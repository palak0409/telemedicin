from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.schemas import Page
from app.database.session import get_db
from app.features.appointments.schemas import ConsultationBrief
from app.features.auth.dependencies import DoctorUser, require_roles
from app.features.consultations import service
from app.features.consultations.schemas import (
    ConsultationOut,
    JoinRequest,
    JoinResponse,
    NotesUpdate,
    RtcConfig,
)
from app.features.users.models import User, UserRole
from app.features.users.schemas import PersonSummary

router = APIRouter(prefix="/consultations", tags=["consultations"])
DB = Annotated[Session, Depends(get_db)]
Participant = Annotated[User, Depends(require_roles(UserRole.PATIENT, UserRole.DOCTOR))]


@router.post("/join", response_model=JoinResponse)
def join(data: JoinRequest, user: Participant, db: DB):
    """
    Step 1 of joining a call: authorizes the user for this appointment, creates
    the room on first entry and returns the room id plus ICE server configuration.
    Step 2 is opening the signaling socket at /ws/consultations/{room_id}.
    """
    consultation, appointment = service.open_room(db, user, data.appointment_id)
    peer = appointment.doctor if user.id == appointment.patient_id else appointment.patient
    return JoinResponse(
        room_id=consultation.room_id,
        appointment_id=appointment.id,
        role=user.role,
        consultation=ConsultationBrief.model_validate(consultation),
        self_user=PersonSummary.model_validate(user),
        peer=PersonSummary.model_validate(peer),
        rtc_config=RtcConfig(**service.rtc_configuration()),
    )


@router.get("", response_model=Page[ConsultationOut])
def consultation_history(
    user: Participant,
    db: DB,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = service.history_for_user(db, user, limit, offset)
    return Page(items=[ConsultationOut.from_model(c) for c in items], total=total)


@router.put("/{consultation_id}/notes", response_model=ConsultationOut)
def update_notes(consultation_id: int, data: NotesUpdate, doctor: DoctorUser, db: DB):
    consultation = service.get_for_doctor(db, doctor, consultation_id)
    consultation.notes = data.notes
    db.commit()
    return ConsultationOut.from_model(consultation)
