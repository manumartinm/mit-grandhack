import numpy as np
import librosa
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import auth as auth_router
from routers import patients as patients_router

app = FastAPI(title="PneumoScan Inference API")

app.include_router(auth_router.router)
app.include_router(patients_router.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CLASS_LABELS = ["Bronchiectasis", "Bronchiolitis", "COPD", "Healthy", "Pneumonia", "URTI"]

MODEL_PATH = "lung_cnn.tflite"

interpreter = None
input_details = None
output_details = None
input_shape = None


@app.on_event("startup")
def load_model():
    global interpreter, input_details, output_details, input_shape

    import models  # noqa: F401 – ensure ORM models are registered
    Base.metadata.create_all(bind=engine)

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


def extract_mfcc(audio_bytes: bytes, sr: int = 8000) -> np.ndarray:
    """Convert raw PCM uint8 audio to MFCC features matching the CNN input."""
    pcm = np.frombuffer(audio_bytes, dtype=np.uint8).astype(np.float32)
    pcm = (pcm - 128.0) / 128.0

    # Model expects (1, 40, 862, 1) → 40 MFCCs, 862 time frames
    if input_shape is not None and len(input_shape) == 4:
        n_mfcc = int(input_shape[1])
        target_frames = int(input_shape[2])
    elif input_shape is not None and len(input_shape) == 3:
        n_mfcc = int(input_shape[2])
        target_frames = int(input_shape[1])
    else:
        n_mfcc = 40
        target_frames = 862

    mfcc = librosa.feature.mfcc(y=pcm, sr=sr, n_mfcc=n_mfcc)

    if mfcc.shape[1] < target_frames:
        mfcc = np.pad(mfcc, ((0, 0), (0, target_frames - mfcc.shape[1])))
    else:
        mfcc = mfcc[:, :target_frames]

    return mfcc


def run_tflite(mfcc: np.ndarray) -> np.ndarray:
    """Run inference through the TFLite interpreter."""
    # Reshape MFCC to match model's expected input shape
    if len(input_shape) == 4:
        # (1, n_mfcc, frames, 1)
        tensor = mfcc[np.newaxis, ..., np.newaxis].astype(np.float32)
    elif len(input_shape) == 3:
        # (1, frames, n_mfcc)
        tensor = mfcc.T[np.newaxis, ...].astype(np.float32)
    else:
        tensor = mfcc[np.newaxis, ...].astype(np.float32)

    interpreter.set_tensor(input_details[0]["index"], tensor)
    interpreter.invoke()
    return interpreter.get_tensor(output_details[0]["index"])[0]


@app.post("/predict")
async def predict(audio: UploadFile = File(...)):
    """
    Accepts raw PCM audio (uint8, mono, 8kHz) and returns class probabilities.
    The app sends the audio buffer directly as a binary file upload.
    """
    raw = await audio.read()
    mfcc = extract_mfcc(raw, sr=8000)

    if interpreter is not None:
        preds = run_tflite(mfcc)
        probs = {label: round(float(p), 4) for label, p in zip(CLASS_LABELS, preds)}
    else:
        raw_vals = np.random.dirichlet(np.ones(len(CLASS_LABELS)))
        probs = {label: round(float(p), 4) for label, p in zip(CLASS_LABELS, raw_vals)}

    confidence = max(probs.values())
    pneumonia_prob = probs.get("Pneumonia", 0.0)

    return {
        "classProbabilities": probs,
        "confidence": confidence,
        "pneumoniaProb": pneumonia_prob,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": interpreter is not None,
        "input_shape": input_shape.tolist() if input_shape is not None else None,
    }
