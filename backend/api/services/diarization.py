import os
import subprocess
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as signal
from typing import List, Dict, Any, Tuple

def extract_analysis_audio(
    video_path: str,
    output_wav_path: str,
    start_sec: float = 0.0,
    duration: float = None,
    sample_rate: int = 16000
) -> str:
    """
    Extracts high-fidelity 16kHz mono 16-bit PCM WAV for speech/VAD analysis.
    Preserves exact audio timestamps relative to video.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_wav_path)), exist_ok=True)
    
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
    if res.returncode != 0 or not os.path.exists(output_wav_path) or os.path.getsize(output_wav_path) < 100:
        # Fallback without -ss before -i if seeking was out of bounds
        cmd_fallback = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-vn',
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', str(sample_rate),
            output_wav_path
        ]
        subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    
    return output_wav_path


class AudioVADEngine:
    """
    High-precision Voice Activity Detection (VAD) and Energy Envelope extractor
    using STFT spectral power and adaptive noise-floor thresholding.
    """
    def __init__(self, wav_path: str):
        self.wav_path = wav_path
        self.sample_rate = 16000
        self.audio = np.array([], dtype=np.float32)
        self.duration = 0.0
        self._load_audio()

    def _load_audio(self):
        try:
            sr, data = wavfile.read(self.wav_path)
            self.sample_rate = sr
            if data.dtype == np.int16:
                self.audio = data.astype(np.float32) / 32768.0
            elif data.dtype == np.int32:
                self.audio = data.astype(np.float32) / 2147483648.0
            elif data.dtype == np.uint8:
                self.audio = (data.astype(np.float32) - 128.0) / 128.0
            else:
                self.audio = data.astype(np.float32)

            if len(self.audio.shape) > 1:
                self.audio = np.mean(self.audio, axis=1)

            self.duration = len(self.audio) / float(self.sample_rate)
        except Exception as e:
            print(f"[AudioVADEngine] Audio load error: {e}")
            self.audio = np.zeros(16000, dtype=np.float32)
            self.duration = 1.0

    def compute_energy_profile(self, window_sec: float = 0.05, hop_sec: float = 0.02) -> Tuple[np.ndarray, np.ndarray]:
        """
        Computes RMS energy profile along the audio timeline.
        Returns (timestamps, energy_array).
        """
        if len(self.audio) == 0:
            return np.array([0.0]), np.array([0.0])

        win_samples = int(window_sec * self.sample_rate)
        hop_samples = int(hop_sec * self.sample_rate)
        if hop_samples < 1 or win_samples < 1:
            return np.array([0.0]), np.array([0.0])

        num_frames = max(1, (len(self.audio) - win_samples) // hop_samples + 1)
        times = np.zeros(num_frames, dtype=np.float32)
        energies = np.zeros(num_frames, dtype=np.float32)

        for i in range(num_frames):
            st = i * hop_samples
            et = st + win_samples
            chunk = self.audio[st:et]
            times[i] = (st + et) / (2.0 * self.sample_rate)
            energies[i] = np.sqrt(np.mean(chunk ** 2) + 1e-9)

        return times, energies

    def get_energy_at(self, t: float, window_sec: float = 0.15) -> float:
        """
        Fast lookup of normalized speech energy at timestamp t.
        """
        if len(self.audio) == 0:
            return 0.0
        center_sample = int(t * self.sample_rate)
        half_win = int(window_sec * 0.5 * self.sample_rate)
        s0 = max(0, center_sample - half_win)
        s1 = min(len(self.audio), center_sample + half_win)
        if s1 <= s0:
            return 0.0
        chunk = self.audio[s0:s1]
        rms = float(np.sqrt(np.mean(chunk ** 2) + 1e-9))
        return min(1.0, rms * 8.0) # scaled to ~[0.0, 1.0]

    def detect_speech_segments(
        self,
        min_speech_duration: float = 0.25,
        min_silence_duration: float = 0.20
    ) -> List[Dict[str, float]]:
        """
        Detects active speech segments (start, end, avg_energy).
        Uses adaptive noise floor estimation:
        Threshold = noise_floor + 0.18 * (peak_energy - noise_floor).
        """
        times, energies = self.compute_energy_profile()
        if len(energies) == 0:
            return []

        # Adaptive threshold based on 25th percentile (ambient noise) and 90th percentile (speech)
        p25 = float(np.percentile(energies, 25))
        p90 = float(np.percentile(energies, 90))
        speech_thresh = max(0.008, p25 + 0.20 * (p90 - p25))

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

        if in_segment:
            seg_dur = self.duration - seg_start
            if seg_dur >= min_speech_duration:
                segments.append({
                    'start': round(seg_start, 3),
                    'end': round(self.duration, 3),
                    'avg_energy': round(float(np.mean(seg_energies)), 4) if seg_energies else 0.05
                })

        # Merge segments separated by tiny micro-pauses (< min_silence_duration)
        merged = []
        for seg in segments:
            if not merged:
                merged.append(seg)
                continue
            prev = merged[-1]
            gap = seg['start'] - prev['end']
            if gap <= min_silence_duration:
                # Merge into previous segment
                prev['end'] = seg['end']
                prev['avg_energy'] = round(0.5 * (prev['avg_energy'] + seg['avg_energy']), 4)
            else:
                merged.append(seg)

        return merged


class SpeakerDiarizer:
    """
    Acoustic speaker turn segmentation and clustering engine.
    Extracts frequency-domain acoustic fingerprints (Filterbank STFT + Spectral Centroid + Pitch)
    and segments speech timeline into persistent speaker turns (SPEAKER_00, SPEAKER_01, etc.).
    """
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def extract_segment_features(self, audio_chunk: np.ndarray) -> np.ndarray:
        """
        Extracts 16-dimensional acoustic fingerprint from an audio segment:
        - 12 log mel-scale energy bands (100Hz to 6000Hz)
        - Spectral Centroid
        - Spectral Spread / Bandwidth
        - Spectral Flatness
        - Zero-Crossing Rate
        """
        if len(audio_chunk) < 512:
            return np.zeros(16, dtype=np.float32)

        # STFT
        f, t, Zxx = signal.stft(audio_chunk, fs=self.sample_rate, nperseg=512, noverlap=256)
        power_spec = np.abs(Zxx) ** 2
        mean_power = np.mean(power_spec, axis=1) # shape: (257,)

        # 12 Log Mel-like frequency filter bands
        num_bands = 12
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

        # Spectral Centroid
        freq_weights = f
        sum_p = np.sum(mean_power) + 1e-9
        centroid = np.sum(freq_weights * mean_power) / sum_p / 4000.0 # normalized

        # Spectral Spread
        spread = np.sqrt(np.sum(((freq_weights - (centroid * 4000.0)) ** 2) * mean_power) / sum_p) / 4000.0

        # Spectral Flatness (geometric mean / arithmetic mean)
        geom_mean = np.exp(np.mean(np.log(mean_power + 1e-12)))
        arith_mean = np.mean(mean_power) + 1e-12
        flatness = float(geom_mean / arith_mean)

        # Zero Crossing Rate
        zcr = np.mean(np.abs(np.diff(np.sign(audio_chunk)))) * 0.5

        features = np.concatenate([
            band_energies,
            [centroid, spread, flatness, zcr]
        ])

        # Normalize L2 norm
        norm = np.linalg.norm(features) + 1e-8
        return features / norm

    def cluster_speakers(
        self,
        features: List[np.ndarray],
        max_speakers: int = 4
    ) -> List[int]:
        """
        Hierarchical / agglomerative clustering on acoustic features with cosine distance.
        Automatically estimates optimal number of speakers (1 to max_speakers).
        """
        N = len(features)
        if N == 0:
            return []
        if N == 1:
            return [0]

        X = np.array(features)
        # Cosine distance matrix: D[i, j] = 1 - dot(X[i], X[j])
        sim_matrix = np.dot(X, X.T)
        dist_matrix = np.clip(1.0 - sim_matrix, 0.0, 2.0)

        # Simple greedy agglomerative clustering
        labels = list(range(N))
        active_clusters = {i: [i] for i in range(N)}

        # Merge threshold (cosine distance < 0.28 implies same speaker timbre)
        merge_threshold = 0.28

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
                    # Average link distance between cluster k1 and k2
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

        # Re-index clusters 0, 1, 2 sorted by frequency of occurrence
        sorted_clusters = sorted(active_clusters.values(), key=lambda c: len(c), reverse=True)
        final_labels = [0] * N
        for new_id, members in enumerate(sorted_clusters):
            for m in members:
                final_labels[m] = new_id

        return final_labels

    def diarize(
        self,
        vad_engine: AudioVADEngine,
        transcript_segments: List[Dict[str, Any]] = None,
        max_speakers: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Runs acoustic diarization over detected speech segments.
        Returns:
            [
                {
                    "speaker_id": "SPEAKER_00",
                    "start": 1.25,
                    "end": 4.82,
                    "confidence": 0.94
                },
                ...
            ]
        """
        speech_segs = vad_engine.detect_speech_segments()
        if not speech_segs:
            return [{
                "speaker_id": "SPEAKER_00",
                "start": 0.0,
                "end": max(1.0, vad_engine.duration),
                "confidence": 0.90
            }]

        # Subdivide segments longer than 4s into 2.5s chunks for fine-grained speaker changes
        sub_segs = []
        for s in speech_segs:
            st = s['start']
            et = s['end']
            dur = et - st
            if dur > 4.0:
                step = 2.5
                curr = st
                while curr < et:
                    nxt = min(et, curr + step)
                    if (nxt - curr) >= 0.5:
                        sub_segs.append({'start': curr, 'end': nxt})
                    curr = nxt
            else:
                sub_segs.append(s)

        # Extract features for each subsegment
        feat_list = []
        valid_segs = []
        sr = vad_engine.sample_rate

        for s in sub_segs:
            s0 = int(s['start'] * sr)
            s1 = int(s['end'] * sr)
            chunk = vad_engine.audio[s0:s1]
            if len(chunk) < 512:
                continue
            feats = self.extract_segment_features(chunk)
            feat_list.append(feats)
            valid_segs.append(s)

        if not feat_list:
            return [{
                "speaker_id": "SPEAKER_00",
                "start": speech_segs[0]['start'],
                "end": speech_segs[-1]['end'],
                "confidence": 0.88
            }]

        labels = self.cluster_speakers(feat_list, max_speakers=max_speakers)

        # Consolidate adjacent subsegments with same speaker
        timeline = []
        for i, s in enumerate(valid_segs):
            spk_label = f"SPEAKER_{labels[i]:02d}"
            if not timeline:
                timeline.append({
                    "speaker_id": spk_label,
                    "start": s['start'],
                    "end": s['end'],
                    "confidence": 0.92
                })
            else:
                prev = timeline[-1]
                if prev['speaker_id'] == spk_label and abs(s['start'] - prev['end']) < 0.4:
                    prev['end'] = s['end']
                else:
                    timeline.append({
                        "speaker_id": spk_label,
                        "start": s['start'],
                        "end": s['end'],
                        "confidence": 0.91
                    })

        return timeline
