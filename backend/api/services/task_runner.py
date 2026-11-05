import os
import threading
import traceback
from django.conf import settings
from ..models import VideoProject, VideoClip
from .downloader import download_youtube_video, probe_video_metadata
from .transcription import (
    extract_audio_from_video,
    get_native_youtube_transcript,
    transcribe_with_whisper,
    transcribe_with_shruti,
    transcribe_with_gemini,
    transcribe_with_groq,
    generate_fallback_transcript,
    align_clip_audio_with_whisper,
    build_sentence_indexed_transcript
)
from .ai_analyzer import analyze_highlights_with_gemini
from .face_tracker import detect_primary_speaker_center, generate_camera_keyframes
from .editor import render_shorts_clip

def process_video_project_async(project_id: str, gemini_api_key: str = ''):
    thread = threading.Thread(
        target=_run_video_pipeline,
        args=(project_id, gemini_api_key),
        daemon=True
    )
    thread.start()

def _run_video_pipeline(project_id: str, gemini_api_key: str = ''):
    try:
        project = VideoProject.objects.get(id=project_id)
    except VideoProject.DoesNotExist:
        return

    try:
        # Determine API key: explicit param -> user profile encrypted key -> settings env
        api_key = gemini_api_key
        if not api_key and project.user and hasattr(project.user, 'profile'):
            api_key = project.user.profile.get_decrypted_gemini_key()
        if not api_key:
            api_key = getattr(settings, 'GEMINI_API_KEY', '')

        groq_key = getattr(settings, 'GROQ_API_KEY', '')

        # Step 1: Download or locate existing video file
        media_videos_dir = os.path.join(settings.MEDIA_ROOT, 'videos')
        os.makedirs(media_videos_dir, exist_ok=True)

        video_full_path = ""
        # 1. Check if this project already has a valid video file
        if project.video_file and project.video_file.name:
            cand = os.path.join(settings.MEDIA_ROOT, project.video_file.name)
            if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 100:
                video_full_path = cand

        # 2. Check if YouTube video already exists in media/videos/ by video_id or previous project
        if not video_full_path and project.source_type == 'youtube' and project.youtube_url:
            from .downloader import get_youtube_video_id
            vid_id = get_youtube_video_id(project.youtube_url)
            if vid_id:
                for ext in ['mp4', 'mkv', 'webm']:
                    cand = os.path.join(media_videos_dir, f"{vid_id}.{ext}")
                    if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 100:
                        video_full_path = cand
                        rel_path = os.path.relpath(cand, settings.MEDIA_ROOT).replace('\\', '/')
                        project.video_file.name = rel_path
                        project.save(update_fields=['video_file'])
                        break

            # Check if any prior project already downloaded this exact YouTube URL
            if not video_full_path:
                prev_proj = VideoProject.objects.filter(youtube_url=project.youtube_url).exclude(id=project.id).order_by('-created_at').first()
                if prev_proj and prev_proj.video_file and prev_proj.video_file.name:
                    cand = os.path.join(settings.MEDIA_ROOT, prev_proj.video_file.name)
                    if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 100:
                        video_full_path = cand
                        project.video_file.name = prev_proj.video_file.name
                        if not project.title or project.title == 'Importing YouTube Video...':
                            project.title = prev_proj.title
                        if not project.thumbnail_url:
                            project.thumbnail_url = prev_proj.thumbnail_url
                        project.save()

        if video_full_path:
            project.status_message = 'Existing video file found on disk. Skipping download.'
            project.progress = 40
            project.download_progress = 100
            project.save(update_fields=['status_message', 'progress', 'download_progress'])
            from .upload_kit import extract_channel_credit
            if not project.channel_name:
                project.channel_name = extract_channel_credit(project.title)
            if not project.duration or project.duration <= 0:
                probe = probe_video_metadata(video_full_path)
                project.duration = probe['duration']
                project.width = probe['width']
                project.height = probe['height']
                project.fps = probe['fps']
                project.save()
        elif project.source_type == 'youtube' and project.youtube_url:
            project.status = 'downloading'
            project.progress = 10
            project.status_message = 'Fetching video from YouTube...'
            project.save(update_fields=['status', 'progress', 'status_message'])

            def update_dl_progress(pct, msg, meta=None):
                project.progress = min(40, 10 + int(pct * 0.3))
                project.download_progress = pct
                if meta:
                    project.download_speed = meta.get('speed', '')
                    project.download_eta = meta.get('eta', '')
                project.status_message = msg
                project.save(update_fields=['progress', 'download_progress', 'download_speed', 'download_eta', 'status_message'])

            dl_res = download_youtube_video(project.youtube_url, media_videos_dir, update_dl_progress)
            from .upload_kit import extract_channel_credit
            project.title = dl_res['title']
            project.channel_name = dl_res.get('channel_name') or extract_channel_credit(project.title)
            project.duration = dl_res['duration']
            project.width = dl_res['width']
            project.height = dl_res['height']
            project.fps = dl_res['fps']
            project.thumbnail_url = dl_res['thumbnail']
            rel_video_path = os.path.relpath(dl_res['file_path'], settings.MEDIA_ROOT).replace('\\', '/')
            project.video_file.name = rel_video_path
            project.save()
            video_full_path = dl_res['file_path']
        else:
            video_full_path = project.video_file.path
            from .upload_kit import extract_channel_credit
            if not project.channel_name:
                project.channel_name = extract_channel_credit(project.title)
            probe = probe_video_metadata(video_full_path)
            project.duration = probe['duration']
            project.width = probe['width']
            project.height = probe['height']
            project.fps = probe['fps']
            project.save()

        # Step 2: Check for existing Dialogue Transcript (from project or previous project)
        transcript = []
        if project.transcript_raw and isinstance(project.transcript_raw, list) and len(project.transcript_raw) > 0:
            transcript = project.transcript_raw
        elif project.source_type == 'youtube' and project.youtube_url:
            prev_proj = VideoProject.objects.filter(youtube_url=project.youtube_url).exclude(id=project.id).order_by('-created_at').first()
            if prev_proj and prev_proj.transcript_raw and isinstance(prev_proj.transcript_raw, list) and len(prev_proj.transcript_raw) > 0:
                transcript = prev_proj.transcript_raw
                project.transcript_raw = transcript
                project.save(update_fields=['transcript_raw'])

        # Step 3: Fast Audio Extraction (reuse if already extracted)
        audio_filename = f"{project.id}.mp3"
        audio_full_path = os.path.join(settings.MEDIA_ROOT, 'audio', audio_filename)
        if os.path.exists(audio_full_path) and os.path.getsize(audio_full_path) > 1024:
            project.status_message = 'Existing audio stream found. Skipping audio extraction.'
            project.progress = 55
            project.audio_file.name = f"audio/{audio_filename}"
            project.save(update_fields=['status_message', 'progress', 'audio_file'])
        else:
            # Check if previous project with same youtube_url has audio stream
            prev_audio = None
            if project.source_type == 'youtube' and project.youtube_url:
                prev_proj = VideoProject.objects.filter(youtube_url=project.youtube_url).exclude(id=project.id).order_by('-created_at').first()
                if prev_proj and prev_proj.audio_file and prev_proj.audio_file.name:
                    cand_a = os.path.join(settings.MEDIA_ROOT, prev_proj.audio_file.name)
                    if os.path.exists(cand_a) and os.path.getsize(cand_a) > 1024:
                        prev_audio = cand_a

            if prev_audio:
                import shutil
                shutil.copy2(prev_audio, audio_full_path)
                project.status_message = 'Existing audio stream restored from cache. Skipping audio extraction.'
                project.progress = 55
                project.audio_file.name = f"audio/{audio_filename}"
                project.save(update_fields=['status_message', 'progress', 'audio_file'])
            else:
                project.status = 'extracting_audio'
                project.progress = 55
                project.status_message = 'Extracting audio stream...'
                project.save(update_fields=['status', 'progress', 'status_message'])
                extract_audio_from_video(video_full_path, audio_full_path)
                project.audio_file.name = f"audio/{audio_filename}"
                project.save(update_fields=['audio_file'])

        # Step 2 (Cont.): Speech transcription only if transcript is missing
        if not transcript:
            if project.source_type == 'youtube' and project.youtube_url:
                project.status = 'transcribing'
                project.progress = 56
                project.status_message = 'Checking for native YouTube dialogue captions...'
                project.save(update_fields=['status', 'progress', 'status_message'])
                transcript = get_native_youtube_transcript(project.youtube_url)

            if not transcript:
                project.status = 'transcribing'
                project.progress = 58
                project.status_message = 'Transcribing dialogue with faster-whisper...'
                project.save(update_fields=['status', 'progress', 'status_message'])
                transcript = transcribe_with_whisper(audio_full_path)

            if not transcript:
                project.progress = 62
                project.status_message = 'Aligning dialogue with Shruti acoustic ASR engine...'
                project.save(update_fields=['progress', 'status_message'])
                transcript = transcribe_with_shruti(audio_full_path)

            if not transcript and api_key:
                project.progress = 66
                project.status_message = 'Transcribing dialogue with Gemini Multimodal AI...'
                project.save(update_fields=['progress', 'status_message'])
                transcript = transcribe_with_gemini(audio_full_path, api_key)

            if not transcript and groq_key:
                project.progress = 68
                project.status_message = 'Transcribing with Groq Whisper API...'
                project.save(update_fields=['progress', 'status_message'])
                transcript = transcribe_with_groq(audio_full_path, groq_key)

            if not transcript:
                transcript = generate_fallback_transcript(project.duration, project.title)

            project.transcript_raw = transcript
            project.progress = 72
            project.status_message = f'Loaded dialogue ({len(transcript)} segments). Analyzing viral highlights...'
            project.save(update_fields=['transcript_raw', 'progress', 'status_message'])
        else:
            project.progress = 72
            project.status_message = f'Using cached dialogue ({len(transcript)} segments). Analyzing viral highlights...'
            project.save(update_fields=['progress', 'status_message'])

        # Step 4: AI Highlight Detection & Viral Scoring
        project.status = 'analyzing'
        project.progress = 78
        is_auto = (project.requested_clip_count == 0)
        count_label = "full video" if is_auto else f"top {project.requested_clip_count}"
        mode_label = "Story Arc Series" if getattr(project, 'clipping_mode', 'viral_highlights') == 'story_series' else "Viral Highlights"
        project.status_message = f"Scanning video timeline with Gemini AI ({mode_label} • {count_label})..."
        project.save(update_fields=['status', 'progress', 'status_message'])

        def update_ai_status(pct, msg):
            project.progress = pct
            project.status_message = msg
            project.save(update_fields=['progress', 'status_message'])

        # Sentence-Indexed Audio Transcription for atomic narrative boundary snapping
        sentence_indexed_transcript = build_sentence_indexed_transcript(transcript)

        highlights = analyze_highlights_with_gemini(
            transcript_segments=sentence_indexed_transcript,
            video_title=project.title,
            total_duration=project.duration,
            api_key=api_key,
            target_count=project.requested_clip_count,
            duration_preference=project.duration_preference,
            clipping_mode=getattr(project, 'clipping_mode', 'viral_highlights'),
            progress_callback=update_ai_status
        )

        # Step 5: Save generated clips with Smart Resume & Deduplication
        total_clips = len(highlights)
        update_ai_status(85, f"Validating {total_clips} story clips and checking system folder cache...")
        existing_clips = list(project.clips.all().order_by('part_number', 'start_time'))

        # Check existing rendered files in system folder for all existing clips
        rendered_dir = os.path.join(settings.MEDIA_ROOT, 'rendered_clips')
        clean_rendered_dir = os.path.join(rendered_dir, 'clean')
        os.makedirs(rendered_dir, exist_ok=True)
        os.makedirs(clean_rendered_dir, exist_ok=True)

        for ec in existing_clips:
            r_name = f"clip_{ec.id}.mp4"
            r_path = os.path.join(rendered_dir, r_name)
            if os.path.exists(r_path) and os.path.getsize(r_path) > 10240:
                if not ec.rendered_file or not ec.rendered_file.name:
                    ec.rendered_file.name = f"rendered_clips/{r_name}"
                ec.render_status = 'completed'
                ec.render_progress = 100
                ec.save(update_fields=['rendered_file', 'render_status', 'render_progress'])
            cr_name = f"clip_{ec.id}_clean.mp4"
            cr_path = os.path.join(clean_rendered_dir, cr_name)
            if os.path.exists(cr_path) and os.path.getsize(cr_path) > 10240:
                if not ec.rendered_clean_file or not ec.rendered_clean_file.name:
                    ec.rendered_clean_file.name = f"rendered_clips/clean/{cr_name}"
                ec.clean_render_status = 'completed'
                ec.save(update_fields=['rendered_clean_file', 'clean_render_status'])

        # Pre-extract master words with global timestamps once
        master_words = []
        if transcript:
            for seg in transcript:
                for w in seg.get('words', []):
                    w_st = float(w.get('start', 0.0))
                    w_et = float(w.get('end', 0.0))
                    word_str = str(w.get('word', '')).strip()
                    if word_str:
                        master_words.append({
                            'word': word_str,
                            'start': w_st,
                            'end': w_et,
                            'confidence': float(w.get('confidence', 0.95)),
                            'needs_review': bool(w.get('needs_review', False))
                        })

        matched_clip_ids = set()
        highlight_to_clip = {}

        # Pass 1: Match existing clips by part_number and story_id, or by timestamp proximity
        for h_idx, h in enumerate(highlights):
            h_start = float(h['start'])
            h_end = float(h['end'])
            h_part = h.get('part_number', h_idx + 1)
            h_story = h.get('story_id', '')

            matched = None
            for ec in existing_clips:
                if ec.id in matched_clip_ids:
                    continue
                # Match by story_id and part_number
                if h_story and ec.story_id == h_story and ec.part_number == h_part:
                    matched = ec
                    break
                # Match by start and end timestamps (within 1.5s tolerance)
                if abs(ec.start_time - h_start) <= 1.5 and abs(ec.end_time - h_end) <= 1.5:
                    matched = ec
                    break
                # Fallback match by sequential order if timestamps are close
                if h_idx < len(existing_clips) and existing_clips[h_idx].id not in matched_clip_ids and abs(existing_clips[h_idx].start_time - h_start) <= 3.0:
                    matched = existing_clips[h_idx]
                    break

            if matched:
                matched_clip_ids.add(matched.id)
                highlight_to_clip[h_idx] = matched
                matched.title = h['title']
                matched.score = h.get('score', matched.score)
                matched.ending_type = h.get('ending_type', matched.ending_type)
                matched.hook_title = h.get('hook_title') or h.get('part_hook') or matched.title
                matched.save(update_fields=['title', 'score', 'ending_type', 'hook_title'])

        already_created_count = len(highlight_to_clip)
        if already_created_count > 0:
            resume_part = already_created_count + 1
            project.status_message = f"{already_created_count}/{total_clips} clips already created. Resuming from clip {resume_part}/{total_clips}..."
            project.progress = 80 + int((already_created_count / max(1, total_clips)) * 18)
            project.save(update_fields=['status_message', 'progress'])

        created_count = 0
        # Pass 2: Create only the remaining clips that are missing
        for idx, h in enumerate(highlights):
            if idx in highlight_to_clip:
                continue

            c_start = float(h['start'])
            c_end = float(h['end'])
            c_dur = max(1.0, c_end - c_start)

            pct = 85 + int(((idx + 1) / max(1, total_clips)) * 14)
            clip_title = h.get('title', f"Clip {idx + 1}")
            project.progress = pct
            project.status_message = f"Assembling Shorts Package ({idx + 1}/{total_clips}): '{clip_title[:28]}' ({c_dur:.0f}s)..."
            project.save(update_fields=['progress', 'status_message'])

            # Fast In-Memory Transcript Word Slicing (Instant array slice & 0.0s rebase)
            aligned_words = []
            if master_words:
                for w in master_words:
                    if w['end'] >= c_start and w['start'] <= c_end:
                        rel_st = max(0.0, round(w['start'] - c_start, 3))
                        rel_et = max(rel_st + 0.05, min(c_dur, round(w['end'] - c_start, 3)))
                        aligned_words.append({
                            'word': w['word'],
                            'start': round(w['start'], 3),
                            'end': round(w['end'], 3),
                            'clip_start': rel_st,
                            'clip_end': rel_et,
                            'confidence': w['confidence'],
                            'needs_review': w['needs_review']
                        })

            if not aligned_words:
                snippet = h.get('transcript_snippet', '') or h.get('title', '')
                tokens = snippet.split()
                if tokens:
                    token_dur = c_dur / float(len(tokens))
                    for ti, tok in enumerate(tokens):
                        st_t = round(ti * token_dur, 3)
                        et_t = round(min(c_dur, (ti + 1) * token_dur), 3)
                        aligned_words.append({
                            'word': tok,
                            'start': round(c_start + st_t, 3),
                            'end': round(c_start + et_t, 3),
                            'clip_start': st_t,
                            'clip_end': et_t,
                            'confidence': 0.90,
                            'needs_review': False
                        })

            crop_x = 50.0
            crop_y = 35.0
            crop_zoom = 1.15
            crop_mode = 'custom_crop'
            crop_keyframes = [{"time": 0.0, "x": crop_x, "y": crop_y, "zoom": crop_zoom, "speaker": "Speaker Focus"}]
            is_speaker_centered = True

            caption_style = {
                "font": "Arial Black",
                "fontSize": 24,
                "preset": "Karaoke",
                "animation": "bounce",
                "highlightColor": "#bef264",
                "textColor": "#FFFFFF",
                "position": "bottom",
                "showCaptions": True,
            }
            if aligned_words:
                caption_style["aligned_words"] = aligned_words

            new_clip = VideoClip.objects.create(
                project=project,
                title=h['title'],
                parent_story_title=h.get('parent_story_title', ''),
                story_id=h.get('story_id', ''),
                part_number=h.get('part_number', idx + 1),
                total_parts=h.get('total_parts', total_clips),
                ending_type=h.get('ending_type', 'punchline'),
                hook_title=h.get('hook_title') or h.get('part_hook') or h.get('title', ''),
                start_time=c_start,
                end_time=c_end,
                duration=c_dur,
                score=h['score'],
                category=h.get('category', 'Highlight'),
                hook=h.get('hook', ''),
                reason=h.get('reason', ''),
                aspect_ratio=project.target_ratio,
                crop_mode=crop_mode,
                crop_x=crop_x,
                crop_y=crop_y,
                crop_zoom=crop_zoom,
                crop_keyframes=crop_keyframes,
                is_speaker_centered=is_speaker_centered,
                caption_style=caption_style
            )
            highlight_to_clip[idx] = new_clip
            created_count += 1

        # Delete only orphan clips that were not matched to any highlight
        all_retained_ids = [c.id for c in highlight_to_clip.values() if hasattr(c, 'id')]
        project.clips.exclude(id__in=all_retained_ids).delete()

        # Complete!
        project.status = 'ready'
        project.progress = 100
        if already_created_count > 0:
            project.status_message = f'Ready! {total_clips}/{total_clips} clips ready ({already_created_count} retained from cache, {created_count} newly generated).'
        else:
            project.status_message = f'Ready! Generated {total_clips} clips.'
        project.save(update_fields=['status', 'progress', 'status_message'])

    except Exception as e:
        traceback.print_exc()
        project.status = 'failed'
        err_msg = str(e)
        if 'Sign in to confirm' in err_msg or 'bot' in err_msg.lower():
            friendly_err = "YouTube anti-bot verification required. Automatic tv/visionos bypass active. For high-volume usage, place a cookies.txt in the CLIPZZZ folder."
            project.error_message = friendly_err
            project.status_message = friendly_err
        else:
            project.error_message = err_msg
            project.status_message = f"Failed: {err_msg[:100]}"
        project.save(update_fields=['status', 'error_message', 'status_message'])


def render_clip_async(clip_id: str):
    thread = threading.Thread(
        target=_run_clip_render,
        args=(clip_id, False),
        daemon=True
    )
    thread.start()

def render_clean_clip_async(clip_id: str):
    thread = threading.Thread(
        target=_run_clip_render,
        args=(clip_id, True),
        daemon=True
    )
    thread.start()

def _run_clip_render(clip_id: str, clean: bool = False):
    try:
        clip = VideoClip.objects.get(id=clip_id)
    except VideoClip.DoesNotExist:
        return

    try:
        if clean:
            clip.clean_render_status = 'rendering'
            clip.save(update_fields=['clean_render_status'])
        else:
            clip.render_status = 'rendering'
            clip.render_progress = 15
            clip.error_message = None
            clip.save(update_fields=['render_status', 'render_progress', 'error_message'])

        project = clip.project
        source_video_path = project.video_file.path

        rendered_dir = os.path.join(settings.MEDIA_ROOT, 'rendered_clips', 'clean' if clean else '')
        os.makedirs(rendered_dir, exist_ok=True)

        output_filename = f"clip_{clip.id}{'_clean' if clean else ''}.mp4"
        output_path = os.path.join(rendered_dir, output_filename)

        active_caption_style = dict(clip.caption_style or {})
        if clean:
            active_caption_style['showCaptions'] = False

        # On-Demand YuNet Neural Keyframe Evaluation if not yet computed
        crop_kfs = clip.crop_keyframes or []
        if len(crop_kfs) <= 1 and getattr(project, 'auto_speaker_tracking', True):
            try:
                from .face_tracker import generate_camera_keyframes
                computed_kfs = generate_camera_keyframes(source_video_path, clip.start_time, clip.duration)
                if computed_kfs:
                    crop_kfs = computed_kfs
                    clip.crop_keyframes = computed_kfs
                    clip.crop_x = computed_kfs[0]['x']
                    clip.crop_y = computed_kfs[0]['y']
                    clip.crop_zoom = computed_kfs[0].get('zoom', 1.15)
                    clip.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom'])
            except Exception as fe:
                print(f"[_run_clip_render] On-demand neural tracking notice: {fe}")

        from .upload_kit import extract_channel_credit
        channel_name = getattr(project, 'channel_name', '') or extract_channel_credit(project.title)
        render_shorts_clip(
            source_video_path=source_video_path,
            clip_start=clip.start_time,
            clip_end=clip.end_time,
            output_mp4_path=output_path,
            crop_mode=clip.crop_mode,
            crop_x=clip.crop_x,
            crop_y=clip.crop_y,
            crop_zoom=clip.crop_zoom,
            crop_keyframes=crop_kfs,
            caption_style=active_caption_style,
            segments=project.transcript_raw if not clean else None,
            channel_name=channel_name if not clean else ""
        )

        rel_path = f"rendered_clips/{'clean/' if clean else ''}{output_filename}"
        if clean:
            clip.rendered_clean_file.name = rel_path
            clip.clean_render_status = 'completed'
            clip.save(update_fields=['rendered_clean_file', 'clean_render_status'])
        else:
            clip.rendered_file.name = rel_path
            clip.render_status = 'completed'
            clip.render_progress = 100
            clip.save(update_fields=['rendered_file', 'render_status', 'render_progress'])

    except Exception as e:
        traceback.print_exc()
        if clean:
            clip.clean_render_status = 'failed'
            clip.error_message = str(e)
            clip.save(update_fields=['clean_render_status', 'error_message'])
        else:
            clip.render_status = 'failed'
            clip.error_message = str(e)
            clip.save(update_fields=['render_status', 'error_message'])
