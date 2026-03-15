import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from core.security import get_current_user
from iris_client import fhir_client, iris_vector_client
from models import Patient, User
from database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/fhir", tags=["fhir"])


class EmbedRequest(BaseModel):
    patient_id: int
    text: str = Field(min_length=1, max_length=8000)
    record_type: str = Field(default="note", min_length=1, max_length=100)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    patient_id: int | None = None
    top_k: int = Field(default=5, ge=1, le=20)


async def _embed_text(text: str) -> list[float]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured.")
    client = AsyncOpenAI(api_key=api_key)
    try:
        result = await client.embeddings.create(model="text-embedding-3-small", input=text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return list(result.data[0].embedding)


@router.get("/summary")
def summary() -> dict[str, Any]:
    return {
        "patient_count": fhir_client.get_patient_count(),
        "observation_count": fhir_client.get_observation_count(),
        "fhir_base": os.getenv("IRIS_FHIR_BASE", ""),
        "vector_ready": iris_vector_client.enabled,
    }


@router.post("/embed")
async def embed_note(
    body: EmbedRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    patient = (
        db.query(Patient)
        .filter(Patient.id == body.patient_id, Patient.created_by == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    embedding = await _embed_text(body.text)
    row_id = iris_vector_client.upsert(
        patient_id=body.patient_id,
        text=body.text,
        record_type=body.record_type,
        embedding=embedding,
    )
    if row_id is None:
        raise HTTPException(status_code=503, detail="Vector storage is unavailable.")
    return {"id": row_id, "stored": True}


@router.post("/search")
async def search_notes(
    body: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if body.patient_id is None:
        raise HTTPException(status_code=400, detail="patient_id is required.")
    patient = (
        db.query(Patient)
        .filter(Patient.id == body.patient_id, Patient.created_by == current_user.id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    embedding = await _embed_text(body.query)
    results = iris_vector_client.search(
        query_embedding=embedding,
        patient_id=body.patient_id,
        top_k=body.top_k,
    )
    return {"items": results, "count": len(results)}
