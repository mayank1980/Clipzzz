import os
import cv2
import numpy as np
from typing import List, Dict, Any

class ShotDetector:
    """
    Intelligent Shot Boundary and Scene Cut Detector.
    Identifies hard camera cuts, angle changes (wide <-> close-up), and transitions
    so camera framing can perform instantaneous cuts rather than nauseating pan-across-wall artifacts.
    """

    def __init__(self, threshold: float = 0.38, min_shot_duration: float = 0.8):
        self.threshold = threshold
        self.min_shot_duration = min_shot_duration

    def detect_shots(
        self,
        video_path: str,
        start_sec: float = 0.0,
        duration: float = 0.0,
        sample_fps: float = 6.0
    ) -> List[Dict[str, Any]]:
        """
        Scans video frames using color histogram and luminance difference to detect shot cuts.
        Returns a list of shot intervals: [{'shot_id': 0, 'start': 0.0, 'end': 4.2}, ...]
        """
        if not os.path.exists(video_path):
            return [{"shot_id": 0, "start": start_sec, "end": start_sec + max(1.0, duration)}]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return [{"shot_id": 0, "start": start_sec, "end": start_sec + max(1.0, duration)}]

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_video_duration = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / max(1.0, fps)
        clip_dur = duration if duration > 0 else max(1.0, total_video_duration - start_sec)
        clip_end = start_sec + clip_dur

        frame_step = max(1, int(round(fps / sample_fps)))
        step_sec = frame_step / fps

        cap.set(cv2.CAP_PROP_POS_MSEC, start_sec * 1000.0)

        prev_hist = None
        prev_gray = None
        cut_times = [start_sec]

        current_time = start_sec
        while current_time < clip_end:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            # Process every frame_step
            small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_LINEAR)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

            # 2D HSV color histogram
            hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
            cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

            if prev_hist is not None and prev_gray is not None:
                # Bhattacharyya distance for color distribution shift
                hist_diff = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
                # Mean pixel luminance delta
                lum_diff = float(np.mean(cv2.absdiff(prev_gray, gray))) / 255.0

                composite_diff = 0.70 * hist_diff + 0.30 * lum_diff

                if composite_diff > self.threshold:
                    if (current_time - cut_times[-1]) >= self.min_shot_duration:
                        cut_times.append(round(current_time, 2))

            prev_hist = hist
            prev_gray = gray
            current_time += step_sec

            # Advance capture pointer by frame_step
            target_frame = int(round(current_time * fps))
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

        cap.release()

        if clip_end > cut_times[-1]:
            cut_times.append(round(clip_end, 2))

        shots = []
        for i in range(len(cut_times) - 1):
            st = cut_times[i]
            et = cut_times[i + 1]
            if et > st:
                shots.append({
                    "shot_id": i,
                    "start": st,
                    "end": et,
                    "duration": round(et - st, 2)
                })

        if not shots:
            shots = [{"shot_id": 0, "start": start_sec, "end": clip_end, "duration": round(clip_dur, 2)}]

        return shots

def detect_shot_boundaries(video_path: str, start_sec: float = 0.0, duration: float = 0.0) -> List[Dict[str, Any]]:
    """Convenience helper for shot boundary detection."""
    detector = ShotDetector()
    shots = detector.detect_shots(video_path, start_sec, duration)
    # Return list of cut points
    cuts = []
    for s in shots:
        cuts.append({
            "time": s["start"],
            "type": "cut",
            "shot_id": s["shot_id"]
        })
    return cuts

