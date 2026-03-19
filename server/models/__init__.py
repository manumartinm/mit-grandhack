from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum("doctor", "admin", name="user_role"), default="doctor")
    phone = Column(String(32), nullable=True)
    preferred_language = Column(String(10), nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(32), nullable=True)
    clinic_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="creator")
    conversations_as_patient = relationship(
        "Conversation", back_populates="patient", foreign_keys="Conversation.patient_id"
    )
    conversations_as_doctor = relationship(
        "Conversation", back_populates="doctor", foreign_keys="Conversation.doctor_id"
    )


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    date_of_birth = Column(String(10), nullable=True)
    gender = Column(String(20), nullable=True)

    # Dedicated profile columns (previously packed into `notes` JSON)
    age_years = Column(Integer, nullable=True)
    village = Column(String(255), nullable=True)
    asha_worker_id = Column(String(64), nullable=True)
    weight_kg = Column(Float, nullable=True)

    # Remaining extended data as JSON (comorbidities, vaccinations, etc.)
    notes = Column(Text, nullable=True)
    fhir_id = Column(String(128), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", back_populates="patients")
    medical_records = relationship(
        "MedicalRecord", back_populates="patient", cascade="all, delete-orphan"
    )
    screening_sessions = relationship(
        "ScreeningSession", back_populates="patient", cascade="all, delete-orphan"
    )


class ScreeningSession(Base):
    """
    Persists every lung-sound screening session including the full CNN output.
    The client uploads this after a completed screening so results survive
    app reinstalls or device loss.
    """
    __tablename__ = "screening_sessions"

    # Client-generated UUID — allows safe idempotent upserts.
    id = Column(String(64), primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    asha_worker_id = Column(String(64), nullable=True)

    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    signal_source = Column(String(20), nullable=True)  # wearable | phone_mic | dual_fused

    # ── Denormalised quick-access fields from CNN output ──────────────────────
    risk_bucket = Column(String(10), nullable=True)        # low | medium | high
    confidence = Column(Float, nullable=True)              # 0..1
    requires_escalation = Column(Boolean, default=False)

    # ── Full JSON payloads ────────────────────────────────────────────────────
    cnn_output = Column(JSON, nullable=True)               # full CNNOutputTool
    symptoms = Column(JSON, nullable=True)                 # list[str]
    zone_results = Column(JSON, nullable=True)             # list[ZoneRecordingResult]

    notes = Column(Text, nullable=True)

    # ── Geolocation ───────────────────────────────────────────────────────────
    gps_lat = Column(Float, nullable=True)
    gps_lon = Column(Float, nullable=True)

    # ── Referral tracking ─────────────────────────────────────────────────────
    referral_status = Column(String(20), nullable=True)    # recommended | accepted | completed | declined
    referral_timestamp = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="screening_sessions")


class AudioRecording(Base):
    __tablename__ = "audio_recordings"

    record_id = Column(String(64), primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(String(64), nullable=True, index=True)

    pcm_path = Column(String(512), nullable=False)
    analysis_path = Column(String(512), nullable=False)
    filename = Column(String(255), nullable=True)
    content_type = Column(String(128), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient")


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    record_type = Column(
        Enum(
            "lab_result", "prescription", "diagnosis", "imaging", "other",
            name="medical_record_type",
        ),
        nullable=False,
    )
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    record_date = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="medical_records")


# NOTE: Conversation.patient_id and CallRequest.patient_id reference users.id
# (healthcare workers communicating with each other), NOT patients.id — intentional.
class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("User", foreign_keys=[patient_id], back_populates="conversations_as_patient")
    doctor = relationship("User", foreign_keys=[doctor_id], back_populates="conversations_as_doctor")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class CallRequest(Base):
    __tablename__ = "call_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mode = Column(String(20), default="dialer_now", nullable=False)
    status = Column(String(20), default="requesting", nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    active = Column(Boolean, default=True)
