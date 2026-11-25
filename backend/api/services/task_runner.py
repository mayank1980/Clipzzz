import os
import threading
import traceback
from django.conf import settings
from ..models import VideoProject, VideoClip
from .downloader import (
    download_youtube_video,
    probe_video_metadata,
    fetch_youtube_metadata_fast,
    download_youtube_audio_fast,
    MIN_VIDEO_DURATION_SECONDS,
)
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
            project.progress = 20
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
            project.status_message = f"Optimizing {project.download_quality} video stream for instant Shorts preview..."
            project.save(update_fields=['status', 'progress', 'status_message'])

            def update_dl_progress(pct, msg, meta=None):
                project.progress = min(35, 10 + int(pct * 0.25))
                project.download_progress = pct
                if meta:
                    project.download_speed = meta.get('speed', '')
                    project.download_eta = meta.get('eta', '')
                speed_txt = f" ({meta.get('speed')})" if meta and meta.get('speed') else ""
                project.status_message = f"Optimizing {project.download_quality} video stream: {pct}%{speed_txt}"
                project.save(update_fields=['progress', 'download_progress', 'download_speed', 'download_eta', 'status_message'])

            dl_quality = getattr(project, 'download_quality', '720p') or '720p'
            use_cache = getattr(project, 'use_cached_video', True)
            dl_res = download_youtube_video(
                project.youtube_url,
                media_videos_dir,
                update_dl_progress,
                quality=dl_quality,
                use_cache=use_cache
            )
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
            video_full_path = dl_res['file_path']
            project.save()
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

        # Guard: CLIPIT only clips long-form videos (> 3 minutes)
        if project.duration and 0 < float(project.duration) < MIN_VIDEO_DURATION_SECONDS:
            mins_d = int(float(project.duration) // 60)
            secs_d = int(float(project.duration) % 60)
            project.status = 'failed'
            project.status_message = 'Video too short for long-form clipping.'
            project.error_message = (
                f"Video is too short ({mins_d}:{secs_d:02d}). CLIPIT creates clips only from videos longer than 3 minutes (3:00+)."
            )
            project.save(update_fields=['status', 'status_message', 'error_message'])
            return

        # Step 2: Instant Dialogue & Timeline Ingestion + Vector Source Key
        from .vector_cache import (
            compute_source_key,
            load_source_cache,
            save_source_cache,
            serialize_clip_snapshot,
            TimelineVectorAllocator,
        )

        source_key = compute_source_key(
            project.youtube_url if project.source_type == 'youtube' else '',
            video_full_path,
        )
        source_cache = load_source_cache(settings.MEDIA_ROOT, source_key)

        transcript = []
        if project.transcript_raw and isinstance(project.transcript_raw, list) and len(project.transcript_raw) > 0:
            transcript = project.transcript_raw
        elif source_cache.get('transcript'):
            transcript = source_cache['transcript']
            project.transcript_raw = transcript
            project.save(update_fields=['transcript_raw'])
        elif project.source_type == 'youtube' and project.youtube_url:
            prev_proj = VideoProject.objects.filter(youtube_url=project.youtube_url).exclude(id=project.id).order_by('-created_at').first()
            if prev_proj and prev_proj.transcript_raw and isinstance(prev_proj.transcript_raw, list) and len(prev_proj.transcript_raw) > 0:
                transcript = prev_proj.transcript_raw
                project.transcript_raw = transcript
                project.save(update_fields=['transcript_raw'])

        if not transcript:
            if project.source_type == 'youtube' and project.youtube_url:
                transcript = get_native_youtube_transcript(project.youtube_url)

        if not transcript and video_full_path and os.path.exists(video_full_path) and api_key:
            try:
                audio_out = os.path.join(media_audio_dir, f"{project.id}.mp3")
                project.status_message = 'Extracting audio & transcribing dialogue with Gemini...'
                project.save(update_fields=['status_message'])
                extract_audio_from_video(video_full_path, audio_out)
                transcript = transcribe_with_gemini(audio_out, api_key)
            except Exception as tr_err:
                print(f"[_run_video_pipeline] Gemini audio transcription fallback note: {tr_err}")

        if not transcript:
            # Fast semantic timeline anchors
            transcript = generate_fallback_transcript(project.duration, project.title)

        project.transcript_raw = transcript
        project.progress = 40
        project.save(update_fields=['transcript_raw', 'progress'])

        # Step 3: Vector Mapping Allocation + Incremental Cached Clip Hydration (0-cost reuse of cached 1..K clips)
        project.status = 'analyzing'
        project.progress = 55
        project.status_message = "Initializing timeline vector map & checking cached viral clips..."
        project.save(update_fields=['status', 'progress', 'status_message'])

        def update_ai_status(pct, msg):
            project.progress = pct
            project.status_message = msg
            project.save(update_fields=['progress', 'status_message'])

        rendered_dir = os.path.join(settings.MEDIA_ROOT, 'rendered_clips')
        clean_rendered_dir = os.path.join(rendered_dir, 'clean')
        os.makedirs(rendered_dir, exist_ok=True)
        os.makedirs(clean_rendered_dir, exist_ok=True)

        allocator = TimelineVectorAllocator(project.duration or 600.0)
        cached_clip_objs: List[VideoClip] = []
        existing_clips = list(project.clips.all().order_by('part_number', 'start_time'))

        # Hydrate any clips already saved on this project OR saved in cross-upload vector cache
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

            allocator.mark_allocated(ec.start_time, ec.end_time, f"{ec.title} {ec.hook}")
            cached_clip_objs.append(ec)

        # If this is a fresh re-import/re-upload of the same video, restore previously cached clips at zero compute cost
        if not cached_clip_objs and source_cache.get('cached_clips'):
            for snap in source_cache.get('cached_clips', []):
                s_t = float(snap.get('start_time', 0.0))
                e_t = float(snap.get('end_time', s_t + 30.0))
                txt_sig = f"{snap.get('title', '')} {snap.get('hook', '')}"
                if allocator.is_conflict(s_t, e_t, txt_sig):
                    continue

                restored = VideoClip.objects.create(
                    project=project,
                    title=snap.get('title', 'Viral Highlight'),
                    parent_story_title='',
                    story_id='',
                    part_number=len(cached_clip_objs) + 1,
                    total_parts=1,
                    ending_type=snap.get('ending_type', 'punchline'),
                    hook_title=snap.get('hook_title', snap.get('title', '')),
                    start_time=s_t,
                    end_time=e_t,
                    duration=float(snap.get('duration', max(1.0, e_t - s_t))),
                    score=int(snap.get('score', 88)),
                    category=snap.get('category', 'Highlight'),
                    hook=snap.get('hook', ''),
                    reason=snap.get('reason', ''),
                    aspect_ratio=snap.get('aspect_ratio', project.target_ratio),
                    crop_mode=snap.get('crop_mode', 'custom_crop'),
                    crop_x=float(snap.get('crop_x', 50.0)),
                    crop_y=float(snap.get('crop_y', 35.0)),
                    crop_zoom=float(snap.get('crop_zoom', 1.15)),
                    crop_keyframes=snap.get('crop_keyframes') or [],
                    is_speaker_centered=bool(snap.get('is_speaker_centered', True)),
                    caption_style=snap.get('caption_style') or {},
                    render_status='completed' if snap.get('rendered_file_name') and os.path.exists(os.path.join(settings.MEDIA_ROOT, snap.get('rendered_file_name'))) else 'not_started',
                    render_progress=100 if snap.get('rendered_file_name') and os.path.exists(os.path.join(settings.MEDIA_ROOT, snap.get('rendered_file_name'))) else 0,
                    clean_render_status='completed' if snap.get('rendered_clean_file_name') and os.path.exists(os.path.join(settings.MEDIA_ROOT, snap.get('rendered_clean_file_name'))) else 'not_started',
                )
                if snap.get('rendered_file_name') and os.path.exists(os.path.join(settings.MEDIA_ROOT, snap['rendered_file_name'])):
                    restored.rendered_file.name = snap['rendered_file_name']
                    restored.rendered_hash = snap.get('rendered_hash', '')
                    restored.save(update_fields=['rendered_file', 'rendered_hash'])
                if snap.get('rendered_clean_file_name') and os.path.exists(os.path.join(settings.MEDIA_ROOT, snap['rendered_clean_file_name'])):
                    restored.rendered_clean_file.name = snap['rendered_clean_file_name']
                    restored.rendered_clean_hash = snap.get('rendered_clean_hash', '')
                    restored.save(update_fields=['rendered_clean_file', 'rendered_clean_hash'])

                allocator.mark_allocated(s_t, e_t, txt_sig)
                cached_clip_objs.append(restored)

        already_cached_count = len(cached_clip_objs)
        start_num = already_cached_count + 1

        # Gather remaining unallocated viral pool candidates first (no AI call needed if queue already has #11..#30)
        cached_pool = list(source_cache.get('viral_pool') or [])
        pending_highlights: List[Dict[str, Any]] = []
        for cand in cached_pool:
            cs = float(cand.get('start', 0.0))
            ce = float(cand.get('end', cs + 30.0))
            ctxt = f"{cand.get('title', '')} {cand.get('hook', '')}"
            if not allocator.is_conflict(cs, ce, ctxt):
                pending_highlights.append(cand)
                allocator.mark_allocated(cs, ce, ctxt)

        # If pool has unallocated viral opportunities remaining or free timeline regions need fresh discovery
        free_spans = allocator.free_intervals(min_duration=35.0)
        if not cached_pool or (not pending_highlights and len(free_spans) > 0 and already_cached_count < 15):
            if already_cached_count > 0:
                update_ai_status(
                    60,
                    f"{already_cached_count} clips restored from vector cache. Scanning free slots starting from clip #{start_num}..."
                )
            else:
                update_ai_status(60, "Scanning video timeline with Viral Highlights AI...")

            sentence_indexed_transcript = build_sentence_indexed_transcript(transcript)
            ai_discovered = analyze_highlights_with_gemini(
                transcript_segments=sentence_indexed_transcript,
                video_title=project.title,
                total_duration=project.duration,
                api_key=api_key,
                target_count=0,
                duration_preference=project.duration_preference,
                clipping_mode='viral_highlights',
                progress_callback=update_ai_status,
                exclude_intervals=allocator.occupied_intervals(),
            )
            for cand in ai_discovered:
                cs = float(cand.get('start', 0.0))
                ce = float(cand.get('end', cs + 30.0))
                ctxt = f"{cand.get('title', '')} {cand.get('hook', '')}"
                if not allocator.is_conflict(cs, ce, ctxt):
                    pending_highlights.append(cand)
                    allocator.mark_allocated(cs, ce, ctxt)
                    cached_pool.append(cand)

        total_clips = already_cached_count + len(pending_highlights)
        if already_cached_count > 0 and pending_highlights:
            update_ai_status(
                85,
                f"Restored {already_cached_count} cached clips. Processing clips #{start_num}–#{total_clips}..."
            )
        elif already_cached_count > 0:
            update_ai_status(90, f"All {already_cached_count} viral clips restored instantly from vector cache.")
        else:
            update_ai_status(85, f"Discovered {total_clips} high-engagement clips. Framing in parallel...")

        # Checkpoint transcript & full viral pool immediately to vector cache
        if source_key:
            save_source_cache(settings.MEDIA_ROOT, source_key, {
                "source_key": source_key,
                "title": project.title,
                "duration": float(project.duration or 0.0),
                "transcript": transcript,
                "viral_pool": cached_pool,
                "cached_clips": [serialize_clip_snapshot(c) for c in cached_clip_objs],
            })

        # Pre-extract master words with global timestamps once (only needed if creating new clips)
        master_words = []
        if pending_highlights and transcript:
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

        already_created_count = already_cached_count
        highlights = pending_highlights
        highlight_to_clip = {}

        # Enhance any cached clips that still lack multi-speaker tracking keyframes
        for c_existing in cached_clip_objs:
            if (not c_existing.crop_keyframes or len(c_existing.crop_keyframes) <= 1 or c_existing.crop_x == 50.0) and getattr(project, 'auto_speaker_tracking', True) and video_full_path and os.path.exists(video_full_path):
                try:
                    from .face_tracker import generate_camera_keyframes, analyze_clip_initial_framing
                    computed_kfs = analyze_clip_initial_framing(video_full_path, c_existing.start_time, c_existing.duration) if total_clips > 6 else generate_camera_keyframes(video_full_path, c_existing.start_time, c_existing.duration)
                    if computed_kfs:
                        c_existing.crop_keyframes = computed_kfs
                        c_existing.crop_x = computed_kfs[0]['x']
                        c_existing.crop_y = computed_kfs[0]['y']
                        c_existing.crop_zoom = computed_kfs[0].get('zoom', 1.15)
                        c_existing.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom'])
                except Exception as e:
                    print(f"[task_runner] Re-tracking cached clip notice: {e}")

        missing_indices = list(range(len(highlights)))
        precomputed_kfs = {}
        used_fast_initial_framing = any(len(c.crop_keyframes or []) <= 1 or any(isinstance(k, dict) and k.get('initial') for k in (c.crop_keyframes or [])) for c in cached_clip_objs)

        if missing_indices and getattr(project, 'auto_speaker_tracking', True) and video_full_path and os.path.exists(video_full_path):
            from concurrent.futures import ThreadPoolExecutor, as_completed
            from .face_tracker import generate_camera_keyframes, analyze_clip_initial_framing

            use_fast_initial = len(missing_indices) > 6
            if use_fast_initial:
                used_fast_initial_framing = True
            worker_count = min(8 if use_fast_initial else 6, len(missing_indices))

            update_ai_status(
                85,
                f"Framing clips #{start_num}–#{total_clips} in parallel ({worker_count} workers)..."
            )

            def _track_one(item_idx: int):
                item_h = highlights[item_idx]
                s_t = float(item_h['start'])
                e_t = float(item_h['end'])
                dur_t = max(1.0, e_t - s_t)
                if use_fast_initial:
                    kfs = analyze_clip_initial_framing(video_full_path, s_t, dur_t)
                else:
                    kfs = generate_camera_keyframes(video_full_path, s_t, dur_t)
                return item_idx, kfs

            completed_tracks = 0
            with ThreadPoolExecutor(max_workers=worker_count) as pool:
                futures = {pool.submit(_track_one, m_idx): m_idx for m_idx in missing_indices}
                for fut in as_completed(futures):
                    m_idx = futures[fut]
                    try:
                        ret_idx, ret_kfs = fut.result()
                        if ret_kfs:
                            precomputed_kfs[ret_idx] = ret_kfs
                    except Exception as track_err:
                        print(f"[_run_video_pipeline] Parallel tracking notice for clip #{start_num + m_idx}: {track_err}")
                    completed_tracks += 1
                    if completed_tracks % 8 == 0 or completed_tracks == len(missing_indices):
                        pct_track = 85 + int((completed_tracks / max(1, len(missing_indices))) * 10)
                        update_ai_status(
                            pct_track,
                            f"Framed {already_cached_count + completed_tracks}/{total_clips} clips..."
                        )

        created_count = 0
        # Pass 2: Create ONLY new unallocated clips starting cleanly at clip #(already_cached_count + 1)
        for idx, h in enumerate(highlights):
            seq_num = start_num + idx
            c_start = float(h['start'])
            c_end = float(h['end'])
            c_dur = max(1.0, c_end - c_start)

            pct = 95 + int(((seq_num) / max(1, total_clips)) * 4)
            clip_title = h.get('title', f"Clip {seq_num}")
            if idx == 0 or (idx + 1) % 8 == 0 or (idx + 1) == len(highlights):
                project.progress = pct
                project.status_message = f"Assembling Viral Clip ({seq_num}/{total_clips}): '{clip_title[:28]}' ({c_dur:.0f}s)..."
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

            # Fast, accurate primary speaker centering and dynamic camera keyframes on clip creation
            computed_kfs = precomputed_kfs.get(idx)
            if computed_kfs:
                crop_keyframes = computed_kfs
                crop_x = computed_kfs[0]['x']
                crop_y = computed_kfs[0]['y']
                crop_zoom = computed_kfs[0].get('zoom', 1.15)
            elif getattr(project, 'auto_speaker_tracking', True) and video_full_path and os.path.exists(video_full_path):
                try:
                    from .face_tracker import analyze_clip_initial_framing
                    computed_kfs = analyze_clip_initial_framing(video_full_path, c_start, c_dur)
                    if computed_kfs:
                        crop_keyframes = computed_kfs
                        crop_x = computed_kfs[0]['x']
                        crop_y = computed_kfs[0]['y']
                        crop_zoom = computed_kfs[0].get('zoom', 1.15)
                except Exception as track_err:
                    print(f"[_run_video_pipeline] Auto-tracking notice for clip {idx + 1}: {track_err}")

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
                parent_story_title='',
                story_id='',
                part_number=seq_num,
                total_parts=1,
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
            if source_key and (created_count % 5 == 0 or (idx + 1) == len(highlights)):
                save_source_cache(settings.MEDIA_ROOT, source_key, {
                    "source_key": source_key,
                    "title": project.title,
                    "duration": float(project.duration or 0.0),
                    "transcript": transcript,
                    "viral_pool": cached_pool,
                    "cached_clips": [serialize_clip_snapshot(c) for c in (cached_clip_objs + list(highlight_to_clip.values()))],
                })

        # Keep both restored cached clips AND newly created clips
        all_retained_ids = [c.id for c in (cached_clip_objs + list(highlight_to_clip.values())) if hasattr(c, 'id')]
        project.clips.exclude(id__in=all_retained_ids).delete()

        # Persist complete vector cache snapshot for instant future re-imports
        if source_key:
            save_source_cache(settings.MEDIA_ROOT, source_key, {
                "source_key": source_key,
                "title": project.title,
                "duration": float(project.duration or 0.0),
                "transcript": transcript,
                "viral_pool": cached_pool,
                "cached_clips": [serialize_clip_snapshot(c) for c in project.clips.all().order_by('part_number', 'start_time')],
            })

        # Step 5: Finalize and prepare Studio
        project.progress = 100
        project.download_progress = 100

        # Complete!
        project.status = 'ready'
        project.progress = 100
        if already_created_count > 0:
            project.status_message = f'Ready! {total_clips}/{total_clips} clips ready ({already_created_count} retained from vector cache, {created_count} newly generated).'
        else:
            project.status_message = f'Ready! Generated {total_clips} engaging clips.'
        project.save(update_fields=['status', 'progress', 'status_message'])

        # Non-blocking background enrichment: fill continuous second-by-second camera keyframes
        # after Studio is already open so large batches don't make the user wait.
        if used_fast_initial_framing and video_full_path and os.path.exists(video_full_path):
            threading.Thread(
                target=_enrich_project_keyframes_async,
                args=(str(project.id), video_full_path, source_key),
                daemon=True,
            ).start()

    except Exception as e:
        traceback.print_exc()
        project.status = 'failed'
        err_msg = str(e)
        if 'Sign in to confirm' in err_msg or 'bot' in err_msg.lower():
            friendly_err = "YouTube anti-bot verification required. Automatic tv/visionos bypass active. For high-volume usage, place a cookies.txt in the CLIPIT folder."
            project.error_message = friendly_err
            project.status_message = friendly_err
        else:
            project.error_message = err_msg
            project.status_message = f"Failed: {err_msg[:100]}"
        project.save(update_fields=['status', 'error_message', 'status_message'])


def _enrich_project_keyframes_async(project_id: str, video_full_path: str, source_key: str = ""):
    """
    Background worker that upgrades single-frame/initial clip framing into full continuous
    multi-speaker camera keyframes without blocking Studio availability, and refreshes vector cache.
    """
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from .face_tracker import generate_camera_keyframes
        from .vector_cache import load_source_cache, save_source_cache, serialize_clip_snapshot

        clips = list(
            VideoClip.objects.filter(project_id=project_id).order_by('part_number', 'start_time')
        )
        pending = [
            c for c in clips
            if c.crop_mode != 'manual_crop'
            and (
                len(c.crop_keyframes or []) <= 1
                or any(isinstance(kf, dict) and kf.get('initial') for kf in (c.crop_keyframes or []))
            )
            and not (c.crop_keyframes and c.crop_keyframes[0].get('speaker') in ('Manual Focus', 'Manual Framing'))
        ]
        if not pending:
            return

        def _compute_for_clip(clip_obj):
            return str(clip_obj.id), generate_camera_keyframes(video_full_path, clip_obj.start_time, clip_obj.duration)

        updated_any = False
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(_compute_for_clip, c) for c in pending]
            for fut in as_completed(futures):
                try:
                    cid, computed_kfs = fut.result()
                    if not computed_kfs:
                        continue
                    fresh = VideoClip.objects.filter(id=cid).first()
                    if not fresh or fresh.crop_mode == 'manual_crop':
                        continue
                    fresh_kfs = fresh.crop_keyframes or []
                    is_still_initial = len(fresh_kfs) <= 1 or any(isinstance(kf, dict) and kf.get('initial') for kf in fresh_kfs)
                    if not is_still_initial:
                        continue
                    first_spk = (fresh.crop_keyframes[0].get('speaker') if fresh.crop_keyframes else '')
                    if first_spk in ('Manual Focus', 'Manual Framing'):
                        continue
                    fresh.crop_keyframes = computed_kfs
                    fresh.crop_x = computed_kfs[0]['x']
                    fresh.crop_y = computed_kfs[0]['y']
                    fresh.crop_zoom = fresh.crop_zoom or computed_kfs[0].get('zoom', 1.15)
                    fresh.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom'])
                    updated_any = True
                except Exception as ce:
                    print(f"[_enrich_project_keyframes_async] Clip keyframe enrichment notice: {ce}")

        if updated_any and source_key:
            cur_cache = load_source_cache(settings.MEDIA_ROOT, source_key)
            if cur_cache:
                cur_cache["cached_clips"] = [
                    serialize_clip_snapshot(c)
                    for c in VideoClip.objects.filter(project_id=project_id).order_by('part_number', 'start_time')
                ]
                save_source_cache(settings.MEDIA_ROOT, source_key, cur_cache)
    except Exception as e:
        print(f"[_enrich_project_keyframes_async] Enrichment notice: {e}")


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
        crop_kfs = list(clip.crop_keyframes or [])
        user_zoom = max(1.0, min(2.5, float(clip.crop_zoom or 1.15)))

        is_user_customized = False
        if crop_kfs and len(crop_kfs) > 0:
            first_kf = crop_kfs[0]
            if first_kf.get('speaker') in ('Manual Focus', 'Manual Framing') or clip.crop_mode == 'manual_crop':
                is_user_customized = True

        needs_keyframes = len(crop_kfs) <= 1 or any(isinstance(kf, dict) and kf.get('initial') for kf in crop_kfs)
        if not is_user_customized and needs_keyframes and getattr(project, 'auto_speaker_tracking', True):
            try:
                from .face_tracker import generate_camera_keyframes
                computed_kfs = generate_camera_keyframes(source_video_path, clip.start_time, clip.duration)
                if computed_kfs:
                    crop_kfs = computed_kfs
                    clip.crop_keyframes = computed_kfs
                    clip.crop_x = computed_kfs[0]['x']
                    clip.crop_y = computed_kfs[0]['y']
                    clip.crop_zoom = user_zoom
                    clip.save(update_fields=['crop_keyframes', 'crop_x', 'crop_y', 'crop_zoom'])
            except Exception as fe:
                print(f"[_run_clip_render] On-demand neural tracking notice: {fe}")

        # Ensure all keyframes respect the user's selected zoom/resizing
        for kf in crop_kfs:
            kf['zoom'] = user_zoom

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
            crop_zoom=user_zoom,
            crop_keyframes=crop_kfs,
            caption_style=active_caption_style,
            segments=project.transcript_raw if not clean else None,
            channel_name=channel_name if not clean else ""
        )

        rel_path = f"rendered_clips/{'clean/' if clean else ''}{output_filename}"
        from .editor import compute_clip_render_hash
        render_hash = compute_clip_render_hash(clip, mode='clean' if clean else 'captioned')

        if clean:
            clip.rendered_clean_file.name = rel_path
            clip.clean_render_status = 'completed'
            clip.rendered_clean_hash = render_hash
            clip.save(update_fields=['rendered_clean_file', 'clean_render_status', 'rendered_clean_hash'])
        else:
            clip.rendered_file.name = rel_path
            clip.render_status = 'completed'
            clip.render_progress = 100
            clip.rendered_hash = render_hash
            clip.save(update_fields=['rendered_file', 'render_status', 'render_progress', 'rendered_hash'])

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
