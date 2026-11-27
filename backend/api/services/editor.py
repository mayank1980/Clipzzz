import os
import re
import json
import math
import hashlib
import subprocess
import threading
import psutil
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

# Concurrency limit: maximum 2 clips rendering simultaneously to ensure PC never stutters
_RENDER_SEMAPHORE = threading.BoundedSemaphore(2)

_DETECTED_ENCODER = None
_ENCODER_ARGS = None

def get_hardware_encoder() -> Tuple[str, List[str]]:
    """
    Detects the best hardware-accelerated video encoder available on the system:
    1. NVIDIA GPU: h264_nvenc (-preset p4 -cq 23 -tune hq -b:v 6000k -maxrate 8500k)
    2. Intel QuickSync: h264_qsv (-global_quality 23 -preset veryfast -b:v 6000k -maxrate 8500k)
    3. Apple Silicon (macOS): h264_videotoolbox (-q:v 65 -b:v 6000k -maxrate 8500k)
    4. Fallback: CPU libx264 (-preset veryfast -crf 22)
    """
    global _DETECTED_ENCODER, _ENCODER_ARGS
    if _DETECTED_ENCODER is not None:
        return _DETECTED_ENCODER, _ENCODER_ARGS

    # 1. Test NVIDIA NVENC
    try:
        probe = subprocess.run(
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
            capture_output=True,
            timeout=4
        )
        if probe.returncode == 0:
            _DETECTED_ENCODER = 'h264_nvenc'
            _ENCODER_ARGS = [
                '-c:v', 'h264_nvenc',
                '-preset', 'p4',
                '-tune', 'hq',
                '-rc', 'vbr',
                '-cq', '23',
                '-b:v', '6000k',
                '-maxrate', '8500k',
                '-bufsize', '12000k'
            ]
            print("[editor] Enabled NVIDIA NVENC (p4/cq23) Hardware Acceleration!")
            return _DETECTED_ENCODER, _ENCODER_ARGS
    except Exception:
        pass

    # 2. Test Intel QuickSync (QSV)
    try:
        probe = subprocess.run(
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1', '-c:v', 'h264_qsv', '-f', 'null', '-'],
            capture_output=True,
            timeout=4
        )
        if probe.returncode == 0:
            _DETECTED_ENCODER = 'h264_qsv'
            _ENCODER_ARGS = [
                '-c:v', 'h264_qsv',
                '-global_quality', '23',
                '-preset', 'veryfast',
                '-b:v', '6000k',
                '-maxrate', '8500k'
            ]
            print("[editor] Enabled Intel QuickSync (h264_qsv) Hardware Acceleration!")
            return _DETECTED_ENCODER, _ENCODER_ARGS
    except Exception:
        pass

    # 3. Test Apple VideoToolbox (macOS)
    try:
        probe = subprocess.run(
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1', '-c:v', 'h264_videotoolbox', '-f', 'null', '-'],
            capture_output=True,
            timeout=4
        )
        if probe.returncode == 0:
            _DETECTED_ENCODER = 'h264_videotoolbox'
            _ENCODER_ARGS = [
                '-c:v', 'h264_videotoolbox',
                '-q:v', '65',
                '-b:v', '6000k',
                '-maxrate', '8500k'
            ]
            print("[editor] Enabled Apple VideoToolbox Hardware Acceleration!")
            return _DETECTED_ENCODER, _ENCODER_ARGS
    except Exception:
        pass

    # 4. CPU Fallback (libx264)
    cpu_threads = str(max(2, min(4, (os.cpu_count() or 4) - 1)))
    _DETECTED_ENCODER = 'libx264'
    _ENCODER_ARGS = [
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-threads', cpu_threads
    ]
    print(f"[editor] Using CPU libx264 veryfast encoding (threads={cpu_threads})")
    return _DETECTED_ENCODER, _ENCODER_ARGS

def get_nvenc_support() -> bool:
    enc, _ = get_hardware_encoder()
    return enc == 'h264_nvenc'

def hex_to_ass_color(hex_str: str, alpha: int = 0) -> str:
    """
    Converts CSS hex color (#RRGGBB) to ASS subtitle format (&HAABBGGRR&).
    """
    hex_clean = hex_str.lstrip('#')
    if len(hex_clean) == 3:
        hex_clean = ''.join([c*2 for c in hex_clean])
    if len(hex_clean) != 6:
        return "&H00FFFFFF&"
    
    r = hex_clean[0:2]
    g = hex_clean[2:4]
    b = hex_clean[4:6]
    a_hex = f"{alpha:02X}"
    return f"&H{a_hex}{b}{g}{r}&"

def format_ass_time(seconds: float) -> str:
    """
    Formats seconds into ASS time format: H:MM:SS.cc (centiseconds)
    """
    total_sec = max(0.0, seconds)
    hours = int(total_sec // 3600)
    minutes = int((total_sec % 3600) // 60)
    secs = int(total_sec % 60)
    centis = int(round((total_sec - int(total_sec)) * 100))
    if centis >= 100:
        centis = 99
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"

def generate_ass_subtitle_file(
    segments: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
    output_ass_path: str,
    style: Dict[str, Any],
    channel_name: str = "",
    split_intervals: List[Tuple[float, float]] = None,
    **kwargs
) -> str:
    """
    Generates an ASS (Advanced SubStation Alpha) subtitle file with word-by-word
    karaoke or highlighted text matching the visual style in the reference UI.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_ass_path)), exist_ok=True)
    
    from .transcription import clean_and_deoverlap_segments
    segments = clean_and_deoverlap_segments(segments)
    
    font_name = style.get('font', 'Arial Black')
    # Use bold system font fallback for web fonts like Montserrat/Inter on Windows
    if font_name in ('Montserrat', 'Inter', 'Poppins', 'System', None, '', 'sans-serif'):
        font_name = 'Arial Black'
    
    raw_fs = float(style.get('fontSize', 22))
    # In 1080x1920 Shorts, 22px in 280px web preview scales to ~92-100px for bold Shorts visibility
    font_size = max(86, min(120, int(raw_fs * 4.2))) if raw_fs < 40 else int(raw_fs)

    text_color = hex_to_ass_color(style.get('textColor', '#FFFFFF'))
    highlight_color = hex_to_ass_color(style.get('highlightColor', '#bef264'))
    
    # Alignment: 2 = Bottom Center, 5 = Middle Center, 8 = Top Center
    pos = style.get('position', 'bottom')
    alignment = 2
    margin_v = 560  # Platform Safe Zone [Y = 960px to 1350px] above YouTube Shorts UI elements
    if pos == 'center':
        alignment = 5
        margin_v = 0
    elif pos == 'top':
        alignment = 8
        margin_v = 280

    # Subtitle positioning: accurately map xPercent, yPercent or position
    y_pct = style.get('yPercent')
    if y_pct is None:
        pos = style.get('position', 'bottom')
        y_pct = 20.0 if pos == 'top' else (50.0 if pos == 'center' else 75.0)
    x_pct = style.get('xPercent')
    if x_pct is None:
        x_pct = 50.0

    y_val = max(8.0, min(92.0, float(y_pct)))
    x_val = max(10.0, min(90.0, float(x_pct)))
    pixel_x = int((x_val / 100.0) * 1080)
    pixel_y = int((y_val / 100.0) * 1920)
    custom_pos_tag = f"\\an5\\pos({pixel_x},{pixel_y})"
    use_pos = True

    # Determine style properties according to captions.js presets
    preset = (style.get('preset') or style.get('templateId') or 'Karaoke').lower()
    animation = style.get('animation', 'bounce').lower()

    border_style = 1
    outline_w = 7  # Ultra-crisp thick black outline for maximum readability on any video background
    shadow_w = 4   # Bold drop shadow
    underline = 0
    back_colour = "&H00000000"

    if 'box' in animation or 'box' in preset or preset in ('safari', 'deep diver b&w', 'midnight serif'):
        border_style = 3  # Opaque box background for Focus Box, Safari, Midnight Serif
        outline_w = 4
        shadow_w = 0
        back_colour = "&HA0000000"
    elif 'underline' in animation or preset in ('marker', 'hook', 'aurora ink'):
        underline = 1
    elif preset in ('cinema', 'acid', 'classic'):
        outline_w = 6
        shadow_w = 3

    header = f"""[Script Info]
Title: CLIPIT Shorts Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{text_color},{highlight_color},&H00000000,{back_colour},-1,0,{underline},0,100,100,0,0,{border_style},{outline_w},{shadow_w},{alignment},50,50,{margin_v},1
Style: SplitSubtitle,{font_name},{font_size},{text_color},{highlight_color},&H00000000,{back_colour},-1,0,{underline},0,100,100,0,0,{border_style},{outline_w},{shadow_w},5,50,50,0,1
Style: CreditWatermark,Montserrat,32,&H00FFFFFF,&H00000000,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,9,45,45,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []

    # Permanent Top-Right Channel Credit Watermark
    if channel_name:
        clip_dur_str = format_ass_time(max(1.0, clip_end - clip_start))
        events.append(f"Dialogue: 1,0:00:00.00,{clip_dur_str},CreditWatermark,,0,0,0,,Credit - {channel_name}")

    show_captions = style.get('showCaptions', True) if style else True

    # Build Smart Pacing Cues matching preview exactly: prioritize clip's aligned_words (user edits, deletions, custom wording)
    all_words = []
    if show_captions:
        # Priority 1: Clip's own aligned_words in caption_style (contains user's latest caption edits and custom text)
        aligned_words = style.get('aligned_words') or []
        if aligned_words and isinstance(aligned_words, list) and len(aligned_words) > 0:
            for w in aligned_words:
                txt = str(w.get('word', '')).strip()
                if not txt:
                    continue
                st = float(w.get('start', clip_start))
                et = float(w.get('end', st + 0.2))
                if et > (clip_start - 0.05) and st < (clip_end + 0.05):
                    all_words.append({
                        'word': txt,
                        'start': max(clip_start, st),
                        'end': min(clip_end, et)
                    })

        # Priority 2: Fallback to project transcript segments if aligned_words was not populated
        if not all_words and segments:
            for seg in segments:
                s_start = float(seg.get('start', 0.0))
                s_end = float(seg.get('end', 0.0))
                if s_end <= clip_start or s_start >= clip_end:
                    continue

                text_tokens = str(seg.get('text', '')).strip().split()
                seg_words = seg.get('words') or []
                has_matching_words = (
                    seg_words and isinstance(seg_words, list) and
                    len(seg_words) == len(text_tokens) and
                    all(str(w.get('word', '')).strip().lower() == text_tokens[i].lower() for i, w in enumerate(seg_words))
                )

                if has_matching_words:
                    for w in seg_words:
                        st = float(w.get('start', s_start))
                        et = float(w.get('end', s_end))
                        if et > clip_start and st < clip_end:
                            all_words.append({
                                'word': str(w.get('word', '')).strip(),
                                'start': max(clip_start, st),
                                'end': min(clip_end, et)
                            })
                elif text_tokens:
                    dur = max(0.15, (s_end - s_start) / max(1, len(text_tokens)))
                    for i, tok in enumerate(text_tokens):
                        st = s_start + (i * dur)
                        et = st + dur
                        if et > clip_start and st < clip_end:
                            all_words.append({
                                'word': tok,
                                'start': max(clip_start, st),
                                'end': min(clip_end, et)
                            })

    all_words.sort(key=lambda x: x['start'])

    # Pre-export automated validation check (PDF 1: Caption Sync Solution Guide)
    validated_words = []
    last_valid_end = clip_start
    for w in all_words:
        txt = str(w.get('word', '')).strip()
        if not txt:
            continue
        st = float(w.get('start', 0.0))
        et = float(w.get('end', st + 0.15))
        st = max(clip_start, min(clip_end - 0.05, st))
        et = max(st + 0.05, min(clip_end, et))
        if st < last_valid_end:
            st = max(st, last_valid_end - 0.02)
            if et <= st:
                et = st + 0.08
        validated_words.append({'word': txt, 'start': round(st, 3), 'end': round(et, 3)})
        last_valid_end = et
    all_words = validated_words

    smart_cues = []
    curr_cue = []
    for i, w in enumerate(all_words):
        if not w['word']:
            continue
        curr_cue.append(w)
        is_last = (i == len(all_words) - 1)
        has_pause = not is_last and ((all_words[i+1]['start'] - w['end']) >= 0.28)
        has_punct = w['word'].endswith(('.', '?', '!', ',', ';'))
        if is_last or len(curr_cue) >= 7 or (len(curr_cue) >= 5 and (has_pause or has_punct)) or (has_pause and len(curr_cue) >= 3):
            cue_start = curr_cue[0]['start']
            cue_end = curr_cue[-1]['end']
            next_start = all_words[i+1]['start'] if not is_last else cue_end + 1.0
            display_end = min(next_start, cue_end + 0.45)
            smart_cues.append({
                'start': cue_start,
                'end': cue_end,
                'display_end': display_end,
                'words': list(curr_cue)
            })
            curr_cue = []

    for cue in smart_cues:
        c_words = cue['words']
        for w_idx, w in enumerate(c_words):
            w_rel_start = max(0.0, w['start'] - clip_start)
            # Active word duration extends to next word start in cue, or cue display end for last word
            if w_idx < len(c_words) - 1:
                w_rel_end = max(w_rel_start + 0.05, c_words[w_idx + 1]['start'] - clip_start)
            else:
                w_rel_end = max(w_rel_start + 0.05, cue['display_end'] - clip_start)

            line_parts = []
            for win_w in c_words:
                word_txt = win_w['word']
                if win_w == w:
                    if 'underline' in animation or preset in ('marker', 'hook', 'aurora ink'):
                        line_parts.append(f"{{\\c{highlight_color}\\u1}}{word_txt}{{\\u0\\c{text_color}}}")
                    elif 'pop' in animation or preset in ('banger', 'beasty', 'new', 'from'):
                        line_parts.append(f"{{\\c{highlight_color}\\fscx120\\fscy120}}{word_txt.upper()}{{\\fscx100\\fscy100\\c{text_color}}}")
                    elif 'scale' in animation or preset in ('lovly', 'marvel', 'flamingo'):
                        line_parts.append(f"{{\\c{highlight_color}\\fscx120\\fscy120}}{word_txt}{{\\fscx100\\fscy100\\c{text_color}}}")
                    else:
                        line_parts.append(f"{{\\c{highlight_color}\\fscx110\\fscy110}}{word_txt}{{\\fscx100\\fscy100\\c{text_color}}}")
                else:
                    line_parts.append(word_txt)

            # Wrap into max 3-4 words per line using ASS \N to match preview line breaks
            if len(line_parts) > 4:
                mid = (len(line_parts) + 1) // 2
                dialogue_text = " ".join(line_parts[:mid]) + r"\N" + " ".join(line_parts[mid:])
            else:
                dialogue_text = " ".join(line_parts)

            if use_pos:
                events.append(f"Dialogue: 0,{format_ass_time(w_rel_start)},{format_ass_time(w_rel_end)},Default,,0,0,0,,{{{custom_pos_tag}}}{dialogue_text}")
            else:
                events.append(f"Dialogue: 0,{format_ass_time(w_rel_start)},{format_ass_time(w_rel_end)},Default,,0,0,0,,{dialogue_text}")

    with open(output_ass_path, 'w', encoding='utf-8') as f:
        f.write(header + "\n".join(events))

    return output_ass_path


def normalize_crop_coord(val: float, key: str = 'x', zoom: float = 1.08) -> float:
    """
    Direct linear normalization [0.0 to 100.0] -> [0.0 to 1.0] (or clamped zoom [1.08 to 2.5]).
    Zero artificial warping ensures 100% pixel-perfect match between preview and exported Short.
    """
    if key == 'zoom':
        return round(max(1.08, min(2.5, float(val))), 4)
    pct = max(0.0, min(100.0, float(val))) / 100.0
    return round(pct, 4)


def build_piecewise_crop_expr(
    keyframes: List[Dict[str, Any]],
    key: str = 'x',
    default_val: float = 50.0,
    pan_dur: float = 0.0,
    zoom: float = 1.08,
) -> str:
    """
    Constructs an FFmpeg piecewise expression for camera cuts AND smooth keyframe transitions.
    Supports per-keyframe easing ('linear'/'smooth' glides from prev keyframe to curr keyframe;
    'cut' snaps crisply; omitted easing uses pan_dur if > 0).
    """
    if not keyframes:
        return f"{normalize_crop_coord(default_val, key, zoom)}"

    kfs = sorted(keyframes, key=lambda k: float(k.get('time', 0.0)))
    if len(kfs) == 1:
        return f"{normalize_crop_coord(kfs[0].get(key, default_val), key, zoom)}"

    last_val = normalize_crop_coord(kfs[-1].get(key, default_val), key, zoom)
    expr = f"{last_val}"

    for i in range(len(kfs) - 1, 0, -1):
        prev_k = kfs[i - 1]
        curr_k = kfs[i]
        t_prev = round(float(prev_k.get('time', 0.0)), 3)
        t_switch = round(float(curr_k.get('time', 0.0)), 3)
        v_prev = normalize_crop_coord(prev_k.get(key, default_val), key, zoom)
        v_curr = normalize_crop_coord(curr_k.get(key, default_val), key, zoom)
        kf_easing = str(curr_k.get('easing', '') or '').lower()

        if kf_easing in ('linear', 'smooth') and t_switch > t_prev + 0.04 and abs(v_curr - v_prev) > 0.0005:
            span = round(t_switch - t_prev, 3)
            diff = round(v_curr - v_prev, 4)
            lerp_expr = f"{v_prev}+({diff})*max(0,min(1,(t-{t_prev})/{span}))"
            expr = f"if(lt(t,{t_switch}),{lerp_expr},{expr})"
        elif kf_easing != 'cut' and pan_dur > 0.0 and abs(v_curr - v_prev) > 0.0005:
            t_end = round(t_switch + pan_dur, 3)
            diff = round(v_curr - v_prev, 4)
            lerp_expr = f"{v_prev}+({diff})*(t-{t_switch})/{pan_dur}"
            expr = f"if(lt(t,{t_switch}),{v_prev},if(lt(t,{t_end}),{lerp_expr},{expr}))"
        else:
            expr = f"if(lt(t,{t_switch}),{v_prev},{expr})"

    return expr


def _probe_has_audio(video_path: str) -> bool:
    """Checks via ffprobe whether source video contains an audio stream."""
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', video_path],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return bool(out.stdout.strip())
    except Exception:
        return True


def _build_atempo_filters(speed: float) -> List[str]:
    """Builds chained FFmpeg atempo filters supporting speeds from 0.25x to 4.0x."""
    spd = max(0.25, min(4.0, float(speed or 1.0)))
    if abs(spd - 1.0) < 0.01:
        return []
    filters = []
    while spd > 2.0:
        filters.append("atempo=2.0")
        spd /= 2.0
    while spd < 0.5:
        filters.append("atempo=0.5")
        spd /= 0.5
    if abs(spd - 1.0) >= 0.005:
        filters.append(f"atempo={spd:.4f}")
    return filters


def _build_visual_adjustments_chain(adjustments: Dict[str, Any]) -> str:
    """Builds FFmpeg visual transforms and color grading chain (flip, rotate, eq, unsharp)."""
    if not adjustments:
        return ""
    parts = []
    if adjustments.get('flipH'):
        parts.append("hflip")
    rot = int(adjustments.get('rotate', 0) or 0) % 360
    if rot == 90:
        parts.append("transpose=1")
    elif rot == 180:
        parts.append("transpose=1,transpose=1")
    elif rot == 270:
        parts.append("transpose=2")

    brightness = max(-0.5, min(0.5, float(adjustments.get('brightness', 0.0) or 0.0)))
    contrast = max(0.4, min(2.0, float(adjustments.get('contrast', 1.0) or 1.0)))
    saturation = max(0.0, min(2.2, float(adjustments.get('saturation', 1.0) or 1.0)))
    if abs(brightness) > 0.01 or abs(contrast - 1.0) > 0.01 or abs(saturation - 1.0) > 0.01:
        parts.append(f"eq=brightness={brightness:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}")

    sharpen = max(0.0, min(2.0, float(adjustments.get('sharpen', 0.0) or 0.0)))
    if sharpen > 0.02:
        amount = round(sharpen * 1.25, 2)
        parts.append(f"unsharp=5:5:{amount:.2f}:5:5:0.0")

    return ("," + ",".join(parts)) if parts else ""


def compute_clip_render_hash(clip, mode: str = 'captioned') -> str:
    """
    Computes a deterministic SHA-256 signature representing all visual, timing,
    framing, captioning, studio editor edits, and credit parameters.
    Used for instant zero-latency caching: avoids re-rendering if nothing changed.
    """
    editor_data = getattr(clip, 'editor_data', None) or {}
    components = [
        str(round(float(clip.start_time), 3)),
        str(round(float(clip.end_time), 3)),
        str(clip.crop_mode),
        str(round(float(clip.crop_x), 2)),
        str(round(float(clip.crop_y), 2)),
        str(round(float(clip.crop_zoom), 2)),
        json.dumps(clip.crop_keyframes or [], sort_keys=True),
        json.dumps(editor_data, sort_keys=True),
        str(getattr(clip.project, 'channel_name', '') or ''),
        mode,
    ]
    if mode == 'captioned':
        components.append(json.dumps(clip.caption_style or {}, sort_keys=True))
        transcript = getattr(clip.project, 'transcript_raw', []) or []
        words = []
        for seg in transcript:
            for w in seg.get('words', []):
                ws = float(w.get('start', 0.0))
                we = float(w.get('end', 0.0))
                if (clip.start_time <= ws <= clip.end_time) or (clip.start_time <= we <= clip.end_time):
                    words.append(f"{w.get('word')}:{ws:.2f}:{we:.2f}")
        components.append(','.join(words))

    return hashlib.sha256(';'.join(components).encode('utf-8')).hexdigest()

def build_ffmpeg_split_filter(
    crop_keyframes: List[Dict[str, Any]],
    default_x: float,
    default_y: float,
    effective_zoom: float,
    duration: float,
    subtitles_filter: str = ""
) -> Tuple[bool, str]:
    """Single-frame smart portrait mode active (split-screen disabled)."""
    return False, ""


def render_shorts_clip(
    source_video_path: str,
    clip_start: float,
    clip_end: float,
    output_mp4_path: str,
    crop_mode: str = 'blur_fill',
    crop_x: float = 50.0,
    crop_y: float = 45.0,
    crop_zoom: float = 1.0,
    crop_keyframes: List[Dict[str, Any]] = None,
    caption_style: Dict[str, Any] = None,
    segments: List[Dict[str, Any]] = None,
    progress_callback = None,
    channel_name: str = "",
    editor_data: Dict[str, Any] = None,
) -> str:
    """
    Renders a vertical 9:16 (1080x1920) YouTube Short using FFmpeg with:
    1. Multi-segment timeline cuts/splits/speeds from CapCut Studio (editor_data.segments)
    2. Keyframed 9:16 smart framing including per-keyframe zoom, smooth easing & drag coordinates
    3. Visual adjustments (flip, rotate, brightness/contrast/saturation, sharpen) & audio fades
    4. Professional ASS subtitle burn-in and broadcast loudnorm audio
    """
    os.makedirs(os.path.dirname(output_mp4_path), exist_ok=True)
    ed = editor_data if isinstance(editor_data, dict) else {}

    # Normalize custom timeline segments (from CapCut Studio split/delete/speed) if present
    raw_ed_segments = ed.get('segments') if isinstance(ed.get('segments'), list) else []
    timeline_segs = []
    for seg in raw_ed_segments:
        if not isinstance(seg, dict):
            continue
        s_val = float(seg.get('start', clip_start))
        e_val = float(seg.get('end', clip_end))
        if e_val - s_val >= 0.15:
            timeline_segs.append({
                'start': s_val,
                'end': e_val,
                'speed': max(0.25, min(3.0, float(seg.get('speed', 1.0) or 1.0))),
                'volume': max(0.0, min(2.0, float(seg.get('volume', 1.0) if seg.get('volume') is not None else 1.0))),
                'muted': bool(seg.get('muted', False)),
            })

    if not timeline_segs:
        timeline_segs = [{
            'start': float(clip_start),
            'end': float(clip_end),
            'speed': max(0.25, min(3.0, float(ed.get('globalSpeed', 1.0) or 1.0))),
            'volume': max(0.0, min(2.0, float(ed.get('globalVolume', 1.0) if ed.get('globalVolume') is not None else 1.0))),
            'muted': bool(ed.get('globalMuted', False)),
        }]

    has_custom_segments = (
        len(timeline_segs) > 1
        or abs(timeline_segs[0]['speed'] - 1.0) > 0.01
        or timeline_segs[0]['muted']
        or abs(timeline_segs[0]['volume'] - 1.0) > 0.02
        or abs(timeline_segs[0]['start'] - float(clip_start)) > 0.05
        or abs(timeline_segs[0]['end'] - float(clip_end)) > 0.05
    )

    seek_start = min(s['start'] for s in timeline_segs)
    seek_end = max(s['end'] for s in timeline_segs)
    seek_span = max(0.5, seek_end - seek_start)
    edited_duration = sum((s['end'] - s['start']) / s['speed'] for s in timeline_segs)
    duration = max(0.5, edited_duration)

    # Subtitle and Top-Right Credit Watermark preparation
    ass_path = output_mp4_path.replace('.mp4', '.ass')
    show_captions = caption_style.get('showCaptions', True) if caption_style else True
    active_segments = segments if (show_captions and segments) else []

    # In clean mode, do not burn dialogue captions
    has_overlay_text = bool(show_captions or channel_name)
    subtitles_filter = ""
    rel_ass = ""

    if has_overlay_text:
        generate_ass_subtitle_file(active_segments, seek_start, seek_start + duration, ass_path, caption_style or {}, channel_name=channel_name)
        try:
            rel_ass = os.path.relpath(ass_path, os.getcwd()).replace(chr(92), '/')
        except Exception:
            rel_ass = ass_path.replace(chr(92), '/')
        subtitles_filter = f",subtitles=filename='{rel_ass}'"

    # Build framing expression (uniform zoom fast path vs dynamic per-keyframe zoom path)
    effective_zoom = max(1.08, min(2.5, float(crop_zoom or 1.15)))
    kfs_clean = [dict(k) for k in (crop_keyframes or []) if isinstance(k, dict)]

    if crop_mode in ('center_crop', 'custom_crop', 'manual_crop'):
        if kfs_clean:
            smooth_pan_default = 0.24 if (ed.get('smoothPan', len(kfs_clean) <= 14)) else 0.0
            expr_x = build_piecewise_crop_expr(kfs_clean, key='x', default_val=crop_x, pan_dur=smooth_pan_default, zoom=effective_zoom)
            expr_y = build_piecewise_crop_expr(kfs_clean, key='y', default_val=crop_y, pan_dur=smooth_pan_default, zoom=effective_zoom)
            z_vals = [normalize_crop_coord(k.get('zoom', effective_zoom), 'zoom', effective_zoom) for k in kfs_clean]
            has_dynamic_zoom = (max(z_vals) - min(z_vals)) > 0.02
            if has_dynamic_zoom:
                expr_z = build_piecewise_crop_expr(kfs_clean, key='zoom', default_val=effective_zoom, pan_dur=smooth_pan_default, zoom=effective_zoom)
                framing_chain = (
                    f"scale=w='trunc(iw*(1920/ih)*({expr_z})/2)*2':h='trunc(1920*({expr_z})/2)*2':eval=frame,"
                    f"crop=w=1080:h=1920:x='(iw-1080)*({expr_x})':y='(ih-1920)*({expr_y})',setsar=1"
                )
            else:
                z_const = z_vals[0]
                framing_chain = (
                    f"crop=w='ih*(9/16)/{z_const:.4f}':h='ih/{z_const:.4f}':"
                    f"x='(iw-ow)*({expr_x})':y='(ih-oh)*({expr_y})',scale=1080:1920,setsar=1"
                )
        else:
            cx = max(0.0, min(100.0, float(crop_x))) / 100.0
            cy = max(0.0, min(100.0, float(crop_y))) / 100.0
            framing_chain = f"crop=w='ih*(9/16)/{effective_zoom:.4f}':h='ih/{effective_zoom:.4f}':x='(iw-ow)*{cx:.4f}':y='(ih-oh)*{cy:.4f}',scale=1080:1920,setsar=1"
    else:
        framing_chain = None

    adjustments_chain = _build_visual_adjustments_chain(ed.get('adjustments') or {})
    has_audio = _probe_has_audio(source_video_path)

    # Audio post-processing: fade in/out + broadcast loudness normalization (or silence if all muted)
    fade_in = max(0.0, min(3.0, float(ed.get('fadeIn', 0.0) or 0.0)))
    fade_out = max(0.0, min(3.0, float(ed.get('fadeOut', 0.0) or 0.0)))
    af_parts = []
    if fade_in > 0.02:
        af_parts.append(f"afade=t=in:st=0:d={fade_in:.2f}")
    if fade_out > 0.02 and duration > fade_out + 0.1:
        af_parts.append(f"afade=t=out:st={max(0.0, duration - fade_out):.2f}:d={fade_out:.2f}")
    af_parts.append("loudnorm=I=-14:LRA=7:tp=-1.5")
    af = ",".join(af_parts)

    cmd = [
        'ffmpeg',
        '-y',
        '-ss', f"{seek_start:.3f}",
        '-t', f"{seek_span:.3f}",
        '-avoid_negative_ts', 'make_zero',
        '-i', source_video_path,
    ]

    if has_custom_segments:
        fc_parts = []
        concat_inputs = []
        for idx, seg in enumerate(timeline_segs):
            rs = max(0.0, seg['start'] - seek_start)
            re_t = max(rs + 0.1, seg['end'] - seek_start)
            spd = seg['speed']
            fc_parts.append(f"[0:v]trim=start={rs:.3f}:end={re_t:.3f},setpts=(PTS-STARTPTS)/{spd:.4f}[sv{idx}]")
            concat_inputs.append(f"[sv{idx}]")
            if has_audio:
                vol = 0.0 if seg['muted'] else seg['volume']
                a_chain = [f"atrim=start={rs:.3f}:end={re_t:.3f}", "asetpts=PTS-STARTPTS"]
                a_chain.extend(_build_atempo_filters(spd))
                if abs(vol - 1.0) > 0.01:
                    a_chain.append(f"volume={vol:.3f}")
                fc_parts.append(f"[0:a]{','.join(a_chain)}[sa{idx}]")
                concat_inputs.append(f"[sa{idx}]")

        a_flag = 1 if has_audio else 0
        concat_out = "[basev][basea]" if has_audio else "[basev]"
        fc_parts.append(f"{''.join(concat_inputs)}concat=n={len(timeline_segs)}:v=1:a={a_flag}{concat_out}")

        if framing_chain is not None:
            fc_parts.append(f"[basev]{framing_chain}{adjustments_chain}{subtitles_filter}[outv]")
        else:
            fc_parts.append(
                f"[basev]split=2[bg][fg];"
                f"[bg]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,boxblur=12:1,scale=1080:1920[blurred];"
                f"[fg]scale=1080:-1[scaled_fg];"
                f"[blurred][scaled_fg]overlay=(W-w)/2:(H-h)/2{adjustments_chain}{subtitles_filter}[outv]"
            )

        if has_audio:
            fc_parts.append(f"[basea]{af}[outa]")
            cmd += ['-filter_complex', ';'.join(fc_parts), '-map', '[outv]', '-map', '[outa]']
        else:
            cmd += ['-filter_complex', ';'.join(fc_parts), '-map', '[outv]']
    else:
        if framing_chain is not None:
            vf = f"{framing_chain}{adjustments_chain}{subtitles_filter}"
            cmd += ['-vf', vf]
        else:
            vf = (
                f"[0:v]split=2[bg][fg];"
                f"[bg]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,boxblur=12:1,scale=1080:1920[blurred];"
                f"[fg]scale=1080:-1[scaled_fg];"
                f"[blurred][scaled_fg]overlay=(W-w)/2:(H-h)/2{adjustments_chain}{subtitles_filter}[outv]"
            )
            cmd += ['-filter_complex', vf, '-map', '[outv]']
            if has_audio:
                cmd += ['-map', '0:a?']
        if has_audio:
            cmd += ['-af', af]

    # Hardware Acceleration: Multi-Platform (NVIDIA NVENC, Intel QSV, Apple VideoToolbox, or CPU libx264)
    enc_name, v_codec_args = get_hardware_encoder()

    # Output parameters with Constant Frame Rate (CFR 30fps) to eliminate playback stutter
    cmd += [
        *v_codec_args,
        '-r', '30',
        '-vsync', 'cfr',
    ]
    if has_audio:
        cmd += ['-c:a', 'aac', '-b:a', '192k']
    cmd += ['-movflags', '+faststart', output_mp4_path]

    safe_cmd = ' '.join(str(c) for c in cmd).encode('ascii', errors='replace').decode('ascii')
    print(f"[render_shorts_clip] Executing FFmpeg ({enc_name}): {safe_cmd}")

    with _RENDER_SEMAPHORE:
        creationflags = 0
        if os.name == 'nt':
            # BELOW_NORMAL_PRIORITY_CLASS: gives Windows UI, mouse, browser, and OS top priority
            # so the computer never lags or freezes during render!
            creationflags = subprocess.BELOW_NORMAL_PRIORITY_CLASS

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=creationflags
        )

        try:
            p = psutil.Process(proc.pid)
            if os.name == 'nt':
                p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
            else:
                p.nice(10)
        except Exception:
            pass

        stdout, stderr = proc.communicate()
        if proc.returncode != 0:
            err_snippet = (stderr or "").strip().splitlines()
            tail_err = "\n".join(err_snippet[-10:]) if err_snippet else "Unknown FFmpeg error"
            raise RuntimeError(f"FFmpeg render failed (code {proc.returncode}): {tail_err}")

    # Cleanup temp ASS file if exists
    if ass_path and os.path.exists(ass_path):
        try:
            os.remove(ass_path)
        except Exception:
            pass

    import gc
    del cmd
    gc.collect()
    return output_mp4_path
