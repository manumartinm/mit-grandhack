import json
from pathlib import Path

import librosa
import numpy as np
from scipy.signal import butter, sosfilt

CLASS_LABELS = ["Bronchiectasis", "Bronchiolitis", "COPD", "Healthy", "Pneumonia", "URTI"]

MODEL_PATH = "lung_cnn.tflite"
RECORDINGS_DIR = Path("recordings")

# ── TFLite model state ────────────────────────────────────────────────────────

interpreter = None
input_details = None
output_details = None
input_shape = None

# ── Audio preprocessing constants ─────────────────────────────────────────────

# Lung sounds occupy 100–2000 Hz; filter aggressively outside this range.
BANDPASS_LOW_HZ  = 100
BANDPASS_HIGH_HZ = 2000
FILTER_ORDER     = 4        # 4th-order Butterworth → −80 dB/decade rolloff
PRE_EMPHASIS     = 0.97     # standard respiratory-audio pre-emphasis coeff
SILENCE_THRESH   = 0.02     # RMS below this (−34 dB) is considered silent


class _NumpyEncoder(json.JSONEncoder):
    """Serialise numpy scalar / array types that the default encoder rejects."""

    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, (np.floating, np.float32, np.float64)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def load_model() -> None:
    """Load the TFLite model and populate module-level interpreter globals."""
    global interpreter, input_details, output_details, input_shape

    try:
        try:
            import tflite_runtime.interpreter as tflite
            interpreter = tflite.Interpreter(model_path=MODEL_PATH)
        except ImportError:
            import tensorflow as tf
            interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)

        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        input_shape = input_details[0]["shape"]

        print(f"TFLite model loaded: {MODEL_PATH}")
        print(f"  Input shape:  {input_shape}")
        print(f"  Input dtype:  {input_details[0]['dtype']}")
        print(f"  Output shape: {output_details[0]['shape']}")
        print(f"  Output dtype: {output_details[0]['dtype']}")
    except Exception as e:
        print(f"WARNING: Could not load model: {e}")
        print("Server will return mock predictions until a model is provided.")


def _bandpass_sos(low: float, high: float, sr: float) -> np.ndarray:
    """Return second-order sections for a Butterworth bandpass filter."""
    nyq = sr / 2.0
    return butter(FILTER_ORDER, [low / nyq, high / nyq], btype="band", output="sos")


def preprocess_signal(pcm_uint8: np.ndarray, sr: int = 8000) -> tuple[np.ndarray, dict]:
    """
    Full preprocessing pipeline for raw PCM uint8 lung-sound audio.

    Steps
    -----
    1. Decode uint8 → float32 in [-1, 1]
    2. DC-offset removal  (subtract mean)
    3. 4th-order Butterworth bandpass  100 – 2 000 Hz
    4. Pre-emphasis  y[n] = x[n] − 0.97·x[n−1]
    5. Peak normalisation  → |peak| = 0.9

    Returns the cleaned float32 array and a dict of quality metrics.
    """
    # 1 – decode
    signal = (pcm_uint8.astype(np.float32) - 128.0) / 128.0

    # Measure clipping on the raw signal (before any processing)
    clipping_ratio = float(np.mean((pcm_uint8 <= 2) | (pcm_uint8 >= 253)))
    dc_offset_raw  = float(signal.mean())

    # 2 – DC removal
    signal -= signal.mean()

    # 3 – bandpass filter (only possible if we have enough samples)
    min_samples_for_filter = FILTER_ORDER * 6  # sosfilt requirement
    if len(signal) >= min_samples_for_filter:
        sos    = _bandpass_sos(BANDPASS_LOW_HZ, BANDPASS_HIGH_HZ, sr)
        signal = sosfilt(sos, signal).astype(np.float32)

    # 4 – pre-emphasis
    signal = np.append(signal[0], signal[1:] - PRE_EMPHASIS * signal[:-1]).astype(np.float32)

    # 5 – peak normalisation
    peak = np.max(np.abs(signal))
    if peak > 1e-8:
        signal = signal * (0.9 / peak)

    # ── quality metrics ──────────────────────────────────────────────────────
    rms  = float(np.sqrt(np.mean(signal ** 2)))
    peak = float(peak)  # ensure Python float (was numpy scalar from np.max)

    # Per-frame silence ratio (20 ms frames)
    frame_len   = int(sr * 0.02)
    frames      = [signal[i:i + frame_len] for i in range(0, len(signal) - frame_len, frame_len)]
    silent_mask = [np.sqrt(np.mean(f ** 2)) < SILENCE_THRESH for f in frames]
    silence_ratio = float(np.mean(silent_mask)) if frames else 1.0

    # Noise-floor: median energy of the quietest 10% of frames
    frame_rms   = np.array([np.sqrt(np.mean(f ** 2)) for f in frames]) if frames else np.array([0.0])
    noise_floor = max(float(np.median(np.sort(frame_rms)[: max(1, len(frame_rms) // 10)])), 1e-10)
    snr_db      = float(20 * np.log10(rms / noise_floor + 1e-10))

    duration_sec = len(pcm_uint8) / sr

    # All values explicitly cast to Python-native types so FastAPI's
    # jsonable_encoder can serialise them (numpy scalars are not JSON-safe).
    quality = {
        "rmsDb":            round(float(20 * np.log10(rms + 1e-10)), 2),
        "peakDb":           round(float(20 * np.log10(peak + 1e-10)), 2),
        "dcOffsetRaw":      round(dc_offset_raw, 4),
        "clippingRatio":    round(clipping_ratio, 4),
        "silenceRatio":     round(silence_ratio, 4),
        "snrDb":            round(snr_db, 2),
        "durationSec":      round(float(duration_sec), 3),
        "sampleRate":       int(sr),
        "samplesRaw":       int(len(pcm_uint8)),
        "bandpassHz":       [int(BANDPASS_LOW_HZ), int(BANDPASS_HIGH_HZ)],
        "preEmphasisCoeff": float(PRE_EMPHASIS),
    }

    # Warnings
    warnings: list[str] = []
    if clipping_ratio > 0.05:
        warnings.append(f"High clipping ({clipping_ratio * 100:.1f}%) — reduce device pressure")
    if rms < 0.03:
        warnings.append("Low signal energy — check device placement on skin")
    if silence_ratio > 0.6:
        warnings.append("Mostly silence detected — verify stethoscope contact")
    if duration_sec < 3.0:
        warnings.append(f"Recording too short ({duration_sec:.1f}s) — minimum 3 s recommended")
    if abs(dc_offset_raw) > 0.1:
        warnings.append(f"High DC offset ({dc_offset_raw:+.3f}) — device may need recalibration")

    quality["warnings"] = warnings

    return signal, quality


def extract_features(signal: np.ndarray, sr: int = 8000) -> np.ndarray:
    """
    Compute MFCC feature matrix from a preprocessed float32 signal.

    Output shape matches the TFLite model's expected input:
      (1, n_mfcc, target_frames, 1)  or  (1, target_frames, n_mfcc)
    depending on input_shape.
    """
    if input_shape is not None and len(input_shape) == 4:
        n_mfcc        = int(input_shape[1])
        target_frames = int(input_shape[2])
    elif input_shape is not None and len(input_shape) == 3:
        n_mfcc        = int(input_shape[2])
        target_frames = int(input_shape[1])
    else:
        n_mfcc        = 40
        target_frames = 862

    # MFCC with 25 ms Hamming window, 10 ms hop.
    # n_mels must be < n_fft/2+1; cap at 64 for low sample rates (e.g. 8 kHz)
    # to avoid empty mel channels and librosa warnings.
    n_fft_samples = int(sr * 0.025)
    max_mels      = n_fft_samples // 2        # hard ceiling from FFT bins
    n_mels        = min(64, max_mels)
    mfcc = librosa.feature.mfcc(
        y=signal,
        sr=sr,
        n_mfcc=n_mfcc,
        n_mels=n_mels,
        n_fft=n_fft_samples,
        hop_length=int(sr * 0.010),
        window="hamming",
    )

    # Pad or truncate to exact target width
    if mfcc.shape[1] < target_frames:
        mfcc = np.pad(mfcc, ((0, 0), (0, target_frames - mfcc.shape[1])))
    else:
        mfcc = mfcc[:, :target_frames]

    return mfcc


def run_tflite(mfcc: np.ndarray) -> np.ndarray:
    """Run inference through the TFLite interpreter."""
    if len(input_shape) == 4:
        tensor = mfcc[np.newaxis, ..., np.newaxis].astype(np.float32)
    elif len(input_shape) == 3:
        tensor = mfcc.T[np.newaxis, ...].astype(np.float32)
    else:
        tensor = mfcc[np.newaxis, ...].astype(np.float32)

    interpreter.set_tensor(input_details[0]["index"], tensor)
    interpreter.invoke()
    return interpreter.get_tensor(output_details[0]["index"])[0]
