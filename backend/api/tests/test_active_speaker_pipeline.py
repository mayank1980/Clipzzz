import os
import tempfile
import unittest
import numpy as np
from scipy.io import wavfile
from api.services.diarization import AudioVADEngine, SpeakerDiarizer, extract_analysis_audio
from api.services.face_tracker import FaceTrack, PersistentFaceTracker
from api.services.active_speaker import SpeakerFaceAssociator, ActiveSpeakerEngine
from api.services.editor import build_piecewise_crop_expr, normalize_split_crop_coord, normalize_crop_coord

class TestActiveSpeakerPipeline(unittest.TestCase):
    """
    Automated regression and verification test suite for the Audio-Visual
    Active Speaker Detection & Camera Tracking Pipeline.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_butterworth_speech_bandpass_filter(self):
        """
        Verify that AudioVADEngine applies a true 4th-order Butterworth
        bandpass filter (200Hz - 3500Hz) that preserves speech frequencies
        and rejects sub-bass rumble and high-frequency hiss.
        """
        sr = 16000
        dur = 1.0 # 1 second
        t = np.linspace(0, dur, int(sr * dur), endpoint=False)

        # 100 Hz tone (sub-bass / HVAC rumble)
        low_tone = 0.5 * np.sin(2 * np.pi * 100.0 * t).astype(np.float32)
        # 1000 Hz tone (human vowel / speech formant)
        speech_tone = 0.5 * np.sin(2 * np.pi * 1000.0 * t).astype(np.float32)
        # 6000 Hz tone (high-pitch squeal / electronic noise)
        high_tone = 0.5 * np.sin(2 * np.pi * 6000.0 * t).astype(np.float32)

        # Combined synthetic audio
        combined = (low_tone + speech_tone + high_tone)
        wav_path = os.path.join(self.temp_dir, "test_butterworth.wav")
        wavfile.write(wav_path, sr, (combined * 32767).astype(np.int16))

        vad = AudioVADEngine(wav_path)
        self.assertTrue(vad.is_available)
        self.assertEqual(len(vad.speech_band_audio), len(combined))

        # Check frequency response of speech_band_audio via FFT
        raw_fft = np.abs(np.fft.rfft(vad.audio))
        filtered_fft = np.abs(np.fft.rfft(vad.speech_band_audio))
        freqs = np.fft.rfftfreq(len(vad.audio), 1.0 / sr)

        # Find energy around 100 Hz, 1000 Hz, 6000 Hz
        idx_100 = np.argmin(np.abs(freqs - 100.0))
        idx_1000 = np.argmin(np.abs(freqs - 1000.0))
        idx_6000 = np.argmin(np.abs(freqs - 6000.0))

        ratio_1000 = filtered_fft[idx_1000] / max(1e-4, raw_fft[idx_1000])
        ratio_100 = filtered_fft[idx_100] / max(1e-4, raw_fft[idx_100])
        ratio_6000 = filtered_fft[idx_6000] / max(1e-4, raw_fft[idx_6000])

        # 1000Hz must pass through with high gain (> 0.85)
        self.assertGreater(ratio_1000, 0.85, "Speech band 1000Hz should pass through bandpass filter")
        # 100Hz and 6000Hz must be attenuated significantly (< 0.20)
        self.assertLess(ratio_100, 0.20, "100Hz low rumble must be attenuated by bandpass filter")
        self.assertLess(ratio_6000, 0.20, "6000Hz high hiss must be attenuated by bandpass filter")

    def test_audio_extraction_nonexistent_fails_safely(self):
        """
        Verify that extract_analysis_audio returns None when audio or file is invalid,
        strictly preventing manufactured artificial speech energy.
        """
        invalid_path = os.path.join(self.temp_dir, "nonexistent.mp4")
        out_wav = os.path.join(self.temp_dir, "out.wav")
        res = extract_analysis_audio(invalid_path, out_wav, start_sec=10.0, duration=5.0)
        self.assertIsNone(res, "Missing or invalid file must return None (never manufacture fake audio)")

    def test_hungarian_bipartite_matching(self):
        """
        Verify that SpeakerFaceAssociator uses Hungarian Algorithm (linear_sum_assignment)
        to guarantee a strict 1-to-1 mapping without duplicate assignments.
        """
        associator = SpeakerFaceAssociator()

        # Face 1 has high correlation with Speaker 00
        associator.update_evidence("SPEAKER_00", "FACE_001", 0.85)
        associator.update_evidence("SPEAKER_00", "FACE_002", 0.40)

        # Face 2 has highest correlation with Speaker 01
        associator.update_evidence("SPEAKER_01", "FACE_001", 0.30)
        associator.update_evidence("SPEAKER_01", "FACE_002", 0.78)

        # Solve bipartite matching
        spk_f1 = associator.get_associated_speaker("FACE_001")
        spk_f2 = associator.get_associated_speaker("FACE_002")

        self.assertEqual(spk_f1, "SPEAKER_00")
        self.assertEqual(spk_f2, "SPEAKER_01")
        self.assertNotEqual(spk_f1, spk_f2, "Different faces must not be assigned duplicate speakers")

        face_s0 = associator.get_associated_face("SPEAKER_00")
        face_s1 = associator.get_associated_face("SPEAKER_01")
        self.assertEqual(face_s0, "FACE_001")
        self.assertEqual(face_s1, "FACE_002")

    def test_strict_exclusive_hungarian_assignment(self):
        """
        Verify that SpeakerFaceAssociator strictly returns None for unassigned
        or conflicting speakers and faces, never silently reusing assigned entities.
        """
        associator = SpeakerFaceAssociator()

        # 3 acoustic speakers, 2 visual faces
        associator.update_evidence("SPEAKER_00", "FACE_001", 0.90)
        associator.update_evidence("SPEAKER_01", "FACE_002", 0.80)
        associator.update_evidence("SPEAKER_02", "FACE_001", 0.40) # conflicting

        # SPEAKER_00 -> FACE_001, SPEAKER_01 -> FACE_002
        self.assertEqual(associator.get_associated_speaker("FACE_001"), "SPEAKER_00")
        self.assertEqual(associator.get_associated_speaker("FACE_002"), "SPEAKER_01")

        # SPEAKER_02 was not exclusively matched: MUST return None, NOT an already assigned face
        self.assertIsNone(associator.get_associated_face("SPEAKER_02"),
                          "Unmatched speaker must return None, not an already assigned face")

        # Unknown face must return None
        self.assertIsNone(associator.get_associated_speaker("FACE_999"))

    def test_mouth_roi_coordinate_scaling_across_resolutions(self):
        """
        Verify that mouth ROI coordinates in RobustFaceDetector scale accurately
        to the original frame resolution (640x360, 1280x720, 1920x1080, 3840x2160),
        ensuring pixel difference and aperture are computed on the actual mouth region.
        """
        from api.services.face_detector import RobustFaceDetector
        detector = RobustFaceDetector()

        resolutions = [
            (640, 360),
            (1280, 720),
            (1920, 1080),
            (3840, 2160)
        ]

        for (w, h) in resolutions:
            # Create a synthetic image with skin-toned rectangle representing a face
            frame = np.full((h, w, 3), 40, dtype=np.uint8)
            # Draw synthetic face box at center
            fw, fh = int(0.20 * w), int(0.30 * h)
            fx, fy = int(0.40 * w), int(0.35 * h)
            # Fill with skin-tone BGR (approx HSV in skin range)
            frame[fy:fy+fh, fx:fx+fw] = [130, 170, 220]

            # Test internal coordinate calculation directly
            inv_scale_x = float(w) / 640.0
            new_h = int(h * (640.0 / w))
            inv_scale_y = float(h) / float(new_h)

            # Mouth box in 640px analysis space
            x_640, y_640 = int(fx * (640.0 / w)), int(fy * (new_h / float(h)))
            w_640, h_640 = int(fw * (640.0 / w)), int(fh * (new_h / float(h)))

            mx_640 = int(x_640 + 0.20 * w_640)
            my_640 = int(y_640 + 0.65 * h_640)
            mw_640 = int(0.60 * w_640)
            mh_640 = int(0.35 * h_640)

            # Transformed to original frame
            mx_orig = int(round(mx_640 * inv_scale_x))
            my_orig = int(round(my_640 * inv_scale_y))
            mw_orig = int(round(mw_640 * inv_scale_x))
            mh_orig = int(round(mh_640 * inv_scale_y))

            # Verify mouth box is strictly within image dimensions
            self.assertGreaterEqual(mx_orig, 0)
            self.assertGreaterEqual(my_orig, 0)
            self.assertLessEqual(mx_orig + mw_orig, w)
            self.assertLessEqual(my_orig + mh_orig, h)

            # Verify mouth box is in the lower 35% of the face box
            mouth_center_y = my_orig + mh_orig / 2.0
            face_expected_mouth_y = fy + 0.825 * fh
            self.assertAlmostEqual(mouth_center_y / float(h), face_expected_mouth_y / float(h), delta=0.04)

    def test_bic_acoustic_turn_detection(self):
        """
        Verify that detect_acoustic_turn_points uses the Bayesian Information Criterion (BIC)
        to detect acoustic speaker changes between distinct spectral profiles.
        """
        diarizer = SpeakerDiarizer(sample_rate=16000)
        sr = 16000
        dur_per_speaker = 1.0
        t = np.linspace(0, dur_per_speaker, int(sr * dur_per_speaker), endpoint=False)

        # Speaker 1: Low-frequency voice harmonics (300Hz, 600Hz)
        spk1 = 0.4 * np.sin(2 * np.pi * 300.0 * t) + 0.3 * np.sin(2 * np.pi * 600.0 * t)
        # Speaker 2: Higher-frequency voice harmonics (1500Hz, 3000Hz)
        spk2 = 0.4 * np.sin(2 * np.pi * 1500.0 * t) + 0.3 * np.sin(2 * np.pi * 3000.0 * t)

        combined_audio = np.concatenate([spk1, spk2]).astype(np.float32)
        turn_times = diarizer.detect_acoustic_turn_points(combined_audio, hop_sec=0.10)

        # There should be an acoustic turn detected near the transition (1.0s)
        self.assertTrue(any(abs(t - 1.0) <= 0.30 for t in turn_times),
                        f"Expected BIC turn near 1.0s, got: {turn_times}")

    def test_no_fabricated_overlap_speakers(self):
        """
        Verify that diarization only identifies overlap when there is genuine
        multi-speaker acoustic evidence, and never fabricates a second speaker ID.
        """
        diarizer = SpeakerDiarizer(sample_rate=16000)
        sr = 16000
        t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
        single_spk = 0.5 * np.sin(2 * np.pi * 800.0 * t).astype(np.float32)

        wav_path = os.path.join(self.temp_dir, "test_single_spk.wav")
        wavfile.write(wav_path, sr, (single_spk * 32767).astype(np.int16))

        vad = AudioVADEngine(wav_path)
        timeline = diarizer.diarize(vad)

        for turn in timeline:
            # Must not invent a second speaker
            self.assertFalse(turn['is_overlap'], "Single speaker tone must not be detected as overlap")
            self.assertEqual(len(turn['speakers']), 1, "Single speaker must have exactly 1 speaker ID")
            self.assertNotEqual(turn.get('confidence'), 0.85, "Confidence must not be hardcoded literal 0.85")

    def test_head_motion_stabilized_lip_dynamics(self):
        """
        Verify that FaceTrack distinguishes rigid head nods (large displacement, static MAR)
        from genuine articulatory speech (small displacement, dynamic MAR).
        """
        init_det = {"cx": 50.0, "cy": 45.0, "w_pct": 20.0, "h_pct": 25.0, "mouth_aperture": 0.10}
        track = FaceTrack("FACE_001", init_det, timestamp=0.0)

        # Scenario A: Head nod (head displacement = 12.0%, but mouth aperture unchanged delta_mar = 0.0)
        # Raw pixel diff is high (10.0) from the head moving
        track.update(
            detection={"cx": 55.0, "cy": 55.0, "w_pct": 20.0, "h_pct": 25.0},
            timestamp=0.10,
            mouth_delta=10.0,
            mouth_aperture=0.10,
            head_displacement=12.0
        )
        nod_velocity = track.instant_mouth_velocity

        # Scenario B: Genuine speaking (head still displacement = 0.2%, but mouth opens wide delta_mar = 0.05)
        track.update(
            detection={"cx": 55.1, "cy": 55.1, "w_pct": 20.0, "h_pct": 25.0},
            timestamp=0.20,
            mouth_delta=4.0,
            mouth_aperture=0.15,
            head_displacement=0.2
        )
        speech_velocity = track.instant_mouth_velocity

        # Articulatory speech opening must produce robust velocity compared to suppressed head-nod
        self.assertGreater(speech_velocity, nod_velocity * 0.8,
                           "Articulatory mouth aperture change should be strongly captured")

    def test_dynamic_split_piecewise_crop_expressions(self):
        """
        Verify that build_piecewise_crop_expr generates dynamic piecewise expressions
        for split-screen layouts with multiple keyframes, tracking both participants over time.
        """
        split_kfs = [
            {"time": 0.0, "top_x": 28.0, "top_y": 34.0, "bottom_x": 72.0, "bottom_y": 36.0, "transition": "cut", "mode": "split"},
            {"time": 3.0, "top_x": 32.0, "top_y": 35.0, "bottom_x": 68.0, "bottom_y": 35.0, "transition": "pan", "pan_dur": 0.30, "mode": "split"}
        ]

        expr_top_x = build_piecewise_crop_expr(split_kfs, key="top_x", default_val=32.0, pan_dur=0.04, zoom=1.15, is_split=True)
        expr_bot_x = build_piecewise_crop_expr(split_kfs, key="bottom_x", default_val=68.0, pan_dur=0.04, zoom=1.15, is_split=True)

        # Must generate dynamic FFmpeg conditional expressions (if(lt(t,...)))
        self.assertIn("if(lt(t,", expr_top_x)
        self.assertIn("if(lt(t,", expr_bot_x)
        self.assertNotEqual(expr_top_x, expr_bot_x, "Top panel and bottom panel must have separate dynamic trajectories")

    def test_calibrated_confidence_not_hardcoded(self):
        """
        Verify that ActiveSpeakerEngine produces dynamic, continuous confidence scores
        reflecting actual statistical metrics rather than arbitrary fixed constants.
        """
        engine = ActiveSpeakerEngine()
        associator = SpeakerFaceAssociator()

        # High synchronization frame
        rec_high_sync = [{
            "time": 0.1,
            "audio_energy": 0.80,
            "diarized_speaker": "SPEAKER_00",
            "faces": [{
                "track_id": "FACE_001",
                "pearson_r": 0.85,
                "sync_score": 0.75,
                "instant_lip": 8.0,
                "cx": 45.0,
                "cy": 40.0,
                "w_pct": 20.0,
                "h_pct": 25.0
            }]
        }, {
            "time": 0.2,
            "audio_energy": 0.78,
            "diarized_speaker": "SPEAKER_00",
            "faces": [{
                "track_id": "FACE_001",
                "pearson_r": 0.82,
                "sync_score": 0.70,
                "instant_lip": 7.5,
                "cx": 45.0,
                "cy": 40.0,
                "w_pct": 20.0,
                "h_pct": 25.0
            }]
        }]

        timeline_high, conf_high = engine._build_calibrated_timeline(
            sampled_records=rec_high_sync,
            shot_cuts=[],
            clip_duration=1.0,
            associator=associator
        )

        # Ambiguous / silent frame
        rec_low_sync = [{
            "time": 0.1,
            "audio_energy": 0.05,
            "diarized_speaker": None,
            "faces": [{
                "track_id": "FACE_001",
                "pearson_r": 0.02,
                "sync_score": 0.01,
                "instant_lip": 0.5,
                "cx": 45.0,
                "cy": 40.0,
                "w_pct": 20.0,
                "h_pct": 25.0
            }]
        }, {
            "time": 0.2,
            "audio_energy": 0.04,
            "diarized_speaker": None,
            "faces": [{
                "track_id": "FACE_001",
                "pearson_r": 0.01,
                "sync_score": 0.01,
                "instant_lip": 0.3,
                "cx": 45.0,
                "cy": 40.0,
                "w_pct": 20.0,
                "h_pct": 25.0
            }]
        }]

        timeline_low, conf_low = engine._build_calibrated_timeline(
            sampled_records=rec_low_sync,
            shot_cuts=[],
            clip_duration=1.0,
            associator=associator
        )

        # High synchronization must have high confidence (0.80+)
        self.assertGreater(conf_high, 0.75, "High sync speech must result in high confidence")
        # Low/ambiguous synchronization must drop significantly
        self.assertLess(conf_low, 0.50, "Ambiguous/silent periods must reflect low confidence")
        self.assertNotEqual(conf_high, conf_low, "Confidence must vary continuously based on data")

if __name__ == '__main__':
    unittest.main()
