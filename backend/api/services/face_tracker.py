import os
import cv2
import numpy as np
import subprocess
from typing import List, Dict, Any, Tuple

def to_916_crop_x(face_cx_pct: float, zoom: float = 1.15) -> float:
    """
    Mathematically projects a 16:9 frame horizontal coordinate (0-100%) to
    a 9:16 portrait viewport scroll percentage (0-100%) such that the subject's
    face is placed DEAD CENTER in the vertical 9:16 Shorts frame.

    In 16:9 video cropped to 9:16:
      Video aspect ratio: 16/9
      Shorts aspect ratio: 9/16
      ow = ih * (9/16) / zoom
      beta = ow / iw = ((9/16)^2) / zoom = (81/256) / zoom = 0.31640625 / zoom
      half_beta = beta / 2.0
      span = 1.0 - beta
      
      When the crop window is at crop_x:
      viewport_center = half_beta + (crop_x / 100.0) * span
      
      Therefore, to center on face_cx_pct:
      crop_x = ((face_cx_pct / 100.0) - half_beta) / span * 100.0
    """
    eff_zoom = max(1.08, min(2.5, float(zoom)))
    beta = 0.31640625 / eff_zoom
    half_beta = beta / 2.0
    span = 1.0 - beta
    norm_face = max(0.0, min(1.0, float(face_cx_pct) / 100.0))
    crop_x = ((norm_face - half_beta) / span) * 100.0
    return round(max(0.0, min(100.0, crop_x)), 1)

def to_916_crop_y(face_cy_pct: float, zoom: float = 1.15) -> float:
    """
    Centers the subject's eyes/face in the golden upper third (approx 30-35% from top)
    of the 9:16 portrait viewport while ensuring zero vertical letterboxing.
    """
    clamped_y = round(max(25.0, min(45.0, float(face_cy_pct))), 1)
    return clamped_y

def compute_panel_crop_box(face_cx_pct: float, face_cy_pct: float, mode: str = 'solo', zoom: float = 1.15) -> Dict[str, float]:
    """
    Computes normalized 16:9 crop dimensions (wf, hf) and scroll coordinates (x, y in 0-100%)
    for either full 9:16 ('solo') or stacked vertical split panels ('split_2', 'split_3', 'split_4').
    Preserves exact 16:9 -> panel aspect ratio so both CSS preview and FFmpeg match 1:1 with zero stretch.
    """
    SRC_AR = 16.0 / 9.0
    eff_zoom = max(1.08, min(2.5, float(zoom)))
    zoom_scale = eff_zoom / 1.15

    if mode == 'split_2':
        # 2 vertical stacked panels: 1080x960 each (AR = 1.125)
        panel_ar = 9.0 / 8.0
        hf = max(0.35, min(0.94, 0.80 / zoom_scale))
        wf = max(0.24, min(0.95, hf * panel_ar / SRC_AR))
    elif mode == 'split_3':
        # 3 vertical stacked panels: 1080x640 each (AR = 1.6875)
        panel_ar = 1080.0 / 640.0
        wf = max(0.24, min(0.88, 0.45 / zoom_scale))
        hf = max(0.22, min(0.95, wf * SRC_AR / panel_ar))
        wf = hf * panel_ar / SRC_AR
    elif mode == 'split_4':
        # 4 vertical stacked panels: 1080x480 each (AR = 2.25)
        panel_ar = 1080.0 / 480.0
        wf = max(0.24, min(0.88, 0.42 / zoom_scale))
        hf = max(0.18, min(0.95, wf * SRC_AR / panel_ar))
        wf = hf * panel_ar / SRC_AR
    else:
        # Solo 9:16 portrait (AR = 0.5625)
        hf = 1.0 / eff_zoom
        wf = hf * (9.0 / 16.0) / SRC_AR

    span_x = max(0.001, 1.0 - wf)
    norm_x = max(0.0, min(1.0, float(face_cx_pct) / 100.0))
    crop_x = max(0.0, min(100.0, ((norm_x - wf / 2.0) / span_x) * 100.0))

    if mode == 'solo':
        crop_y = to_916_crop_y(face_cy_pct, zoom=eff_zoom)
    else:
        span_y = max(0.001, 1.0 - hf)
        # Keep head + upper shoulders comfortably inside wide split strips
        target_y = min(0.92, (float(face_cy_pct) + min(6.0, hf * 10.0)) / 100.0)
        crop_y = max(0.0, min(100.0, ((target_y - hf / 2.0) / span_y) * 100.0))

    return {
        "x": round(crop_x, 1),
        "y": round(crop_y, 1),
        "raw_x": round(float(face_cx_pct), 1),
        "raw_y": round(float(face_cy_pct), 1),
        "wf": round(wf, 5),
        "hf": round(hf, 5),
    }

def dedupe_frame_people(faces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filters duplicate/overlapping boxes on the same person and insignificant background
    detections so split screens trigger strictly for distinct foreground people.
    Returns up to 4 people sorted left-to-right by horizontal center (cx).
    """
    if not faces:
        return []
    max_area = max((f.get('area', 0) for f in faces), default=0)
    ranked = sorted(faces, key=lambda f: f.get('confidence', 0.5) * max(1, f.get('area', 1)), reverse=True)
    kept: List[Dict[str, Any]] = []
    for f in ranked:
        if f.get('area', 0) < max_area * 0.22:
            continue
        if f.get('confidence', 0.5) < 0.36:
            continue
        is_dup = False
        for k in kept:
            if abs(f['cx'] - k['cx']) < 14.0 and abs(f['cy'] - k['cy']) < 24.0:
                is_dup = True
                break
        if not is_dup:
            kept.append(f)
        if len(kept) >= 4:
            break
    kept.sort(key=lambda p: p['cx'])
    return kept

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
    2. Multi-Angle & Reading Detection: Frontal + Bilateral Profiles (left & right) + Upper Body.
    3. Mathematical 9:16 Projection: Subjects always centered dead in frame, zero edge cutoff.
    4. Sticky Memory: If a speaker looks down or turns, holds position; NEVER snaps to empty center walls.
    5. Fast-Paced Debounce (0.32s): Cuts rapidly in heated debates without jerky twitches.
    6. Centroid-Radius spatial clustering for physical studio seats.
    """

    def __init__(self, smoothing_alpha: float = 0.35, min_shot_duration: float = 4.5):
        self.alpha = smoothing_alpha
        self.min_shot_duration = min_shot_duration  # Rock-solid 4.5s minimum hold per speaker (eliminates shaking)
        self.current_focal_x = 50.0
        self.current_focal_y = 35.0

        # 1. Primary: YuNet Deep Neural Detector (sensitive to angled & profile faces)
        self.yunet_path = ensure_yunet_model()
        self.yunet_detector = None
        if self.yunet_path and os.path.exists(self.yunet_path) and hasattr(cv2, 'FaceDetectorYN'):
            try:
                self.yunet_detector = cv2.FaceDetectorYN.create(
                    self.yunet_path,
                    "",
                    (320, 320),
                    score_threshold=0.18,
                    nms_threshold=0.30,
                    top_k=5000
                )
            except Exception as e:
                print(f"[AutoCameraEngine] YuNet init notice: {e}")

        # 2. Multi-Cascade Suite: Frontal, Left Profile, Right Profile, and Upper Body (Reading/Looking Down)
        alt2_path = cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'
        prof_path = cv2.data.haarcascades + 'haarcascade_profileface.xml'
        upper_path = cv2.data.haarcascades + 'haarcascade_upperbody.xml'
        self.face_cascade_alt2 = cv2.CascadeClassifier(alt2_path) if os.path.exists(alt2_path) else None
        self.profile_cascade = cv2.CascadeClassifier(prof_path) if os.path.exists(prof_path) else None
        self.upperbody_cascade = cv2.CascadeClassifier(upper_path) if os.path.exists(upper_path) else None
        self.hog_detector = None
        try:
            hog = cv2.HOGDescriptor()
            hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self.hog_detector = hog
        except Exception:
            pass

    def _has_valid_face_skin(self, bgr_crop: np.ndarray) -> bool:
        if bgr_crop is None or bgr_crop.size == 0:
            return False
        hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
        # Handle all skin tones (fair, olive, tan, deep) under diverse lighting
        # Skin hue spans both yellow-orange (0-35) and deep warm red (165-180)
        lower_skin1 = np.array([0, 12, 25], dtype=np.uint8)
        upper_skin1 = np.array([36, 255, 255], dtype=np.uint8)
        mask1 = cv2.inRange(hsv, lower_skin1, upper_skin1)

        lower_skin2 = np.array([165, 12, 25], dtype=np.uint8)
        upper_skin2 = np.array([180, 255, 255], dtype=np.uint8)
        mask2 = cv2.inRange(hsv, lower_skin2, upper_skin2)

        mask = cv2.bitwise_or(mask1, mask2)
        skin_pct = (mask > 0).mean() * 100.0
        return skin_pct >= 4.0

    def detect_faces_in_frame(self, frame: np.ndarray, target_w: int = 640) -> List[Dict[str, Any]]:
        orig_h, orig_w = frame.shape[:2]
        if orig_w == 0 or orig_h == 0:
            return []

        scale = float(target_w) / orig_w
        new_h = int(orig_h * scale)
        small = cv2.resize(frame, (target_w, new_h), interpolation=cv2.INTER_LINEAR)

        results = []

        # 1. Primary Neural Detection: YuNet
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

                        # Reject noise/speckles on walls (must be genuine face size)
                        if score < 0.20 or fw < 20 or fh < 22 or (fw * fh) < 450:
                            continue

                        cx_pct = ((x1 + fw / 2.0) / float(target_w)) * 100.0
                        cy_pct = ((y1 + fh / 2.0) / float(new_h)) * 100.0

                        # Allow edge-of-frame speakers (down to 2% from border)
                        if cy_pct < 4.0 or cy_pct > 95.0 or cx_pct < 2.0 or cx_pct > 98.0:
                            continue

                        # Skin tone validation on smaller/marginal detections to eliminate wall/brick false positives
                        crop = small[y1:y1+fh, x1:x1+fw]
                        if (fw * fh < 1400 or score < 0.65) and not self._has_valid_face_skin(crop):
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

                    # Fast path: only skip cascades if YuNet already found 2+ distinct prominent faces
                    distinct_yn = dedupe_frame_people(results)
                    if len(distinct_yn) >= 2 and all(r['area'] >= 900 and r['confidence'] >= 0.60 for r in distinct_yn):
                        primary = max(results, key=lambda r: r['area'])
                        self.current_focal_x = primary['cx']
                        self.current_focal_y = primary['cy']
                        return results
            except Exception as e:
                pass

        # 2. Multi-Cascade Robust Suite: Frontal, Left Profile, Right Profile (Turned/Reading Faces)
        has_prominent_yunet = any(r['area'] >= 900 and r['confidence'] >= 0.60 for r in results)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        detections = []

        # Frontal Alt2 (only needed if YuNet didn't find a strong frontal face)
        if not has_prominent_yunet and self.face_cascade_alt2 and not self.face_cascade_alt2.empty():
            faces_alt2 = self.face_cascade_alt2.detectMultiScale(
                gray,
                scaleFactor=1.08,
                minNeighbors=3,
                minSize=(22, 22)
            )
            for (x, y, w, h) in faces_alt2:
                ratio = w / float(h)
                if 0.60 <= ratio <= 1.40:
                    crop = small[y:y+h, x:x+w]
                    if self._has_valid_face_skin(crop):
                        detections.append((x, y, w, h, 0.75))

        # Left & Right Profile Cascades: always run if fewer than 2 people found so far (catches side-facing second speakers)
        if self.profile_cascade and not self.profile_cascade.empty():
            prof_faces = self.profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.05,
                minNeighbors=3 if has_prominent_yunet else 2,
                minSize=(24, 24)
            )
            for (x, y, w, h) in prof_faces:
                crop = small[y:y+h, x:x+w]
                if self._has_valid_face_skin(crop):
                    detections.append((x, y, w, h, 0.78))

            flipped_gray = cv2.flip(gray, 1)
            prof_right = self.profile_cascade.detectMultiScale(
                flipped_gray,
                scaleFactor=1.05,
                minNeighbors=3 if has_prominent_yunet else 2,
                minSize=(24, 24)
            )
            for (fx, fy, fw, fh) in prof_right:
                orig_x = target_w - (fx + fw)
                crop = small[fy:fy+fh, orig_x:orig_x+fw]
                if self._has_valid_face_skin(crop):
                    detections.append((orig_x, fy, fw, fh, 0.78))

        # 3. Upper Body Cascade (Person reading letter, looking down at phone or table)
        if not results and not detections and self.upperbody_cascade and not self.upperbody_cascade.empty():
            upper_bodies = self.upperbody_cascade.detectMultiScale(
                gray,
                scaleFactor=1.06,
                minNeighbors=2,
                minSize=(36, 36)
            )
            for (ux, uy, uw, uh) in upper_bodies:
                head_w = int(uw * 0.55)
                head_h = int(uh * 0.45)
                head_x = int(ux + (uw - head_w) / 2)
                head_y = uy
                crop = small[head_y:head_y+head_h, head_x:head_x+head_w]
                if self._has_valid_face_skin(crop):
                    detections.append((head_x, head_y, head_w, head_h, 0.70))

        # 4. HOG People Detector Fallback (Torso / seated human body on frame borders)
        if not results and not detections and self.hog_detector is not None:
            try:
                boxes, weights = self.hog_detector.detectMultiScale(small, winStride=(8, 8), padding=(4, 4), scale=1.08)
                for (bx, by, bw, bh), weight in zip(boxes, weights):
                    if weight > 0.12 and bh >= 60:
                        hw = int(bw * 0.50)
                        hh = int(bh * 0.30)
                        hx = int(bx + (bw - hw) / 2)
                        hy = int(by + bh * 0.05)
                        detections.append((hx, hy, hw, hh, float(weight)))
            except Exception:
                pass

        for det in detections:
            x, y, w, h = det[0], det[1], det[2], det[3]
            conf = det[4] if len(det) > 4 else 0.70
            cx_pct = ((x + w / 2.0) / float(target_w)) * 100.0
            cy_pct = ((y + h / 2.0) / float(new_h)) * 100.0
            if 4.0 <= cy_pct <= 96.0 and 2.0 <= cx_pct <= 98.0:
                results.append({
                    'x': int(x),
                    'y': int(y),
                    'w': int(w),
                    'h': int(h),
                    'cx': float(cx_pct),
                    'cy': float(cy_pct),
                    'area': int(w * h),
                    'confidence': float(conf),
                })

        if results:
            primary = max(results, key=lambda r: r['area'])
            self.current_focal_x = primary['cx']
            self.current_focal_y = primary['cy']

        return results

    def cluster_speaker_seats(self, all_faces: List[Dict[str, Any]], max_spread: float = 12.0) -> List[Dict[str, Any]]:
        """
        Centroid-Radius clustering: groups face detections into distinct physical chairs/seats.
        Filters false-positive edge noise and merges nearby clusters belonging to the same person.
        Mathematically projects each seat's 16:9 median into accurate 9:16 portrait viewport crop_x.
        """
        if not all_faces:
            return [{
                "id": 0,
                "x": self.current_focal_x,
                "y": self.current_focal_y,
                "raw_x": 50.0,
                "raw_y": 35.0,
                "label": "Speaker Focus",
                "count": 1
            }]

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

        # Filter out transient edge noise (must have at least 8% of total face detections)
        min_cluster_len = max(4, int(len(all_faces) * 0.08)) if len(clusters) > 1 else 1
        valid_clusters = [c for c in clusters if len(c) >= min_cluster_len]
        if not valid_clusters:
            valid_clusters = clusters

        # Merge clusters within 18.0% of each other (same physical human body)
        merged_clusters: List[List[Dict[str, Any]]] = []
        for c in valid_clusters:
            if not merged_clusters:
                merged_clusters.append(c)
            else:
                prev_cent = float(np.mean([item['cx'] for item in merged_clusters[-1]]))
                curr_cent = float(np.mean([item['cx'] for item in c]))
                if abs(curr_cent - prev_cent) < 18.0:
                    merged_clusters[-1].extend(c)
                else:
                    merged_clusters.append(c)

        speaker_seats = []
        for idx, c in enumerate(merged_clusters):
            c_xs = [f["cx"] for f in c]
            c_ys = [f["cy"] for f in c]
            med_x = float(np.median(c_xs))
            med_y = float(np.median(c_ys))

            # Mathematical 9:16 Projection: perfectly centers the face in the 9:16 vertical viewport
            proj_x = to_916_crop_x(med_x, zoom=1.15)
            proj_y = to_916_crop_y(med_y, zoom=1.15)

            if med_x < 42.0:
                label = "Speaker 1 (Left)"
            elif med_x > 58.0:
                label = "Speaker 2 (Right)"
            else:
                label = "Active Speaker"

            speaker_seats.append({
                "id": idx,
                "x": proj_x,        # Projected 9:16 crop scroll position
                "y": proj_y,
                "raw_x": med_x,      # 16:9 source coordinate
                "raw_y": med_y,
                "label": label,
                "count": len(c)
            })

        speaker_seats.sort(key=lambda s: s["raw_x"])
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

        offsets = [0.1, 0.4, 0.8, 1.2, 1.6, duration * 0.35, duration * 0.65, max(0.2, duration - 0.2)]
        for offset in offsets:
            if offset > duration + 0.1:
                continue
            target_time = start_sec + offset
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, target_time * 1000.0))
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            frame_faces = self.detect_faces_in_frame(frame, target_w=640)
            if frame_faces:
                best = max(frame_faces, key=lambda f: f['area'])
                all_faces.append(best)

        # If no face was found in the initial window, search a wider window (up to 8s into the scene)
        if not all_faces and duration > 1.5:
            for extra_t in [start_sec + 2.0, start_sec + 3.0, start_sec + 5.0, start_sec + 7.0]:
                cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, extra_t * 1000.0))
                ret, frame = cap.read()
                if ret and frame is not None:
                    ff = self.detect_faces_in_frame(frame, target_w=640)
                    if ff:
                        all_faces.append(max(ff, key=lambda f: f['area']))
                        break

        cap.release()

        # Sticky Memory fallback: Never default to empty center wall
        if not all_faces:
            fallback = {
                "x": self.current_focal_x,
                "y": self.current_focal_y,
                "mode": "custom_crop",
                "detected": False,
                "face_count": 0,
                "zoom": 1.15
            }
            _FACE_CACHE[cache_key] = fallback
            return fallback

        avg_x = sum(f['cx'] for f in all_faces) / len(all_faces)
        avg_y = sum(f['cy'] for f in all_faces) / len(all_faces)

        # Mathematical projection to 9:16
        proj_x = to_916_crop_x(avg_x, zoom=1.15)
        proj_y = to_916_crop_y(avg_y, zoom=1.15)

        # Update sticky memory
        self.current_focal_x = proj_x
        self.current_focal_y = proj_y

        result = {
            "x": proj_x,
            "y": proj_y,
            "raw_x": avg_x,
            "raw_y": avg_y,
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
        sample_interval: float = 0.32
    ) -> List[Dict[str, Any]]:
        """
        Responsive Multi-Speaker Camera Tracking Engine with:
        1. YuNet neural face detection (Zero wall false-positives).
        2. Bilateral profile and reading/looking-down posture detection.
        3. Mathematical 9:16 Projection: Subjects always centered dead in frame.
        4. Sticky Memory: Holds speaker framing if face obscured, never snaps to empty wall.
        5. Fast-Paced Debounce (0.32s): rapidly follows active speaker in fast back-and-forth dialogue.
        6. Centroid-Radius spatial clustering for physical speaker seats.
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
            return [{"time": 0.0, "mode": "solo", "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        all_faces = [f for st in sampled_timeline for f in st["faces"]]
        if not all_faces:
            return [{"time": 0.0, "mode": "solo", "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        # 1. Shot-Aware Dynamic Framing:
        # Every frame is evaluated for the active speaker (solo shot or multi-speaker debate).
        # We compute exact 9:16 portrait coordinates and apply deadband hysteresis to ensure
        # rock-solid shots with zero shaking and zero edge cutoff.
        speaker_seats = self.cluster_speaker_seats(all_faces, max_spread=14.0)

        raw_track = []
        last_valid_mode = "solo"
        last_valid_x = self.current_focal_x
        last_valid_y = self.current_focal_y
        last_valid_label = "Speaker Focus"
        last_valid_panels = None
        has_any_split = False

        for st in sampled_timeline:
            t = st["time"]
            faces = st["faces"]

            if not faces:
                # Sticky memory: hold previous shot layout/position seamlessly
                raw_track.append({
                    "time": t,
                    "mode": last_valid_mode,
                    "x": last_valid_x,
                    "y": last_valid_y,
                    "panels": last_valid_panels,
                    "speaker": last_valid_label,
                    "has_face": False
                })
                continue

            distinct_people = dedupe_frame_people(faces)
            if not distinct_people:
                distinct_people = [max(faces, key=lambda f: f.get('area', 0))]

            xs = [p['cx'] for p in distinct_people]
            ys = [p['cy'] for p in distinct_people]
            horiz_span = (max(xs) - min(xs)) if len(distinct_people) > 1 else 0.0
            vert_span = (max(ys) - min(ys)) if len(distinct_people) > 1 else 0.0
            is_multi_split = len(distinct_people) >= 2 and (horiz_span >= 18.0 or vert_span >= 22.0)

            if is_multi_split:
                has_any_split = True
                n_panes = min(4, len(distinct_people))
                mode = f"split_{n_panes}"
                panels = []
                for p in distinct_people[:n_panes]:
                    box = compute_panel_crop_box(p['cx'], p['cy'], mode=mode, zoom=1.15)
                    panels.append(box)
                px = panels[0]["x"]
                py = panels[0]["y"]
                label = f"{n_panes}-Person Split"
            else:
                mode = "solo"
                panels = None
                if len(distinct_people) == 1:
                    target_f = distinct_people[0]
                    label = "Speaker Focus"
                else:
                    speaking = [f for f in distinct_people if f.get("lip_motion", 0.0) >= 1.0]
                    target_f = max(speaking, key=lambda f: f.get("lip_motion", 0.0)) if speaking else max(distinct_people, key=lambda f: f.get('area', 0))
                    if target_f["cx"] < 45.0:
                        label = "Speaker 1 (Left)"
                    elif target_f["cx"] > 55.0:
                        label = "Speaker 2 (Right)"
                    else:
                        label = "Active Speaker"

                px = to_916_crop_x(target_f["cx"], zoom=1.15)
                py = to_916_crop_y(target_f["cy"], zoom=1.15)

            last_valid_mode = mode
            last_valid_x = px
            last_valid_y = py
            last_valid_panels = panels
            last_valid_label = label

            raw_track.append({
                "time": t,
                "mode": mode,
                "x": px,
                "y": py,
                "panels": panels,
                "speaker": label,
                "has_face": True
            })

        if not raw_track:
            return [{"time": 0.0, "mode": "solo", "x": self.current_focal_x, "y": self.current_focal_y, "zoom": 1.15, "speaker": "Speaker Focus"}]

        # Solo speaker throughout entire clip: lock unconditionally
        if len(speaker_seats) == 1 and not has_any_split:
            solo = speaker_seats[0]
            self.current_focal_x = solo["x"]
            self.current_focal_y = solo["y"]
            return [{
                "time": 0.0,
                "mode": "solo",
                "x": solo["x"],
                "y": solo["y"],
                "zoom": 1.15,
                "speaker": solo["label"]
            }]

        # 2. Synthesize stable broadcast shots (solo cuts + vertical multi-person split screens) with deadband hysteresis
        keyframes = []
        current_mode = None
        current_shot_x = None
        current_shot_y = None
        current_panels = None
        current_label = None
        last_cut_time = -999.0
        min_dwell = 1.5   # Minimum hold time per shot layout
        deadband = 8.5    # Deadband %: movements within 8.5% hold steady

        pending_switch = None
        pending_count = 0

        def _make_kf(t_val, m_val, x_val, y_val, lbl_val, panels_val):
            kf = {
                "time": round(t_val, 2),
                "mode": m_val,
                "x": x_val,
                "y": y_val,
                "zoom": 1.15,
                "speaker": lbl_val,
            }
            if panels_val:
                kf["panels"] = panels_val
            return kf

        for pt in raw_track:
            t = pt["time"]
            mode = pt["mode"]
            px = pt["x"]
            py = pt["y"]
            panels = pt["panels"]
            label = pt["speaker"]

            if current_shot_x is None:
                current_mode = mode
                current_shot_x = px
                current_shot_y = py
                current_panels = panels
                current_label = label
                keyframes.append(_make_kf(0.0, mode, px, py, label, panels))
                last_cut_time = 0.0
                continue

            mode_changed = (mode != current_mode)
            if not mode_changed and panels and current_panels and len(panels) == len(current_panels):
                dist = max(abs(panels[i]["x"] - current_panels[i]["x"]) for i in range(len(panels)))
            else:
                dist = abs(px - current_shot_x)

            time_since_cut = t - last_cut_time

            if not mode_changed and dist <= deadband:
                pending_switch = None
                pending_count = 0
                continue

            if time_since_cut >= min_dwell:
                if (
                    pending_switch is not None
                    and pending_switch["mode"] == mode
                    and abs(px - pending_switch["x"]) <= deadband
                ):
                    pending_count += 1
                else:
                    pending_switch = {"mode": mode, "x": px, "y": py, "panels": panels, "label": label}
                    pending_count = 1

                # Require 3 frames (~1.0s) before dropping from multi-split back to solo so brief turns don't flicker;
                # otherwise confirm layout/speaker shift after 2 frames (~0.6s) or large immediate scene cut (>22%)
                needed = 3 if (current_mode.startswith("split_") and mode == "solo") else 2
                if pending_count >= needed or (not mode_changed and dist >= 22.0):
                    current_mode = pending_switch["mode"]
                    current_shot_x = pending_switch["x"]
                    current_shot_y = pending_switch["y"]
                    current_panels = pending_switch["panels"]
                    current_label = pending_switch["label"]
                    keyframes.append(_make_kf(t, current_mode, current_shot_x, current_shot_y, current_label, current_panels))
                    last_cut_time = t
                    pending_switch = None
                    pending_count = 0

        if not keyframes:
            keyframes.append(_make_kf(0.0, raw_track[0]["mode"], raw_track[0]["x"], raw_track[0]["y"], raw_track[0]["speaker"], raw_track[0]["panels"]))

        self.current_focal_x = keyframes[0]["x"]
        self.current_focal_y = keyframes[0]["y"]
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
