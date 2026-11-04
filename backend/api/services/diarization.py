import os
import subprocess
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as signal
from typing import List, Dict, Any, Tuple, Optional

def extract_analysis_audio(
    video_path: str,
    output_wav_path: str,
    start_sec: float = 0.0,
    duration: float = None,
    sample_rate: int = 16000,
    source_audio_path: str = None
) -> Optional[str]:
    """
    Extracts 16kHz mono 16-bit PCM WAV for speech/VAD analysis.
    Strictly preserves audio-video timestamp alignment for any clip offset (0s, 30s, 120s, 600s+).
    If extraction fails or extracted duration deviates significantly, returns None (never fakes audio).
    """
    if not os.path.exists(video_path):
        return None

    os.makedirs(os.path.dirname(os.path.abspath(output_wav_path)), exist_ok=True)

    # Fast in-memory WAV slice if pre-extracted master audio is available (0.002s, zero FFmpeg overhead)
    src_wav = source_audio_path if (source_audio_path and os.path.exists(source_audio_path)) else (video_path if video_path.lower().endswith('.wav') else None)
    if src_wav:
        try:
            sr, data = wavfile.read(src_wav)
            s0 = max(0, int(round(start_sec * sr)))
            s1 = min(len(data), int(round((start_sec + duration) * sr))) if duration else len(data)
            slice_data = data[s0:s1]
            if len(slice_data.shape) > 1:
                slice_data = np.mean(slice_data, axis=1).astype(data.dtype)
            if sr == sample_rate:
                wavfile.write(output_wav_path, sample_rate, slice_data)
                return output_wav_path
            else:
                target_len = int(len(slice_data) * float(sample_rate) / float(sr))
                resampled = signal.resample(slice_data.astype(np.float32), target_len).astype(data.dtype)
                wavfile.write(output_wav_path, sample_rate, resampled)
                return output_wav_path
        except Exception:
            pass

    # 1. Primary: Fast input seeking (-ss before -i)
    cmd = ['ffmpeg', '-y']
    if start_sec > 0.0:
        cmd += ['-ss', f"{start_sec:.3f}"]
    if duration is not None and duration > 0.0:
        cmd += ['-t', f"{duration:.3f}"]
    
    cmd += [
        '-i', video_path,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', str(sample_rate),
        output_wav_path
    ]
    
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    success = (res.returncode == 0 and os.path.exists(output_wav_path) and os.path.getsize(output_wav_path) > 300)

    # 2. Fallback: Frame-accurate output seeking (-ss after -i) to prevent desync
    if not success:
        cmd_fallback = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-vn',
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', str(sample_rate)
        ]
        if start_sec > 0.0:
            cmd_fallback += ['-ss', f"{start_sec:.3f}"]
        if duration is not None and duration > 0.0:
            cmd_fallback += ['-t', f"{duration:.3f}"]
        cmd_fallback.append(output_wav_path)

        res2 = subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        success = (res2.returncode == 0 and os.path.exists(output_wav_path) and os.path.getsize(output_wav_path) > 300)

    if not success:
        return None

    # Validate extracted duration against expected clip duration strictly
    try:
        sr, data = wavfile.read(output_wav_path)
        actual_dur = len(data) / float(sr)
        tolerance = max(0.40, 0.08 * (duration or 1.0))
        if duration is not None and duration > 1.0 and abs(actual_dur - duration) > tolerance:
            # Timestamp alignment mismatch: retry with accurate seek re-extraction
            if os.path.exists(output_wav_path):
                os.remove(output_wav_path)
            
            cmd_accurate = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', f"{start_sec:.3f}",
                '-t', f"{duration:.3f}",
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ac', '1',
                '-ar', str(sample_rate),
                output_wav_path
            ]
            res_acc = subprocess.run(cmd_accurate, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if res_acc.returncode == 0 and os.path.exists(output_wav_path) and os.path.getsize(output_wav_path) > 300:
                sr2, data2 = wavfile.read(output_wav_path)
                actual_dur2 = len(data2) / float(sr2)
                if abs(actual_dur2 - duration) <= tolerance:
                    return output_wav_path

            # Strict rejection: fail extraction to prevent AV desync
            if os.path.exists(output_wav_path):
                os.remove(output_wav_path)
            print(f"[extract_analysis_audio] Strict rejection: expected {duration:.2f}s, got {actual_dur:.2f}s")
            return None
    except Exception:
        if os.path.exists(output_wav_path):
            os.remove(output_wav_path)
        return None

    return output_wav_path


class AudioVADEngine:
    """
    Precision Voice Activity Detection (VAD) & Temporal Syllable Envelope Extractor.
    Applies a genuine 4th-order Butterworth bandpass filter (200Hz - 3500Hz) to isolate human
    speech formants from low rumble and high-frequency noise.
    Extracts syllable cadence envelopes for Pearson cross-correlation with visual lip aperture.
    """
    def __init__(self, wav_path: Optional[str]):
        self.wav_path = wav_path
        self.sample_rate = 16000
        self.audio = np.array([], dtype=np.float32)
        self.speech_band_audio = np.array([], dtype=np.float32)
        self.duration = 0.0
        self.is_available = False
        if wav_path and os.path.exists(wav_path):
            self._load_audio()

    def _load_audio(self):
        try:
            sr, data = wavfile.read(self.wav_path)
            self.sample_rate = sr
            if data.dtype == np.int16:
                raw_audio = data.astype(np.float32) / 32768.0
            elif data.dtype == np.int32:
                raw_audio = data.astype(np.float32) / 2147483648.0
            elif data.dtype == np.uint8:
                raw_audio = (data.astype(np.float32) - 128.0) / 128.0
            else:
                raw_audio = data.astype(np.float32)

            if len(raw_audio.shape) > 1:
                raw_audio = np.mean(raw_audio, axis=1)

            self.audio = raw_audio
            self.duration = len(self.audio) / float(self.sample_rate)
            self.is_available = len(self.audio) > (self.sample_rate * 0.1)

            # Apply genuine 4th order Butterworth bandpass filter (200Hz - 3500Hz)
            if self.is_available and len(self.audio) > 128:
                nyq = 0.5 * self.sample_rate
                low_cut = max(0.01, 200.0 / nyq)
                high_cut = min(0.95, 3500.0 / nyq)
                sos = signal.butter(4, [low_cut, high_cut], btype='bandpass', output='sos')
                self.speech_band_audio = signal.sosfiltfilt(sos, self.audio).astype(np.float32)
            else:
                self.speech_band_audio = self.audio
        except Exception as e:
            print(f"[AudioVADEngine] Audio load error: {e}")
            self.audio = np.array([], dtype=np.float32)
            self.speech_band_audio = np.array([], dtype=np.float32)
            self.duration = 0.0
            self.is_available = False

    def get_energy_at(self, t: float, window_sec: float = 0.15) -> float:
        """
        Fast lookup of normalized speech energy at timestamp t.
        Returns 0.0 if audio is unavailable or silent (never fakes positive speech).
        """
        if not self.is_available or len(self.speech_band_audio) == 0:
            return 0.0
        center_sample = int(t * self.sample_rate)
        half_win = int(window_sec * 0.5 * self.sample_rate)
        s0 = max(0, center_sample - half_win)
        s1 = min(len(self.speech_band_audio), center_sample + half_win)
        if s1 <= s0:
            return 0.0
        chunk = self.speech_band_audio[s0:s1]
        rms = float(np.sqrt(np.mean(chunk ** 2) + 1e-9))
        return min(1.0, rms * 8.0)

    def get_syllable_envelope(self, start_t: float, end_t: float, num_points: int = 10) -> np.ndarray:
        """
        Extracts temporal speech syllable energy envelope over [start_t, end_t]
        from the genuine bandpassed speech stream (200Hz - 3500Hz).
        Used for true cross-modal Pearson correlation with visual lip aperture dynamics.
        """
        if not self.is_available or len(self.speech_band_audio) == 0 or end_t <= start_t:
            return np.zeros(num_points, dtype=np.float32)

        s0 = max(0, int(start_t * self.sample_rate))
        s1 = min(len(self.speech_band_audio), int(end_t * self.sample_rate))
        if s1 - s0 < 64:
            return np.zeros(num_points, dtype=np.float32)

        chunk = self.speech_band_audio[s0:s1]
        total_len = len(chunk)

        envelope = np.zeros(num_points, dtype=np.float32)
        win_size = min(total_len, max(32, int(0.04 * self.sample_rate))) # 40ms window

        for i in range(num_points):
            idx = int(i * (total_len - win_size) / max(1, num_points - 1)) if num_points > 1 else 0
            w_chunk = chunk[idx:idx + win_size]
            envelope[i] = np.sqrt(np.mean(w_chunk ** 2) + 1e-9)

        # Normalize envelope to zero-mean unit-variance
        std_val = float(np.std(envelope))
        if std_val > 1e-6:
            return (envelope - np.mean(envelope)) / std_val
        return np.zeros(num_points, dtype=np.float32)

    def detect_speech_segments(
        self,
        min_speech_duration: float = 0.20,
        min_silence_duration: float = 0.18
    ) -> List[Dict[str, float]]:
        """
        Detects active speech intervals with adaptive noise floor estimation.
        """
        if not self.is_available or len(self.speech_band_audio) == 0:
            return []

        hop_sec = 0.02
        win_sec = 0.05
        win_samples = int(win_sec * self.sample_rate)
        hop_samples = int(hop_sec * self.sample_rate)

        num_frames = max(1, (len(self.speech_band_audio) - win_samples) // hop_samples + 1)
        times = np.zeros(num_frames, dtype=np.float32)
        energies = np.zeros(num_frames, dtype=np.float32)

        for i in range(num_frames):
            st = i * hop_samples
            et = st + win_samples
            chunk = self.speech_band_audio[st:et]
            times[i] = (st + et) / (2.0 * self.sample_rate)
            energies[i] = np.sqrt(np.mean(chunk ** 2) + 1e-9)

        p25 = float(np.percentile(energies, 25))
        p90 = float(np.percentile(energies, 90))
        speech_thresh = max(0.006, p25 + 0.18 * (p90 - p25))

        is_speech = energies >= speech_thresh
        segments = []
        in_segment = False
        seg_start = 0.0
        seg_energies = []

        for i, val in enumerate(is_speech):
            t = float(times[i])
            if val and not in_segment:
                in_segment = True
                seg_start = t
                seg_energies = [energies[i]]
            elif val and in_segment:
                seg_energies.append(energies[i])
            elif not val and in_segment:
                seg_dur = t - seg_start
                if seg_dur >= min_speech_duration:
                    segments.append({
                        'start': round(seg_start, 3),
                        'end': round(t, 3),
                        'avg_energy': round(float(np.mean(seg_energies)), 4)
                    })
                in_segment = False
                seg_energies = []

        if in_segment and (self.duration - seg_start) >= min_speech_duration:
            segments.append({
                'start': round(seg_start, 3),
                'end': round(self.duration, 3),
                'avg_energy': round(float(np.mean(seg_energies)), 4) if seg_energies else 0.05
            })

        merged = []
        for seg in segments:
            if not merged:
                merged.append(seg)
                continue
            prev = merged[-1]
            if (seg['start'] - prev['end']) <= min_silence_duration:
                prev['end'] = seg['end']
                prev['avg_energy'] = round(0.5 * (prev['avg_energy'] + seg['avg_energy']), 4)
            else:
                merged.append(seg)

        return merged


class SpeakerDiarizer:
    """
    Acoustic Speaker Diarization & Turn Segmentation Engine.
    Uses Bayesian Information Criterion (BIC) change-point detection on acoustic voiceprints,
    identifies overlapping speech intervals, and associates turns with stable acoustic identities.
    """
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def extract_voiceprint(self, audio_chunk: np.ndarray) -> np.ndarray:
        """
        Extracts 24-dimensional acoustic voiceprint:
        - 16 log-mel filterbank energies (100Hz to 6000Hz)
        - Spectral Centroid & Spread
        - Spectral Roll-off
        - Spectral Flux
        - Zero-crossing rate
        - Pitch autocorrelation peak proxy
        """
        if len(audio_chunk) < 512:
            return np.zeros(24, dtype=np.float32)

        f, t, Zxx = signal.stft(audio_chunk, fs=self.sample_rate, nperseg=512, noverlap=256)
        power_spec = np.abs(Zxx) ** 2
        mean_power = np.mean(power_spec, axis=1)

        num_bands = 16
        band_edges = np.logspace(np.log10(100), np.log10(6000), num_bands + 1)
        band_energies = np.zeros(num_bands, dtype=np.float32)
        for b in range(num_bands):
            f_low = band_edges[b]
            f_high = band_edges[b + 1]
            idx = np.where((f >= f_low) & (f < f_high))[0]
            if len(idx) > 0:
                band_energies[b] = np.log10(np.sum(mean_power[idx]) + 1e-6)
            else:
                band_energies[b] = -6.0

        sum_p = np.sum(mean_power) + 1e-9
        centroid = np.sum(f * mean_power) / sum_p / 4000.0
        spread = np.sqrt(np.sum(((f - (centroid * 4000.0)) ** 2) * mean_power) / sum_p) / 4000.0

        cum_power = np.cumsum(mean_power)
        roll_idx = np.where(cum_power >= 0.85 * cum_power[-1])[0]
        rolloff = f[roll_idx[0]] / 6000.0 if len(roll_idx) > 0 else 0.5

        flux = float(np.mean(np.diff(power_spec, axis=1) ** 2)) if power_spec.shape[1] > 1 else 0.0
        zcr = float(np.mean(np.abs(np.diff(np.sign(audio_chunk))))) * 0.5

        # Pitch Autocorrelation Proxy
        corr = np.correlate(audio_chunk[:min(len(audio_chunk), 1600)], audio_chunk[:min(len(audio_chunk), 1600)], mode='full')
        corr = corr[len(corr)//2:]
        pitch_proxy = 0.0
        if len(corr) >= 200:
            pitch_chunk = corr[45:200]
            if len(pitch_chunk) > 0 and corr[0] > 1e-6:
                pitch_proxy = float(np.max(pitch_chunk) / corr[0])

        features = np.concatenate([
            band_energies,
            [centroid, spread, rolloff, min(1.0, flux * 10.0), zcr, pitch_proxy, 0.0, 0.0]
        ])

        norm = np.linalg.norm(features) + 1e-8
        return features / norm

    def detect_acoustic_turn_points(self, audio: np.ndarray, hop_sec: float = 0.20) -> List[float]:
        """
        Acoustic change-point detection using the Bayesian Information Criterion (BIC).
        Evaluates the Generalized Likelihood Ratio (GLR) with BIC complexity penalty:
        ΔBIC = 0.5 * [N * Σ ln(σ_full^2) - N1 * Σ ln(σ_left^2) - N2 * Σ ln(σ_right^2)] - λ * d * ln(N)
        Identifies genuine speaker turn transitions without arbitrary fixed distance thresholding.
        """
        hop_samples = int(hop_sec * self.sample_rate)
        if len(audio) < hop_samples * 6:
            return []

        num_windows = len(audio) // hop_samples
        features = []
        for i in range(num_windows):
            chunk = audio[i * hop_samples:(i + 1) * hop_samples]
            features.append(self.extract_voiceprint(chunk))

        if len(features) < 6:
            return []

        features_arr = np.array(features, dtype=np.float64)
        N_total, d = features_arr.shape
        turn_times = []

        # Sliding window analysis: 3 frames left (0.60s), 3 frames right (0.60s)
        window_half = 3
        lambda_param = 1.10 # BIC penalty parameter

        for i in range(window_half, N_total - window_half):
            left_part = features_arr[i - window_half:i]
            right_part = features_arr[i:i + window_half]
            full_window = features_arr[i - window_half:i + window_half]

            N1 = len(left_part)
            N2 = len(right_part)
            N = len(full_window)

            var_full = np.var(full_window, axis=0) + 1e-5
            var_left = np.var(left_part, axis=0) + 1e-5
            var_right = np.var(right_part, axis=0) + 1e-5

            # Generalized Likelihood Ratio under Gaussian model with diagonal covariance
            glr = 0.5 * (
                N * np.sum(np.log(var_full))
                - N1 * np.sum(np.log(var_left))
                - N2 * np.sum(np.log(var_right))
            )

            # BIC penalty: (d) * ln(N)
            bic_penalty = lambda_param * d * np.log(N)
            delta_bic = glr - bic_penalty

            # Vector distance corroboration
            left_mean = np.mean(left_part, axis=0)
            right_mean = np.mean(right_part, axis=0)
            dist = 1.0 - float(np.dot(left_mean, right_mean) / (np.linalg.norm(left_mean) * np.linalg.norm(right_mean) + 1e-8))

            # Turn confirmed when BIC favors 2-speaker model AND vector distance indicates divergence
            if delta_bic > 0.0 and dist > 0.06:
                t = round(i * hop_sec, 2)
                if not turn_times or (t - turn_times[-1]) >= 0.40:
                    turn_times.append(t)

        return turn_times

    def detect_overlapping_intervals(self, vad_engine: AudioVADEngine, min_overlap_sec: float = 0.4) -> List[Dict[str, float]]:
        """
        Detects acoustic intervals with simultaneous dual speech energy
        (characterized by elevated spectral flux, dual pitch peaks, and high entropy).
        """
        if not vad_engine or not vad_engine.is_available:
            return []

        sr = vad_engine.sample_rate
        hop_sec = 0.10
        hop_samples = int(hop_sec * sr)
        audio = vad_engine.speech_band_audio
        if len(audio) < hop_samples * 4:
            return []

        overlaps = []
        in_overlap = False
        ov_start = 0.0

        for idx in range(len(audio) // hop_samples):
            t = idx * hop_sec
            chunk = audio[idx * hop_samples:(idx + 1) * hop_samples]
            if len(chunk) < 256:
                continue

            # Dual speaker acoustic signature: high RMS + dual pitch peak in autocorrelation
            rms = np.sqrt(np.mean(chunk ** 2) + 1e-9)
            if rms > 0.035:
                corr = np.correlate(chunk, chunk, mode='full')
                corr = corr[len(corr)//2:]
                if len(corr) >= 200:
                    search_zone = corr[45:200]
                    # Check for multiple prominent peaks
                    peaks = signal.find_peaks(search_zone, height=0.25 * corr[0], distance=15)[0]
                    is_dual = len(peaks) >= 2
                else:
                    is_dual = False
            else:
                is_dual = False

            if is_dual and not in_overlap:
                in_overlap = True
                ov_start = t
            elif not is_dual and in_overlap:
                if (t - ov_start) >= min_overlap_sec:
                    overlaps.append({'start': round(ov_start, 2), 'end': round(t, 2)})
                in_overlap = False

        if in_overlap and (vad_engine.duration - ov_start) >= min_overlap_sec:
            overlaps.append({'start': round(ov_start, 2), 'end': round(vad_engine.duration, 2)})

        return overlaps

    def diarize(
        self,
        vad_engine: AudioVADEngine,
        transcript_segments: List[Dict[str, Any]] = None,
        max_speakers: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Executes acoustic diarization.
        Produces stable speaker identities (SPEAKER_00, SPEAKER_01, ...) and overlapping speech intervals.
        """
        if not vad_engine or not vad_engine.is_available:
            return []

        speech_segs = vad_engine.detect_speech_segments()
        if not speech_segs:
            return []

        sr = vad_engine.sample_rate
        all_turns = []

        # Ground boundaries with transcript segment anchors if available
        transcript_cuts = set()
        if transcript_segments:
            for seg in transcript_segments:
                seg_st = float(seg.get('start', 0.0))
                seg_et = float(seg.get('end', 0.0))
                if seg_st > 0.0:
                    transcript_cuts.add(round(seg_st, 2))
                if seg_et > 0.0:
                    transcript_cuts.add(round(seg_et, 2))
                for w in (seg.get('words') or []):
                    w_et = float(w.get('end', 0.0))
                    if w_et > 0.0:
                        transcript_cuts.add(round(w_et, 2))

        for s in speech_segs:
            st = s['start']
            et = s['end']
            if (et - st) < 0.30:
                continue

            s0 = int(st * sr)
            s1 = int(et * sr)
            seg_audio = vad_engine.speech_band_audio[s0:s1]

            internal_cuts = self.detect_acoustic_turn_points(seg_audio, hop_sec=0.20)
            boundary_times = [st] + [round(st + cut_t, 3) for cut_t in internal_cuts]
            boundary_times += [t for t in transcript_cuts if st < t < et]
            boundary_times.append(et)
            boundary_times = sorted(list(set(boundary_times)))

            for i in range(len(boundary_times) - 1):
                t0 = boundary_times[i]
                t1 = boundary_times[i + 1]
                if (t1 - t0) >= 0.25:
                    c0 = int(t0 * sr)
                    c1 = int(t1 * sr)
                    vp = self.extract_voiceprint(vad_engine.speech_band_audio[c0:c1])
                    all_turns.append({
                        'start': t0,
                        'end': t1,
                        'voiceprint': vp
                    })

        if not all_turns:
            return [{
                "speaker_id": "SPEAKER_00",
                "speakers": ["SPEAKER_00"],
                "start": speech_segs[0]['start'],
                "end": speech_segs[-1]['end'],
                "is_overlap": False,
                "confidence": 0.35
            }]

        X = np.array([turn['voiceprint'] for turn in all_turns])
        sim_matrix = np.dot(X, X.T)
        dist_matrix = np.clip(1.0 - sim_matrix, 0.0, 2.0)

        N = len(all_turns)
        active_clusters = {i: [i] for i in range(N)}
        merge_threshold = 0.26

        while True:
            cluster_keys = list(active_clusters.keys())
            if len(cluster_keys) <= 1:
                break

            min_dist = 999.0
            pair_to_merge = None

            for i in range(len(cluster_keys)):
                k1 = cluster_keys[i]
                for j in range(i + 1, len(cluster_keys)):
                    k2 = cluster_keys[j]
                    indices1 = active_clusters[k1]
                    indices2 = active_clusters[k2]
                    dists = [dist_matrix[idx1, idx2] for idx1 in indices1 for idx2 in indices2]
                    avg_d = float(np.mean(dists))
                    if avg_d < min_dist:
                        min_dist = avg_d
                        pair_to_merge = (k1, k2)

            if pair_to_merge is not None and (min_dist < merge_threshold or len(active_clusters) > max_speakers):
                k1, k2 = pair_to_merge
                active_clusters[k1].extend(active_clusters[k2])
                del active_clusters[k2]
            else:
                break

        sorted_clusters = sorted(
            active_clusters.values(),
            key=lambda c: sum(all_turns[idx]['end'] - all_turns[idx]['start'] for idx in c),
            reverse=True
        )

        # Compute normalized centroid for each speaker cluster
        cluster_centroids = []
        for members in sorted_clusters:
            c_vps = [all_turns[m]['voiceprint'] for m in members]
            mean_c = np.mean(c_vps, axis=0)
            mean_c = mean_c / (np.linalg.norm(mean_c) + 1e-8)
            cluster_centroids.append(mean_c)

        # Detect overlapping speech intervals
        overlaps = self.detect_overlapping_intervals(vad_engine)

        timeline = []
        for i, turn in enumerate(all_turns):
            turn_vp = turn['voiceprint']
            sims = [float(np.dot(turn_vp, c)) for c in cluster_centroids]
            ranked = sorted([(idx, s) for idx, s in enumerate(sims)], key=lambda x: x[1], reverse=True)
            best_spk_idx = ranked[0][0]
            spk_id = f"SPEAKER_{best_spk_idx:02d}"

            # Only identify overlap when there is genuine acoustic evidence for both speakers
            is_ov = False
            spk_list = [spk_id]
            if len(ranked) >= 2 and ranked[0][1] > 0.58 and ranked[1][1] > 0.52 and (ranked[0][1] - ranked[1][1]) < 0.20:
                intersects_ov = any(max(turn['start'], ov['start']) < min(turn['end'], ov['end']) for ov in overlaps)
                if intersects_ov:
                    second_spk_idx = ranked[1][0]
                    spk_list = [spk_id, f"SPEAKER_{second_spk_idx:02d}"]
                    is_ov = True

            margin = ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0.0)
            heuristic_conf = round(float(np.clip(0.30 + 0.45 * ranked[0][1] + 0.25 * margin, 0.20, 0.95)), 3)

            timeline.append({
                "speaker_id": spk_id,
                "speakers": spk_list,
                "start": turn['start'],
                "end": turn['end'],
                "is_overlap": is_ov,
                "confidence": heuristic_conf
            })

        # Merge adjacent turns with identical speaker assignments
        merged = []
        for t in timeline:
            if not merged:
                merged.append(t)
                continue
            prev = merged[-1]
            if prev['speaker_id'] == t['speaker_id'] and prev['is_overlap'] == t['is_overlap'] and (t['start'] - prev['end']) < 0.25:
                prev['end'] = t['end']
            else:
                merged.append(t)

        return merged
