import os
import re
import json
import time
import shutil
import socket
import hashlib
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from requests.adapters import HTTPAdapter
import urllib3.util.connection as urllib3_cn
import yt_dlp
from pathlib import Path
from django.conf import settings


# Prefer IPv4 DNS resolution without explicit bind() calls so Windows Wi-Fi/VPN adapters bypass sluggish IPv6 routes cleanly
try:
    urllib3_cn.allowed_gai_family = lambda: socket.AF_INET
except Exception:
    pass


def _make_pooled_adapter(maxsize: int = 16) -> HTTPAdapter:
    return HTTPAdapter(pool_connections=maxsize, pool_maxsize=maxsize)


def _format_speed_eta(speed_bps: float, downloaded: int, total: int):
    speed_str = ""
    if speed_bps > 0:
        if speed_bps >= 1024 * 1024:
            speed_str = f"{speed_bps / (1024 * 1024):.1f} MB/s"
        else:
            speed_str = f"{speed_bps / 1024:.0f} KB/s"
    eta_str = ""
    if speed_bps > 0 and total > downloaded:
        eta = (total - downloaded) / speed_bps
        if eta < 60:
            eta_str = f"ETA {int(eta)}s"
        else:
            eta_str = f"ETA {int(eta // 60)}m {int(eta % 60):02d}s"
    size_str = f"{downloaded / (1024 * 1024):.0f}/{total / (1024 * 1024):.0f} MB" if total > 0 else ""
    pct = min(99, int((downloaded / total) * 100)) if total > 0 else 0
    return pct, speed_str, eta_str, size_str


def _parallel_range_download_streams(
    streams: list,
    temp_paths: list,
    base_headers: dict,
    cookie_jar=None,
    num_workers: int = 12,
    progress_callback=None,
    quality: str = '720p',
) -> bool:
    """
    Saturates high-speed Wi-Fi links (e.g. 100+ Mbps) by splitting single-stream HTTPS media URLs
    into parallel HTTP 206 Range connections (bypassing YouTube single-TCP-stream ~800 KB/s throttling).
    Returns True if all streams downloaded intact, else False for transparent fallback.
    """
    probe_sess = requests.Session()
    probe_sess.mount('https://', _make_pooled_adapter(4))
    probe_sess.mount('http://', _make_pooled_adapter(4))
    if cookie_jar is not None:
        probe_sess.cookies.update(cookie_jar)

    resolved_sizes = []
    stream_headers = []
    for fmt in streams:
        f_url = fmt.get('url')
        if not f_url:
            return False
        hdrs = dict(base_headers or {})
        hdrs.update(fmt.get('http_headers') or {})
        hdrs['Range'] = 'bytes=0-0'
        try:
            r = probe_sess.get(f_url, headers=hdrs, timeout=10, stream=True)
            r.close()
            if r.status_code != 206:
                return False
            cr = r.headers.get('Content-Range', '')
            if '/' not in cr:
                return False
            tot_sz = int(cr.split('/')[-1])
            if tot_sz < 512 * 1024:
                return False
            hdrs.pop('Range', None)
            resolved_sizes.append(tot_sz)
            stream_headers.append(hdrs)
        except Exception:
            return False

    grand_total = sum(resolved_sizes)
    start_time = time.time()
    bytes_lock = threading.Lock()
    state = {'downloaded': 0, 'last_emit': 0.0, 'last_pct': -1}
    window_samples = []  # [(timestamp, bytes)] for smooth rolling speed

    def _add_progress(delta: int, force: bool = False):
        if not progress_callback:
            return
        with bytes_lock:
            state['downloaded'] += delta
            now = time.time()
            if delta > 0:
                window_samples.append((now, state['downloaded']))
                cutoff = now - 2.0
                while len(window_samples) > 2 and window_samples[0][0] < cutoff:
                    window_samples.pop(0)

            pct = min(99, int((state['downloaded'] / max(1, grand_total)) * 100))
            if not force and (now - state['last_emit'] < 0.25) and pct == state['last_pct']:
                return
            state['last_emit'] = now
            state['last_pct'] = pct

            if len(window_samples) >= 2 and (window_samples[-1][0] - window_samples[0][0]) >= 0.2:
                dt = window_samples[-1][0] - window_samples[0][0]
                db = window_samples[-1][1] - window_samples[0][1]
                speed_bps = max(0.0, db / dt)
            else:
                dt_all = max(0.1, now - start_time)
                speed_bps = state['downloaded'] / dt_all

            pct_v, speed_str, eta_str, size_str = _format_speed_eta(speed_bps, state['downloaded'], grand_total)
            details = [s for s in [size_str, speed_str, eta_str] if s]
            details_txt = f" ({' · '.join(details)})" if details else ""
            msg = f"Optimizing {quality} video stream: {pct_v}%{details_txt}"
            progress_callback(pct_v, msg, {
                'download_pct': pct_v,
                'speed': speed_str,
                'eta': eta_str,
                'size': size_str,
                'downloaded_bytes': state['downloaded'],
                'total_bytes': grand_total,
            })

    tls = threading.local()

    def _get_worker_session():
        sess = getattr(tls, 'sess', None)
        if sess is None:
            sess = requests.Session()
            sess.mount('https://', _make_pooled_adapter(16))
            sess.mount('http://', _make_pooled_adapter(16))
            if cookie_jar is not None:
                sess.cookies.update(cookie_jar)
            tls.sess = sess
        return sess

    # Download each stream (video + audio) using parallel Range workers into preallocated file
    for s_idx, (fmt, out_tmp, tot_sz, hdrs) in enumerate(zip(streams, temp_paths, resolved_sizes, stream_headers)):
        f_url = fmt['url']
        workers = num_workers if tot_sz >= 6 * 1024 * 1024 else max(4, num_workers // 2)
        chunk_sz = max(1024 * 1024, min(3 * 1024 * 1024, tot_sz // max(1, workers * 2)))
        ranges = []
        pos = 0
        while pos < tot_sz:
            end_b = min(tot_sz - 1, pos + chunk_sz - 1)
            ranges.append((pos, end_b))
            pos = end_b + 1

        with open(out_tmp, 'wb') as f_init:
            f_init.truncate(tot_sz)

        file_lock = threading.Lock()
        fh = open(out_tmp, 'r+b')
        try:
            def _fetch_range(r_pair):
                r_start, r_end = r_pair
                expected_len = (r_end - r_start) + 1
                req_hdrs = dict(hdrs)
                req_hdrs['Range'] = f'bytes={r_start}-{r_end}'

                for attempt in range(4):
                    try:
                        sess = _get_worker_session()
                        resp = sess.get(f_url, headers=req_hdrs, stream=True, timeout=15)
                        if resp.status_code not in (200, 206):
                            resp.close()
                            continue
                        buf = bytearray()
                        for blk in resp.iter_content(chunk_size=131072):
                            if blk:
                                buf.extend(blk)
                                _add_progress(len(blk))
                        resp.close()
                        if len(buf) == expected_len:
                            with file_lock:
                                fh.seek(r_start)
                                fh.write(buf)
                            return True
                        # Undo partial count on retry
                        _add_progress(-len(buf))
                    except Exception:
                        time.sleep(0.25 * (attempt + 1))
                return False

            with ThreadPoolExecutor(max_workers=workers) as pool:
                futs = [pool.submit(_fetch_range, rp) for rp in ranges]
                for fut in as_completed(futs):
                    if not fut.result():
                        return False
        finally:
            fh.close()

    _add_progress(0, force=True)
    return True

MIN_VIDEO_DURATION_SECONDS = 180  # 3 minutes minimum for long-form clipping

def detect_video_platform(url: str) -> str:
    """Identifies the source video platform cleanly for UI badges & messaging."""
    low = (url or "").lower()
    if "youtube.com" in low or "youtu.be" in low:
        return "YouTube"
    if "facebook.com" in low or "fb.watch" in low or "fb.com" in low:
        return "Facebook"
    if "instagram.com" in low:
        return "Instagram"
    if "vimeo.com" in low:
        return "Vimeo"
    if "twitch.tv" in low:
        return "Twitch"
    if "twitter.com" in low or "x.com" in low:
        return "X (Twitter)"
    if "dailymotion.com" in low or "dai.ly" in low:
        return "Dailymotion"
    if "rumble.com" in low:
        return "Rumble"
    if "tiktok.com" in low:
        return "TikTok"
    if "drive.google.com" in low:
        return "Google Drive"
    return "Video Link"

def get_youtube_video_id(url: str) -> str:
    """Extract 11-char video ID from YouTube URL strictly."""
    low = (url or "").lower()
    if "youtube.com" not in low and "youtu.be" not in low:
        if re.match(r'^[0-9A-Za-z_-]{11}$', url.strip()):
            return url.strip()
        return ''
    patterns = [
        r'(?:youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([0-9A-Za-z_-]{11})',
        r'(?:v=)([0-9A-Za-z_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ''

def get_video_identifier(url: str) -> tuple:
    """
    Returns (safe_id, is_youtube) for any supported platform URL (YouTube, Facebook, Vimeo, etc.).
    """
    clean_url = (url or "").strip()
    yt_id = get_youtube_video_id(clean_url)
    if yt_id:
        return yt_id, True
    if clean_url.startswith("http://") or clean_url.startswith("https://"):
        url_hash = hashlib.md5(clean_url.encode("utf-8")).hexdigest()[:12]
        prefix = detect_video_platform(clean_url).lower().split()[0].replace("(", "").replace(")", "")
        return f"{prefix}_{url_hash}", False
    return '', False

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
    video_id, is_youtube = get_video_identifier(url)
    platform_name = detect_video_platform(url)

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
                    video_title = f"{platform_name} Video ({video_id})"
                    thumbnail = ""
                    try:
                        meta_opts = {
                            'quiet': True,
                            'no_warnings': True,
                            'remote_components': ['ejs:github'],
                        }
                        if is_youtube:
                            meta_opts['extractor_args'] = {'youtube': {'player_client': ['tv_embedded', 'visionos', 'android']}}
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

    # Deterministic template using our clean video_id across all platforms (YouTube, Facebook, Vimeo, etc.)
    out_template = os.path.join(output_dir, f'{video_id}_{quality}.%(ext)s') if video_id else os.path.join(output_dir, f'%(id)s_{quality}.%(ext)s')
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

    # Resilient high-throughput yt-dlp configuration (IPv4 + 16 concurrent fragments + 10MB Range chunks)
    ydl_opts = {
        'format': format_spec,
        'outtmpl': out_template,
        'merge_output_format': 'mp4',
        'progress_hooks': [hook],
        'concurrent_fragment_downloads': 16,  # 16 parallel fragment streams for HLS/DASH manifests
        'http_chunk_size': 10 * 1024 * 1024,  # 10 MB HTTP Range chunks prevent single-stream CDN throttling
        'buffersize': 1024 * 1024 * 16,       # 16 MB socket buffer
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
    if shutil.which('aria2c'):
        ydl_opts['external_downloader'] = 'aria2c'
        ydl_opts['external_downloader_args'] = {'default': ['-x', '16', '-s', '16', '-k', '2M', '--file-allocation=none']}

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

    # Fast Parallel HTTP Range Download Attempt (12 concurrent connections saturating 100+ Mbps Wi-Fi)
    info = None
    parallel_succeeded = False
    try:
        probe_opts = dict(ydl_opts)
        probe_opts.pop('progress_hooks', None)
        with yt_dlp.YoutubeDL(probe_opts) as ydl_meta:
            pre_info = ydl_meta.extract_info(url, download=False)
            if pre_info:
                req_fmts = pre_info.get('requested_formats') or ([pre_info] if pre_info.get('url') else [])
                can_parallel = (
                    len(req_fmts) in (1, 2)
                    and all(
                        str(f.get('protocol', '')).startswith('http')
                        and 'm3u8' not in str(f.get('protocol', ''))
                        and not f.get('fragments')
                        and f.get('ext') in ('mp4', 'm4a')
                        for f in req_fmts
                    )
                )
                if can_parallel:
                    base_hdrs = pre_info.get('http_headers') or ydl_meta.params.get('http_headers') or {}
                    c_jar = getattr(ydl_meta, 'cookiejar', None)
                    temp_parts = [
                        os.path.join(output_dir, f"{video_id or pre_info.get('id', 'vid')}_{quality}_part{idx}.{fmt.get('ext', 'mp4')}.tmp")
                        for idx, fmt in enumerate(req_fmts)
                    ]
                    if _parallel_range_download_streams(
                        req_fmts,
                        temp_parts,
                        base_hdrs,
                        cookie_jar=c_jar,
                        num_workers=12,
                        progress_callback=progress_callback,
                        quality=quality,
                    ):
                        final_id = video_id or pre_info.get('id') or 'video'
                        final_out = os.path.join(output_dir, f"{final_id}_{quality}.mp4")
                        if len(temp_parts) == 1:
                            if temp_parts[0].endswith('.mp4.tmp'):
                                os.replace(temp_parts[0], final_out)
                            else:
                                subprocess.run(['ffmpeg', '-y', '-i', temp_parts[0], '-c', 'copy', '-movflags', '+faststart', final_out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                                os.remove(temp_parts[0])
                        else:
                            subprocess.run(
                                ['ffmpeg', '-y', '-i', temp_parts[0], '-i', temp_parts[1], '-c', 'copy', '-movflags', '+faststart', final_out],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
                            )
                            for tp in temp_parts:
                                if os.path.exists(tp):
                                    os.remove(tp)
                        info = pre_info
                        parallel_succeeded = True
                    else:
                        for tp in temp_parts:
                            if os.path.exists(tp):
                                try:
                                    os.remove(tp)
                                except Exception:
                                    pass
    except Exception as par_err:
        print(f"[download_youtube_video] Parallel stream probe fallback: {par_err}")

    # Standard / Segmented yt-dlp Download Fallback
    if not parallel_succeeded:
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

            if not info:
                if 'Sign in to confirm' in err_msg or 'bot' in err_msg.lower():
                    raise ValueError(
                        "YouTube anti-bot verification required. To proceed instantly: "
                        "1) Switch to 'File Upload' to upload the video file directly (100% offline bypass), or "
                        "2) Export cookies.txt from YouTube (using 'Get cookies.txt LOCALLY' extension) into your Downloads or CLIPIT folder."
                    )
                raise dl_err

    if not info:
        raise ValueError(f"Failed to extract {platform_name} video information.")

    resolved_id = info.get('id') or video_id or 'video'
    video_title = info.get('title') or f"{platform_name} Video"
    channel_name = info.get('uploader') or info.get('channel') or info.get('creator') or ''
    thumbnail = info.get('thumbnail', '')
    duration = float(info.get('duration', 0.0) or 0.0)
    
    # Determine actual file path (checks both deterministic video_id and extractor id)
    output_path = None
    id_candidates = [c for c in [video_id, resolved_id] if c]
    for cid in id_candidates:
        for q_tag in [f"_{quality}", ""]:
            for ext in ['mp4', 'mkv', 'webm']:
                cand = os.path.join(output_dir, f"{cid}{q_tag}.{ext}")
                if os.path.exists(cand) and os.path.getsize(cand) > 1024 * 10:
                    output_path = cand
                    break
            if output_path:
                break
        if output_path:
            break

    if not output_path or not os.path.exists(output_path):
        raise FileNotFoundError(f"Downloaded video file not found in {output_dir} for {video_id or resolved_id}")

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
    On-the-spot multi-platform video inspection (YouTube, Facebook, Vimeo, Twitch, X, Instagram, Direct URLs),
    metadata extraction, minimum long-form duration check (> 3 min), and AI mode recommendation.
    """
    video_id, is_youtube = get_video_identifier(url)
    if not video_id:
        return {'success': False, 'error': 'Please enter a valid video URL (YouTube, Facebook, Vimeo, Twitch, X, or direct link).'}

    platform_name = detect_video_platform(url)
    title = f"{platform_name} Video ({video_id})"
    author = ""
    duration = 0.0
    thumbnail = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg" if is_youtube else ""
    description = ""

    # 1. Fast metadata extraction via yt-dlp across 1,000+ platforms
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'extract_flat': 'in_playlist',
            'remote_components': ['ejs:github'],
        }
        if is_youtube:
            ydl_opts['extractor_args'] = {'youtube': {'player_client': ['tv_embedded', 'android', 'web']}}
        cfile = find_cookie_file()
        if cfile:
            ydl_opts['cookiefile'] = cfile

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info:
                title = info.get('title') or title
                author = info.get('uploader') or info.get('channel') or info.get('creator') or ''
                duration = float(info.get('duration') or 0.0)
                thumbnail = info.get('thumbnail') or thumbnail
                description = (info.get('description') or '')[:500]
    except Exception as e:
        print(f"[inspect_and_classify_video] yt-dlp extract note: {e}")
        # Fast fallback: oEmbed (for YouTube)
        if is_youtube:
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

    # Minimum Long-Form Video Duration Enforcement (> 3 minutes / 180 seconds)
    if duration > 0 and duration < MIN_VIDEO_DURATION_SECONDS:
        return {
            'success': False,
            'error': f"Video is too short ({duration_str}). CLIPIT creates clips only from long-form videos longer than 3 minutes (3:00+).",
        }

    # 2. Content classification & Viral Highlights targeting
    text_corpus = f"{title} {author} {description}".lower()
    recommended_mode = "viral_highlights"

    if any(k in text_corpus for k in ['horror', 'bhoot', 'chudail', 'ghost', 'paranormal', 'incident', 'darr', 'haunted', 'scary', 'mystery', 'crime', 'true crime', 'case', 'murder', 'qissa']):
        content_type = "Suspense & Storytelling"
        reason = "High-tension narrative detected. Viral Highlights isolates the most gripping hooks, twists, and climax moments."
    elif any(k in text_corpus for k in ['podcast', 'interview', 'story', 'kahani', 'biopic', 'journey', 'life of', 'real experience', 'narration', 'conversation', 'talk', 'debate']):
        content_type = "Podcast & Deep Conversation"
        reason = "Long-form dialogue detected. Viral Highlights extracts sharp takeaways, debates, and scroll-stopping hooks."
    elif any(k in text_corpus for k in ['comedy', 'standup', 'roast', 'funny', 'joke', 'laughter', 'sketch', 'mimicry', 'crowd work', 'meme']):
        content_type = "Standup Comedy & Humor"
        reason = "High-energy punchlines detected. Viral Highlights extracts the top standalone comedic hooks across the timeline."
    elif any(k in text_corpus for k in ['motivation', 'speech', 'ted', 'advice', 'success', 'mindset', 'habits', 'rules', 'growth']):
        content_type = "Motivational Keynote & Speech"
        reason = "Strong actionable takeaway hooks detected. Viral Highlights maximizes standalone opening retention."
    else:
        content_type = "Long-Form Creator Video"
        reason = "Viral Highlights scans the full timeline for peak hooks, emotional spikes, and clean standalone takeaways."

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
        'platform': platform_name,
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

