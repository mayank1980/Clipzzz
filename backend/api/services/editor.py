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
    Direct linear normalization [0.0 to 1.0] matching VideoPlayer.jsx CSS viewport coordinates.
    Zero artificial warping ensures 100% pixel-perfect match between preview and exported Short.
    """
    pct = max(0.0, min(100.0, float(val))) / 100.0
    return round(pct, 4)


def build_piecewise_crop_expr(keyframes: List[Dict[str, Any]], key: str = 'x', default_val: float = 50.0, pan_dur: float = 0.0, zoom: float = 1.08) -> str:
    """
    Constructs an FFmpeg piecewise step expression for clean, broadcast-grade camera cuts.
    Holds rock-solid on each speaker without shaky panning across background walls.
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
        t_switch = round(float(curr_k.get('time', 0.0)), 2)
        v_prev = normalize_crop_coord(prev_k.get(key, default_val), key, zoom)
        v_curr = normalize_crop_coord(curr_k.get(key, default_val), key, zoom)

        if pan_dur > 0.0:
            t_end = round(t_switch + pan_dur, 2)
            diff = round(v_curr - v_prev, 4)
            lerp_expr = f"{v_prev}+({diff})*(t-{t_switch})/{pan_dur}"
            expr = f"if(lt(t,{t_switch}),{v_prev},if(lt(t,{t_end}),{lerp_expr},{expr}))"
        else:
            expr = f"if(lt(t,{t_switch}),{v_prev},{expr})"

    return expr

def compute_clip_render_hash(clip, mode: str = 'captioned') -> str:
    """
    Computes a deterministic SHA-256 signature representing all visual, timing,
    framing, captioning, and credit parameters that affect the rendered output.
    Used for instant zero-latency caching: avoids re-rendering if nothing changed.
    """
    components = [
        str(round(float(clip.start_time), 3)),
        str(round(float(clip.end_time), 3)),
        str(clip.crop_mode),
        str(round(float(clip.crop_x), 2)),
        str(round(float(clip.crop_y), 2)),
        str(round(float(clip.crop_zoom), 2)),
        json.dumps(clip.crop_keyframes or [], sort_keys=True),
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
    """
    Builds a multi-panel vertical split-screen FFmpeg filter_complex graph when any keyframe
    uses 'split_2', 'split_3', or 'split_4'. Handles seamless solo <-> split layout transitions.
    Returns (True, filter_complex_str) if split panels exist, else (False, "").
    """
    if not crop_keyframes:
        return False, ""

    has_split = any(
        str(kf.get('mode', '')).startswith('split_') and len(kf.get('panels') or []) >= 2
        for kf in crop_keyframes
    )
    if not has_split:
        return False, ""

    from .face_tracker import compute_panel_crop_box

    sorted_kfs = sorted(crop_keyframes, key=lambda k: float(k.get('time', 0.0)))
    segments = []
    for idx, kf in enumerate(sorted_kfs):
        t_start = max(0.0, float(kf.get('time', 0.0)))
        if t_start >= duration - 0.05 and idx > 0:
            continue
        t_end = float(sorted_kfs[idx + 1].get('time', duration)) if idx + 1 < len(sorted_kfs) else (duration + 0.1)
        t_end = min(duration + 0.1, max(t_start + 0.05, t_end))
        if t_end - t_start >= 0.05:
            segments.append((t_start, t_end, kf))

    if not segments:
        segments = [(0.0, duration + 0.1, sorted_kfs[0])]

    filter_parts: List[str] = []
    num_segs = len(segments)

    if num_segs > 1:
        split_labels = "".join([f"[s{i}]" for i in range(num_segs)])
        filter_parts.append(f"[0:v]split={num_segs}{split_labels}")

    seg_outputs: List[str] = []
    for seg_idx, (ts, te, kf) in enumerate(segments):
        src_lbl = "[0:v]" if num_segs == 1 else f"[tr_{seg_idx}]"
        if num_segs > 1:
            filter_parts.append(f"[s{seg_idx}]trim=start={ts:.3f}:end={te:.3f},setpts=PTS-STARTPTS{src_lbl}")

        mode = str(kf.get('mode', 'solo'))
        panels = kf.get('panels') or []
        out_lbl = f"[seg_{seg_idx}]"

        if mode.startswith('split_') and len(panels) >= 2:
            n_panes = min(4, len(panels))
            panel_h = 1920 // n_panes
            p_in_lbls = "".join([f"[pin_{seg_idx}_{p_i}]" for p_i in range(n_panes)])
            filter_parts.append(f"{src_lbl}split={n_panes}{p_in_lbls}")

            p_out_lbls = []
            for p_i in range(n_panes):
                p = panels[p_i]
                if 'raw_x' in p and 'raw_y' in p:
                    box = compute_panel_crop_box(p['raw_x'], p['raw_y'], mode=mode, zoom=effective_zoom)
                else:
                    box = p
                wf = float(box.get('wf', 0.45))
                hf = float(box.get('hf', 0.50))
                cx = max(0.0, min(100.0, float(box.get('x', 50.0)))) / 100.0
                cy = max(0.0, min(100.0, float(box.get('y', 50.0)))) / 100.0
                pan_out = f"[pan_{seg_idx}_{p_i}]"
                filter_parts.append(
                    f"[pin_{seg_idx}_{p_i}]crop=w='iw*{wf:.5f}':h='ih*{hf:.5f}':x='(iw-ow)*{cx:.5f}':y='(ih-oh)*{cy:.5f}',"
                    f"scale=1080:{panel_h}:flags=lanczos,setsar=1{pan_out}"
                )
                p_out_lbls.append(pan_out)

            filter_parts.append(f"{''.join(p_out_lbls)}vstack=inputs={n_panes}{out_lbl}")
        else:
            cx = max(0.0, min(100.0, float(kf.get('x', default_x)))) / 100.0
            cy = max(0.0, min(100.0, float(kf.get('y', default_y)))) / 100.0
            filter_parts.append(
                f"{src_lbl}crop=w='ih*(9/16)/{effective_zoom:.4f}':h='ih/{effective_zoom:.4f}':"
                f"x='(iw-ow)*{cx:.5f}':y='(ih-oh)*{cy:.5f}',scale=1080:1920:flags=lanczos,setsar=1{out_lbl}"
            )
        seg_outputs.append(out_lbl)

    if num_segs == 1:
        # Append subtitles onto the single stacked segment directly
        last_expr = filter_parts[-1]
        if last_expr.endswith(seg_outputs[0]):
            filter_parts[-1] = last_expr[:-len(seg_outputs[0])] + f"{subtitles_filter}[outv]"
        else:
            filter_parts.append(f"{seg_outputs[0]}null{subtitles_filter}[outv]")
    else:
        filter_parts.append(f"{''.join(seg_outputs)}concat=n={num_segs}:v=1:a=0{subtitles_filter}[outv]")

    return True, ";".join(filter_parts)


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
    channel_name: str = ""
) -> str:
    """
    Renders a vertical 9:16 (1080x1920) YouTube Short using FFmpeg with:
    1. Smart blur-fill or custom cropped 9:16 framing (100% 1:1 match to web preview)
    2. Professional ASS subtitle burn-in
    3. Broadcast audio normalization (loudnorm)
    """
    os.makedirs(os.path.dirname(output_mp4_path), exist_ok=True)
    duration = max(1.0, clip_end - clip_start)

    # Subtitle and Top-Right Credit Watermark preparation
    ass_path = output_mp4_path.replace('.mp4', '.ass')
    show_captions = caption_style.get('showCaptions', True) if caption_style else True
    active_segments = segments if (show_captions and segments) else []

    # In clean mode, do not burn dialogue captions
    has_overlay_text = bool(show_captions or channel_name)
    subtitles_filter = ""
    rel_ass = ""

    if has_overlay_text:
        generate_ass_subtitle_file(active_segments, clip_start, clip_end, ass_path, caption_style or {}, channel_name=channel_name)
        try:
            rel_ass = os.path.relpath(ass_path, os.getcwd()).replace(chr(92), '/')
        except Exception:
            rel_ass = ass_path.replace(chr(92), '/')
        subtitles_filter = f",subtitles=filename='{rel_ass}'"

    use_filter_complex = False

    # Construct video filter graph: Dedicated 9:16 Portrait Shorts (1080x1920) matching main player
    if crop_mode == 'center_crop' or crop_mode == 'custom_crop':
        effective_zoom = max(1.08, min(2.5, float(crop_zoom)))
        if crop_keyframes and len(crop_keyframes) > 0:
            for kf in crop_keyframes:
                kf['zoom'] = effective_zoom
            is_split, split_vf = build_ffmpeg_split_filter(
                crop_keyframes, crop_x, crop_y, effective_zoom, duration, subtitles_filter=subtitles_filter
            )
            if is_split:
                use_filter_complex = True
                vf = split_vf
            else:
                expr_x = build_piecewise_crop_expr(crop_keyframes, key='x', default_val=crop_x, pan_dur=0.0, zoom=effective_zoom)
                expr_y = build_piecewise_crop_expr(crop_keyframes, key='y', default_val=crop_y, pan_dur=0.0, zoom=effective_zoom)
                vf = f"crop=w='ih*(9/16)/{effective_zoom:.4f}':h='ih/{effective_zoom:.4f}':x='(iw-ow)*({expr_x})':y='(ih-oh)*({expr_y})',scale=1080:1920{subtitles_filter}"
        else:
            cx = max(0.0, min(100.0, float(crop_x))) / 100.0
            cy = max(0.0, min(100.0, float(crop_y))) / 100.0
            vf = f"crop=w='ih*(9/16)/{effective_zoom:.4f}':h='ih/{effective_zoom:.4f}':x='(iw-ow)*{cx:.4f}':y='(ih-oh)*{cy:.4f}',scale=1080:1920{subtitles_filter}"
    else:
        # Blurred Background Fill mode
        vf = (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,boxblur=12:1,scale=1080:1920[blurred];"
            f"[fg]scale=1080:-1[scaled_fg];"
            f"[blurred][scaled_fg]overlay=(W-w)/2:(H-h)/2{subtitles_filter}[outv]"
        )

    # Audio filter: audio loudness normalization
    af = "loudnorm=I=-14:LRA=7:tp=-1.5"

    # Ultra-Fast Seeking: -ss and -t before -i for instantaneous 10ms keyframe seek with make_zero ts
    cmd = [
        'ffmpeg',
        '-y',
        '-ss', f"{clip_start:.3f}",
        '-t', f"{duration:.3f}",
        '-avoid_negative_ts', 'make_zero',
        '-i', source_video_path,
    ]

    if (crop_mode == 'center_crop' or crop_mode == 'custom_crop') and not use_filter_complex:
        cmd += ['-vf', vf]
    else:
        cmd += ['-filter_complex', vf, '-map', '[outv]', '-map', '0:a?']

    # Hardware Acceleration: Multi-Platform (NVIDIA NVENC, Intel QSV, Apple VideoToolbox, or CPU libx264)
    enc_name, v_codec_args = get_hardware_encoder()

    # Output parameters with Constant Frame Rate (CFR 30fps) to eliminate playback stutter
    cmd += [
        '-af', af,
        *v_codec_args,
        '-r', '30',
        '-vsync', 'cfr',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        output_mp4_path
    ]

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
    del cmd, vf
    gc.collect()
    return output_mp4_path
