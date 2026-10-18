"""
Consultation lifecycle and WebRTC (ICE) configuration.

    confirmed appointment
        └─ first participant opens the room ─▶ WAITING
              └─ second participant joins ──▶ ACTIVE  (started_at)
                    └─ either side ends ────▶ ENDED   (ended_at; appointment → completed)
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.dates import format_clinic_time, utcnow
from app.core.errors import conflict, not_found
from app.database.session import SessionLocal
from app.features.appointments.models import Appointment, AppointmentStatus
from app.features.consultations.models import Consultation, ConsultationStatus
from app.features.doctors.models import DoctorProfile
from app.features.notifications.service import notify
from app.features.users.models import User, UserRole


def join_window(appointment: Appointment) -> tuple[datetime, datetime]:
    grace = timedelta(minutes=settings.consultation_join_window_minutes)
    return appointment.start_time - grace, appointment.end_time + grace


def can_join(appointment: Appointment, now: datetime) -> bool:
    if appointment.status != AppointmentStatus.CONFIRMED:
        return False
    consultation = appointment.consultation
    if consultation and consultation.status == ConsultationStatus.ENDED:
        return False
    if consultation and consultation.status == ConsultationStatus.ACTIVE:
        return True  # an ongoing call can always be rejoined, even if it overran
    opens, closes = join_window(appointment)
    return opens <= now <= closes


def rtc_configuration() -> dict:
    """
    Configuration passed straight into the browser's `new RTCPeerConnection(...)`.

    STUN lets each browser learn its public address (a server-reflexive
    candidate) so peers behind ordinary NATs can connect directly. TURN relays
    the media when no direct path exists — symmetric NATs, strict corporate
    firewalls, some mobile networks. TURN credentials come from the environment
    and are only handed to authenticated participants of a consultation.
    """
    def split(value: str) -> list[str]:
        return [url.strip() for url in value.split(",") if url.strip()]

    ice_servers = []
    if stun := split(settings.stun_server):
        ice_servers.append({"urls": stun})
    turn = split(settings.turn_server)
    if turn:
        ice_servers.append(
            {"urls": turn, "username": settings.turn_username, "credential": settings.turn_password}
        )
    # Forcing relay without a TURN server would make every call fail.
    policy = settings.ice_transport_policy if turn else "all"
    return {"iceServers": ice_servers, "iceTransportPolicy": policy}


def other_participant_id(appointment: Appointment, user_id: int) -> int:
    return appointment.patient_id if user_id == appointment.doctor_id else appointment.doctor_id


def open_room(db: Session, user: User, appointment_id: int) -> tuple[Consultation, Appointment]:
    """Validates that `user` may enter the room now and returns its consultation (created on first entry)."""
    appointment = db.scalar(
        select(Appointment)
        .where(Appointment.id == appointment_id)
        .options(
            selectinload(Appointment.consultation),
            selectinload(Appointment.patient),
            selectinload(Appointment.doctor).selectinload(User.doctor_profile).selectinload(DoctorProfile.specialization),
        )
    )
    if appointment is None or user.id not in (appointment.patient_id, appointment.doctor_id):
        raise not_found("Appointment")

    consultation = appointment.consultation
    if (consultation and consultation.status == ConsultationStatus.ENDED) or (
        appointment.status == AppointmentStatus.COMPLETED
    ):
        raise conflict("This consultation has already ended.")
    if appointment.status != AppointmentStatus.CONFIRMED:
        raise conflict("Only confirmed appointments can be joined.")

    now = utcnow()
    if not can_join(appointment, now):
        opens, _ = join_window(appointment)
        if now < opens:
            raise conflict(f"The consultation room opens at {format_clinic_time(opens)}.")
        raise conflict("The time for this consultation has passed.")

    if consultation is None:
        consultation = Consultation(
            appointment_id=appointment.id, room_id=str(uuid.uuid4()), status=ConsultationStatus.WAITING
        )
        db.add(consultation)
        try:
            db.flush()
        except IntegrityError:
            # The other participant opened the room at the same moment.
            db.rollback()
            consultation = db.scalar(
                select(Consultation).where(Consultation.appointment_id == appointment.id)
            )
        else:
            other_id = other_participant_id(appointment, user.id)
            notify(
                db,
                other_id,
                type="consultation_waiting",
                title="Consultation room is open",
                message=f"{user.display_name} is waiting for you in the consultation room.",
                link=f"/consultation/{appointment.id}",
            )
    return consultation, appointment


def history_for_user(db: Session, user: User, limit: int, offset: int) -> tuple[list[Consultation], int]:
    owner = Appointment.doctor_id if user.role == UserRole.DOCTOR else Appointment.patient_id
    stmt = select(Consultation).join(Consultation.appointment).where(owner == user.id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(
        stmt.options(
            selectinload(Consultation.documentation),
            selectinload(Consultation.appointment).selectinload(Appointment.patient),
            selectinload(Consultation.appointment)
            .selectinload(Appointment.doctor)
            .selectinload(User.doctor_profile)
            .selectinload(DoctorProfile.specialization),
        )
        .order_by(Appointment.start_time.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(items), total


def get_for_doctor(db: Session, doctor: User, consultation_id: int) -> Consultation:
    consultation = db.get(Consultation, consultation_id)
    if consultation is None or consultation.appointment.doctor_id != doctor.id:
        raise not_found("Consultation")
    return consultation


# --- Called from the signaling socket (each opens its own short session) -------


@dataclass(frozen=True)
class RoomInfo:
    consultation_id: int
    appointment_id: int
    patient_id: int
    doctor_id: int


def load_room(room_id: str, user_id: int) -> RoomInfo | None:
    """Room details if `user_id` is a participant and the consultation has not ended."""
    with SessionLocal() as db:
        consultation = db.scalar(select(Consultation).where(Consultation.room_id == room_id))
        if consultation is None or consultation.status == ConsultationStatus.ENDED:
            return None
        appointment = consultation.appointment
        if user_id not in (appointment.patient_id, appointment.doctor_id):
            return None
        return RoomInfo(consultation.id, appointment.id, appointment.patient_id, appointment.doctor_id)


def record_presence(consultation_id: int, both_present: bool) -> None:
    """Moves the consultation to ACTIVE the first time both participants are in the room."""
    if not both_present:
        return
    with SessionLocal() as db:
        consultation = db.get(Consultation, consultation_id)
        if consultation and consultation.status == ConsultationStatus.WAITING:
            consultation.status = ConsultationStatus.ACTIVE
            consultation.started_at = utcnow()
            db.commit()


def end_consultation(consultation_id: int, user_id: int) -> None:
    with SessionLocal() as db:
        consultation = db.scalar(
            select(Consultation).where(Consultation.id == consultation_id).with_for_update()
        )
        if consultation is None or consultation.status == ConsultationStatus.ENDED:
            return
        consultation.status = ConsultationStatus.ENDED
        consultation.ended_at = utcnow()
        consultation.ended_by_id = user_id
        appointment = consultation.appointment
        appointment.status = AppointmentStatus.COMPLETED

        ended_by = db.get(User, user_id)
        other_id = other_participant_id(appointment, user_id)
        area = "doctor" if other_id == appointment.doctor_id else "patient"
        notify(
            db,
            other_id,
            type="consultation_ended",
            title="Consultation ended",
            message=f"{ended_by.display_name} ended the consultation.",
            link=f"/{area}/appointments/{appointment.id}",
        )
