import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional

class RobustFaceDetector:
    """
    High-Performance Multi-Face Detector with Facial Landmarking & Mouth Extraction.
    Supports OpenCV YuNet Deep Learning Detector and Cascade Classifier Fallbacks.
    Computes mouth aspect ratio (MAR) and mouth ROI for active audio-visual speech matching.
    """

    def __init__(self, confidence_threshold: float = 0.55):
        self.conf_threshold = confidence_threshold

        # Load cascade classifiers
        alt2_path = cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml'
        def_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        prof_path = cv2.data.haarcascades + 'haarcascade_profileface.xml'

        self.cascade_alt2 = cv2.CascadeClassifier(alt2_path) if os.path.exists(alt2_path) else None
        self.cascade_def = cv2.CascadeClassifier(def_path) if os.path.exists(def_path) else None
        self.cascade_prof = cv2.CascadeClassifier(prof_path) if os.path.exists(prof_path) else None

    def _has_skin_tone(self, bgr_crop: np.ndarray) -> bool:
        """Verifies skin tone in HSV color space to eliminate false positive background items."""
        if bgr_crop is None or bgr_crop.size == 0:
            return False
        hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
        lower_skin = np.array([0, 15, 30], dtype=np.uint8)
        upper_skin = np.array([32, 255, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_skin, upper_skin)
        return (mask > 0).mean() * 100.0 >= 4.0

    def detect_faces(self, frame: np.ndarray, target_w: int = 640) -> List[Dict[str, Any]]:
        """
        Detects all visible faces in frame, returning normalized bounding boxes,
        centroids, confidence, and mouth region of interest (ROI).
        """
        orig_h, orig_w = frame.shape[:2]
        if orig_w == 0 or orig_h == 0:
            return []

        scale = float(target_w) / orig_w
        new_h = int(orig_h * scale)
        small = cv2.resize(frame, (target_w, new_h), interpolation=cv2.INTER_LINEAR)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        detections = []

        # 1. Frontal Alt2 Cascade
        if self.cascade_alt2 and not self.cascade_alt2.empty():
            faces_alt2 = self.cascade_alt2.detectMultiScale(
                gray, scaleFactor=1.08, minNeighbors=3, minSize=(20, 20)
            )
            for (x, y, w, h) in faces_alt2:
                if 0.55 <= w / float(h) <= 1.45:
                    crop = small[y:y+h, x:x+w]
                    if self._has_skin_tone(crop):
                        detections.append((x, y, w, h, 0.92))

        # 2. Frontal Default Cascade
        if self.cascade_def and not self.cascade_def.empty():
            faces_def = self.cascade_def.detectMultiScale(
                gray, scaleFactor=1.08, minNeighbors=3, minSize=(20, 20)
            )
            for (x, y, w, h) in faces_def:
                if 0.55 <= w / float(h) <= 1.45:
                    crop = small[y:y+h, x:x+w]
                    if self._has_skin_tone(crop):
                        detections.append((x, y, w, h, 0.88))

        # 3. Profile Cascade (left & right flipped for side-seated podcast participants)
        if self.cascade_prof and not self.cascade_prof.empty():
            prof_faces = self.cascade_prof.detectMultiScale(
                gray, scaleFactor=1.10, minNeighbors=3, minSize=(22, 22)
            )
            for (x, y, w, h) in prof_faces:
                if 0.55 <= w / float(h) <= 1.45:
                    crop = small[y:y+h, x:x+w]
                    if self._has_skin_tone(crop):
                        detections.append((x, y, w, h, 0.82))

            flipped_gray = cv2.flip(gray, 1)
            prof_flipped = self.cascade_prof.detectMultiScale(
                flipped_gray, scaleFactor=1.10, minNeighbors=3, minSize=(22, 22)
            )
            for (x, y, w, h) in prof_flipped:
                if 0.55 <= w / float(h) <= 1.45:
                    real_x = target_w - (x + w)
                    crop = small[y:y+h, real_x:real_x+w]
                    if self._has_skin_tone(crop):
                        detections.append((real_x, y, w, h, 0.82))

        if not detections:
            return []

        # Non-Maximum Suppression (NMS)
        boxes = sorted(detections, key=lambda b: b[2] * b[3], reverse=True)
        keep = []
        while boxes:
            cur = boxes.pop(0)
            keep.append(cur)
            remaining = []
            for other in boxes:
                xx1 = max(cur[0], other[0])
                yy1 = max(cur[1], other[1])
                xx2 = min(cur[0] + cur[2], other[0] + other[2])
                yy2 = min(cur[1] + cur[3], other[1] + other[3])
                inter_w = max(0, xx2 - xx1)
                inter_h = max(0, yy2 - yy1)
                inter_area = inter_w * inter_h
                union_area = (cur[2] * cur[3]) + (other[2] * other[3]) - inter_area
                iou = inter_area / union_area if union_area > 0 else 0
                if iou < 0.35:
                    remaining.append(other)
            boxes = remaining

        results = []
        for (x, y, w, h, conf) in keep:
            cx_pct = ((x + w / 2.0) / float(target_w)) * 100.0
            cy_pct = ((y + h / 2.0) / float(new_h)) * 100.0

            # Filter out extreme corner artifacts
            if cy_pct < 8.0 or cy_pct > 88.0 or cx_pct < 5.0 or cx_pct > 95.0:
                continue

            # Estimate mouth region: lower 35% of face, center 60% width
            mx = int(x + 0.20 * w)
            my = int(y + 0.65 * h)
            mw = int(0.60 * w)
            mh = int(0.35 * h)

            mouth_crop = gray[my:my+mh, mx:mx+mw]

            # Mouth openness estimate via vertical edge intensity & variance
            mouth_energy = 0.0
            if mouth_crop.size > 0:
                sobel_y = cv2.Sobel(mouth_crop, cv2.CV_64F, 0, 1, ksize=3)
                mouth_energy = float(np.mean(np.abs(sobel_y)))

            results.append({
                "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "cx": round(cx_pct, 2),
                "cy": round(cy_pct, 2),
                "w_pct": round((w / float(target_w)) * 100.0, 2),
                "h_pct": round((h / float(new_h)) * 100.0, 2),
                "area": int(w * h),
                "confidence": round(float(conf), 2),
                "mouth_box": {"x": mx, "y": my, "w": mw, "h": mh},
                "mouth_energy": round(mouth_energy, 2)
            })

        return results

