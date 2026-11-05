from rest_framework import serializers
from django.db import models
from django.contrib.auth.models import User
from .models import VideoProject, VideoClip, UserProfile

class UserProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    masked_gemini_key = serializers.CharField(read_only=True)
    has_gemini_key = serializers.BooleanField(read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'first_name',
            'last_name',
            'email',
            'contact_number',
            'masked_gemini_key',
            'has_gemini_key',
            'created_at',
        ]


class RequestOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    contact_number = serializers.CharField(required=False, allow_blank=True)
    is_signup = serializers.BooleanField(default=False)
    captcha_verified = serializers.BooleanField(default=False)


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=10)


class SaveKeySerializer(serializers.Serializer):
    gemini_api_key = serializers.CharField(min_length=10)


class VideoClipSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoClip
        fields = [
            'id',
            'project',
            'title',
            'parent_story_title',
            'story_id',
            'part_number',
            'total_parts',
            'ending_type',
            'hook_title',
            'start_time',
            'end_time',
            'duration',
            'score',
            'category',
            'hook',
            'reason',
            'aspect_ratio',
            'crop_mode',
            'crop_x',
            'crop_y',
            'crop_zoom',
            'crop_keyframes',
            'is_speaker_centered',
            'caption_style',
            'rendered_file',
            'render_status',
            'render_progress',
            'rendered_clean_file',
            'clean_render_status',
            'error_message',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'project', 'rendered_file', 'render_status', 'render_progress',
            'rendered_clean_file', 'clean_render_status', 'created_at', 'updated_at'
        ]


class VideoProjectListSerializer(serializers.ModelSerializer):
    clips_count = serializers.IntegerField(source='clips.count', read_only=True)

    class Meta:
        model = VideoProject
        fields = [
            'id',
            'title',
            'source_type',
            'youtube_url',
            'video_file',
            'thumbnail_url',
            'channel_name',
            'target_ratio',
            'auto_speaker_tracking',
            'requested_clip_count',
            'duration_preference',
            'clipping_mode',
            'duration',
            'width',
            'height',
            'fps',
            'status',
            'progress',
            'status_message',
            'clips_count',
            'created_at',
            'updated_at',
        ]


class VideoProjectDetailSerializer(serializers.ModelSerializer):
    clips = serializers.SerializerMethodField()

    def get_clips(self, obj):
        clips_qs = obj.clips.all()
        # In story mode or when episodic multi-parts exist, order chronologically by start_time so parts are sequential
        if obj.clipping_mode == 'story_series' or clips_qs.filter(models.Q(part_number__gt=1) | ~models.Q(story_id='')).exists():
            clips_qs = clips_qs.order_by('start_time')
        else:
            clips_qs = clips_qs.order_by('-score', 'start_time')
        return VideoClipSerializer(clips_qs, many=True, context=self.context).data

    class Meta:
        model = VideoProject
        fields = [
            'id',
            'title',
            'source_type',
            'youtube_url',
            'video_file',
            'audio_file',
            'thumbnail_url',
            'channel_name',
            'target_ratio',
            'auto_speaker_tracking',
            'requested_clip_count',
            'duration_preference',
            'clipping_mode',
            'duration',
            'width',
            'height',
            'fps',
            'status',
            'progress',
            'status_message',
            'error_message',
            'transcript_raw',
            'clips',
            'created_at',
            'updated_at',
        ]


class VideoImportSerializer(serializers.Serializer):
    youtube_url = serializers.URLField(required=False, allow_blank=True)
    video_file = serializers.FileField(required=False)
    gemini_api_key = serializers.CharField(required=False, allow_blank=True)
    target_ratio = serializers.ChoiceField(choices=['9:16'], default='9:16')
    auto_speaker_tracking = serializers.BooleanField(default=True)
    requested_clip_count = serializers.IntegerField(default=0, min_value=0, max_value=25)
    duration_preference = serializers.ChoiceField(choices=['0-30', '30-60', '60-80'], default='30-60')
    clipping_mode = serializers.ChoiceField(choices=['viral_highlights', 'story_series'], default='story_series')

    def validate(self, data):
        if not data.get('youtube_url') and not data.get('video_file'):
            raise serializers.ValidationError("Either a YouTube URL or a video file must be provided.")
        return data


class ClipUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoClip
        fields = [
            'title',
            'parent_story_title',
            'story_id',
            'part_number',
            'total_parts',
            'ending_type',
            'hook_title',
            'start_time',
            'end_time',
            'aspect_ratio',
            'crop_mode',
            'crop_x',
            'crop_y',
            'crop_zoom',
            'crop_keyframes',
            'caption_style',
        ]
