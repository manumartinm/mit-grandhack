from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


# ── Auth ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "doctor"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Patients ──────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    full_name: str
    date_of_birth: Optional[str]
    gender: Optional[str]
    notes: Optional[str]
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
