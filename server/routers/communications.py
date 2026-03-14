from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.security import get_current_user
from database import get_db
from models import CallRequest, Conversation, Message, User
from schemas import (
    CallRequestCreate,
    CallRequestOut,
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
)

router = APIRouter(prefix="/communications", tags=["communications"])


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = Conversation(
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    patient_id: int | None = None,
    doctor_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Conversation)
    if patient_id is not None:
        query = query.filter(Conversation.patient_id == patient_id)
    if doctor_id is not None:
        query = query.filter(Conversation.doctor_id == doctor_id)
    return query.order_by(Conversation.created_at.desc()).all()


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageOut])
def list_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    conversation_id: int,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    message = Message(
        conversation_id=conversation_id,
        sender_role=body.sender_role,
        content=body.content,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.post("/call-requests", response_model=CallRequestOut, status_code=status.HTTP_201_CREATED)
def create_call_request(
    body: CallRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    call_request = CallRequest(
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        mode=body.mode,
        reason=body.reason,
        status="requesting",
    )
    db.add(call_request)
    db.commit()
    db.refresh(call_request)
    return call_request


@router.get("/call-requests/{request_id}", response_model=CallRequestOut)
def get_call_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    call_request = db.query(CallRequest).filter(CallRequest.id == request_id).first()
    if not call_request:
        raise HTTPException(status_code=404, detail="Call request not found")
    return call_request


@router.post("/call-requests/{request_id}/cancel", response_model=CallRequestOut)
def cancel_call_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    call_request = db.query(CallRequest).filter(CallRequest.id == request_id).first()
    if not call_request:
        raise HTTPException(status_code=404, detail="Call request not found")
    call_request.status = "ended"
    call_request.active = False
    db.add(call_request)
    db.commit()
    db.refresh(call_request)
    return call_request
