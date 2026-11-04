import os
import cv2
import numpy as np
import subprocess
from typing import List, Dict, Any, Tuple

class AutoCameraEngine:
    """
    Intelligent Active Camera Framing & Speaker Tracking Engine.
    Implements multi-model face detection, centroid-radius speaker clustering,
    lip-motion dynamic active speaker identification, and sticky camera hysteresis.
    """

    def __init__(self, smoothing_alpha: float = 0.20, min_shot_duration: float = 2.5):
        self.alpha = smoothing_alpha
        self.min_shot_duration = min_shot_duration
        self.current_focal_x = 50.0
        self.current_focal_y = 35.0

        alt2_path = cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'
        def_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        prof_path = cv2.data.haarcascades + 'haarcascade_profileface.xml'

        self.face_cascade_alt2 = cv2.CascadeClassifier(alt2_path) if os.path.exists(alt2_path) else None
        self.face_cascade_def = cv2.CascadeClassifier(def_path) if os.path.exists(def_path) else None
        self.profile_cascade = cv2.CascadeClassifier(prof_path) if os.path.exists(prof_path) else None

    def _has_valid_face_skin(self, bgr_crop: np.ndarray) -> bool:
        if bgr_crop is None or bgr_crop.size == 0:
            return False
        hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
        # Lenient skin mask to handle varied podcast studio lighting & skin tones
        lower_skin = np.array([0, 15, 30], dtype=np.uint8)
        upper_skin = np.array([32, 255, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_skin, upper_skin)
        skin_pct = (mask > 0).mean() * 100.0
        return skin_pct >= 5.0

    def detect_faces_in_frame(self, frame: np.ndarray, target_w: int = 480) -> List[Dict[str, Any]]:
        orig_h, orig_w = frame.shape[:2]
        if orig_w == 0 or orig_h == 0:
            return []

        scale = float(target_w) / orig_w
        new_h = int(orig_h * scale)
        small = cv2.resize(frame, (target_w, new_h), interpolation=cv2.INTER_LINEAR)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        detections = []

        # 1. Frontal Alt2 Detector (Fastest and highly accurate for podcast/interviews)
        if self.face_cascade_alt2 and not self.face_cascade_alt2.empty():
            faces_alt2 = self.face_cascade_alt2.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(32, 32)
            )
            for (x, y, w, h) in faces_alt2:
                ratio = w / float(h)
                if 0.60 <= ratio <= 1.40:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h))

        # 2. Frontal Default Detector (Hierarchical fallback if Alt2 found no faces)
        if not detections and self.face_cascade_def and not self.face_cascade_def.empty():
            faces_def = self.face_cascade_def.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(32, 32)
            )
            for (x, y, w, h) in faces_def:
                ratio = w / float(h)
                if 0.60 <= ratio <= 1.40:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h))

        # 3. Profile Detector (Hierarchical fallback for profile speakers)
        if not detections and self.profile_cascade and not self.profile_cascade.empty():
            prof_faces = self.profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(32, 32)
            )
            for (x, y, w, h) in prof_faces:
                ratio = w / float(h)
                if 0.60 <= ratio <= 1.40:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h))

            if not detections:
                flipped_gray = cv2.flip(gray, 1)
                prof_flipped = self.profile_cascade.detectMultiScale(
                    flipped_gray,
                    scaleFactor=1.15,
                    minNeighbors=4,
                    minSize=(32, 32)
                )
                for (x, y, w, h) in prof_flipped:
                    ratio = w / float(h)
                    if 0.60 <= ratio <= 1.40:
                        real_x = target_w - (x + w)
                        crop = small[y:y+h, real_x:real_x+w]
                        if self._has_valid_face_skin(crop):
                            detections.append((real_x, y, w, h))

        if not detections:
            return []

        # Non-Maximum Suppression (NMS)
        boxes = []
        for (x, y, w, h) in detections:
            boxes.append([x, y, x + w, y + h, w * h])

        boxes = sorted(boxes, key=lambda b: b[4], reverse=True)
        keep = []
        while boxes:
            cur = boxes.pop(0)
            keep.append(cur)
            remaining = []
            for other in boxes:
                xx1 = max(cur[0], other[0])
                yy1 = max(cur[1], other[1])
                xx2 = min(cur[2], other[2])
                yy2 = min(cur[3], other[3])
                inter_w = max(0, xx2 - xx1)
                inter_h = max(0, yy2 - yy1)
                inter_area = inter_w * inter_h
                union_area = cur[4] + other[4] - inter_area
                iou = inter_area / union_area if union_area > 0 else 0
                if iou < 0.35:
                    remaining.append(other)
            boxes = remaining

        results = []
        for (x1, y1, x2, y2, area) in keep:
            fw = x2 - x1
            fh = y2 - y1
            cx_pct = ((x1 + fw / 2.0) / float(target_w)) * 100.0
            cy_pct = ((y1 + fh / 2.0) / float(new_h)) * 100.0
            # Allow studio desks spanning wide bounds [8.0, 92.0]
            if cy_pct < 10.0 or cy_pct > 86.0:
                continue
            if cx_pct < 8.0 or cx_pct > 92.0:
                continue
            results.append({
                'x': int(x1),
                'y': int(y1),
                'w': int(fw),
                'h': int(fh),
                'cx': float(cx_pct),
                'cy': float(cy_pct),
                'area': int(area),
            })

        return results

    def cluster_speaker_seats(self, all_faces: List[Dict[str, Any]], max_spread: float = 7.0) -> List[Dict[str, Any]]:
        """
        Centroid-Radius clustering: groups face detections into distinct physical chairs/seats.
        Avoids single-linkage chaining that merged all panelists into a single center cluster.
        """
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

        # Filter out 1-off noise detections: require at least 4% of total faces or >= 3 detections
        min_cluster_len = max(3, int(len(all_faces) * 0.04)) if len(clusters) > 1 else 1
        valid_clusters = [c for c in clusters if len(c) >= min_cluster_len]
        if not valid_clusters:
            valid_clusters = clusters

        speaker_seats = []
        for idx, c in enumerate(valid_clusters):
            c_xs = [f["cx"] for f in c]
            c_ys = [f["cy"] for f in c]
            med_x = float(np.median(c_xs))
            med_y = float(np.median(c_ys))

            # Zero-Wall Framing: 9:16 slice is 31.64% of 16:9 width. Half-width is 15.82%.
            # Clamping to [16.0, 84.0] guarantees ZERO black borders across any seat in the studio!
            clamped_x = round(max(16.0, min(84.0, med_x)), 1)
            clamped_y = round(max(22.0, min(42.0, med_y)), 1)

            if clamped_x < 38.0:
                label = "Speaker Left"
            elif clamped_x > 62.0:
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

        # Sort left-to-right
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
        """
        Calculates optimal primary focal center across clip frames.
        """
        if not os.path.exists(video_path):
            return {"x": 50.0, "y": 35.0, "mode": "custom_crop", "detected": False, "face_count": 0}

        cache_key = f"frame:{video_path}:{round(start_sec, 1)}"
        if cache_key in _FACE_CACHE:
            return _FACE_CACHE[cache_key]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"x": 50.0, "y": 35.0, "mode": "custom_crop", "detected": False, "face_count": 0}

        all_faces: List[Dict[str, Any]] = []

        # Adaptive fast sampling: check middle frame first, exit immediately on face detection
        sample_offsets = [round(min(2.0, duration * 0.5), 2), 0.5]
        for offset in sample_offsets:
            target_time = start_sec + offset
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, target_time * 1000.0))
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            frame_faces = self.detect_faces_in_frame(frame, target_w=480)
            if frame_faces:
                # Prefer face closest to natural center-third
                best = min(frame_faces, key=lambda f: abs(f['cx'] - 50.0))
                all_faces.append(best)
                break  # Fast exit: speaker located!

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
        sample_interval: float = 2.0
    ) -> List[Dict[str, Any]]:
        """
        State-of-the-art Multi-Speaker Camera Tracking Engine.
        1. Samples video frames and measures inter-frame lip motion dynamics.
        2. Discovers physical speaker seats via Centroid-Radius spatial clustering.
        3. Identifies the truly speaking person instead of laughing guests or closest faces.
        4. Applies sticky camera hysteresis: camera holds on speaking person and does not jitter away.
        5. Switches to dynamic stacked split-screen for conversational banter.
        """
        if not os.path.exists(video_path):
            return [{"time": 0.0, "x": 50.0, "y": 35.0, "zoom": 1.0, "speaker": "Center Focus"}]

        frame_w = 480
        frame_h = 270
        frame_sz = frame_w * frame_h * 3
        fps = 1.0 / max(0.8, sample_interval)

        sampled_timeline: List[Dict[str, Any]] = []

        # Fast 1-pass FFmpeg raw pipe decoding
        cmd = [
            'ffmpeg', '-y',
            '-ss', f"{start_sec:.2f}",
            '-t', f"{duration:.2f}",
            '-i', video_path,
            '-vf', f"fps={fps:.3f},scale={frame_w}:{frame_h}",
            '-c:v', 'rawvideo',
            '-pix_fmt', 'bgr24',
            '-f', 'rawvideo',
            'pipe:1'
        ]

        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            raw_bytes, _ = proc.communicate()
            total_frames = len(raw_bytes) // frame_sz

            prev_gray = None
            for i in range(total_frames):
                rel_t = round(i * sample_interval, 2)
                buf = raw_bytes[i * frame_sz : (i + 1) * frame_sz]
                frame = np.frombuffer(buf, dtype=np.uint8).reshape((frame_h, frame_w, 3))
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

                faces = self.detect_faces_in_frame(frame, target_w=frame_w)

                # Compute mouth/lip motion variance against prev_gray
                for fc in faces:
                    lip_motion = 0.0
                    if prev_gray is not None:
                        my1 = int(fc['y'] + 0.65 * fc['h'])
                        my2 = int(fc['y'] + fc['h'])
                        mx1 = int(fc['x'] + 0.20 * fc['w'])
                        mx2 = int(fc['x'] + 0.80 * fc['w'])
                        m1 = prev_gray[my1:my2, mx1:mx2]
                        m2 = gray[my1:my2, mx1:mx2]
                        if m1.size > 0 and m1.shape == m2.shape:
                            lip_motion = float(np.mean(cv2.absdiff(m1, m2)))
                    fc['lip_motion'] = lip_motion

                sampled_timeline.append({
                    "time": rel_t,
                    "faces": faces
                })
                prev_gray = gray

        except Exception as e:
            # Fallback to OpenCV seek if FFmpeg raw pipe fails
            cap = cv2.VideoCapture(video_path)
            prev_gray = None
            for rel_t in [0.0, round(duration * 0.33, 1), round(duration * 0.66, 1), round(max(0.0, duration - 1.0), 1)]:
                cap.set(cv2.CAP_PROP_POS_MSEC, (start_sec + rel_t) * 1000.0)
                ret, frame = cap.read()
                if ret and frame is not None:
                    faces = self.detect_faces_in_frame(frame, target_w=frame_w)
                    gray = cv2.cvtColor(cv2.resize(frame, (frame_w, frame_h)), cv2.COLOR_BGR2GRAY)
                    for fc in faces:
                        fc['lip_motion'] = 15.0  # nominal active motion
                    sampled_timeline.append({"time": rel_t, "faces": faces})
            cap.release()

        if not sampled_timeline:
            return [{"time": 0.0, "x": 50.0, "y": 35.0, "zoom": 1.0, "speaker": "Center Focus"}]

        # Collect all valid face detections across clip
        all_faces = [f for st in sampled_timeline for f in st["faces"]]
        if not all_faces:
            return [{"time": 0.0, "x": 50.0, "y": 35.0, "zoom": 1.0, "speaker": "Center Focus"}]

        # 1. Establish stable physical speaker seats via Centroid-Radius Clustering
        speaker_seats = self.cluster_speaker_seats(all_faces, max_spread=7.0)

        # 2. Build continuous focal track across time samples with Sticky Speaker Hysteresis
        focal_track = []
        current_seat = speaker_seats[0]
        last_switch_time = 0.0
        switch_candidate_id = None
        candidate_streak = 0
        min_dwell = self.min_shot_duration  # Default 2.5s minimum hold on a speaker

        for st in sampled_timeline:
            t = st["time"]
            faces = st["faces"]

            if faces:
                # Calculate active speech score for each physical seat
                seat_scores = {s["id"]: 0.0 for s in speaker_seats}
                for f in faces:
                    nearest_s = min(speaker_seats, key=lambda s: abs(s["x"] - f["cx"]))
                    motion = f.get("lip_motion", 0.0)
                    # Normalize by face area with soft dampening: prevents large foreground face from dominating
                    area_weight = 1.0 + 0.15 * min(2.0, f["area"] / 10000.0)
                    score = motion * area_weight
                    seat_scores[nearest_s["id"]] = max(seat_scores[nearest_s["id"]], score)

                # Sticky Continuity Bonus for current speaker:
                # Gives +50% advantage to prevent camera from jumping away if someone else laughs or moves
                curr_score = seat_scores[current_seat["id"]]
                other_seats = [s for s in speaker_seats if s["id"] != current_seat["id"]]

                if other_seats:
                    best_other_seat = max(other_seats, key=lambda s: seat_scores[s["id"]])
                    other_score = seat_scores[best_other_seat["id"]]

                    # Switch rules:
                    # 1. Must hold current speaker for at least min_dwell (2.5s)
                    # 2. Candidate must show true active speech (score > 10.0)
                    # 3. Candidate must clearly exceed current speaker (1.35x)
                    time_since_switch = t - last_switch_time
                    is_valid_candidate = (
                        other_score > 10.0 and
                        (other_score > 1.35 * max(4.0, curr_score)) and
                        time_since_switch >= min_dwell
                    )

                    if is_valid_candidate:
                        if switch_candidate_id == best_other_seat["id"]:
                            candidate_streak += 1
                        else:
                            switch_candidate_id = best_other_seat["id"]
                            candidate_streak = 1

                        # Require 2 consecutive time samples (~2.5s) of confirmed talking
                        # This eliminates brief laughs, coughs, and fast movements completely!
                        if candidate_streak >= 2:
                            current_seat = best_other_seat
                            last_switch_time = t
                            switch_candidate_id = None
                            candidate_streak = 0
                    else:
                        candidate_streak = 0
                        switch_candidate_id = None

                chosen_x = current_seat["x"]
                chosen_y = current_seat["y"]
                chosen_label = current_seat["label"]

            else:
                # No face detected in this frame (e.g. wide crowd shot or slide)
                chosen_x = current_seat["x"]
                chosen_y = current_seat["y"]
                chosen_label = current_seat["label"]

            focal_track.append({
                "time": t,
                "x": chosen_x,
                "y": chosen_y,
                "speaker": chosen_label,
                "seat_id": current_seat["id"]
            })

        # 3. Dynamic Stacked Split-Screen & Solo Framing State Machine
        has_multi_seats = len(speaker_seats) >= 2
        seat_top = min(speaker_seats, key=lambda s: s["x"]) if has_multi_seats else speaker_seats[0]
        seat_bottom = max(speaker_seats, key=lambda s: s["x"]) if has_multi_seats else speaker_seats[0]
        seat_distance = abs(seat_bottom["x"] - seat_top["x"]) if has_multi_seats else 0.0

        keyframes = []
        active_mode = "solo"
        split_hold_until = -1.0
        last_kf_time = -999.0
        last_kf_x = -999.0

        total_samples = len(focal_track)
        for i, pt in enumerate(focal_track):
            t = pt["time"]

            # Rapid banter detection: check if focal point changes back-and-forth within <= 1.8s window
            is_rapid_banter = False
            if has_multi_seats and seat_distance >= 18.0:
                window_pts = [focal_track[j] for j in range(i, min(total_samples, i + 4))]
                unique_speakers = set(wp["seat_id"] for wp in window_pts)
                if len(unique_speakers) >= 2:
                    is_rapid_banter = True

            # State Machine: Split vs Solo
            if is_rapid_banter:
                if active_mode != "split":
                    active_mode = "split"
                    split_hold_until = t + 2.8  # Hold split for at least 2.8 seconds anti-flicker
                    keyframes.append({
                        "time": round(t, 1),
                        "mode": "split",
                        "top_x": seat_top["x"],
                        "top_y": seat_top["y"],
                        "bottom_x": seat_bottom["x"],
                        "bottom_y": seat_bottom["y"],
                        "x": seat_top["x"],
                        "y": seat_top["y"],
                        "zoom": 1.15,
                        "speaker": f"Split: {seat_top['label']} & {seat_bottom['label']}"
                    })
                    last_kf_time = t
                else:
                    split_hold_until = max(split_hold_until, t + 2.8)

            elif active_mode == "split":
                if t >= split_hold_until:
                    # Split hold elapsed: return cleanly to solo active speaker
                    active_mode = "solo"
                    keyframes.append({
                        "time": round(t, 1),
                        "mode": "solo",
                        "x": pt["x"],
                        "y": pt["y"],
                        "zoom": 1.0,
                        "speaker": pt["speaker"]
                    })
                    last_kf_time = t
                    last_kf_x = pt["x"]

            else:
                # Solo camera tracking
                if not keyframes:
                    keyframes.append({
                        "time": 0.0,
                        "mode": "solo",
                        "x": pt["x"],
                        "y": pt["y"],
                        "zoom": 1.0,
                        "speaker": pt["speaker"]
                    })
                    last_kf_time = 0.0
                    last_kf_x = pt["x"]
                else:
                    shift = abs(pt["x"] - last_kf_x)
                    time_elapsed = t - last_kf_time
                    if shift >= 8.0 and time_elapsed >= self.min_shot_duration:
                        keyframes.append({
                            "time": round(t, 1),
                            "mode": "solo",
                            "x": pt["x"],
                            "y": pt["y"],
                            "zoom": 1.0,
                            "speaker": pt["speaker"]
                        })
                        last_kf_time = t
                        last_kf_x = pt["x"]

        if not keyframes:
            keyframes.append({
                "time": 0.0,
                "mode": "solo",
                "x": focal_track[0]["x"],
                "y": focal_track[0]["y"],
                "zoom": 1.0,
                "speaker": focal_track[0]["speaker"]
            })

        return keyframes

_FACE_CACHE: Dict[str, Any] = {}
_CAMERA_ENGINE = AutoCameraEngine()

def detect_primary_speaker_center(video_path: str, start_sec: float = 0.0, sample_duration: float = 2.0) -> dict:
    """
    Returns robust, tightly focused speaker center coordinates without blank space.
    """
    return _CAMERA_ENGINE.analyze_clip_framing(video_path, start_sec=start_sec, duration=sample_duration)

def generate_camera_keyframes(video_path: str, start_sec: float, duration: float) -> list:
    """
    Generates dynamic multi-speaker camera keyframes across a clip.
    """
    return _CAMERA_ENGINE.generate_clip_camera_keyframes(video_path, start_sec, duration)
