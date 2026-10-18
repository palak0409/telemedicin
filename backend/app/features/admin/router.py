"""Platform administration. Every route requires the admin role (router-level dependency)."""
from datetime import date, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.dates import clinic_datetime, clinic_today, utcnow
from app.core.errors import bad_request, conflict, not_found
from app.core.schemas import Page
from app.database.session import get_db
from app.features.admin.schemas import (
    AdminAppointmentRow,
    AdminConsultationRow,
    AdminDoctorDetail,
    AdminDoctorRow,
    AdminPatientRow,
    AdminStats,
    PartyRef,
    SpecializationAdminOut,
    SpecializationIn,
    UserStatusUpdate,
    VerificationUpdate,
)
from app.features.appointments import service as appointments_service
from app.features.appointments.models import BLOCKING_STATUSES, Appointment, AppointmentStatus
from app.features.appointments.schemas import StatusReason
from app.features.auth.dependencies import AdminUser, require_roles
from app.features.consultations.models import Consultation, ConsultationStatus
from app.features.doctors import service as doctors_service
from app.features.doctors.models import DoctorProfile, Specialization, VerificationStatus
from app.features.doctors.schemas import detail_fields
from app.features.notifications.service import notify
from app.features.users.models import User, UserRole

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles(UserRole.ADMIN))]
)
DB = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def _count(db: Session, stmt) -> int:
    return db.scalar(select(func.count()).select_from(stmt.subquery()))


# --- Dashboard ----------------------------------------------------------------


@router.get("/stats", response_model=AdminStats)
def stats(db: DB):
    today = clinic_today()
    day_start = clinic_datetime(today, time.min)
    day_end = clinic_datetime(today + timedelta(days=1), time.min)
    now = utcnow()

    def count(*where, model=Appointment) -> int:
        return db.scalar(select(func.count()).select_from(model).where(*where))

    return AdminStats(
        patients=count(User.role == UserRole.PATIENT, model=User),
        doctors_verified=count(DoctorProfile.verification_status == VerificationStatus.VERIFIED, model=DoctorProfile),
        doctors_pending=count(DoctorProfile.verification_status == VerificationStatus.PENDING, model=DoctorProfile),
        appointments_today=count(
            Appointment.start_time >= day_start,
            Appointment.start_time < day_end,
            Appointment.status.in_((*BLOCKING_STATUSES, AppointmentStatus.COMPLETED)),
        ),
        appointments_pending=count(Appointment.status == AppointmentStatus.PENDING, Appointment.start_time > now),
        appointments_upcoming=count(Appointment.status == AppointmentStatus.CONFIRMED, Appointment.start_time > now),
        consultations_active=count(
            Consultation.status.in_((ConsultationStatus.WAITING, ConsultationStatus.ACTIVE)), model=Consultation
        ),
        consultations_completed=count(Consultation.status == ConsultationStatus.ENDED, model=Consultation),
    )


# --- Doctors ------------------------------------------------------------------


@router.get("/doctors", response_model=Page[AdminDoctorRow])
def list_doctors(
    db: DB,
    status_filter: Annotated[VerificationStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    stmt = select(DoctorProfile).join(DoctorProfile.user).join(DoctorProfile.specialization)
    if status_filter:
        stmt = stmt.where(DoctorProfile.verification_status == status_filter)
    if q:
        stmt = stmt.where(
            or_(
                User.full_name.contains(q, autoescape=True),
                User.email.contains(q, autoescape=True),
                DoctorProfile.license_number.contains(q, autoescape=True),
            )
        )
    total = _count(db, stmt)
    profiles = db.scalars(
        stmt.options(selectinload(DoctorProfile.user), selectinload(DoctorProfile.specialization))
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        AdminDoctorRow(
            id=p.user.id,
            full_name=p.user.full_name,
            email=p.user.email,
            photo_url=p.user.photo_url,
            is_active=p.user.is_active,
            specialization=p.specialization.name,
            license_number=p.license_number,
            years_of_practice=p.years_of_practice,
            verification_status=p.verification_status,
            created_at=p.user.created_at,
        )
        for p in profiles
    ]
    return Page(items=items, total=total)


def _doctor_detail(db: Session, doctor_id: int) -> AdminDoctorDetail:
    profile = doctors_service.get_profile(db, doctor_id, bookable_only=False)
    user = profile.user
    return AdminDoctorDetail(
        **detail_fields(profile),
        email=user.email,
        phone=user.phone,
        is_active=user.is_active,
        created_at=user.created_at,
        verification_note=profile.verification_note,
        verified_at=profile.verified_at,
        appointment_count=db.scalar(
            select(func.count()).where(Appointment.doctor_id == user.id)
        ),
    )


@router.get("/doctors/{doctor_id}", response_model=AdminDoctorDetail)
def get_doctor(doctor_id: int, db: DB):
    return _doctor_detail(db, doctor_id)


VERIFICATION_MESSAGES = {
    VerificationStatus.VERIFIED: ("Profile verified", "Your profile has been verified. Patients can now find and book you."),
    VerificationStatus.REJECTED: ("Verification declined", "Your profile could not be verified."),
    VerificationStatus.SUSPENDED: ("Profile suspended", "Your profile has been suspended and is hidden from patients."),
    VerificationStatus.PENDING: ("Verification pending", "Your profile has been returned to pending review."),
}


@router.patch("/doctors/{doctor_id}/verification", response_model=AdminDoctorDetail)
def update_verification(doctor_id: int, data: VerificationUpdate, db: DB):
    """Moves a doctor through pending → verified / rejected / suspended and notifies them."""
    profile = doctors_service.get_profile(db, doctor_id, bookable_only=False)
    profile.verification_status = data.status
    profile.verification_note = data.note
    profile.verified_at = utcnow() if data.status == VerificationStatus.VERIFIED else None

    title, message = VERIFICATION_MESSAGES[data.status]
    if data.note:
        message = f"{message} Note: {data.note}"
    notify(db, doctor_id, type="verification_updated", title=title, message=message, link="/doctor/profile")
    return _doctor_detail(db, doctor_id)


@router.patch("/users/{user_id}/status", status_code=status.HTTP_204_NO_CONTENT)
def update_user_status(user_id: int, data: UserStatusUpdate, admin: AdminUser, db: DB):
    """Deactivated users cannot sign in, and their existing tokens stop working immediately."""
    user = db.get(User, user_id)
    if user is None:
        raise not_found("User")
    if user.role == UserRole.ADMIN:
        raise bad_request("Administrator accounts cannot be deactivated here.")
    user.is_active = data.is_active
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Patients -----------------------------------------------------------------


@router.get("/patients", response_model=Page[AdminPatientRow])
def list_patients(
    db: DB, q: Annotated[str | None, Query(max_length=100)] = None, limit: Limit = 20, offset: Offset = 0
):
    stmt = select(User).where(User.role == UserRole.PATIENT)
    if q:
        stmt = stmt.where(or_(User.full_name.contains(q, autoescape=True), User.email.contains(q, autoescape=True)))
    total = _count(db, stmt)
    users = db.scalars(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)).all()

    counts = dict(
        db.execute(
            select(Appointment.patient_id, func.count())
            .where(Appointment.patient_id.in_([u.id for u in users]))
            .group_by(Appointment.patient_id)
        ).all()
    )
    items = [
        AdminPatientRow(
            id=u.id,
            full_name=u.full_name,
            email=u.email,
            phone=u.phone,
            photo_url=u.photo_url,
            is_active=u.is_active,
            created_at=u.created_at,
            appointment_count=counts.get(u.id, 0),
        )
        for u in users
    ]
    return Page(items=items, total=total)


# --- Appointments -------------------------------------------------------------


def _party(user: User) -> PartyRef:
    return PartyRef(id=user.id, full_name=user.full_name)


@router.get("/appointments", response_model=Page[AdminAppointmentRow])
def list_appointments(
    db: DB,
    status_filter: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    stmt = select(Appointment)
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    if date_from:
        stmt = stmt.where(Appointment.start_time >= clinic_datetime(date_from, time.min))
    if date_to:
        stmt = stmt.where(Appointment.start_time < clinic_datetime(date_to + timedelta(days=1), time.min))
    if q:
        matching_users = select(User.id).where(User.full_name.contains(q, autoescape=True))
        stmt = stmt.where(
            or_(Appointment.patient_id.in_(matching_users), Appointment.doctor_id.in_(matching_users))
        )
    total = _count(db, stmt)
    appointments = db.scalars(
        stmt.options(*appointments_service.LOAD_RELATED)
        .order_by(Appointment.start_time.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        AdminAppointmentRow(
            id=a.id,
            start_time=a.start_time,
            end_time=a.end_time,
            status=a.status,
            status_note=a.status_note,
            created_at=a.created_at,
            patient=_party(a.patient),
            doctor=_party(a.doctor),
            specialization=a.doctor.doctor_profile.specialization.name if a.doctor.doctor_profile else None,
            consultation_status=a.consultation.status if a.consultation else None,
        )
        for a in appointments
    ]
    return Page(items=items, total=total)


@router.post("/appointments/{appointment_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_appointment(appointment_id: int, data: StatusReason, admin: AdminUser, db: DB):
    appointments_service.cancel(db, admin, appointment_id, data.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Consultations ------------------------------------------------------------


@router.get("/consultations", response_model=Page[AdminConsultationRow])
def list_consultations(
    db: DB,
    status_filter: Annotated[ConsultationStatus | None, Query(alias="status")] = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    stmt = select(Consultation).join(Consultation.appointment)
    if status_filter:
        stmt = stmt.where(Consultation.status == status_filter)
    total = _count(db, stmt)
    consultations = db.scalars(
        stmt.options(
            selectinload(Consultation.appointment).selectinload(Appointment.patient),
            selectinload(Consultation.appointment).selectinload(Appointment.doctor),
        )
        .order_by(Appointment.start_time.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        AdminConsultationRow(
            id=c.id,
            room_id=c.room_id,
            status=c.status,
            started_at=c.started_at,
            ended_at=c.ended_at,
            duration_seconds=c.duration_seconds,
            appointment_id=c.appointment_id,
            scheduled_start=c.appointment.start_time,
            patient=_party(c.appointment.patient),
            doctor=_party(c.appointment.doctor),
        )
        for c in consultations
    ]
    return Page(items=items, total=total)


# --- Specializations ----------------------------------------------------------


def _specialization_out(db: Session, specialization: Specialization) -> SpecializationAdminOut:
    doctor_count = db.scalar(
        select(func.count()).where(DoctorProfile.specialization_id == specialization.id)
    )
    return SpecializationAdminOut(
        id=specialization.id,
        name=specialization.name,
        description=specialization.description,
        is_active=specialization.is_active,
        doctor_count=doctor_count,
    )


@router.get("/specializations", response_model=list[SpecializationAdminOut])
def list_specializations(db: DB):
    counts = dict(
        db.execute(
            select(DoctorProfile.specialization_id, func.count()).group_by(DoctorProfile.specialization_id)
        ).all()
    )
    return [
        SpecializationAdminOut(
            id=s.id, name=s.name, description=s.description, is_active=s.is_active, doctor_count=counts.get(s.id, 0)
        )
        for s in db.scalars(select(Specialization).order_by(Specialization.name)).all()
    ]


def _save_specialization(db: Session, specialization: Specialization) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict("A specialization with this name already exists.")


@router.post("/specializations", response_model=SpecializationAdminOut, status_code=status.HTTP_201_CREATED)
def create_specialization(data: SpecializationIn, db: DB):
    specialization = Specialization(**data.model_dump())
    db.add(specialization)
    _save_specialization(db, specialization)
    return _specialization_out(db, specialization)


@router.put("/specializations/{specialization_id}", response_model=SpecializationAdminOut)
def update_specialization(specialization_id: int, data: SpecializationIn, db: DB):
    specialization = db.get(Specialization, specialization_id)
    if specialization is None:
        raise not_found("Specialization")
    for field, value in data.model_dump().items():
        setattr(specialization, field, value)
    _save_specialization(db, specialization)
    return _specialization_out(db, specialization)


@router.delete("/specializations/{specialization_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_specialization(specialization_id: int, db: DB):
    """Only unused specializations can be deleted; used ones should be deactivated instead."""
    specialization = db.get(Specialization, specialization_id)
    if specialization is None:
        raise not_found("Specialization")
    if db.scalar(select(func.count()).where(DoctorProfile.specialization_id == specialization_id)):
        raise conflict("Doctors are assigned to this specialization. Deactivate it instead of deleting.")
    db.delete(specialization)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
