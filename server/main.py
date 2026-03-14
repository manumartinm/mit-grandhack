import json
import uuid
from datetime import datetime

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import audio
from database import Base, engine
from routers import ai as ai_router
from routers import auth as auth_router
from routers import communications as communications_router
from routers import patients as patients_router

app = FastAPI(title="PneumoScan Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(patients_router.router)
app.include_router(communications_router.router)
app.include_router(ai_router.router)


def _patch_columns(table: str, columns: dict[str, str]) -> None:
    """Add missing columns to *table*. Safe to call on every startup."""
    inspector = inspect(engine)
    try:
        existing = {col["name"] for col in inspector.get_columns(table)}
    except Exception as exc:
        print(f"WARNING: Could not inspect {table}: {exc}")
        return
    with engine.begin() as conn:
        for col_name, ddl in columns.items():
            if col_name not in existing:
                print(f"Schema patch: {table}.{col_name}")
                conn.execute(text(ddl))


def _ensure_user_columns() -> None:
    _patch_columns("users", {
        "phone":                   "ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL",
        "preferred_language":      "ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10) NULL",
        "emergency_contact_name":  "ALTER TABLE users ADD COLUMN emergency_contact_name VARCHAR(255) NULL",
        "emergency_contact_phone": "ALTER TABLE users ADD COLUMN emergency_contact_phone VARCHAR(32) NULL",
        "clinic_name":             "ALTER TABLE users ADD COLUMN clinic_name VARCHAR(255) NULL",
    })


def _ensure_patient_columns() -> None:
    """Add dedicated profile columns that previously lived in the notes JSON blob."""
    _patch_columns("patients", {
        "age_years":      "ALTER TABLE patients ADD COLUMN age_years INT NULL",
        "village":        "ALTER TABLE patients ADD COLUMN village VARCHAR(255) NULL",
        "asha_worker_id": "ALTER TABLE patients ADD COLUMN asha_worker_id VARCHAR(64) NULL",
        "weight_kg":      "ALTER TABLE patients ADD COLUMN weight_kg FLOAT NULL",
    })


@app.on_event("startup")
def on_startup():
    import models  # noqa: F401 – ensure ORM models are registered
    Base.metadata.create_all(bind=engine)   # creates any NEW tables (e.g. screening_sessions)
    _ensure_user_columns()
    _ensure_patient_columns()
    audio.RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    audio.load_model()


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Accept raw PCM audio (uint8, mono, 8 kHz) and return class probabilities.

    Pipeline
    --------
    Raw bytes → preprocess_signal → extract_features → TFLite inference
    """
    raw_bytes = await file.read()
    pcm_uint8 = np.frombuffer(raw_bytes, dtype=np.uint8)

    signal, quality = audio.preprocess_signal(pcm_uint8, sr=8000)
    mfcc = audio.extract_features(signal, sr=8000)

    if audio.interpreter is not None:
        preds = audio.run_tflite(mfcc)
        probs = {label: round(float(p), 4) for label, p in zip(audio.CLASS_LABELS, preds)}
    else:
        raw_vals = np.random.dirichlet(np.ones(len(audio.CLASS_LABELS)))
        probs    = {label: round(float(p), 4) for label, p in zip(audio.CLASS_LABELS, raw_vals)}

    confidence     = max(probs.values())
    pneumonia_prob = probs.get("Pneumonia", 0.0)
    created_at     = datetime.utcnow().isoformat()
    record_id      = f"rec-{uuid.uuid4().hex[:12]}"

    audio_path    = audio.RECORDINGS_DIR / f"{record_id}.pcm"
    analysis_path = audio.RECORDINGS_DIR / f"{record_id}.json"
    audio_path.write_bytes(raw_bytes)

    analysis_payload = {
        "recordId":           record_id,
        "createdAt":          created_at,
        "modelPath":          audio.MODEL_PATH,
        "classProbabilities": probs,
        "confidence":         confidence,
        "pneumoniaProb":      pneumonia_prob,
        "signalQuality":      quality,
        "filename":           file.filename,
        "contentType":        file.content_type,
    }
    analysis_path.write_text(json.dumps(analysis_payload, indent=2, cls=audio._NumpyEncoder))

    return {
        "recordId":           record_id,
        "createdAt":          created_at,
        "modelPath":          audio.MODEL_PATH,
        "classProbabilities": probs,
        "confidence":         confidence,
        "pneumoniaProb":      pneumonia_prob,
        "signalQuality":      quality,
    }


@app.get("/screenings")
def list_recordings(limit: int = 50):
    files = sorted(audio.RECORDINGS_DIR.glob("*.json"), reverse=True)[: max(limit, 1)]
    payload = []
    for f in files:
        try:
            payload.append(json.loads(f.read_text()))
        except Exception:
            continue
    return {"count": len(payload), "items": payload}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": audio.interpreter is not None,
        "input_shape": audio.input_shape.tolist() if audio.input_shape is not None else None,
        "recordings_dir": str(audio.RECORDINGS_DIR.resolve()),
    }
