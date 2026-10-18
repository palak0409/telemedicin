"""
Appointment booking and lifecycle.

    pending ──accept──▶ confirmed ──consultation ends──▶ completed
       │                    │
       ├──reject──▶ rejected│
       └──cancel──▶ cancelled ◀──cancel──┘

Pending and confirmed appointments both hold the doctor's slot, so a slot can
never be requested twice while the doctor is still deciding.
"""
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.dates import clinic_today, format_clinic_time, to_clinic_date, utcnow
from app.core.errors import bad_request, conflict, not_found
from app.features.appointments.models import BLOCKING_STATUSES, Appointment, AppointmentStatus
from app.features.appointments.schemas import (
    AppointmentCreate,
    AppointmentDetail,
    AppointmentOut,
    ConsultationBrief,
    PatientClinicalInfo,
    doctor_brief,
)
from app.features.consultations.models import Consultation
from app.features.consultations.service import can_join
from app.features.doctors import service as doctors_service
from app.features.doctors.models import DoctorProfile
from app.features.notifications.service import notify
from app.features.patients.schemas import MedicalProfileOut
from app.features.patients.service import age_from
from app.features.users.models import User, UserRole
from app.features.users.schemas import PersonSummary

LOAD_RELATED = (
    selectinload(Appointment.patient).selectinload(User.patient_profile),
    selectinload(Appointment.doctor).selectinload(User.doctor_profile).selectinload(DoctorProfile.specialization),
    selectinload(Appointment.consultation).selectinload(Consultation.documentation),
)


def to_out(appointment: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=appointment.id,
        start_time=appointment.start_time,
        end_time=appointment.end_time,
        reason=appointment.reason,
        status=appointment.status,
        status_note=appointment.status_note,
        cancelled_by_id=appointment.cancelled_by_id,
        created_at=appointment.created_at,
        patient=PersonSummary.model_validate(appointment.patient),
        doctor=doctor_brief(appointment),
        consultation=(
            ConsultationBrief.model_validate(appointment.consultation) if appointment.consultation else None
        ),
        can_join=can_join(appointment, utcnow()),
    )


def to_detail(appointment: Appointment, viewer: User) -> AppointmentDetail:
    profile = appointment.doctor.doctor_profile
    patient_info = None
    if viewer.id == appointment.doctor_id:
        patient = appointment.patient
        medical = patient.patient_profile
        patient_info = PatientClinicalInfo(
            age=age_from(medical.date_of_birth) if medical else None,
            gender=medical.gender if medical else None,
            phone=patient.phone,
            medical=MedicalProfileOut.model_validate(medical) if medical else None,
        )
    return AppointmentDetail(
        **to_out(appointment).model_dump(),
        consultation_fee=profile.consultation_fee if profile else None,
        duration_minutes=int((appointment.end_time - appointment.start_time).total_seconds() // 60),
        patient_info=patient_info,
    )


# --- Queries ------------------------------------------------------------------


def get_for_user(db: Session, user: User, appointment_id: int) -> Appointment:
    appointment = db.scalar(
        select(Appointment).where(Appointment.id == appointment_id).options(*LOAD_RELATED)
    )
    if appointment is None:
        raise not_found("Appointment")
    if user.role != UserRole.ADMIN and user.id not in (appointment.patient_id, appointment.doctor_id):
        raise not_found("Appointment")
    return appointment


def list_for_user(
    db: Session,
    user: User,
    *,
    scope: str,
    status: AppointmentStatus | None,
    limit: int,
    offset: int,
) -> tuple[list[Appointment], int]:
    """
    `upcoming`: pending/confirmed appointments that have not finished (including
    the join grace period). `past`: everything else — finished, rejected, cancelled.
    """
    owner = Appointment.doctor_id if user.role == UserRole.DOCTOR else Appointment.patient_id
    stmt = select(Appointment).where(owner == user.id)

    grace = timedelta(minutes=settings.consultation_join_window_minutes)
    still_open = Appointment.end_time >= utcnow() - grace
    if scope == "upcoming":
        stmt = stmt.where(Appointment.status.in_(BLOCKING_STATUSES), still_open)
        order = Appointment.start_time.asc()
    elif scope == "past":
        stmt = stmt.where(or_(Appointment.status.not_in(BLOCKING_STATUSES), ~still_open))
        order = Appointment.start_time.desc()
    else:
        order = Appointment.start_time.desc()

    if status:
        stmt = stmt.where(Appointment.status == status)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.options(*LOAD_RELATED).order_by(order).limit(limit).offset(offset)).all()
    return list(items), total


# --- Commands -----------------------------------------------------------------


def book(db: Session, patient: User, data: AppointmentCreate) -> Appointment:
    """
    Books a slot for the patient.

    Double-booking prevention: the doctor's profile row is locked with
    SELECT … FOR UPDATE before the slot is checked. Concurrent requests for the
    same doctor therefore run one after another, and the second one sees the
    first one's appointment and is rejected with 409.
    """
    start = data.start_time
    if start <= utcnow():
        raise bad_request("Please choose a time in the future.")
    if to_clinic_date(start) > clinic_today() + timedelta(days=settings.booking_horizon_days):
        raise bad_request(f"Appointments can be booked up to {settings.booking_horizon_days} days ahead.")

    db.execute(
        select(DoctorProfile.id).where(DoctorProfile.user_id == data.doctor_id).with_for_update()
    )
    profile = doctors_service.get_profile(db, data.doctor_id)  # 404 unless verified & active

    slot = doctors_service.find_bookable_slot(db, profile, start)
    if slot is None:
        raise conflict("This time slot is no longer available. Please choose another time.")

    patient_clash = db.scalar(
        select(Appointment.id)
        .where(
            Appointment.patient_id == patient.id,
            Appointment.status.in_(BLOCKING_STATUSES),
            Appointment.start_time < slot["end"],
            Appointment.end_time > slot["start"],
        )
        .limit(1)
    )
    if patient_clash:
        raise conflict("You already have another appointment at this time.")

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=profile.user_id,
        start_time=slot["start"],
        end_time=slot["end"],
        reason=data.reason,
        status=AppointmentStatus.PENDING,
    )
    db.add(appointment)
    db.flush()

    notify(
        db,
        profile.user_id,
        type="appointment_requested",
        title="New appointment request",
        message=f"{patient.full_name} requested a consultation on {format_clinic_time(start)}.",
        link=f"/doctor/appointments/{appointment.id}",
    )
    return get_for_user(db, patient, appointment.id)


def _lock(db: Session, appointment_id: int) -> Appointment | None:
    """Row lock so that e.g. an accept and a cancel cannot both succeed."""
    return db.scalar(select(Appointment).where(Appointment.id == appointment_id).with_for_update())


def accept(db: Session, doctor: User, appointment_id: int) -> Appointment:
    appointment = _lock(db, appointment_id)
    if appointment is None or appointment.doctor_id != doctor.id:
        raise not_found("Appointment")
    if appointment.status != AppointmentStatus.PENDING:
        raise conflict(f"This appointment is already {appointment.status.value}.")
    if appointment.start_time <= utcnow():
        raise conflict("This appointment's start time has already passed.")

    appointment.status = AppointmentStatus.CONFIRMED
    notify(
        db,
        appointment.patient_id,
        type="appointment_confirmed",
        title="Appointment confirmed",
        message=f"{doctor.display_name} confirmed your appointment on {format_clinic_time(appointment.start_time)}.",
        link=f"/patient/appointments/{appointment.id}",
    )
    return get_for_user(db, doctor, appointment.id)


def reject(db: Session, doctor: User, appointment_id: int, reason: str | None) -> Appointment:
    appointment = _lock(db, appointment_id)
    if appointment is None or appointment.doctor_id != doctor.id:
        raise not_found("Appointment")
    if appointment.status != AppointmentStatus.PENDING:
        raise conflict(f"This appointment is already {appointment.status.value}.")

    appointment.status = AppointmentStatus.REJECTED
    appointment.status_note = reason
    suffix = f" Reason: {reason}" if reason else ""
    notify(
        db,
        appointment.patient_id,
        type="appointment_rejected",
        title="Appointment request declined",
        message=(
            f"{doctor.display_name} could not accept your request for "
            f"{format_clinic_time(appointment.start_time)}.{suffix}"
        ),
        link=f"/patient/appointments/{appointment.id}",
    )
    return get_for_user(db, doctor, appointment.id)


def cancel(db: Session, user: User, appointment_id: int, reason: str | None) -> Appointment:
    """Patients, doctors (for their own appointments) and admins can cancel before the start time."""
    appointment = _lock(db, appointment_id)
    if appointment is None:
        raise not_found("Appointment")
    is_participant = user.id in (appointment.patient_id, appointment.doctor_id)
    if not is_participant and user.role != UserRole.ADMIN:
        raise not_found("Appointment")
    if appointment.status not in BLOCKING_STATUSES:
        raise conflict(f"This appointment is already {appointment.status.value}.")
    if appointment.start_time <= utcnow():
        raise conflict("Appointments cannot be cancelled after they have started.")

    appointment.status = AppointmentStatus.CANCELLED
    appointment.status_note = reason
    appointment.cancelled_by_id = user.id

    db.commit()

    cancelled_by = user.display_name if is_participant else "The clinic"
    suffix = f" Reason: {reason}" if reason else ""
    message = f"{cancelled_by} cancelled the appointment on {format_clinic_time(appointment.start_time)}.{suffix}"
    for recipient_id, area in ((appointment.patient_id, "patient"), (appointment.doctor_id, "doctor")):
        if recipient_id != user.id:
            notify(
                db,
                recipient_id,
                type="appointment_cancelled",
                title="Appointment cancelled",
                message=message,
                link=f"/{area}/appointments/{appointment.id}",
            )
    return get_for_user(db, user, appointment.id)
