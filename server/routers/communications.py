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


def _is_participant(conversation: Conversation, user_id: int) -> bool:
    return conversation.patient_id == user_id or conversation.doctor_id == user_id


def _get_conversation_for_user_or_404(
    db: Session, conversation_id: int, user_id: int
) -> Conversation:
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _is_participant(conversation, user_id):
        raise HTTPException(status_code=403, detail="Not authorized for this conversation")
    return conversation


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id not in (body.patient_id, body.doctor_id):
        raise HTTPException(
            status_code=403,
            detail="You can only create conversations that include your own user.",
        )

    patient_user = db.query(User).filter(User.id == body.patient_id).first()
    doctor_user = db.query(User).filter(User.id == body.doctor_id).first()
    if not patient_user or not doctor_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(Conversation)
        .filter(
            Conversation.patient_id == body.patient_id,
            Conversation.doctor_id == body.doctor_id,
        )
        .first()
    )
    if existing:
        return existing

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
    query = db.query(Conversation).filter(
        (Conversation.patient_id == current_user.id)
        | (Conversation.doctor_id == current_user.id)
    )
    if patient_id is not None:
        if patient_id != current_user.id and doctor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only filter conversations where you are a participant.",
            )
        query = query.filter(Conversation.patient_id == patient_id)
    if doctor_id is not None:
        if doctor_id != current_user.id and patient_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only filter conversations where you are a participant.",
            )
        query = query.filter(Conversation.doctor_id == doctor_id)
    return query.order_by(Conversation.created_at.desc()).all()


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageOut])
def list_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_conversation_for_user_or_404(db, conversation_id, current_user.id)
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
    conversation = _get_conversation_for_user_or_404(db, conversation_id, current_user.id)
    if body.sender_role == "patient" and conversation.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only patient participant can send patient messages")
    if body.sender_role == "doctor" and conversation.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only doctor participant can send doctor messages")
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
    if current_user.id not in (body.patient_id, body.doctor_id):
        raise HTTPException(
            status_code=403,
            detail="You can only create call requests where you are a participant.",
        )

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
    if current_user.id not in (call_request.patient_id, call_request.doctor_id):
        raise HTTPException(status_code=403, detail="Not authorized for this call request")
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
    if current_user.id not in (call_request.patient_id, call_request.doctor_id):
        raise HTTPException(status_code=403, detail="Not authorized for this call request")
    call_request.status = "ended"
    call_request.active = False
    db.add(call_request)
    db.commit()
    db.refresh(call_request)
    return call_request
