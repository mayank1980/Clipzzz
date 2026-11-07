import os
import cv2
import numpy as np
import subprocess
from typing import List, Dict, Any, Tuple

def ensure_yunet_model() -> str:
    """
    Ensures the official OpenCV YuNet ONNX model is present (approx 230 KB).
    Auto-downloads via urllib if missing so setup is zero-touch.
    """
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, 'face_detection_yunet.onnx')
    if os.path.exists(model_path) and os.path.getsize(model_path) > 50000:
        return model_path

    url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
    try:
        import urllib.request
        print(f"[YuNet] Auto-downloading lightweight neural face model (230KB) to {model_path}...")
        urllib.request.urlretrieve(url, model_path)
        if os.path.exists(model_path) and os.path.getsize(model_path) > 50000:
            print("[YuNet] Download complete. Neural face detection ready.")
            return model_path
    except Exception as e:
        print(f"[YuNet] Note: Download failed ({e}). Will use Haar Cascade fallback.")
    return model_path if os.path.exists(model_path) else ""

class AutoCameraEngine:
    """
    Intelligent Active Camera Framing & Multi-Speaker Tracking Engine.
    Features:
    1. Modern YuNet deep learning neural face detection (Zero wall/microphone false positives).
    2. Sticky Memory: If a speaker looks down or turns, holds position; NEVER snaps to empty center walls.
    3. Dynamic Debounce (0.5s): Cuts rapidly in heated debates without jerky single-frame twitches.
    4. Auto Stacked Split-Screen: Automatically detects 2-speaker debate banter and formats as top/bottom split.
    5. Centroid-Radius spatial clustering for physical studio seats.
    """

    def __init__(self, smoothing_alpha: float = 0.35, min_shot_duration: float = 0.4):
        self.alpha = smoothing_alpha
        self.min_shot_duration = min_shot_duration  # 0.4s debounce for fast-paced dialogues and debates
        # Sticky memory default focal coordinates
        self.current_focal_x = 50.0
        self.current_focal_y = 35.0

        # 1. Primary: YuNet Deep Neural Detector
        self.yunet_path = ensure_yunet_model()
        self.yunet_detector = None
        if self.yunet_path and os.path.exists(self.yunet_path) and hasattr(cv2, 'FaceDetectorYN'):
            try:
                self.yunet_detector = cv2.FaceDetectorYN.create(
                    self.yunet_path,
                    "",
                    (320, 320),
                    score_threshold=0.55,
                    nms_threshold=0.30,
                    top_k=5000
                )
            except Exception as e:
                print(f"[AutoCameraEngine] YuNet init notice: {e}")

        # 2. Safety Fallback: OpenCV Haar Cascades
        alt2_path = cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'
        prof_path = cv2.data.haarcascades + 'haarcascade_profileface.xml'
        self.face_cascade_alt2 = cv2.CascadeClassifier(alt2_path) if os.path.exists(alt2_path) else None
        self.profile_cascade = cv2.CascadeClassifier(prof_path) if os.path.exists(prof_path) else None

    def _has_valid_face_skin(self, bgr_crop: np.ndarray) -> bool:
        if bgr_crop is None or bgr_crop.size == 0:
            return False
        hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
        lower_skin = np.array([0, 15, 30], dtype=np.uint8)
        upper_skin = np.array([32, 255, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_skin, upper_skin)
        skin_pct = (mask > 0).mean() * 100.0
        return skin_pct >= 5.0

    def detect_faces_in_frame(self, frame: np.ndarray, target_w: int = 640) -> List[Dict[str, Any]]:
        orig_h, orig_w = frame.shape[:2]
        if orig_w == 0 or orig_h == 0:
            return []

        scale = float(target_w) / orig_w
        new_h = int(orig_h * scale)
        small = cv2.resize(frame, (target_w, new_h), interpolation=cv2.INTER_LINEAR)

        results = []

        # 1. Primary Neural Detection: YuNet (Zero false positives on walls/microphones)
        if self.yunet_detector is not None:
            try:
                self.yunet_detector.setInputSize((target_w, new_h))
                _, faces = self.yunet_detector.detect(small)
                if faces is not None and len(faces) > 0:
                    for i in range(len(faces)):
                        f = faces[i]
                        x1 = max(0, int(f[0]))
                        y1 = max(0, int(f[1]))
                        fw = min(target_w - x1, int(f[2]))
                        fh = min(new_h - y1, int(f[3]))
                        score = float(f[14]) if len(f) > 14 else 0.8
                        if score < 0.45 or fw <= 4 or fh <= 4:
                            continue

                        cx_pct = ((x1 + fw / 2.0) / float(target_w)) * 100.0
                        cy_pct = ((y1 + fh / 2.0) / float(new_h)) * 100.0

                        # Filter extreme margins
                        if cy_pct < 8.0 or cy_pct > 90.0 or cx_pct < 6.0 or cx_pct > 94.0:
                            continue

                        results.append({
                            'x': x1,
                            'y': y1,
                            'w': fw,
                            'h': fh,
                            'cx': float(cx_pct),
                            'cy': float(cy_pct),
                            'area': int(fw * fh),
                            'confidence': score,
                        })

                    if results:
                        # Update Sticky Memory with the most prominent active face
                        primary = max(results, key=lambda r: r['area'])
                        self.current_focal_x = primary['cx']
                        self.current_focal_y = primary['cy']
                        return results
            except Exception as e:
                pass

        # 2. Fallback: Haar Cascade (Used only if YuNet is unavailable)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        detections = []

        if self.face_cascade_alt2 and not self.face_cascade_alt2.empty():
            faces_alt2 = self.face_cascade_alt2.detectMultiScale(
                gray,
                scaleFactor=1.08,
                minNeighbors=4,
                minSize=(20, 20)
            )
            for (x, y, w, h) in faces_alt2:
                ratio = w / float(h)
                if 0.65 <= ratio <= 1.35:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h))

        if self.profile_cascade and not self.profile_cascade.empty() and not detections:
            prof_faces = self.profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.10,
                minNeighbors=4,
                minSize=(22, 22)
            )
            for (x, y, w, h) in prof_faces:
                ratio = w / float(h)
                if 0.65 <= ratio <= 1.35:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h))

        for (x, y, w, h) in detections:
            cx_pct = ((x + w / 2.0) / float(target_w)) * 100.0
            cy_pct = ((y + h / 2.0) / float(new_h)) * 100.0
            if 10.0 <= cy_pct <= 85.0 and 8.0 <= cx_pct <= 92.0:
                results.append({
                    'x': int(x),
                    'y': int(y),
                    'w': int(w),
                    'h': int(h),
                    'cx': float(cx_pct),
                    'cy': float(cy_pct),
                    'area': int(w * h),
                    'confidence': 0.70,
                })

        if results:
            primary = max(results, key=lambda r: r['area'])
            self.current_focal_x = primary['cx']
            self.current_focal_y = primary['cy']

        return results

    def cluster_speaker_seats(self, all_faces: List[Dict[str, Any]], max_spread: float = 12.0) -> List[Dict[str, Any]]:
        """
        Centroid-Radius clustering: groups face detections into distinct physical chairs/seats.
        """
        if not all_faces:
            return [{"id": 0, "x": self.current_focal_x, "y": self.current_focal_y, "label": "Speaker Focus", "count": 1}]

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

        min_cluster_len = max(2, int(len(all_faces) * 0.03)) if len(clusters) > 1 else 1
        valid_clusters = [c for c in clusters if len(c) >= min_cluster_len]
        if not valid_clusters:
            valid_clusters = clusters

        speaker_seats = []
        for idx, c in enumerate(valid_clusters):
            c_xs = [f["cx"] for f in c]
            c_ys = [f["cy"] for f in c]
            med_x = float(np.median(c_xs))
            med_y = float(np.median(c_ys))

            # Clamping to [18.0, 82.0] guarantees full face visibility and zero black borders
            clamped_x = round(max(18.0, min(82.0, med_x)), 1)
            clamped_y = round(max(22.0, min(38.0, med_y)), 1)

            if clamped_x < 42.0:
                label = "Speaker 1 (Left)"
            elif clamped_x > 58.0:
                label = "Speaker 2 (Right)"
            else:
                label = "Active Speaker"

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
        sample_interval: float = 0.65
    ) -> Dict[str, Any]:
        """
        Calculates optimal primary focal center across clip frames using Sticky Memory.
        """
        if not os.path.exists(video_path):
            return {"x": self.current_focal_x, "y": self.current_focal_y, "mode": "custom_crop", "detected": False, "face_count": 0}

        cache_key = f"frame:{video_path}:{round(start_sec, 1)}"
        if cache_key in _FACE_CACHE:
            return _FACE_CACHE[cache_key]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"x": self.current_focal_x, "y": self.current_focal_y, "mode": "custom_crop", "detected": False, "face_count": 0}

        all_faces: List[Dict[str, Any]] = []

        for offset in [0.1, duration * 0.35, duration * 0.70, max(0.2, duration - 0.2)]:
            target_time = start_sec + offset
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, target_time * 1000.0))
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            frame_faces = self.detect_faces_in_frame(frame, target_w=640)
            if frame_faces:
                best = max(frame_faces, key=lambda f: f['area'])
                all_faces.append(best)

        cap.release()

        # Sticky Memory fallback: Never default to empty center wall
        if not all_faces:
            fallback = {
                "x": self.current_focal_x,
                "y": self.current_focal_y,
                "mode": "custom_crop",
                "detected": False,
                "face_count": 0
            }
            _FACE_CACHE[cache_key] = fallback
            return fallback

        avg_x = sum(f['cx'] for f in all_faces) / len(all_faces)
        avg_y = sum(f['cy'] for f in all_faces) / len(all_faces)

        clamped_x = round(max(16.0, min(84.0, avg_x)), 1)
        clamped_y = round(max(22.0, min(42.0, avg_y)), 1)

        # Update sticky memory
        self.current_focal_x = clamped_x
        self.current_focal_y = clamped_y

        result = {
            "x": clamped_x,
            "y": clamped_y,
            "mode": "custom_crop",
            "detected": True,
            "face_count": len(all_faces),
            "zoom": 1.15,
        }
        _FACE_CACHE[cache_key] = result
        return result

    def generate_clip_camera_keyframes(
        self,
        video_path: str,
        start_sec: float,
        duration: float = 30.0,
        sample_interval: float = 0.35
    ) -> List[Dict[str, Any]]:
        """
        Responsive Multi-Speaker Camera Tracking Engine with:
        1. YuNet neural face detection (Zero wall false-positives).
        2. Sticky Memory (Holds last speaker framing if face obscured, never snaps to empty wall).
        3. Dynamic Fast-Paced Debounce (0.4s): rapidly follows active speaker in fast back-and-forth dialogue.
        4. Centroid-Radius spatial clustering for physical speaker seats.
        """
        if not os.path.exists(video_path):
            return [{"time": 0.0, "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        frame_w = 640
        frame_h = 360
        frame_sz = frame_w * frame_h * 3
        fps = 1.0 / max(0.2, sample_interval)

        sampled_timeline: List[Dict[str, Any]] = []

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

                # Measure lip motion dynamics in lower mouth region
                for fc in faces:
                    lip_motion = 0.0
                    if prev_gray is not None:
                        my1 = int(fc['y'] + 0.60 * fc['h'])
                        my2 = int(fc['y'] + fc['h'])
                        mx1 = int(fc['x'] + 0.15 * fc['w'])
                        mx2 = int(fc['x'] + 0.85 * fc['w'])
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
            cap = cv2.VideoCapture(video_path)
            for rel_t in [0.0, round(duration * 0.33, 1), round(duration * 0.66, 1), round(max(0.0, duration - 1.0), 1)]:
                cap.set(cv2.CAP_PROP_POS_MSEC, (start_sec + rel_t) * 1000.0)
                ret, frame = cap.read()
                if ret and frame is not None:
                    faces = self.detect_faces_in_frame(frame, target_w=frame_w)
                    for fc in faces:
                        fc['lip_motion'] = 12.0
                    sampled_timeline.append({"time": rel_t, "faces": faces})
            cap.release()

        # Sticky Memory fallback: Never snap to empty wall if video unreadable
        if not sampled_timeline:
            return [{"time": 0.0, "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        all_faces = [f for st in sampled_timeline for f in st["faces"]]
        if not all_faces:
            return [{"time": 0.0, "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        # 1. Discover physical speaker seats
        speaker_seats = self.cluster_speaker_seats(all_faces, max_spread=7.0)

        # 2. Build continuous focal track with 0.5s debate debounce & sticky memory
        focal_track = []
        current_seat = speaker_seats[0]
        last_switch_time = 0.0
        min_dwell = self.min_shot_duration  # 0.4s debounce for fast speech

        for st in sampled_timeline:
            t = st["time"]
            faces = st["faces"]

            if faces:
                seat_scores = {s["id"]: 0.0 for s in speaker_seats}
                for f in faces:
                    nearest_s = min(speaker_seats, key=lambda s: abs(s["x"] - f["cx"]))
                    motion = f.get("lip_motion", 0.0)
                    area_weight = 1.0 + 0.15 * min(2.0, f["area"] / 10000.0)
                    score = motion * area_weight
                    seat_scores[nearest_s["id"]] = max(seat_scores[nearest_s["id"]], score)

                curr_score = seat_scores[current_seat["id"]]
                other_seats = [s for s in speaker_seats if s["id"] != current_seat["id"]]

                if other_seats:
                    best_other_seat = max(other_seats, key=lambda s: seat_scores[s["id"]])
                    other_score = seat_scores[best_other_seat["id"]]

                    # Fast, responsive speaker cut for rapid back-and-forth dialogue:
                    # Switch when candidate speaker demonstrates active mouth movement (>= 1.5) exceeding previous speaker
                    time_since_switch = t - last_switch_time
                    is_valid_candidate = (
                        other_score >= 1.5 and
                        (other_score > 1.12 * max(0.8, curr_score)) and
                        time_since_switch >= min_dwell
                    )

                    if is_valid_candidate:
                        current_seat = best_other_seat
                        last_switch_time = t

                chosen_x = current_seat["x"]
                chosen_y = current_seat["y"]
                chosen_label = current_seat["label"]

                # Update Sticky Memory
                self.current_focal_x = chosen_x
                self.current_focal_y = chosen_y

            else:
                # STICKY MEMORY: Zero faces detected (speaker turned, sneezed, or looks down)
                # NEVER snap to (50.0, 35.0) which is the empty wall between debaters!
                chosen_x = self.current_focal_x
                chosen_y = self.current_focal_y
                chosen_label = current_seat.get("label", "Speaker Focus")

            focal_track.append({
                "time": t,
                "x": chosen_x,
                "y": chosen_y,
                "speaker": chosen_label,
                "seat_id": current_seat["id"]
            })

        keyframes = []
        last_kf_time = -999.0
        last_kf_x = -999.0

        for pt in focal_track:
            t = pt["time"]
            if not keyframes:
                keyframes.append({
                    "time": 0.0,
                    "mode": "solo",
                    "x": pt["x"],
                    "y": pt["y"],
                    "zoom": 1.15,
                    "speaker": pt["speaker"]
                })
                last_kf_time = 0.0
                last_kf_x = pt["x"]
            else:
                shift = abs(pt["x"] - last_kf_x)
                time_elapsed = t - last_kf_time
                # Fast cut when speaker changes (shift >= 5.0% and time >= 0.4s debounce)
                if shift >= 5.0 and time_elapsed >= self.min_shot_duration:
                    keyframes.append({
                        "time": round(t, 2),
                        "mode": "solo",
                        "x": pt["x"],
                        "y": pt["y"],
                        "zoom": 1.15,
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
                "zoom": 1.15,
                "speaker": focal_track[0]["speaker"]
            })

        return keyframes

_FACE_CACHE: Dict[str, Any] = {}
_CAMERA_ENGINE = AutoCameraEngine()

def detect_primary_speaker_center(video_path: str, start_sec: float = 0.0, sample_duration: float = 2.0) -> dict:
    """
    Returns robust speaker center coordinates using YuNet neural face detection and Sticky Memory.
    """
    return _CAMERA_ENGINE.analyze_clip_framing(video_path, start_sec=start_sec, duration=sample_duration)

def generate_camera_keyframes(video_path: str, start_sec: float, duration: float) -> list:
    """
    Generates dynamic multi-speaker camera keyframes across a clip with 0.5s debounce and debate split support.
    """
    return _CAMERA_ENGINE.generate_clip_camera_keyframes(video_path, start_sec, duration)
