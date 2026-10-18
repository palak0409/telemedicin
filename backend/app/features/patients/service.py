"""
Patient medical information and the rule for who may read it.

A doctor may view a patient's medical profile only while a care relationship
exists: at least one pending, confirmed or completed appointment between them.
Rejected or cancelled requests do not grant access.
"""
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.dates import utcnow
from app.core.errors import not_found
from app.features.appointments.models import Appointment, AppointmentStatus
from app.features.patients.models import PatientProfile
from app.features.patients.schemas import MedicalProfileIn, PatientListItem
from app.features.users.models import User, UserRole

CARE_STATUSES = (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED)


def age_from(date_of_birth: date | None) -> int | None:
    if date_of_birth is None:
        return None
    today = date.today()
    return today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))


def get_or_create_profile(db: Session, user: User) -> PatientProfile:
    if user.patient_profile is None:
        user.patient_profile = PatientProfile()
        db.commit()
    return user.patient_profile


def update_profile(db: Session, user: User, data: MedicalProfileIn) -> PatientProfile:
    profile = get_or_create_profile(db, user)
    for field, value in data.model_dump().items():
        setattr(profile, field, value)
    db.commit()
    return profile


def has_care_relationship(db: Session, doctor_id: int, patient_id: int) -> bool:
    return (
        db.scalar(
            select(Appointment.id)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.patient_id == patient_id,
                Appointment.status.in_(CARE_STATUSES),
            )
            .limit(1)
        )
        is not None
    )


def get_patient_for_doctor(db: Session, doctor_id: int, patient_id: int) -> User:
    patient = db.get(User, patient_id)
    # 404 rather than 403 so doctors cannot probe which patient ids exist.
    if patient is None or patient.role != UserRole.PATIENT or not has_care_relationship(db, doctor_id, patient_id):
        raise not_found("Patient")
    return patient


def patients_of_doctor(db: Session, doctor_id: int, q: str | None) -> list[PatientListItem]:
    now = utcnow()
    stmt = (
        select(
            User,
            PatientProfile.date_of_birth,
            PatientProfile.gender,
            func.count(Appointment.id),
            func.max(case((Appointment.start_time < now, Appointment.start_time))),
            func.min(case((Appointment.start_time >= now, Appointment.start_time))),
        )
        .join(Appointment, Appointment.patient_id == User.id)
        .outerjoin(PatientProfile, PatientProfile.user_id == User.id)
        .where(Appointment.doctor_id == doctor_id, Appointment.status.in_(CARE_STATUSES))
        .group_by(User.id, PatientProfile.date_of_birth, PatientProfile.gender)
        .order_by(User.full_name)
    )
    if q:
        stmt = stmt.where(User.full_name.contains(q, autoescape=True))

    return [
        PatientListItem(
            id=user.id,
            full_name=user.full_name,
            photo_url=user.photo_url,
            gender=gender,
            age=age_from(dob),
            total_appointments=total,
            last_visit_at=last_visit,
            next_appointment_at=next_appointment,
        )
        for user, dob, gender, total, last_visit, next_appointment in db.execute(stmt).all()
    ]
