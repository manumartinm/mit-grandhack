from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.security import get_current_user
from database import SessionLocal, get_db
from iris_client import fhir_client
from models import MedicalRecord, Patient, ScreeningSession, User
from schemas import (
    MedicalRecordCreate,
    MedicalRecordOut,
    PatientCreate,
    PatientOut,
    PatientUpdate,
    ScreeningSessionCreate,
    ScreeningSessionOut,
)

router = APIRouter(prefix="/patients", tags=["patients"])


def _sync_patient_to_fhir(patient_id: int) -> None:
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or patient.fhir_id:
            return
        fhir_id = fhir_client.create_patient(patient)
        if fhir_id:
            patient.fhir_id = fhir_id
            db.commit()
    except Exception as exc:
        print(f"WARNING: Could not sync patient {patient_id} to FHIR: {exc}")
    finally:
        db.close()


def _get_owned_patient(db: Session, patient_id: int, owner_id: int) -> Patient:
    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.created_by == owner_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


# ── Patients ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Patient)
        .filter(Patient.created_by == current_user.id)
        .order_by(Patient.updated_at.desc())
        .all()
    )


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ownership rule: one patient identity belongs to a single rural coworker.
    existing = (
        db.query(Patient)
        .filter(
            Patient.full_name == body.full_name,
            Patient.date_of_birth == body.date_of_birth,
            Patient.gender == body.gender,
        )
        .first()
    )
    if existing and existing.created_by != current_user.id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This patient is already assigned to another rural coworker. "
                "A patient can belong to only one coworker."
            ),
        )
    if existing and existing.created_by == current_user.id:
        raise HTTPException(status_code=409, detail="Patient already registered for this user.")

    patient = Patient(**body.model_dump(), created_by=current_user.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    background_tasks.add_task(_sync_patient_to_fhir, patient.id)
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_owned_patient(db, patient_id, current_user.id)


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = _get_owned_patient(db, patient_id, current_user.id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = _get_owned_patient(db, patient_id, current_user.id)

    db.delete(patient)
    db.commit()


# ── Medical Records ───────────────────────────────────────────────────────────

@router.get("/{patient_id}/emr", response_model=List[MedicalRecordOut])
def list_medical_records(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)

    return (
        db.query(MedicalRecord)
        .filter(
            MedicalRecord.patient_id == patient_id,
            or_(
                MedicalRecord.created_by == current_user.id,
                MedicalRecord.created_by.is_(None),
            ),
        )
        .order_by(MedicalRecord.created_at.desc())
        .all()
    )


@router.post(
    "/{patient_id}/emr",
    response_model=MedicalRecordOut,
    status_code=status.HTTP_201_CREATED,
)
def create_medical_record(
    patient_id: int,
    body: MedicalRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)

    record = MedicalRecord(
        patient_id=patient_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{patient_id}/emr/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medical_record(
    patient_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)

    record = (
        db.query(MedicalRecord)
        .filter(
            MedicalRecord.id == record_id,
            MedicalRecord.patient_id == patient_id,
            or_(
                MedicalRecord.created_by == current_user.id,
                MedicalRecord.created_by.is_(None),
            ),
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    db.delete(record)
    db.commit()


# ── Screening Sessions ────────────────────────────────────────────────────────

@router.get("/{patient_id}/sessions", response_model=List[ScreeningSessionOut])
def list_sessions(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)

    return (
        db.query(ScreeningSession)
        .filter(
            ScreeningSession.patient_id == patient_id,
            or_(
                ScreeningSession.created_by == current_user.id,
                ScreeningSession.created_by.is_(None),
            ),
        )
        .order_by(ScreeningSession.started_at.desc())
        .all()
    )


@router.post(
    "/{patient_id}/sessions",
    response_model=ScreeningSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    patient_id: int,
    body: ScreeningSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)

    # Idempotent: return existing session if same UUID already stored.
    existing = db.query(ScreeningSession).filter(ScreeningSession.id == body.id).first()
    if existing:
        if existing.patient_id != patient_id:
            raise HTTPException(
                status_code=409,
                detail="Session ID already exists for another patient.",
            )
        if existing.created_by not in (None, current_user.id):
            raise HTTPException(
                status_code=409,
                detail="Session ID already exists for another user.",
            )
        return existing

    session = ScreeningSession(
        patient_id=patient_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.put(
    "/{patient_id}/sessions/{session_id}",
    response_model=ScreeningSessionOut,
)
def update_session(
    patient_id: int,
    session_id: str,
    body: ScreeningSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_patient(db, patient_id, current_user.id)
    session = (
        db.query(ScreeningSession)
        .filter(
            ScreeningSession.id == session_id,
            ScreeningSession.patient_id == patient_id,
            or_(
                ScreeningSession.created_by == current_user.id,
                ScreeningSession.created_by.is_(None),
            ),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)
    return session
