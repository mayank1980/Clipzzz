import uuid
from django.db import models
from django.contrib.auth.models import User
from .services.security import encrypt_api_key, decrypt_api_key, mask_api_key

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    contact_number = models.CharField(max_length=30, blank=True, default='')
    encrypted_gemini_key = models.TextField(blank=True, default='')
    
    # OTP authentication storage
    otp_code = models.CharField(max_length=10, blank=True, default='')
    otp_created_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_gemini_key(self, raw_key: str):
        self.encrypted_gemini_key = encrypt_api_key(raw_key)
        self.save(update_fields=['encrypted_gemini_key', 'updated_at'])

    def get_decrypted_gemini_key(self) -> str:
        return decrypt_api_key(self.encrypted_gemini_key)

    @property
    def masked_gemini_key(self) -> str:
        decrypted = self.get_decrypted_gemini_key()
        return mask_api_key(decrypted)

    @property
    def has_gemini_key(self) -> bool:
        return bool(self.encrypted_gemini_key and len(self.encrypted_gemini_key) > 10)

    def __str__(self):
        return f"{self.user.email} (has_key={self.has_gemini_key})"


class VideoProject(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('downloading', 'Downloading Video'),
        ('extracting_audio', 'Extracting Audio'),
        ('transcribing', 'Transcribing Audio'),
        ('analyzing', 'AI Highlight Analysis'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]

    SOURCE_CHOICES = [
        ('youtube', 'YouTube URL'),
        ('upload', 'Direct File Upload'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, related_name='projects', on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=255, default='Untitled Video')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='youtube')
    youtube_url = models.URLField(max_length=500, blank=True, null=True)
    video_file = models.FileField(upload_to='videos/%Y/%m/%d/', blank=True, null=True)
    audio_file = models.FileField(upload_to='audio/%Y/%m/%d/', blank=True, null=True)
    thumbnail_url = models.URLField(max_length=500, blank=True, null=True)
    channel_name = models.CharField(max_length=255, blank=True, default='')
    
    # User Project Preferences
    target_ratio = models.CharField(max_length=20, default='9:16') # Exclusively 9:16 Portrait Shorts
    download_quality = models.CharField(max_length=20, default='720p') # '720p', '1080p', '480p'
    download_full_video = models.BooleanField(default=False) # Fallback mode: only download full file if explicitly requested
    use_cached_video = models.BooleanField(default=True)
    auto_speaker_tracking = models.BooleanField(default=True)
    requested_clip_count = models.IntegerField(default=0) # 5, 7, 9, 11
    duration_preference = models.CharField(max_length=20, default='30-60') # '0-30', '30-60', '60-80'
    clipping_mode = models.CharField(max_length=50, default='story_series') # 'viral_highlights' or 'story_series'

    # Video metadata
    duration = models.FloatField(default=0.0)
    width = models.IntegerField(default=1920)
    height = models.IntegerField(default=1080)
    fps = models.FloatField(default=30.0)

    # Status tracking
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    progress = models.IntegerField(default=0)
    download_progress = models.IntegerField(default=0)
    download_speed = models.CharField(max_length=50, blank=True, default='')
    download_eta = models.CharField(max_length=50, blank=True, default='')
    status_message = models.CharField(max_length=255, default='Project initialized')
    error_message = models.TextField(blank=True, null=True)

    # Transcript data
    transcript_raw = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.status})"

    class Meta:
        ordering = ['-created_at']


class VideoClip(models.Model):
    RENDER_STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('rendering', 'Rendering'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(VideoProject, related_name='clips', on_delete=models.CASCADE)
    title = models.CharField(max_length=255, default='Highlight Clip')

    # Episodic Story / Multi-Part Metadata
    parent_story_title = models.CharField(max_length=255, blank=True, default='')
    story_id = models.CharField(max_length=100, blank=True, default='')
    part_number = models.IntegerField(default=1)
    total_parts = models.IntegerField(default=1)
    ending_type = models.CharField(
        max_length=50,
        choices=[
            ('punchline', 'Punchline'),
            ('cliffhanger', 'Cliffhanger'),
            ('takeaway', 'Takeaway'),
        ],
        default='punchline',
        blank=True
    )
    hook_title = models.CharField(max_length=255, blank=True, default='')
    
    # Timing
    start_time = models.FloatField(default=0.0)
    end_time = models.FloatField(default=30.0)
    duration = models.FloatField(default=30.0)
    
    # AI Analysis & Scoring
    score = models.IntegerField(default=90)
    category = models.CharField(max_length=100, default='Highlight')
    hook = models.TextField(blank=True, default='')
    reason = models.TextField(blank=True, default='')

    # Visual & Framing Settings
    aspect_ratio = models.CharField(max_length=20, default='9:16')
    crop_mode = models.CharField(max_length=50, default='blur_fill') # blur_fill, center_crop, custom_crop
    crop_x = models.FloatField(default=50.0)
    crop_y = models.FloatField(default=45.0)
    crop_zoom = models.FloatField(default=1.0)
    crop_keyframes = models.JSONField(default=list, blank=True)
    is_speaker_centered = models.BooleanField(default=False)

    # Subtitle / Caption Customization
    caption_style = models.JSONField(default=dict, blank=True)

    # Rendered video (with captions)
    rendered_file = models.FileField(upload_to='rendered_clips/%Y/%m/%d/', blank=True, null=True)
    rendered_hash = models.CharField(max_length=64, blank=True, default='')
    render_status = models.CharField(max_length=30, choices=RENDER_STATUS_CHOICES, default='not_started')
    render_progress = models.IntegerField(default=0)

    # Rendered clean video (without captions)
    rendered_clean_file = models.FileField(upload_to='rendered_clips/clean/%Y/%m/%d/', blank=True, null=True)
    rendered_clean_hash = models.CharField(max_length=64, blank=True, default='')
    clean_render_status = models.CharField(max_length=30, choices=RENDER_STATUS_CHOICES, default='not_started')

    error_message = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.end_time > self.start_time:
            self.duration = round(self.end_time - self.start_time, 2)
        if not self.caption_style:
            self.caption_style = {
                "font": "Montserrat",
                "textColor": "#FFFFFF",
                "highlightColor": "#bef264",
                "alignment": "center",
                "position": "bottom",
                "fontSize": 22,
                "showCaptions": True,
                "animation": "karaoke",
                "shadow": True,
            }
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.start_time:.1f}s - {self.end_time:.1f}s)"

    class Meta:
        ordering = ['-score', 'start_time']
