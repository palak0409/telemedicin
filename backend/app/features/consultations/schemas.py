from datetime import datetime

from pydantic import BaseModel

from app.core.schemas import OptionalText
from app.features.appointments.schemas import ConsultationBrief, DoctorBrief, doctor_brief
from app.features.consultations.models import Consultation, ConsultationStatus
from app.features.users.models import UserRole
from app.features.users.schemas import PersonSummary


class JoinRequest(BaseModel):
    appointment_id: int


class RtcConfig(BaseModel):
    iceServers: list[dict]
    iceTransportPolicy: str


class JoinResponse(BaseModel):
    """Everything the consultation page needs before opening the signaling socket."""

    room_id: str
    appointment_id: int
    role: UserRole
    consultation: ConsultationBrief
    self_user: PersonSummary
    peer: PersonSummary
    rtc_config: RtcConfig


class ConsultationOut(BaseModel):
    id: int
    status: ConsultationStatus
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    notes: str | None
    summary: dict | None
    documentation_status: str | None
    appointment_id: int
    scheduled_start: datetime
    reason: str
    doctor: DoctorBrief
    patient: PersonSummary

    @classmethod
    def from_model(cls, consultation: Consultation) -> "ConsultationOut":
        appointment = consultation.appointment
        return cls(
            id=consultation.id,
            status=consultation.status,
            started_at=consultation.started_at,
            ended_at=consultation.ended_at,
            duration_seconds=consultation.duration_seconds,
            notes=consultation.notes,
            summary=consultation.summary,
            documentation_status=consultation.documentation_status,
            appointment_id=appointment.id,
            scheduled_start=appointment.start_time,
            reason=appointment.reason,
            doctor=doctor_brief(appointment),
            patient=PersonSummary.model_validate(appointment.patient),
        )


class NotesUpdate(BaseModel):
    notes: OptionalText(5000) = None
