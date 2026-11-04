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

def download_youtube_video(url: str, output_dir: str, progress_callback=None) -> dict:
    """
    Downloads YouTube video via yt-dlp in 1080p/720p mp4 format.
    Optimized for high-speed connections with concurrent fragment streaming (10 parallel streams).
    Provides granular speed (MB/s), ETA, and size metrics to frontend.
    """
    os.makedirs(output_dir, exist_ok=True)
    video_id = get_youtube_video_id(url)

    # 1. Check if video already exists locally (silent cache hit)
    if video_id:
        for ext in ['mp4', 'mkv', 'webm']:
            cand = os.path.join(output_dir, f"{video_id}.{ext}")
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

    out_template = os.path.join(output_dir, '%(id)s.%(ext)s')
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
            msg = f"Downloading YouTube video: {pct}%{details_txt}"

            meta = {
                'download_pct': pct,
                'speed': speed_str,
                'eta': eta_str,
                'size': size_str,
                'downloaded_bytes': downloaded,
                'total_bytes': total
            }
            progress_callback(pct, msg, meta)

    # Resilient yt-dlp configuration with Node.js challenge solving & multi-tiered format selection
    ydl_opts = {
        'format': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/bv*+ba/best[ext=mp4]/b/best',
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
            print("[download_youtube_video] Format restriction detected. Retrying with universal format selector...")
            try:
                fmt_opts = dict(ydl_opts)
                fmt_opts['format'] = 'b/bv*+ba/best'
                with yt_dlp.YoutubeDL(fmt_opts) as ydl_fmt:
                    info = ydl_fmt.extract_info(url, download=True)
            except Exception as fmt_err:
                print(f"[download_youtube_video] Universal format retry encountered: {fmt_err}")
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
                    fallback_opts['format'] = 'b/bv*+ba/best'
                    fallback_opts['extractor_args'] = {'youtube': {'player_client': cl}}
                    with yt_dlp.YoutubeDL(fallback_opts) as ydl_fb:
                        info = ydl_fb.extract_info(url, download=True)
                    if info:
                        print(f"[download_youtube_video] Succeeded with client profile: {cl}")
                        break
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
    output_path = os.path.join(output_dir, f"{video_id}.mp4")
    if not os.path.exists(output_path):
        for ext in ['mp4', 'mkv', 'webm']:
            cand = os.path.join(output_dir, f"{video_id}.{ext}")
            if os.path.exists(cand):
                output_path = cand
                break

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

    # 3. Trigger immediate background pre-downloading on the spot
    def _bg_download():
        try:
            out_dir = os.path.join(settings.MEDIA_ROOT, 'source_videos')
            download_youtube_video(url, out_dir)
        except Exception as dl_e:
            print(f"[inspect_and_classify_video] Pre-download thread note: {dl_e}")

    threading.Thread(target=_bg_download, daemon=True).start()

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
    }

