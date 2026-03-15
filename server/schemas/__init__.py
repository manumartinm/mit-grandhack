from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    full_name: str = Field(min_length=2, max_length=120)
    role: str = "doctor"


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    phone: Optional[str] = None
    clinic_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileUpdate(BaseModel):
    phone: Optional[str] = None
    preferred_language: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    clinic_name: Optional[str] = None


class UserProfileOut(BaseModel):
    phone: Optional[str]
    preferred_language: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    clinic_name: Optional[str]

    class Config:
        from_attributes = True


# ── Patients ──────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    age_years: Optional[int] = None
    village: Optional[str] = None
    asha_worker_id: Optional[str] = None
    weight_kg: Optional[float] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    age_years: Optional[int] = None
    village: Optional[str] = None
    asha_worker_id: Optional[str] = None
    weight_kg: Optional[float] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    full_name: str
    date_of_birth: Optional[str]
    gender: Optional[str]
    age_years: Optional[int]
    village: Optional[str]
    asha_worker_id: Optional[str]
    weight_kg: Optional[float]
    notes: Optional[str]
    fhir_id: Optional[str]
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MedicalRecordCreate(BaseModel):
    record_type: Literal["lab_result", "prescription", "diagnosis", "imaging", "other"]
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    record_date: Optional[str] = None


class MedicalRecordOut(BaseModel):
    id: int
    patient_id: int
    created_by: Optional[int] = None
    record_type: str
    title: str
    content: str
    record_date: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ScreeningSessionCreate(BaseModel):
    """Sent by the mobile client after a completed screening."""
    id: str  # client-generated UUID – allows safe idempotent upserts
    asha_worker_id: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    signal_source: Optional[str] = None
    risk_bucket: Optional[str] = None
    confidence: Optional[float] = None
    requires_escalation: bool = False
    cnn_output: Optional[dict[str, Any]] = None
    symptoms: list[str] = Field(default_factory=list)
    zone_results: Optional[list[dict[str, Any]]] = None
    notes: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    referral_status: Optional[str] = None
    referral_timestamp: Optional[datetime] = None


class ScreeningSessionOut(BaseModel):
    id: str
    patient_id: int
    created_by: Optional[int] = None
    asha_worker_id: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    signal_source: Optional[str]
    risk_bucket: Optional[str]
    confidence: Optional[float]
    requires_escalation: bool
    cnn_output: Optional[dict[str, Any]]
    symptoms: Optional[list[str]]
    zone_results: Optional[list[dict[str, Any]]]
    notes: Optional[str]
    gps_lat: Optional[float]
    gps_lon: Optional[float]
    referral_status: Optional[str]
    referral_timestamp: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class AIChatRequest(BaseModel):
    patient_id: int
    messages: list[AIChatMessage]
    cnn_output: Optional[dict[str, Any]] = None
    outbreak_alerts: list[dict[str, Any]] = Field(default_factory=list)
    medical_records: list[dict[str, Any]] = Field(default_factory=list)


class AIScreeningInsightsRequest(BaseModel):
    patient_id: Optional[int] = None
    cnn_output: dict[str, Any]
    previous_sessions: list[dict[str, Any]] = Field(default_factory=list)


class AIOcrRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    mime_type: str = "image/jpeg"


class ConversationCreate(BaseModel):
    patient_id: int
    doctor_id: int


class ConversationOut(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    sender_role: str
    content: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class CallRequestCreate(BaseModel):
    patient_id: int
    doctor_id: int
    mode: str = "dialer_now"
    reason: Optional[str] = None


class CallRequestOut(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    mode: str
    status: str
    reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    active: bool

    class Config:
        from_attributes = True
