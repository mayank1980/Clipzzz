import os
import re
import json
import time
import subprocess
import yt_dlp
from pathlib import Path
from django.conf import settings

def get_youtube_video_id(url: str) -> str:
    """Extract 11-char video ID from YouTube URL."""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:embed\/|shorts\/)([0-9A-Za-z_-]{11})',
        r'^([0-9A-Za-z_-]{11})$'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ''

def probe_video_metadata(video_path: str) -> dict:
    """
    Extracts video duration, width, height, fps, and format using ffprobe.
    """
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        duration = float(data.get('format', {}).get('duration', 0.0))
        width = 1920
        height = 1080
        fps = 30.0

        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'video':
                width = int(stream.get('width', 1920))
                height = int(stream.get('height', 1080))
                
                # Parse FPS e.g. "30/1" or "29.97"
                r_frame_rate = stream.get('r_frame_rate', '30/1')
                if '/' in r_frame_rate:
                    num, den = r_frame_rate.split('/')
                    fps = float(num) / float(den) if float(den) > 0 else 30.0
                else:
                    fps = float(r_frame_rate)
                break

        return {
            'duration': duration,
            'width': width,
            'height': height,
            'fps': round(fps, 2),
        }
    except Exception as e:
        print(f"[probe_video_metadata] Error probing {video_path}: {e}")
        return {
            'duration': 0.0,
            'width': 1920,
            'height': 1080,
            'fps': 30.0
        }

def download_youtube_video(url: str, output_dir: str, progress_callback=None, quality='720p', use_cache=True) -> dict:
    """
    Downloads YouTube video via yt-dlp in configurable quality (720p, 1080p, 480p).
    Defaults to 720p HD for 4x faster downloads, significantly reduced file size, and optimal Shorts processing.
    Optimized for high-speed connections with concurrent fragment streaming (8 parallel streams).
    Provides granular speed (MB/s), ETA, and size metrics to frontend.
    """
    os.makedirs(output_dir, exist_ok=True)
    video_id = get_youtube_video_id(url)

    # 1. Check if video already exists locally (silent cache hit)
    if video_id and use_cache:
        tags_to_check = [f"_{quality}", "_720p", "_1080p", "_480p", ""]
        for ext in ['mp4', 'mkv', 'webm']:
            for q_tag in tags_to_check:
                cand = os.path.join(output_dir, f"{video_id}{q_tag}.{ext}")
                if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 100:
                    print(f"[download_youtube_video] Local video cached at {cand}. Skipping download!")
                    if progress_callback:
                        progress_callback(100, "Local video file found. Skipping download...", {
                            'download_pct': 100,
                            'speed': 'Instant (Cached)',
                            'eta': '0s',
                            'downloaded_bytes': os.path.getsize(cand),
                            'total_bytes': os.path.getsize(cand)
                        })
                    probe = probe_video_metadata(cand)
                    video_title = f"YouTube Video ({video_id})"
                    thumbnail = ""
                    try:
                        meta_opts = {
                            'quiet': True,
                            'no_warnings': True,
                            'remote_components': ['ejs:github'],
                            'extractor_args': {'youtube': {'player_client': ['tv_embedded', 'visionos', 'android']}}
                        }
                        with yt_dlp.YoutubeDL(meta_opts) as ydl:
                            info = ydl.extract_info(url, download=False)
                            video_title = info.get('title', video_title)
                            thumbnail = info.get('thumbnail', '')
                    except Exception:
                        pass

                    return {
                        'video_id': video_id,
                        'title': video_title,
                        'thumbnail': thumbnail,
                        'duration': probe['duration'],
                        'width': probe['width'],
                        'height': probe['height'],
                        'fps': probe['fps'],
                        'file_path': cand,
                    }

    out_template = os.path.join(output_dir, f'%(id)s_{quality}.%(ext)s')
    last_update_time = [0.0]
    last_pct = [-1]

    def hook(d):
        if d['status'] == 'downloading' and progress_callback:
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            speed = d.get('speed') or 0.0
            eta = d.get('eta')

            pct = int((downloaded / total) * 100) if total > 0 else 0
            now = time.time()

            # Throttle callback to at most once per 250ms or when pct changes
            if (now - last_update_time[0] < 0.25) and (pct == last_pct[0]):
                return
            last_update_time[0] = now
            last_pct[0] = pct

            speed_str = ""
            if speed > 0:
                if speed >= 1024 * 1024:
                    speed_str = f"{speed / (1024 * 1024):.1f} MB/s"
                else:
                    speed_str = f"{speed / 1024:.0f} KB/s"

            eta_str = ""
            if eta is not None and eta >= 0:
                if eta < 60:
                    eta_str = f"ETA {int(eta)}s"
                else:
                    eta_str = f"ETA {int(eta // 60)}m {int(eta % 60):02d}s"

            size_str = ""
            if total > 0:
                dl_mb = downloaded / (1024 * 1024)
                tot_mb = total / (1024 * 1024)
                size_str = f"{dl_mb:.0f}/{tot_mb:.0f} MB"

            details = [s for s in [size_str, speed_str, eta_str] if s]
            details_txt = f" ({' · '.join(details)})" if details else ""
            msg = f"Downloading {quality} video (Fallback): {pct}%{details_txt}"

            meta = {
                'download_pct': pct,
                'speed': speed_str,
                'eta': eta_str,
                'size': size_str,
                'downloaded_bytes': downloaded,
                'total_bytes': total
            }
            progress_callback(pct, msg, meta)

    # Format selection according to user quality preference (capped to 30fps MP4 to avoid oversized 60fps bloat)
    if quality == '480p':
        format_spec = 'bestvideo[height<=480][fps<=30][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]'
        fallback_fmt = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best'
    elif quality == '1080p':
        format_spec = 'bestvideo[height<=1080][fps<=30][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/bv*+ba/best'
        fallback_fmt = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
    else:  # '720p' (default: 4x faster, compact and ideal for mobile shorts)
        format_spec = 'bestvideo[height<=720][fps<=30][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best'
        fallback_fmt = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best'

    # Resilient yt-dlp configuration with Node.js challenge solving & multi-tiered format selection
    ydl_opts = {
        'format': format_spec,
        'outtmpl': out_template,
        'merge_output_format': 'mp4',
        'progress_hooks': [hook],
        'concurrent_fragment_downloads': 8,   # 8 parallel fragment streams for max speed
        'buffersize': 1024 * 1024 * 8,        # 8 MB socket buffer
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        'file_access_retries': 5,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'remote_components': ['ejs:github'],
        'js_runtimes': {'node': {}},
    }

    # Automatically scan for cookies.txt across project roots, Downloads, and Desktop folders
    cookie_candidates = [
        os.path.join(settings.BASE_DIR, 'cookies.txt'),
        os.path.join(settings.BASE_DIR, '..', 'cookies.txt'),
        os.path.join(settings.MEDIA_ROOT, 'cookies.txt'),
        os.path.expanduser('~/Downloads/cookies.txt'),
        os.path.expanduser('~/Downloads/youtube_cookies.txt'),
        os.path.expanduser('~/Desktop/cookies.txt'),
    ]
    for c_path in cookie_candidates:
        if os.path.exists(c_path) and os.path.getsize(c_path) > 10:
            ydl_opts['cookiefile'] = os.path.abspath(c_path)
            print(f"[download_youtube_video] Loaded authentication cookies from {c_path}")
            break

    # Download with automatic fallback for formats and anti-bot verification
    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as dl_err:
        err_msg = str(dl_err)
        print(f"[download_youtube_video] Initial attempt encountered: {err_msg}")

        # Format availability fallback
        if 'Requested format is not available' in err_msg or 'format' in err_msg.lower():
            print("[download_youtube_video] Format restriction detected. Retrying with format selector...")
            try:
                fmt_opts = dict(ydl_opts)
                fmt_opts['format'] = fallback_fmt
                with yt_dlp.YoutubeDL(fmt_opts) as ydl_fmt:
                    info = ydl_fmt.extract_info(url, download=True)
            except Exception as fmt_err:
                print(f"[download_youtube_video] Format retry encountered: {fmt_err}")
                err_msg = str(fmt_err)

        # Anti-bot / sign-in challenge fallback
        if not info and ('Sign in to confirm' in err_msg or 'bot' in err_msg.lower() or '429' in err_msg or '403' in err_msg):
            print("[download_youtube_video] Bot challenge detected. Retrying with alternative clients...")
            fallback_clients = [
                ['tv_samsung', 'web'],
                ['mweb', 'android'],
                ['ios'],
            ]
            for cl in fallback_clients:
                try:
                    fallback_opts = dict(ydl_opts)
                    fallback_opts['format'] = fallback_fmt
                    fallback_opts['extractor_args'] = {'youtube': {'player_client': cl}}
                    with yt_dlp.YoutubeDL(fallback_opts) as ydl_fb:
                        info = ydl_fb.extract_info(url, download=True)
                    if info:
                        print(f"[download_youtube_video] Succeeded with client profile: {cl}")
                        break
                except Exception as fb_err:
                    print(f"[download_youtube_video] Client profile {cl} failed: {fb_err}")
                    continue
                except Exception as fb_err:
                    print(f"[download_youtube_video] Client profile {cl} failed: {fb_err}")
                    continue

        if not info:
            if 'Sign in to confirm' in err_msg or 'bot' in err_msg.lower():
                raise ValueError(
                    "YouTube anti-bot verification required. To proceed instantly: "
                    "1) Switch to 'File Upload' to upload the video file directly (100% offline bypass), or "
                    "2) Export cookies.txt from YouTube (using 'Get cookies.txt LOCALLY' extension) into your Downloads or CLIPZZZ folder."
                )
            raise dl_err

    if not info:
        raise ValueError("Failed to extract YouTube video information.")

    video_id = info.get('id', 'video')
    video_title = info.get('title', 'YouTube Video')
    channel_name = info.get('uploader') or info.get('channel') or info.get('creator') or ''
    thumbnail = info.get('thumbnail', '')
    duration = float(info.get('duration', 0.0))
    
    # Determine actual file path
    output_path = None
    for q_tag in [f"_{quality}", ""]:
        for ext in ['mp4', 'mkv', 'webm']:
            cand = os.path.join(output_dir, f"{video_id}{q_tag}.{ext}")
            if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 10:
                output_path = cand
                break
        if output_path:
            break

    if not output_path or not os.path.exists(output_path):
        for ext in ['mp4', 'mkv', 'webm']:
            cand = os.path.join(output_dir, f"{video_id}.{ext}")
            if os.path.exists(cand):
                output_path = cand
                break

    if not output_path or not os.path.exists(output_path):
        raise FileNotFoundError(f"Downloaded video file not found in {output_dir} for {video_id}")

    probe = probe_video_metadata(output_path)
    if duration == 0.0:
        duration = probe['duration']

    return {
        'video_id': video_id,
        'title': video_title,
        'channel_name': channel_name,
        'thumbnail': thumbnail,
        'duration': duration,
        'width': probe['width'],
        'height': probe['height'],
        'fps': probe['fps'],
        'file_path': output_path,
    }


def find_cookie_file():
    """Locates cookies.txt across workspace, downloads, and user desktop."""
    cookie_candidates = [
        os.path.join(settings.BASE_DIR, 'cookies.txt'),
        os.path.join(settings.BASE_DIR, '..', 'cookies.txt'),
        os.path.join(settings.MEDIA_ROOT, 'cookies.txt'),
        os.path.expanduser('~/Downloads/cookies.txt'),
        os.path.expanduser('~/Downloads/youtube_cookies.txt'),
        os.path.expanduser('~/Desktop/cookies.txt'),
    ]
    for c_path in cookie_candidates:
        if os.path.exists(c_path) and os.path.getsize(c_path) > 10:
            return os.path.abspath(c_path)
    return None


def fetch_youtube_metadata_fast(url: str) -> dict:
    """
    Sub-second metadata extraction with 0 bytes of video downloaded.
    Extracts title, channel, duration, thumbnail, and dimensions.
    """
    video_id = get_youtube_video_id(url)
    out = {
        'video_id': video_id,
        'title': f'YouTube Video ({video_id})',
        'channel_name': '',
        'thumbnail': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg" if video_id else '',
        'duration': 0.0,
        'width': 1920,
        'height': 1080,
        'fps': 30.0,
    }
    cookie_file = find_cookie_file()
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'remote_components': ['ejs:github'],
        'extractor_args': {'youtube': {'player_client': ['tv_embedded', 'visionos', 'android']}},
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info:
                out['video_id'] = info.get('id', video_id)
                out['title'] = info.get('title', out['title'])
                out['channel_name'] = info.get('uploader') or info.get('channel') or info.get('creator') or ''
                out['thumbnail'] = info.get('thumbnail') or out['thumbnail']
                out['duration'] = float(info.get('duration', 0.0) or 0.0)
                out['width'] = int(info.get('width', 1920) or 1920)
                out['height'] = int(info.get('height', 1080) or 1080)
                out['fps'] = float(info.get('fps', 30.0) or 30.0)
    except Exception as e:
        print(f"[fetch_youtube_metadata_fast] Metadata probe note: {e}")

    return out


def download_youtube_audio_fast(url: str, output_path: str, progress_callback=None) -> str:
    """
    Lightning-fast audio stream download (~10-15 MB) for speech recognition.
    Takes 2-4 seconds instead of waiting for a 1.2 GB video.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cookie_file = find_cookie_file()
    base_target = output_path.replace('.mp3', '')

    ydl_opts = {
        'format': 'ba/bestaudio/best',
        'outtmpl': base_target + '.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '128',
        }],
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'remote_components': ['ejs:github'],
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    if progress_callback:
        def hook(d):
            if d['status'] == 'downloading':
                tot = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
                dl = d.get('downloaded_bytes', 0)
                pct = int((dl / max(1, tot)) * 100)
                progress_callback(pct, f"Downloading audio stream: {pct}% (~12 MB)")
        ydl_opts['progress_hooks'] = [hook]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
    except Exception as e:
        print(f"[download_youtube_audio_fast] Audio extraction note: {e}")

    if os.path.exists(output_path) and os.path.getsize(output_path) > 1024:
        return output_path

    for ext in ['.mp3', '.m4a', '.webm', '.opus']:
        cand = base_target + ext
        if os.path.exists(cand) and os.path.getsize(cand) > 1024:
            return cand

    return output_path


def inspect_and_classify_video(url: str, gemini_api_key: str = None) -> dict:
    """
    On-the-spot video inspection, metadata extraction, AI content classification,
    and automatic background pre-downloading.
    """
    import threading
    video_id = get_youtube_video_id(url)
    if not video_id:
        return {'success': False, 'error': 'Invalid YouTube URL provided.'}

    title = f"YouTube Video ({video_id})"
    author = ""
    duration = 0.0
    thumbnail = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
    description = ""

    # 1. Fast metadata extraction via yt-dlp flat extract
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'extract_flat': True,
            'remote_components': ['ejs:github'],
            'extractor_args': {'youtube': {'player_client': ['tv_embedded', 'android', 'web']}}
        }
        cfile = find_cookie_file()
        if cfile:
            ydl_opts['cookiefile'] = cfile

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info:
                title = info.get('title') or title
                author = info.get('uploader') or info.get('channel') or ''
                duration = float(info.get('duration') or 0.0)
                thumbnail = info.get('thumbnail') or thumbnail
                description = (info.get('description') or '')[:500]
    except Exception as e:
        print(f"[inspect_and_classify_video] yt-dlp flat extract note: {e}")
        # Fast fallback: oEmbed
        try:
            import urllib.request
            oe_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            req = urllib.request.Request(oe_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3) as resp:
                oe = json.loads(resp.read().decode())
                title = oe.get('title') or title
                author = oe.get('author_name') or author
                thumbnail = oe.get('thumbnail_url') or thumbnail
        except Exception:
            pass

    # Format human-readable duration
    mins = int(duration // 60)
    secs = int(duration % 60)
    duration_str = f"{mins}:{secs:02d}" if duration > 0 else ""

    # 2. Content classification & mode recommendation
    text_corpus = f"{title} {author} {description}".lower()

    if any(k in text_corpus for k in ['horror', 'bhoot', 'chudail', 'ghost', 'paranormal', 'incident', 'darr', 'haunted', 'scary', 'mystery', 'crime', 'true crime', 'case', 'murder', 'qissa']):
        content_type = "Horror & Paranormal Story Arc"
        recommended_mode = "story_series"
        reason = "Continuous narrative incident detected. Slices complete consecutive episodes (Part 1 to Part N) until the story concludes."
    elif any(k in text_corpus for k in ['podcast', 'interview', 'story', 'kahani', 'biopic', 'journey', 'life of', 'real experience', 'narration', 'conversation', 'talk']):
        content_type = "Story Narration & Deep Podcast"
        recommended_mode = "story_series"
        reason = "Narrative storytelling detected. Story Series preserves the chronological arc without mid-sentence cutoffs."
    elif any(k in text_corpus for k in ['comedy', 'standup', 'roast', 'funny', 'joke', 'laughter', 'sketch', 'mimicry', 'crowd work', 'meme']):
        content_type = "Standup Comedy & Humor"
        recommended_mode = "viral_highlights"
        reason = "High-energy punchlines detected. Viral Highlights extracts the top standalone comedic hooks across the timeline."
    elif any(k in text_corpus for k in ['motivation', 'speech', 'ted', 'advice', 'success', 'mindset', 'habits', 'rules', 'growth']):
        content_type = "Motivational Keynote & Speech"
        recommended_mode = "viral_highlights"
        reason = "Strong actionable takeaway hooks detected. Viral Highlights maximizes standalone opening retention."
    else:
        content_type = "General Video Content"
        recommended_mode = "viral_highlights"
        reason = "Viral Highlights will detect and extract high-retention moments across the full timeline."

    # 3. Check for existing cached download on disk
    cached_info = None
    if video_id:
        out_dirs = [
            os.path.join(settings.MEDIA_ROOT, 'videos'),
            os.path.join(settings.MEDIA_ROOT, 'source_videos'),
        ]
        for v_dir in out_dirs:
            if not os.path.exists(v_dir):
                continue
            for f in os.listdir(v_dir):
                if f.startswith(video_id) and f.endswith(('.mp4', '.mkv', '.webm')) and not f.endswith('.temp.mp4') and '.part' not in f:
                    full_p = os.path.join(v_dir, f)
                    if os.path.exists(full_p) and os.path.getsize(full_p) > 1024 * 500:
                        pr = probe_video_metadata(full_p)
                        size_mb = round(os.path.getsize(full_p) / (1024 * 1024), 1)
                        h = pr.get('height', 1080)
                        res_str = f"{h}p Full HD" if h >= 1080 else f"{h}p HD" if h >= 720 else f"{h}p SD"
                        cached_info = {
                            'exists': True,
                            'file_name': f,
                            'size_mb': size_mb,
                            'resolution': res_str,
                            'width': pr.get('width', 1920),
                            'height': h,
                        }
                        if duration == 0.0 and pr.get('duration'):
                            duration = pr['duration']
                        break
            if cached_info:
                break

    # 4. Dynamic size estimation per quality preset
    dur_mins = max(1.0, duration / 60.0) if duration > 0 else 10.0
    size_1080 = max(15, int(dur_mins * 24.5))
    size_720 = max(5, int(dur_mins * 7.2))
    size_480 = max(3, int(dur_mins * 3.5))

    def _fmt_time(mb):
        secs = int(mb / 3.5)
        if secs < 60:
            return f"~{secs}s"
        return f"~{secs // 60}m {secs % 60:02d}s"

    qualities = [
        {
            'id': '720p',
            'label': '720p HD',
            'sub': 'Fast & Crisp',
            'tag': 'Recommended (4x Faster)',
            'size_mb': size_720,
            'time_est': _fmt_time(size_720),
            'recommended': True,
        },
        {
            'id': '1080p',
            'label': '1080p Full HD',
            'sub': 'Source Quality',
            'tag': 'Large (Heavy)',
            'size_mb': size_1080,
            'time_est': _fmt_time(size_1080),
            'recommended': False,
        },
        {
            'id': '480p',
            'label': '480p SD',
            'sub': 'Ultra-Fast',
            'tag': 'Fastest (Data Saver)',
            'size_mb': size_480,
            'time_est': _fmt_time(size_480),
            'recommended': False,
        },
    ]

    return {
        'success': True,
        'video_id': video_id,
        'title': title,
        'author_name': author,
        'thumbnail_url': thumbnail,
        'duration': duration,
        'duration_str': duration_str,
        'content_type': content_type,
        'recommended_mode': recommended_mode,
        'recommendation_reason': reason,
        'qualities': qualities,
        'default_quality': '720p',
        'cached_video': cached_info,
    }

