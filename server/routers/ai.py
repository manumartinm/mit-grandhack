import io
import json
import os
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI, OpenAI
from pydantic_ai import Agent, RunContext
from sqlalchemy.orm import Session

from core.security import get_current_user
from database import SessionLocal, get_db
from iris_client import iris_vector_client
from models import MedicalRecord, Patient, User
from schemas import AIChatRequest, AIOcrRequest, AIScreeningInsightsRequest

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_owned_patient_or_404(db: Session, patient_id: int, owner_id: int) -> Patient:
    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.created_by == owner_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@dataclass
class AgentDeps:
    patient_id: int
    cnn_output: dict[str, Any] | None
    outbreak_alerts: list[dict[str, Any]]


specialist_agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt=(
        "You are a clinical specialist assistant. Summarize electronic medical records "
        "for respiratory triage. Keep outputs concise, factual, and mention only clinically "
        "relevant information."
    ),
)

coordinator_agent = Agent(
    "openai:gpt-4o-mini",
    deps_type=AgentDeps,
    system_prompt=(
        "You are Stethoscan AI, a clinical decision-support assistant for lung screening.\n"
        "Use tools to gather EMR and risk context before concluding.\n"
        "Rules:\n"
        "- You are not a final diagnosis system.\n"
        "- Escalate to a doctor when risk or guardrails indicate.\n"
        "- Keep guidance short and practical for health workers.\n"
        "- Return plain text only (no Markdown, no bullets with markdown syntax, no code fences).\n"
        "- Always consider both: (a) the latest user message and (b) the full conversation history.\n"
    ),
)


@coordinator_agent.tool
def get_patient_emr(ctx: RunContext[AgentDeps]) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        records = (
            db.query(MedicalRecord)
            .filter(MedicalRecord.patient_id == ctx.deps.patient_id)
            .order_by(MedicalRecord.created_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "record_type": r.record_type,
                "title": r.title,
                "content": r.content,
                "record_date": r.record_date,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    finally:
        db.close()


@coordinator_agent.tool
def get_screening_history(ctx: RunContext[AgentDeps]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == ctx.deps.patient_id).first()
        if not patient:
            return {"history": [], "notes": None}

        parsed_notes: dict[str, Any] | None = None
        if patient.notes:
            try:
                parsed_notes = json.loads(patient.notes)
            except Exception:
                parsed_notes = {"raw_notes": patient.notes}

        return {
            "patient_name": patient.full_name,
            "notes": parsed_notes,
            "latest_cnn_output": ctx.deps.cnn_output,
        }
    finally:
        db.close()


@coordinator_agent.tool
def assess_pneumonia_risk(
    ctx: RunContext[AgentDeps], class_probabilities: dict[str, float]
) -> dict[str, Any]:
    pneumonia_prob = float(class_probabilities.get("Pneumonia", 0.0))
    if pneumonia_prob >= 0.7:
        bucket = "high"
    elif pneumonia_prob >= 0.35:
        bucket = "medium"
    else:
        bucket = "low"
    return {"bucket": bucket, "pneumonia_probability": round(pneumonia_prob, 4)}


@coordinator_agent.tool
def check_escalation(
    ctx: RunContext[AgentDeps], cnn_output: dict[str, Any], patient_age: int | None
) -> dict[str, Any]:
    guardrails = cnn_output.get("guardrails") if isinstance(cnn_output, dict) else {}
    requires = bool(guardrails.get("requiresDoctorEscalation"))
    reason = guardrails.get("escalationReason")

    probs = cnn_output.get("classProbabilities", {}) if isinstance(cnn_output, dict) else {}
    pneumonia_prob = float(probs.get("Pneumonia", 0.0))
    if pneumonia_prob >= 0.7:
        requires = True
        reason = reason or "High pneumonia probability from screening model."
    if patient_age is not None and patient_age < 5 and pneumonia_prob >= 0.35:
        requires = True
        reason = reason or "Pediatric patient with elevated respiratory risk."

    return {"requires_escalation": requires, "reason": reason}


@coordinator_agent.tool
async def rag_notes_search(
    ctx: RunContext[AgentDeps], query: str
) -> list[dict[str, Any]]:
    embedding = await _embed_text_async(query)
    return iris_vector_client.search(
        query_embedding=embedding, patient_id=ctx.deps.patient_id, top_k=5
    )


@coordinator_agent.tool
async def summarize_emr(ctx: RunContext[AgentDeps], records: list[dict[str, Any]]) -> str:
    if not records:
        return "No EMR records are available."

    result = await specialist_agent.run(
        "Summarize these EMR records for respiratory triage:\n"
        f"{json.dumps(records, ensure_ascii=False)}"
    )
    return str(result.output)


@router.post("/chat")
async def chat(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the server."
        )

    _get_owned_patient_or_404(db, body.patient_id, current_user.id)

    prompt, deps = await _build_chat_prompt_and_deps(body)

    async def stream():
        try:
            async with coordinator_agent.run_stream(prompt, deps=deps) as result:
                async for chunk in result.stream_text(delta=True):
                    if not chunk:
                        continue
                    yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)


@router.post("/chat-sync")
async def chat_sync(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the server."
        )

    _get_owned_patient_or_404(db, body.patient_id, current_user.id)
    prompt, deps = await _build_chat_prompt_and_deps(body)
    try:
        result = await coordinator_agent.run(prompt, deps=deps)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"content": str(result.output)}


def _openai_client() -> AsyncOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the server."
        )
    return AsyncOpenAI(api_key=api_key)


async def _embed_text_async(text: str) -> list[float]:
    client = _openai_client()
    try:
        response = await client.embeddings.create(model="text-embedding-3-small", input=text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return list(response.data[0].embedding)


async def _build_chat_prompt_and_deps(body: AIChatRequest) -> tuple[str, AgentDeps]:
    conversation = "\n".join([f"{m.role}: {m.content}" for m in body.messages])
    user_query = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    rag_context = []
    if user_query:
        try:
            embedding = await _embed_text_async(user_query)
            rag_context = iris_vector_client.search(
                query_embedding=embedding, patient_id=body.patient_id, top_k=3
            )
        except Exception as exc:
            print(f"WARNING: RAG retrieval failed: {exc}")

    rag_block = "None."
    if rag_context:
        rag_lines = [
            f"- ({item.get('record_type', 'note')}, sim={item.get('similarity', 0):.3f}) {item.get('text', '')}"
            for item in rag_context
        ]
        rag_block = "\n".join(rag_lines)

    prompt = (
        f"Patient ID: {body.patient_id}\n"
        f"Latest user input:\n{user_query}\n\n"
        f"Conversation:\n{conversation}\n\n"
        f"Client provided medical records: {json.dumps(body.medical_records, ensure_ascii=False)}\n"
        f"[RAG CONTEXT]\n{rag_block}\n\n"
        "Use tools to gather EMR and risk context, then respond with:\n"
        "1) clinical interpretation,\n"
        "2) immediate next steps,\n"
        "3) whether doctor escalation is needed and why.\n"
        "Output format constraints:\n"
        "- Plain text only.\n"
        "- Do not use Markdown symbols (#, *, -, ```).\n"
        "- Base your answer on the latest user input while keeping consistency with the full conversation history.\n"
    )

    deps = AgentDeps(
        patient_id=body.patient_id,
        cnn_output=body.cnn_output,
        outbreak_alerts=body.outbreak_alerts,
    )
    return prompt, deps


def _embed_text_sync(text: str) -> list[float]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return []
    try:
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(model="text-embedding-3-small", input=text)
        return list(response.data[0].embedding)
    except Exception as exc:
        print(f"WARNING: could not generate embedding: {exc}")
        return []


def _store_summary_embedding(patient_id: int | None, summary_text: str) -> None:
    if patient_id is None or not summary_text:
        return
    embedding = _embed_text_sync(summary_text)
    if not embedding:
        return
    iris_vector_client.upsert(
        patient_id=patient_id,
        text=summary_text,
        record_type="ai_summary",
        embedding=embedding,
    )


@router.post("/screening-insights")
async def screening_insights(
    body: AIScreeningInsightsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient_summary = "No patient context provided."
    if body.patient_id is not None:
        patient = _get_owned_patient_or_404(db, body.patient_id, current_user.id)
        patient_summary = f"Patient: {patient.full_name}"

    prompt = (
        "You are a nurse-facing clinical triage assistant for rural health workers.\n"
        "Your role is to help a health worker decide practical next steps after a lung screening.\n"
        "Do not write for a patient audience. Write for the nurse.\n\n"
        f"{patient_summary}\n"
        f"CNN output: {json.dumps(body.cnn_output, ensure_ascii=False)}\n"
        f"Previous sessions summary: {json.dumps(body.previous_sessions, ensure_ascii=False)}\n\n"
        "Return JSON only with this exact shape:\n"
        '{"verdict":"string","explanation":"string","warningSigns":["string"],"nextActions":["string"],"recommendReferral":boolean}\n'
        "Rules:\n"
        "- verdict: very short triage label, nurse-friendly\n"
        "- explanation: 1-3 short sentences in plain language\n"
        "- warningSigns: 2-4 concise bullets\n"
        "- nextActions: 2-4 concrete nurse actions\n"
        "- recommendReferral must align with risk and escalation context\n"
    )

    client = _openai_client()
    try:
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=450,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    content = (completion.choices[0].message.content or "").strip()
    background_tasks.add_task(_store_summary_embedding, body.patient_id, content)
    return {"insights": content}


@router.post("/ocr")
async def ocr_document(
    body: AIOcrRequest,
    current_user: User = Depends(get_current_user),
):
    client = _openai_client()
    data_url = f"data:{body.mime_type};base64,{body.image_base64}"

    try:
        completion = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract all medical text from this document image. "
                                "Return only plain text content, preserving line breaks."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "high"},
                        },
                    ],
                }
            ],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    text = (completion.choices[0].message.content or "").strip()
    return {"text": text}


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    client = _openai_client()
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    buffer = io.BytesIO(audio_bytes)
    buffer.name = file.filename or "voice-input.m4a"

    try:
        transcription = await client.audio.transcriptions.create(
            model="whisper-1",
            file=buffer,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"text": (transcription.text or "").strip()}
