"""Registration and login. New doctors start as PENDING until an admin verifies them."""
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict
from app.core.security import create_access_token, hash_password, verify_password
from app.features.auth.schemas import AuthResponse, DoctorRegister, PatientRegister
from app.features.doctors.models import DoctorProfile, Specialization, VerificationStatus
from app.features.notifications.service import notify_many
from app.features.patients.models import PatientProfile
from app.features.users.models import User, UserRole
from app.features.users.schemas import UserOut


def auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.from_user(user),
    )


def _ensure_email_available(db: Session, email: str) -> None:
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("An account with this email already exists.")


def _commit_new_user(db: Session, user: User) -> User:
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict("An account with this email or license number already exists.")
    return user


def register_patient(db: Session, data: PatientRegister) -> User:
    email = data.email.lower()
    _ensure_email_available(db, email)
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        role=UserRole.PATIENT,
        full_name=data.full_name,
        phone=data.phone,
        patient_profile=PatientProfile(),
    )
    return _commit_new_user(db, user)


def register_doctor(db: Session, data: DoctorRegister) -> User:
    email = data.email.lower()
    _ensure_email_available(db, email)

    specialization = db.get(Specialization, data.specialization_id)
    if not specialization or not specialization.is_active:
        raise bad_request("Please choose a valid specialization.")
    if db.scalar(select(DoctorProfile.id).where(DoctorProfile.license_number == data.license_number)):
        raise conflict("This license / registration number is already registered.")

    user = User(
        email=email,
        password_hash=hash_password(data.password),
        role=UserRole.DOCTOR,
        full_name=data.full_name,
        phone=data.phone,
        doctor_profile=DoctorProfile(
            specialization_id=specialization.id,
            license_number=data.license_number,
            qualifications=data.qualifications,
            years_of_practice=data.years_of_practice,
            languages=[],
            verification_status=VerificationStatus.PENDING,
        ),
    )
    _commit_new_user(db, user)

    admin_ids = db.scalars(
        select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    ).all()
    notify_many(
        db,
        admin_ids,
        type="doctor_registered",
        title="New doctor awaiting verification",
        message=f"{user.full_name} ({specialization.name}) registered and needs verification.",
        link=f"/admin/doctors/{user.id}",
    )
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This account has been deactivated. Contact the clinic."
        )
    return user
