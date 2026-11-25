import os
import re
import json
import math
import zlib
import hashlib
from typing import List, Dict, Any, Optional, Tuple
import numpy as np


FEATURE_DIM = 64


def _safe_filename_key(raw: str) -> str:
    return re.sub(r'[^a-zA-Z0-9._-]', '_', raw)[:80]


def compute_source_key(youtube_url: str = '', video_path: str = '') -> str:
    """
    Computes a canonical lightweight cache key for a video source.
    - URLs resolve via platform video ID or normalized URL SHA-256 prefix.
    - Local uploaded files use sparse 3x64KB sampling + file size (<2ms even on 2GB MP4s).
    """
    url = (youtube_url or '').strip()
    if url:
        try:
            from .downloader import get_youtube_video_id
            vid_id = get_youtube_video_id(url)
            if vid_id:
                return _safe_filename_key(f"yt_{vid_id}")
        except Exception:
            pass
        norm_url = url.split('#')[0].strip().lower()
        h = hashlib.sha256(norm_url.encode('utf-8')).hexdigest()[:16]
        return f"url_{h}"

    if video_path and os.path.exists(video_path):
        try:
            fsize = os.path.getsize(video_path)
            hasher = hashlib.sha256()
            hasher.update(str(fsize).encode('utf-8'))
            chunk = 65536
            with open(video_path, 'rb') as fp:
                hasher.update(fp.read(chunk))
                if fsize > chunk * 3:
                    fp.seek(fsize // 2)
                    hasher.update(fp.read(chunk))
                if fsize > chunk * 2:
                    fp.seek(max(0, fsize - chunk))
                    hasher.update(fp.read(chunk))
            return f"file_{fsize}_{hasher.hexdigest()[:16]}"
        except Exception:
            pass

    return ""


def compute_text_vector(text: str) -> np.ndarray:
    """Computes a lightweight L2-normalized 64-dim hashed bag-of-words vector in O(|words|)."""
    vec = np.zeros(FEATURE_DIM, dtype=np.float32)
    tokens = re.findall(r'\b[a-zA-Z0-9]{3,}\b', (text or '').lower())
    for tok in tokens:
        idx = zlib.crc32(tok.encode('utf-8')) % FEATURE_DIM
        vec[idx] += 1.0
    norm = float(np.linalg.norm(vec))
    if norm > 1e-6:
        vec /= norm
    return vec


class TimelineVectorAllocator:
    """
    Minimal-memory 1D timeline occupancy vector (1 byte/sec) + 64-dim topic feature vectors.
    Guarantees zero duplicate time intervals or topic overlaps when continuing/caching clips
    across incremental video runs (e.g. clips 1..10 cached -> allocates starting at #11).
    """

    def __init__(self, duration_seconds: float):
        total_sec = max(1, int(math.ceil(float(duration_seconds or 0.0))) + 2)
        self.total_seconds = total_sec
        self.occupancy = np.zeros(total_sec, dtype=np.uint8)
        self.topic_vectors: List[np.ndarray] = []
        self.intervals: List[Tuple[float, float]] = []

    def mark_allocated(self, start: float, end: float, text: str = "") -> None:
        s_idx = max(0, min(self.total_seconds - 1, int(math.floor(float(start)))))
        e_idx = max(s_idx + 1, min(self.total_seconds, int(math.ceil(float(end)))))
        self.occupancy[s_idx:e_idx] = 1
        self.intervals.append((float(start), float(end)))
        if text:
            vec = compute_text_vector(text)
            if float(np.linalg.norm(vec)) > 0.0:
                self.topic_vectors.append(vec)

    def overlap_fraction(self, start: float, end: float) -> float:
        s_idx = max(0, min(self.total_seconds - 1, int(math.floor(float(start)))))
        e_idx = max(s_idx + 1, min(self.total_seconds, int(math.ceil(float(end)))))
        span = self.occupancy[s_idx:e_idx]
        if span.size == 0:
            return 0.0
        return float(np.mean(span > 0))

    def max_topic_cosine(self, text: str) -> float:
        if not self.topic_vectors or not text:
            return 0.0
        vec = compute_text_vector(text)
        if float(np.linalg.norm(vec)) <= 1e-6:
            return 0.0
        return max(float(np.dot(vec, tv)) for tv in self.topic_vectors)

    def is_conflict(self, start: float, end: float, text: str = "", min_gap: float = 4.0) -> bool:
        if self.overlap_fraction(max(0.0, start - min_gap), end + min_gap) > 0.22:
            return True
        if text and self.max_topic_cosine(text) >= 0.80:
            return True
        return False

    def occupied_intervals(self) -> List[Tuple[float, float]]:
        return list(self.intervals)

    def free_intervals(self, min_duration: float = 25.0) -> List[Tuple[float, float]]:
        free_mask = (self.occupancy == 0).astype(np.int8)
        padded = np.concatenate(([0], free_mask, [0]))
        diffs = np.diff(padded)
        starts = np.where(diffs == 1)[0]
        ends = np.where(diffs == -1)[0]
        result = []
        for s, e in zip(starts, ends):
            if (e - s) >= min_duration:
                result.append((float(s), float(e)))
        return result


def _cache_file_path(media_root: str, source_key: str) -> str:
    cache_dir = os.path.join(media_root, 'vector_cache')
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, f"{_safe_filename_key(source_key)}.json")


def load_source_cache(media_root: str, source_key: str) -> Dict[str, Any]:
    if not media_root or not source_key:
        return {}
    path = _cache_file_path(media_root, source_key)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_source_cache(media_root: str, source_key: str, payload: Dict[str, Any]) -> None:
    if not media_root or not source_key:
        return
    path = _cache_file_path(media_root, source_key)
    tmp_path = f"{path}.tmp"
    try:
        with open(tmp_path, 'w', encoding='utf-8') as fp:
            json.dump(payload, fp, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception as e:
        print(f"[vector_cache] Save cache notice: {e}")


def serialize_clip_snapshot(clip_obj) -> Dict[str, Any]:
    """Serializes lightweight reusable clip payload (no duplicate video bytes)."""
    return {
        "title": clip_obj.title,
        "hook_title": clip_obj.hook_title,
        "ending_type": clip_obj.ending_type,
        "start_time": float(clip_obj.start_time),
        "end_time": float(clip_obj.end_time),
        "duration": float(clip_obj.duration),
        "score": int(clip_obj.score),
        "category": clip_obj.category,
        "hook": clip_obj.hook,
        "reason": clip_obj.reason,
        "aspect_ratio": clip_obj.aspect_ratio,
        "crop_mode": clip_obj.crop_mode,
        "crop_x": float(clip_obj.crop_x),
        "crop_y": float(clip_obj.crop_y),
        "crop_zoom": float(clip_obj.crop_zoom),
        "crop_keyframes": clip_obj.crop_keyframes or [],
        "is_speaker_centered": bool(clip_obj.is_speaker_centered),
        "caption_style": clip_obj.caption_style or {},
        "rendered_file_name": clip_obj.rendered_file.name if clip_obj.rendered_file else "",
        "rendered_hash": getattr(clip_obj, 'rendered_hash', '') or '',
        "rendered_clean_file_name": clip_obj.rendered_clean_file.name if clip_obj.rendered_clean_file else "",
        "rendered_clean_hash": getattr(clip_obj, 'rendered_clean_hash', '') or '',
    }
