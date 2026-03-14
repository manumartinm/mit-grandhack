from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.security import get_current_user
from database import get_db
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


# ── Patients ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Patient).all()


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = Patient(**body.model_dump(), created_by=current_user.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

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
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    db.delete(patient)
    db.commit()


# ── Medical Records ───────────────────────────────────────────────────────────

@router.get("/{patient_id}/emr", response_model=List[MedicalRecordOut])
def list_medical_records(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    return (
        db.query(MedicalRecord)
        .filter(MedicalRecord.patient_id == patient_id)
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
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    record = MedicalRecord(patient_id=patient_id, **body.model_dump())
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
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    record = (
        db.query(MedicalRecord)
        .filter(
            MedicalRecord.id == record_id,
            MedicalRecord.patient_id == patient_id,
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
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    return (
        db.query(ScreeningSession)
        .filter(ScreeningSession.patient_id == patient_id)
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
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Idempotent: return existing session if same UUID already stored.
    existing = db.query(ScreeningSession).filter(ScreeningSession.id == body.id).first()
    if existing:
        return existing

    session = ScreeningSession(patient_id=patient_id, **body.model_dump())
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
    session = (
        db.query(ScreeningSession)
        .filter(
            ScreeningSession.id == session_id,
            ScreeningSession.patient_id == patient_id,
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
