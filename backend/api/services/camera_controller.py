import os
import numpy as np
from typing import List, Dict, Any, Optional

class CameraTrajectoryPlanner:
    """
    Intelligent 9:16 Portrait Camera Trajectory & Framing Planner.
    Converts audio-visual active speaker intervals into cinematic 9:16 camera movements:
    - Clamps X/Y coordinates to completely eliminate black borders.
    - Applies natural podcast headroom & upper-body rule of thirds.
    - Uses instant cuts across camera shot changes (no nauseating wall pans).
    - Uses smooth cubic interpolation for intra-shot speaker transitions.
    - Supports single-speaker focus, two-person debate framing, and stacked split layouts.
    """
    def __init__(self, target_aspect: str = '9:16'):
        self.target_aspect = target_aspect

    def plan_trajectory(
        self,
        speaker_timeline: List[Dict[str, Any]],
        shot_boundaries: List[Dict[str, Any]] = None,
        clip_duration: float = 30.0,
        default_zoom: float = 1.18
    ) -> List[Dict[str, Any]]:
        """
        Generates piecewise keyframes for FFmpeg rendering and interactive preview.
        """
        if not speaker_timeline:
            return [{
                "time": 0.0,
                "x": 50.0,
                "y": 42.0,
                "zoom": 1.0,
                "mode": "solo",
                "speaker": "Speaker Focus",
                "transition": "cut"
            }]

        shot_cut_times = [s['time'] for s in (shot_boundaries or []) if s.get('type') == 'cut']
        keyframes = []

        for idx, turn in enumerate(speaker_timeline):
            t_start = float(turn.get('start', 0.0))
            t_end = float(turn.get('end', clip_duration))
            mode = turn.get('mode', 'single')
            speaker_id = turn.get('speaker_id', f"SPEAKER_{idx:02d}")

            # Determine transition type: cut if at/near shot boundary or first keyframe, else smooth pan
            is_shot_cut = (idx == 0) or any(abs(t_start - sc) < 0.20 for sc in shot_cut_times)
            transition_type = "cut" if is_shot_cut else "pan"

            # Determine zoom and coordinates based on mode
            if mode == 'two_person' and ('top_x' in turn or 'bottom_x' in turn):
                # Two-person debate or stacked split
                top_x = self._clamp_x(turn.get('top_x', 32.0), zoom=1.15)
                top_y = self._clamp_y(turn.get('top_y', 36.0))
                bot_x = self._clamp_x(turn.get('bottom_x', 68.0), zoom=1.15)
                bot_y = self._clamp_y(turn.get('bottom_y', 36.0))
                mid_x = round((top_x + bot_x) / 2.0, 2)

                kf = {
                    "time": round(t_start, 3),
                    "x": mid_x,
                    "y": round((top_y + bot_y) / 2.0, 2),
                    "zoom": 1.05,
                    "mode": "split", # triggers dual speaker framing/split in editor
                    "top_x": top_x,
                    "top_y": top_y,
                    "bottom_x": bot_x,
                    "bottom_y": bot_y,
                    "speaker": "Debate Discussion",
                    "confidence": round(float(turn.get('confidence', 0.80)), 2),
                    "transition": transition_type
                }
            elif mode == 'wide':
                kf = {
                    "time": round(t_start, 3),
                    "x": 50.0,
                    "y": 45.0,
                    "zoom": 1.0,
                    "mode": "solo",
                    "speaker": speaker_id,
                    "confidence": round(float(turn.get('confidence', 0.65)), 2),
                    "transition": transition_type
                }
            else:
                # Single speaker focus
                raw_x = float(turn.get('cx', 50.0))
                raw_y = float(turn.get('cy', 42.0))
                zoom = max(1.10, min(1.35, default_zoom))

                clamped_x = self._clamp_x(raw_x, zoom=zoom)
                clamped_y = self._clamp_y(raw_y)

                kf = {
                    "time": round(t_start, 3),
                    "x": clamped_x,
                    "y": clamped_y,
                    "zoom": zoom,
                    "mode": "solo",
                    "speaker": speaker_id,
                    "confidence": round(float(turn.get('confidence', 0.75)), 2),
                    "transition": transition_type
                }

            keyframes.append(kf)

        # Ensure starting keyframe exists at t=0.0
        if keyframes and keyframes[0]['time'] > 0.05:
            first_clone = dict(keyframes[0])
            first_clone['time'] = 0.0
            first_clone['transition'] = 'cut'
            keyframes.insert(0, first_clone)

        return keyframes

    def generate_trajectory(
        self,
        speaker_timeline: List[Dict[str, Any]],
        clip_start: float = 0.0,
        duration: float = 30.0,
        shot_boundaries: List[Dict[str, Any]] = None,
        default_zoom: float = 1.18
    ) -> Dict[str, Any]:
        """Convenience facade returning {'keyframes': [...]}"""
        kfs = self.plan_trajectory(
            speaker_timeline=speaker_timeline,
            shot_boundaries=shot_boundaries,
            clip_duration=duration,
            default_zoom=default_zoom
        )
        return {"keyframes": kfs}

    def _clamp_x(self, x: float, zoom: float = 1.18) -> float:

        """
        Clamps X-centroid in percent [0, 100] to strictly prevent empty edge margins.
        For 9:16 portrait in 16:9 source, half-crop width fraction is 0.1582 / zoom.
        """
        z = max(1.0, zoom)
        # Margin in percent
        margin_pct = (0.1582 / z) * 100.0 + 1.5 # 1.5% buffer
        min_x = round(margin_pct, 2)
        max_x = round(100.0 - margin_pct, 2)
        return max(min_x, min(max_x, round(x, 2)))

    def _clamp_y(self, y: float) -> float:
        """
        Clamps Y-centroid to keep face in upper third with headroom.
        """
        # Optimal headroom for vertical portrait framing is around 32% - 46%
        return max(25.0, min(58.0, round(y, 2)))

CameraController = CameraTrajectoryPlanner

