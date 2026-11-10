import os
import random
from datetime import datetime, timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404, HttpResponse
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

from .models import VideoProject, VideoClip, UserProfile
from .serializers import (
    UserProfileSerializer,
    RequestOTPSerializer,
    VerifyOTPSerializer,
    SaveKeySerializer,
    VideoProjectListSerializer,
    VideoProjectDetailSerializer,
    VideoImportSerializer,
    VideoClipSerializer,
    ClipUpdateSerializer,
)
from .services.task_runner import process_video_project_async, render_clip_async
from .services.email_service import send_otp_email
from .services.rate_limiter import check_otp_rate_limit, get_client_ip
import re

@api_view(['POST'])
@permission_classes([AllowAny])
def request_otp(request):
    """
    Sends a 6-digit OTP via Gmail SMTP for Signup or Login.
    Strictly verifies @gmail.com accounts, Indian contact numbers, rate limits, and captcha.
    """
    serializer = RequestOTPSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email'].lower().strip()
    is_signup = serializer.validated_data.get('is_signup', False)
    first_name = serializer.validated_data.get('first_name', '').strip()
    last_name = serializer.validated_data.get('last_name', '').strip()
    contact_number = serializer.validated_data.get('contact_number', '').strip()
    captcha_verified = serializer.validated_data.get('captcha_verified', False)

    # 1. Require Swipe Captcha verification
    if not captcha_verified:
        return Response({'error': 'Swipe captcha verification is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # 2. Strict @gmail.com only validation
    if not (email.endswith('@gmail.com') or email.endswith('@googlemail.com')):
        return Response({'error': 'Only official @gmail.com email addresses are supported.'}, status=status.HTTP_400_BAD_REQUEST)

    # 3. Rate limiting check (Redis / Django Cache)
    client_ip = get_client_ip(request)
    allowed, rate_err = check_otp_rate_limit(email, client_ip)
    if not allowed:
        return Response({'error': rate_err}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # 4. Indian Phone Number validation for Signup
    if is_signup:
        clean_phone = re.sub(r'[\s\-\(\)]', '', contact_number)
        # Matches 10 digits starting with 6-9, or +91 / 91 prefix
        if not re.match(r'^(\+?91)?[6-9]\d{9}$', clean_phone):
            return Response({'error': 'Please enter a valid 10-digit Indian mobile number (e.g. +91 98765 43210).'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email=email).first()

    if is_signup:
        if user:
            return Response({'error': 'An account with this email already exists. Please log in.'}, status=status.HTTP_400_BAD_REQUEST)
        username = email.split('@')[0] + str(random.randint(100, 999))
        user = User.objects.create(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        profile = UserProfile.objects.create(user=user, contact_number=contact_number)
    else:
        if not user:
            return Response({'error': 'No account found with this email. Please sign up first.'}, status=status.HTTP_404_NOT_FOUND)
        profile, _ = UserProfile.objects.get_or_create(user=user)

    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999)}"
    profile.otp_code = otp_code
    profile.otp_created_at = datetime.now(timezone.utc)
    profile.save(update_fields=['otp_code', 'otp_created_at'])

    # Send OTP via Gmail SMTP
    display_name = user.first_name if user.first_name else 'Creator'
    smtp_configured = bool(getattr(settings, 'EMAIL_HOST_USER', '') and getattr(settings, 'EMAIL_HOST_PASSWORD', ''))
    email_dispatched = send_otp_email(email, otp_code, user_name=display_name)

    if smtp_configured and not email_dispatched:
        return Response(
            {'error': 'Failed to send verification email via Gmail SMTP. Please verify network/SMTP configuration and try again.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    res_data = {
        'success': True,
        'message': f"Verification code sent to {email}",
        'email_sent': email_dispatched,
    }

    # Only fall back to dev_otp when SMTP credentials are intentionally blank
    if not smtp_configured and not email_dispatched:
        res_data['dev_otp'] = otp_code

    return Response(res_data)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_otp(request):
    """
    Verifies OTP and returns long-lived JWT access and refresh tokens.
    """
    serializer = VerifyOTPSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email'].lower().strip()
    otp = serializer.validated_data['otp'].strip()

    user = User.objects.filter(email=email).first()
    if not user or not hasattr(user, 'profile'):
        return Response({'error': 'Invalid user session or email.'}, status=status.HTTP_400_BAD_REQUEST)

    profile = user.profile
    if profile.otp_code != otp:
        return Response({'error': 'Invalid OTP code. Please try again.'}, status=status.HTTP_400_BAD_REQUEST)

    # Clear OTP after verification
    profile.otp_code = ''
    profile.save(update_fields=['otp_code'])

    # Generate SimpleJWT tokens
    refresh = RefreshToken.for_user(user)

    return Response({
        'success': True,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserProfileSerializer(profile).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    return Response(UserProfileSerializer(profile).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_gemini_key(request):
    """
    Encrypts and permanently binds the Gemini API key to the authenticated user's account.
    Validates key near-instantaneously without slow multi-model generation loops.
    """
    serializer = SaveKeySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    raw_key = serializer.validated_data['gemini_api_key'].strip()

    if len(raw_key) < 20:
        return Response({'error': 'Invalid key length. Gemini API keys typically start with AIzaSy and are ~39 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    # Fast non-blocking verification via Google's models metadata endpoint (sub-second)
    try:
        import requests
        resp = requests.get(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={raw_key}",
            timeout=2.5
        )
        if resp.status_code == 400:
            err_json = resp.json().get('error', {})
            msg = err_json.get('message', '')
            if 'API key not valid' in msg or err_json.get('status') == 'INVALID_ARGUMENT':
                return Response({'error': 'Invalid Gemini API key. Please check your key from Google AI Studio.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        # If network/DNS has latency, do not block the user or cause broken pipes
        pass

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.set_gemini_key(raw_key)

    return Response({
        'success': True,
        'message': 'Gemini API key encrypted and linked securely to your account!',
        'masked_gemini_key': profile.masked_gemini_key,
        'has_gemini_key': True,
    })


class VideoProjectViewSet(viewsets.ModelViewSet):
    queryset = VideoProject.objects.all()

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return VideoProject.objects.filter(user=self.request.user)
        return VideoProject.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return VideoProjectListSerializer
        return VideoProjectDetailSerializer

    def perform_destroy(self, instance):
        # Clean up rendered clip media files
        for clip in instance.clips.all():
            if clip.rendered_file and os.path.exists(clip.rendered_file.path):
                try:
                    os.remove(clip.rendered_file.path)
                except Exception:
                    pass

        # Clean up project audio file
        if instance.audio_file and os.path.exists(instance.audio_file.path):
            try:
                os.remove(instance.audio_file.path)
            except Exception:
                pass

        # If user uploaded a raw file (not a cached YouTube download), clean it up
        if instance.source_type == 'upload' and instance.video_file and os.path.exists(instance.video_file.path):
            try:
                os.remove(instance.video_file.path)
            except Exception:
                pass

        instance.delete()

    @action(detail=False, methods=['post'], url_path='import')
    def import_video(self, request):
        serializer = VideoImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        youtube_url = serializer.validated_data.get('youtube_url', '').strip()
        video_file = serializer.validated_data.get('video_file', None)
        gemini_api_key = serializer.validated_data.get('gemini_api_key', '').strip()
        target_ratio = serializer.validated_data.get('target_ratio', '9:16')
        download_quality = serializer.validated_data.get('download_quality', '720p')
        download_full_video = serializer.validated_data.get('download_full_video', False)
        use_cached_video = serializer.validated_data.get('use_cached_video', True)
        auto_speaker_tracking = serializer.validated_data.get('auto_speaker_tracking', True)
        requested_clip_count = serializer.validated_data.get('requested_clip_count', 7)
        duration_preference = serializer.validated_data.get('duration_preference', '30-60')
        clipping_mode = serializer.validated_data.get('clipping_mode', 'viral_highlights')

        user = request.user if request.user.is_authenticated else None

        if youtube_url:
            from .services.downloader import detect_video_platform
            platform_label = detect_video_platform(youtube_url)
            project = VideoProject.objects.create(
                user=user,
                source_type='youtube',
                youtube_url=youtube_url,
                title=f'Importing {platform_label} Video...',
                target_ratio=target_ratio,
                download_quality=download_quality,
                download_full_video=download_full_video,
                use_cached_video=use_cached_video,
                auto_speaker_tracking=auto_speaker_tracking,
                requested_clip_count=requested_clip_count,
                duration_preference=duration_preference,
                clipping_mode=clipping_mode,
                status='downloading' if download_full_video else 'analyzing',
                progress=5,
                status_message=f'Connecting to {platform_label} stream...'
            )
        elif video_file:
            project = VideoProject.objects.create(
                user=user,
                source_type='upload',
                video_file=video_file,
                title=video_file.name,
                target_ratio=target_ratio,
                download_quality=download_quality,
                download_full_video=download_full_video,
                use_cached_video=use_cached_video,
                auto_speaker_tracking=auto_speaker_tracking,
                requested_clip_count=requested_clip_count,
                duration_preference=duration_preference,
                clipping_mode=clipping_mode,
                status='extracting_audio',
                progress=20,
                status_message='Video uploaded successfully. Processing...'
            )
        else:
            return Response({'error': 'No video provided'}, status=status.HTTP_400_BAD_REQUEST)

        process_video_project_async(str(project.id), gemini_api_key)

        return Response(VideoProjectDetailSerializer(project).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        project = self.get_object()
        return Response({
            'id': str(project.id),
            'status': project.status,
            'progress': project.progress,
            'download_progress': getattr(project, 'download_progress', 0),
            'download_speed': getattr(project, 'download_speed', ''),
            'download_eta': getattr(project, 'download_eta', ''),
            'status_message': project.status_message,
            'error_message': project.error_message,
            'clips_count': project.clips.count(),
        })

    @action(detail=True, methods=['get'])
    def clips(self, request, pk=None):
        project = self.get_object()
        clips_qs = project.clips.all()
        # In story mode or when episodic multi-parts exist, order chronologically by start_time so parts are sequential
        if project.clipping_mode == 'story_series' or clips_qs.filter(models.Q(part_number__gt=1) | ~models.Q(story_id='')).exists():
            clips_qs = clips_qs.order_by('start_time')
        else:
            clips_qs = clips_qs.order_by('-score', 'start_time')
        serializer = VideoClipSerializer(clips_qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='inspect-url', permission_classes=[AllowAny])
    def inspect_url(self, request):
        """
        Inspects video URL across YouTube, Facebook, Vimeo, Twitch, X, Instagram & direct links,
        validates minimum long-form duration (> 3 min), and recommends optimal clipping mode.
        """
        url = request.data.get('youtube_url', '').strip()
        if not url:
            return Response({'error': 'Video URL is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from .services.downloader import inspect_and_classify_video
        gemini_api_key = request.data.get('gemini_api_key', '')
        result = inspect_and_classify_video(url, gemini_api_key=gemini_api_key)
        if not result.get('success'):
            return Response({'error': result.get('error', 'Failed to inspect video URL.')}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class VideoClipViewSet(viewsets.ModelViewSet):
    queryset = VideoClip.objects.all()
    serializer_class = VideoClipSerializer

    def update(self, request, *args, **kwargs):
        clip = self.get_object()
        serializer = ClipUpdateSerializer(clip, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(VideoClipSerializer(clip).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def render(self, request, pk=None):
        clip = self.get_object()
        update_ser = ClipUpdateSerializer(clip, data=request.data, partial=True)
        if update_ser.is_valid():
            update_ser.save()

        force = request.data.get('force', False)
        if isinstance(force, str):
            force = force.lower() in ('true', '1')

        from .services.editor import compute_clip_render_hash
        current_hash = compute_clip_render_hash(clip, mode='captioned')

        disk_file = os.path.join(settings.MEDIA_ROOT, 'rendered_clips', f"clip_{clip.id}.mp4")
        has_disk_file = os.path.exists(disk_file) and os.path.getsize(disk_file) > 1024

        # Smart Cache: If parameters are identical and rendered video is on disk, reuse instantly
        if not force and clip.rendered_hash == current_hash and has_disk_file:
            rel_path = f"rendered_clips/clip_{clip.id}.mp4"
            if not clip.rendered_file or clip.rendered_file.name != rel_path:
                clip.rendered_file.name = rel_path
            clip.render_status = 'completed'
            clip.render_progress = 100
            clip.error_message = None
            clip.save(update_fields=['rendered_file', 'render_status', 'render_progress', 'error_message'])
            return Response({
                'status': 'completed',
                'clip_id': str(clip.id),
                'render_status': 'completed',
                'render_progress': 100,
                'cached': True,
                'rendered_file': clip.rendered_file.url,
            })

        # Cache miss or explicit force re-render: clean up stale file and trigger render
        if clip.rendered_file:
            try:
                old_path = clip.rendered_file.path
                if os.path.exists(old_path):
                    os.remove(old_path)
            except Exception:
                pass
            clip.rendered_file = None

        if os.path.exists(disk_file):
            try:
                os.remove(disk_file)
            except Exception:
                pass

        clip.render_status = 'rendering'
        clip.render_progress = 10
        clip.error_message = None
        clip.save(update_fields=['rendered_file', 'render_status', 'render_progress', 'error_message'])

        render_clip_async(str(clip.id))
        return Response({
            'status': 'rendering_started',
            'clip_id': str(clip.id),
            'render_status': 'rendering',
            'cached': False,
        })

    @action(detail=True, methods=['post'])
    def auto_track(self, request, pk=None):
        clip = self.get_object()
        if not clip.project.video_file or not os.path.exists(clip.project.video_file.path):
            return Response({'error': 'Source video file not found'}, status=status.HTTP_404_NOT_FOUND)
        
        from .services.face_tracker import generate_camera_keyframes
        keyframes = generate_camera_keyframes(
            clip.project.video_file.path,
            start_sec=clip.start_time,
            duration=clip.duration
        )
        clip.crop_keyframes = keyframes
        if keyframes:
            clip.crop_x = keyframes[0]['x']
            clip.crop_y = keyframes[0]['y']
            clip.crop_zoom = keyframes[0].get('zoom', 1.15)
        clip.crop_mode = 'custom_crop'
        clip.is_speaker_centered = True
        clip.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom', 'crop_mode', 'is_speaker_centered'])
        return Response(VideoClipSerializer(clip).data)

    @action(detail=True, methods=['get'])
    def render_status(self, request, pk=None):
        clip = self.get_object()
        clean_file_url = None
        try:
            if clip.rendered_clean_file and clip.rendered_clean_file.name:
                clean_file_url = clip.rendered_clean_file.url
        except Exception:
            clean_file_url = None

        captioned_url = None
        try:
            if clip.rendered_file and clip.rendered_file.name:
                captioned_url = clip.rendered_file.url
        except Exception:
            captioned_url = None

        return Response({
            'id': str(clip.id),
            'render_status': clip.render_status,
            'render_progress': clip.render_progress,
            'rendered_file': captioned_url,
            'clean_render_status': getattr(clip, 'clean_render_status', 'not_started'),
            'rendered_clean_file': clean_file_url,
            'error_message': clip.error_message,
        })

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        clip = self.get_object()
        file_path = None
        try:
            if clip.rendered_file and clip.rendered_file.name and os.path.exists(clip.rendered_file.path):
                file_path = clip.rendered_file.path
        except Exception:
            file_path = None

        # If not rendered yet, check if file exists in system folder first, otherwise render full 9:16 short
        if not file_path:
            out_dir = os.path.join(settings.MEDIA_ROOT, 'rendered_clips')
            os.makedirs(out_dir, exist_ok=True)
            out_name = f"clip_{clip.id}.mp4"
            out_path = os.path.join(out_dir, out_name)

            # Check if clip is already rendered and remains in system folder
            if os.path.exists(out_path) and os.path.getsize(out_path) > 10240:
                clip.rendered_file.name = f"rendered_clips/{out_name}"
                clip.render_status = 'completed'
                clip.render_progress = 100
                clip.save(update_fields=['rendered_file', 'render_status', 'render_progress'])
                file_path = out_path
            elif clip.project.video_file and os.path.exists(clip.project.video_file.path):
                from .services.editor import render_shorts_clip
                try:
                    crop_kfs = clip.crop_keyframes or []
                    if len(crop_kfs) <= 1 and getattr(clip.project, 'auto_speaker_tracking', True):
                        try:
                            from .services.face_tracker import generate_camera_keyframes
                            computed_kfs = generate_camera_keyframes(clip.project.video_file.path, clip.start_time, clip.duration)
                            if computed_kfs:
                                crop_kfs = computed_kfs
                                clip.crop_keyframes = computed_kfs
                                clip.crop_x = computed_kfs[0]['x']
                                clip.crop_y = computed_kfs[0]['y']
                                clip.crop_zoom = computed_kfs[0].get('zoom', 1.15)
                                clip.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom'])
                        except Exception:
                            pass

                    from .services.upload_kit import extract_channel_credit
                    channel_name = getattr(clip.project, 'channel_name', '') or extract_channel_credit(clip.project.title)
                    render_shorts_clip(
                        source_video_path=clip.project.video_file.path,
                        clip_start=clip.start_time,
                        clip_end=clip.end_time,
                        output_mp4_path=out_path,
                        crop_mode=clip.crop_mode,
                        crop_x=clip.crop_x,
                        crop_y=clip.crop_y,
                        crop_zoom=clip.crop_zoom,
                        crop_keyframes=crop_kfs,
                        caption_style=clip.caption_style,
                        segments=clip.project.transcript_raw,
                        channel_name=channel_name
                    )
                    clip.rendered_file.name = f"rendered_clips/{out_name}"
                    clip.render_status = 'completed'
                    clip.render_progress = 100
                    clip.save(update_fields=['rendered_file', 'render_status', 'render_progress'])
                    file_path = out_path
                except Exception as e:
                    print(f"[download] Error on-demand rendering: {e}")

        if not file_path or not os.path.exists(file_path):
            raise Http404("Rendered clip file not available")

        safe_name = "".join(c for c in clip.title if c.isalnum() or c in (' ', '_', '-')).rstrip()
        filename = f"{safe_name.replace(' ', '_')}_Short.mp4"
        return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=filename)

    @action(detail=True, methods=['post'])
    def render_clean(self, request, pk=None):
        clip = self.get_object()
        update_ser = ClipUpdateSerializer(clip, data=request.data, partial=True)
        if update_ser.is_valid():
            update_ser.save()

        force = request.data.get('force', False)
        if isinstance(force, str):
            force = force.lower() in ('true', '1')

        from .services.editor import compute_clip_render_hash
        current_hash = compute_clip_render_hash(clip, mode='clean')

        clean_disk_file = os.path.join(settings.MEDIA_ROOT, 'rendered_clips', 'clean', f"clip_{clip.id}_clean.mp4")
        has_disk_file = os.path.exists(clean_disk_file) and os.path.getsize(clean_disk_file) > 1024

        # Smart Cache: If parameters are identical and clean rendered video is on disk, reuse instantly
        if not force and clip.rendered_clean_hash == current_hash and has_disk_file:
            rel_path = f"rendered_clips/clean/clip_{clip.id}_clean.mp4"
            if not clip.rendered_clean_file or clip.rendered_clean_file.name != rel_path:
                clip.rendered_clean_file.name = rel_path
            clip.clean_render_status = 'completed'
            clip.save(update_fields=['rendered_clean_file', 'clean_render_status'])
            return Response({
                'status': 'completed',
                'clip_id': str(clip.id),
                'clean_render_status': 'completed',
                'cached': True,
                'rendered_clean_file': clip.rendered_clean_file.url,
            })

        # Cache miss or explicit force re-render: clean up stale file and trigger render
        try:
            if clip.rendered_clean_file and clip.rendered_clean_file.name:
                old_path = clip.rendered_clean_file.path
                if os.path.exists(old_path):
                    os.remove(old_path)
        except Exception:
            pass
        clip.rendered_clean_file = None

        if os.path.exists(clean_disk_file):
            try:
                os.remove(clean_disk_file)
            except Exception:
                pass

        from .services.task_runner import render_clean_clip_async
        clip.clean_render_status = 'rendering'
        clip.save(update_fields=['rendered_clean_file', 'clean_render_status'])
        render_clean_clip_async(str(clip.id))
        return Response({
            'status': 'clean_rendering_started',
            'clip_id': str(clip.id),
            'clean_render_status': 'rendering',
            'cached': False,
        })

    @action(detail=True, methods=['get'])
    def download_clean(self, request, pk=None):
        clip = self.get_object()
        clean_path = None
        try:
            if clip.rendered_clean_file and clip.rendered_clean_file.name:
                p = clip.rendered_clean_file.path
                if os.path.exists(p):
                    clean_path = p
        except Exception:
            clean_path = None

        # If not clean-rendered yet, check system folder first, otherwise render clean 9:16 short
        if not clean_path:
            out_dir = os.path.join(settings.MEDIA_ROOT, 'rendered_clips', 'clean')
            os.makedirs(out_dir, exist_ok=True)
            out_name = f"clip_{clip.id}_clean.mp4"
            out_path = os.path.join(out_dir, out_name)

            if os.path.exists(out_path) and os.path.getsize(out_path) > 10240:
                rel_name = f"rendered_clips/clean/{out_name}"
                clip.rendered_clean_file.name = rel_name
                clip.clean_render_status = 'completed'
                clip.save(update_fields=['rendered_clean_file', 'clean_render_status'])
                clean_path = out_path
            elif clip.project.video_file and os.path.exists(clip.project.video_file.path):
                from .services.editor import render_shorts_clip
                try:
                    clean_style = dict(clip.caption_style or {})
                    clean_style['showCaptions'] = False
                    from .services.upload_kit import extract_channel_credit
                    channel_name = getattr(clip.project, 'channel_name', '') or extract_channel_credit(clip.project.title)
                    render_shorts_clip(
                        source_video_path=clip.project.video_file.path,
                        clip_start=clip.start_time,
                        clip_end=clip.end_time,
                        output_mp4_path=out_path,
                        crop_mode=clip.crop_mode,
                        crop_x=clip.crop_x,
                        crop_y=clip.crop_y,
                        crop_zoom=clip.crop_zoom,
                        crop_keyframes=clip.crop_keyframes,
                        caption_style=clean_style,
                        segments=None,
                        channel_name=""
                    )
                    rel_name = f"rendered_clips/clean/{out_name}"
                    clip.rendered_clean_file.name = rel_name
                    clip.clean_render_status = 'completed'
                    clip.save(update_fields=['rendered_clean_file', 'clean_render_status'])
                    clean_path = out_path
                except Exception as e:
                    print(f"[download_clean] Error on-demand clean rendering: {e}")

        if not clean_path or not os.path.exists(clean_path):
            raise Http404("Clean rendered clip file not available")

        safe_name = "".join(c for c in clip.title if c.isalnum() or c in (' ', '_', '-')).rstrip()
        filename = f"{safe_name.replace(' ', '_')}_Clean_NoCaptions.mp4"
        return FileResponse(open(clean_path, 'rb'), as_attachment=True, filename=filename)

    @action(detail=True, methods=['get'])
    def description(self, request, pk=None):
        """
        Returns structured YouTube Shorts metadata, hashtags, channel credits, and fair use disclaimer.
        """
        from .services.upload_kit import generate_shorts_upload_kit
        clip = self.get_object()
        kit_data = generate_shorts_upload_kit(clip)
        return Response(kit_data)

    @action(detail=True, methods=['get'])
    def download_description(self, request, pk=None):
        """
        Downloads the YouTube Shorts description and fair use notice as an upload-ready .md file.
        """
        from .services.upload_kit import generate_shorts_upload_kit
        clip = self.get_object()
        kit_data = generate_shorts_upload_kit(clip)
        md_text = kit_data['markdown']

        safe_name = "".join(c for c in clip.title if c.isalnum() or c in (' ', '_', '-')).rstrip()
        filename = f"{safe_name.replace(' ', '_')}_Upload_Kit.md"

        response = HttpResponse(md_text, content_type='text/markdown; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['get'])
    def bundle(self, request, pk=None):
        """
        Generates and downloads a complete YouTube Shorts ZIP Bundle:
        - video_short.mp4
        - youtube_shorts_upload_kit.md (with full attribution and fair use disclaimer)
        - subtitles.srt
        """
        import io
        import zipfile
        from .services.upload_kit import generate_shorts_upload_kit, generate_srt_subtitles

        clip = self.get_object()

        # Ensure video file is available
        if not clip.rendered_file or not os.path.exists(clip.rendered_file.path):
            if clip.project.video_file and os.path.exists(clip.project.video_file.path):
                out_dir = os.path.join(settings.MEDIA_ROOT, 'rendered')
                os.makedirs(out_dir, exist_ok=True)
                out_name = f"bundle_{clip.id}.mp4"
                out_path = os.path.join(out_dir, out_name)
                cmd = [
                    'ffmpeg', '-y',
                    '-ss', str(clip.start_time),
                    '-to', str(clip.end_time),
                    '-i', clip.project.video_file.path,
                    '-c', 'copy',
                    out_path
                ]
                try:
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                    clip.rendered_file.name = f"rendered/{out_name}"
                    clip.render_status = 'completed'
                    clip.render_progress = 100
                    clip.save(update_fields=['rendered_file', 'render_status', 'render_progress'])
                except Exception:
                    pass

        zip_buffer = io.BytesIO()
        safe_name = "".join(c for c in clip.title if c.isalnum() or c in (' ', '_', '-')).rstrip()
        folder_prefix = safe_name.replace(' ', '_')

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Add MP4 video file
            if clip.rendered_file and os.path.exists(clip.rendered_file.path):
                zip_file.write(
                    clip.rendered_file.path,
                    arcname=f"{folder_prefix}/{folder_prefix}_Short.mp4"
                )

            # 2. Add YouTube Shorts upload description markdown
            kit_data = generate_shorts_upload_kit(clip)
            zip_file.writestr(
                f"{folder_prefix}/youtube_shorts_upload_kit.md",
                kit_data['markdown'].encode('utf-8')
            )

            # 3. Add SRT subtitles file
            srt_content = generate_srt_subtitles(clip)
            zip_file.writestr(
                f"{folder_prefix}/subtitles.srt",
                srt_content.encode('utf-8')
            )

        zip_buffer.seek(0)
        zip_filename = f"{folder_prefix}_Shorts_Pack.zip"

        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
        return response


@api_view(['POST'])
@permission_classes([AllowAny])
def validate_gemini_key(request):
    api_key = request.data.get('gemini_api_key', '').strip()
    if not api_key:
        return Response({'valid': False, 'message': 'API key is required'}, status=status.HTTP_400_BAD_REQUEST)

    if len(api_key) < 20:
        return Response({'valid': False, 'message': 'Gemini API keys are typically ~39 characters starting with AIzaSy'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        import requests
        resp = requests.get(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            timeout=2.5
        )
        if resp.status_code == 400:
            err = resp.json().get('error', {})
            if 'API key not valid' in err.get('message', ''):
                return Response({'valid': False, 'message': 'Invalid Gemini API key from Google AI Studio.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'valid': True, 'message': 'Gemini API key is valid!'})
    except Exception:
        # Non-blocking fallback
        return Response({'valid': True, 'message': 'Gemini API key format validated!'})


@api_view(['POST'])
@permission_classes([AllowAny])
def upload_cookies(request):
    """
    Saves and activates cookies.txt for YouTube yt-dlp authenticated downloading.
    """
    content = ""
    if 'cookies_file' in request.FILES:
        f = request.FILES['cookies_file']
        content = f.read().decode('utf-8', errors='ignore')
    elif 'cookies_text' in request.data:
        content = request.data.get('cookies_text', '').strip()

    if not content or len(content.strip()) < 5:
        return Response({'error': 'No valid cookie file or text provided.'}, status=status.HTTP_400_BAD_REQUEST)

    target_path = os.path.join(settings.BASE_DIR, 'cookies.txt')
    root_path = os.path.join(settings.BASE_DIR, '..', 'cookies.txt')

    with open(target_path, 'w', encoding='utf-8') as out_f:
        out_f.write(content)

    try:
        with open(root_path, 'w', encoding='utf-8') as out_f2:
            out_f2.write(content)
    except Exception:
        pass

    return Response({
        'success': True,
        'message': 'cookies.txt saved and activated successfully for YouTube downloads!'
    })
