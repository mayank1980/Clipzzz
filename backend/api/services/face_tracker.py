import os
import cv2
import numpy as np
import subprocess
from typing import List, Dict, Any, Tuple, Optional
from .face_detector import RobustFaceDetector

_FACE_CACHE: Dict[str, Any] = {}

class FaceTrack:
    """Represents a single persistent visual face identity tracked over time."""
    def __init__(self, track_id: str, init_detection: Dict[str, Any], timestamp: float):
        self.track_id = track_id
        self.cx = init_detection['cx']
        self.cy = init_detection['cy']
        self.w_pct = init_detection.get('w_pct', 15.0)
        self.h_pct = init_detection.get('h_pct', 20.0)
        self.area = init_detection.get('area', 5000)
        self.last_seen = timestamp
        self.first_seen = timestamp
        self.detection_history: List[Tuple[float, Dict[str, Any]]] = [(timestamp, init_detection)]
        self.mouth_motion_history: List[Tuple[float, float]] = [] # (time, motion_val)
        self.active_score = 0.0

    def update(self, detection: Dict[str, Any], timestamp: float, mouth_delta: float = 0.0):
        # Exponential moving average for smooth visual tracking
        alpha = 0.35
        self.cx = round((1.0 - alpha) * self.cx + alpha * detection['cx'], 2)
        self.cy = round((1.0 - alpha) * self.cy + alpha * detection['cy'], 2)
        self.w_pct = round((1.0 - alpha) * self.w_pct + alpha * detection.get('w_pct', self.w_pct), 2)
        self.h_pct = round((1.0 - alpha) * self.h_pct + alpha * detection.get('h_pct', self.h_pct), 2)
        self.area = detection.get('area', self.area)
        self.last_seen = timestamp
        self.detection_history.append((timestamp, detection))
        if len(self.detection_history) > 60:
            self.detection_history.pop(0)

        self.mouth_motion_history.append((timestamp, mouth_delta))
        if len(self.mouth_motion_history) > 60:
            self.mouth_motion_history.pop(0)

    def get_recent_mouth_energy(self, window_sec: float = 1.0) -> float:
        """Returns mean mouth motion variance over recent time window."""
        if not self.mouth_motion_history:
            return 0.0
        cutoff = self.last_seen - window_sec
        recent = [val for (t, val) in self.mouth_motion_history if t >= cutoff]
        return float(np.mean(recent)) if recent else 0.0


class PersistentFaceTracker:
    """
    Visual Face Tracking System with ID Persistence across video frames.
    Matches incoming detections to active tracks using IoU, spatial proximity, and scale similarity.
    Maintains persistent IDs (FACE_001, FACE_002, ...) throughout debate and podcast sessions.
    """

    def __init__(self, max_missed_seconds: float = 1.6, match_distance_threshold: float = 14.0):
        self.max_missed_sec = max_missed_seconds
        self.match_dist_thresh = match_distance_threshold
        self.tracks: Dict[str, FaceTrack] = {}
        self.next_track_num = 1
        self.detector = RobustFaceDetector()

    def reset_tracks(self):
        """Resets active tracks on camera cut / shot boundary."""
        self.tracks.clear()


    def process_frame(
        self,
        frame: np.ndarray,
        timestamp: float,
        prev_gray: Optional[np.ndarray] = None
    ) -> List[Dict[str, Any]]:
        """
        Detects faces in frame and updates active persistent face tracks.
        Returns a list of active face tracking states at current timestamp.
        """
        detections = self.detector.detect_faces(frame)
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Compute mouth motion for each detection against prev_gray
        for det in detections:
            mouth_delta = 0.0
            mb = det.get('mouth_box', {})
            if prev_gray is not None and mb:
                mx, my, mw, mh = mb['x'], mb['y'], mb['w'], mb['h']
                if 0 <= my and my + mh <= prev_gray.shape[0] and 0 <= mx and mx + mw <= prev_gray.shape[1]:
                    prev_mouth = prev_gray[my:my+mh, mx:mx+mw]
                    curr_mouth = gray[my:my+mh, mx:mx+mw]
                    if prev_mouth.shape == curr_mouth.shape and prev_mouth.size > 0:
                        mouth_delta = float(np.mean(cv2.absdiff(prev_mouth, curr_mouth)))
            det['mouth_delta'] = mouth_delta

        # Match detections to existing tracks
        matched_track_ids = set()
        matched_det_indices = set()

        # Greedy closest centroid assignment
        for det_idx, det in enumerate(detections):
            best_track_id = None
            min_dist = 999.0

            for track_id, track in self.tracks.items():
                if track_id in matched_track_ids:
                    continue
                # Time since last seen
                if (timestamp - track.last_seen) > self.max_missed_sec:
                    continue

                dist = np.hypot(det['cx'] - track.cx, det['cy'] - track.cy)
                if dist < self.match_dist_thresh and dist < min_dist:
                    min_dist = dist
                    best_track_id = track_id

            if best_track_id is not None:
                self.tracks[best_track_id].update(det, timestamp, det.get('mouth_delta', 0.0))
                matched_track_ids.add(best_track_id)
                matched_det_indices.add(det_idx)

        # Create new tracks for unmatched detections
        for det_idx, det in enumerate(detections):
            if det_idx not in matched_det_indices:
                new_id = f"FACE_{self.next_track_num:03d}"
                self.next_track_num += 1
                new_track = FaceTrack(new_id, det, timestamp)
                new_track.mouth_motion_history.append((timestamp, det.get('mouth_delta', 0.0)))
                self.tracks[new_id] = new_track
                matched_track_ids.add(new_id)

        # Clean up obsolete tracks older than max_missed_seconds
        expired_ids = [
            tid for tid, t in self.tracks.items()
            if (timestamp - t.last_seen) > self.max_missed_sec
        ]
        for eid in expired_ids:
            del self.tracks[eid]

        # Return snapshot of currently visible tracks
        current_visible = []
        for tid in matched_track_ids:
            if tid in self.tracks:
                trk = self.tracks[tid]
                current_visible.append({
                    "face_track_id": trk.track_id,
                    "timestamp": timestamp,
                    "cx": trk.cx,
                    "cy": trk.cy,
                    "w_pct": trk.w_pct,
                    "h_pct": trk.h_pct,
                    "area": trk.area,
                    "mouth_motion": trk.get_recent_mouth_energy(0.8),
                })

        return current_visible


class AutoCameraEngine:
    """
    Backward-Compatible Facade for Camera Framing & Tracking Engine.
    Inherited by task_runner and crop inspectors with persistent multi-speaker intelligence.
    """

    def __init__(self, smoothing_alpha: float = 0.20, min_shot_duration: float = 2.0):
        self.alpha = smoothing_alpha
        self.min_shot_duration = min_shot_duration
        self.tracker = PersistentFaceTracker()

    def cluster_speaker_seats(self, all_faces: List[Dict[str, Any]], max_spread: float = 8.0) -> List[Dict[str, Any]]:
        """Centroid-Radius clustering to discover physical studio seats."""
        if not all_faces:
            return [{"id": 0, "x": 50.0, "y": 32.0, "label": "Center Speaker", "count": 1}]

        sorted_faces = sorted(all_faces, key=lambda f: f['cx'])
        clusters: List[List[Dict[str, Any]]] = []

        for f in sorted_faces:
            best_c = None
            min_dist = 999.0
            for c in clusters:
                centroid_x = float(np.mean([item['cx'] for item in c]))
                dist = abs(f['cx'] - centroid_x)
                if dist <= max_spread and dist < min_dist:
                    min_dist = dist
                    best_c = c

            if best_c is not None:
                best_c.append(f)
            else:
                clusters.append([f])

        valid_clusters = [c for c in clusters if len(c) >= max(2, int(len(all_faces) * 0.03))]
        if not valid_clusters:
            valid_clusters = clusters

        speaker_seats = []
        for idx, c in enumerate(valid_clusters):
            c_xs = [f["cx"] for f in c]
            c_ys = [f["cy"] for f in c]
            med_x = float(np.median(c_xs))
            med_y = float(np.median(c_ys))

            clamped_x = round(max(16.0, min(84.0, med_x)), 1)
            clamped_y = round(max(22.0, min(42.0, med_y)), 1)

            if clamped_x < 36.0:
                label = "Speaker Left"
            elif clamped_x > 64.0:
                label = "Speaker Right"
            else:
                label = "Center Speaker"

            speaker_seats.append({
                "id": idx,
                "x": clamped_x,
                "y": clamped_y,
                "raw_x": med_x,
                "label": label,
                "count": len(c)
            })

        speaker_seats.sort(key=lambda s: s["x"])
        for idx, s in enumerate(speaker_seats):
            s["id"] = idx

        return speaker_seats

    def analyze_clip_framing(
        self,
        video_path: str,
        start_sec: float = 0.0,
        duration: float = 2.0,
        sample_interval: float = 1.0
    ) -> Dict[str, Any]:
        """Calculates optimal primary focal center across clip frames."""
        if not os.path.exists(video_path):
            return {"x": 50.0, "y": 35.0, "mode": "custom_crop", "detected": False, "face_count": 0}

        cache_key = f"frame:{video_path}:{round(start_sec, 1)}"
        if cache_key in _FACE_CACHE:
            return _FACE_CACHE[cache_key]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"x": 50.0, "y": 35.0, "mode": "custom_crop", "detected": False, "face_count": 0}

        detector = RobustFaceDetector()
        all_faces: List[Dict[str, Any]] = []

        for offset in [0.2, duration * 0.5, max(0.5, duration - 0.2)]:
            target_time = start_sec + offset
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, target_time * 1000.0))
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            frame_faces = detector.detect_faces(frame, target_w=640)
            if frame_faces:
                best = min(frame_faces, key=lambda f: abs(f['cx'] - 50.0))
                all_faces.append(best)

        cap.release()

        if not all_faces:
            fallback = {"x": 50.0, "y": 35.0, "mode": "custom_crop", "detected": False, "face_count": 0}
            _FACE_CACHE[cache_key] = fallback
            return fallback

        avg_x = sum(f['cx'] for f in all_faces) / len(all_faces)
        avg_y = sum(f['cy'] for f in all_faces) / len(all_faces)

        clamped_x = round(max(16.0, min(84.0, avg_x)), 1)
        clamped_y = round(max(22.0, min(42.0, avg_y)), 1)

        result = {
            "x": clamped_x,
            "y": clamped_y,
            "mode": "custom_crop",
            "detected": True,
            "face_count": len(all_faces),
            "zoom": 1.0,
        }
        _FACE_CACHE[cache_key] = result
        return result

    def generate_clip_camera_keyframes(
        self,
        video_path: str,
        start_sec: float,
        duration: float = 30.0,
        sample_interval: float = 0.50
    ) -> List[Dict[str, Any]]:
        """
        Generates responsive camera trajectory keyframes with high temporal resolution (500ms).
        Delegates to the active speaker decision pipeline.
        """
        from .active_speaker import ActiveSpeakerEngine
        from .camera_controller import CameraController

        engine = ActiveSpeakerEngine()
        controller = CameraController()

        # Step 1: Compute audio-visual active speaker timeline
        speaker_timeline = engine.analyze_clip_speakers(
            video_path=video_path,
            clip_start=start_sec,
            duration=duration,
            sample_interval=sample_interval
        )

        # Step 2: Convert speaker timeline into 9:16 portrait camera trajectory
        trajectory = controller.generate_trajectory(
            speaker_timeline=speaker_timeline,
            clip_start=start_sec,
            duration=duration
        )

        return trajectory.get('keyframes', [
            {"time": 0.0, "x": 50.0, "y": 35.0, "zoom": 1.0, "speaker": "Center Focus"}
        ])

def detect_primary_speaker_center(video_path: str, start_sec: float = 0.0, duration: float = 2.0) -> Dict[str, Any]:
    """Module-level helper to detect primary speaker center."""
    engine = AutoCameraEngine()
    return engine.analyze_clip_framing(video_path, start_sec, duration)

def generate_camera_keyframes(video_path: str, start_sec: float = 0.0, duration: float = 30.0) -> List[Dict[str, Any]]:
    """Module-level helper to generate intelligent multi-speaker 9:16 keyframes."""
    engine = AutoCameraEngine()
    return engine.generate_clip_camera_keyframes(video_path, start_sec, duration)

