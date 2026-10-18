from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dates import clinic_today
from app.core.errors import bad_request
from app.core.schemas import Page
from app.database.session import get_db
from app.features.auth.dependencies import CurrentUser, DoctorUser
from app.features.doctors import service
from app.features.doctors.models import Specialization
from app.features.doctors.schemas import (
    AvailabilityOut,
    AvailabilityUpdate,
    DoctorDetail,
    DoctorOwnProfile,
    DoctorProfileUpdate,
    DoctorSummary,
    SlotCalendarOut,
    SpecializationOut,
    TimeOffIn,
    TimeOffOut,
    detail_fields,
)
from app.features.users.models import UserRole

router = APIRouter(prefix="/doctors", tags=["doctors"])
specializations_router = APIRouter(prefix="/specializations", tags=["specializations"])
DB = Annotated[Session, Depends(get_db)]


@specializations_router.get("", response_model=list[SpecializationOut])
def list_specializations(db: DB):
    """Public: needed by the registration form before the user has an account."""
    return db.scalars(
        select(Specialization).where(Specialization.is_active.is_(True)).order_by(Specialization.name)
    ).all()


# --- Discovery ------------------------------------------------------------------


@router.get("", response_model=Page[DoctorSummary])
def search_doctors(
    user: CurrentUser,
    db: DB,
    q: Annotated[str | None, Query(max_length=100)] = None,
    specialization_id: int | None = None,
    language: Annotated[str | None, Query(max_length=40)] = None,
    min_experience: Annotated[int | None, Query(ge=0, le=70)] = None,
    available: Literal["today", "week"] | None = None,
    sort: Literal["name", "experience", "fee_low", "fee_high", "availability"] = "name",
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = service.search_doctors(
        db,
        q=q.strip() if q else None,
        specialization_id=specialization_id,
        language=language,
        min_experience=min_experience,
        available=available,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return Page(items=items, total=total)


@router.get("/languages", response_model=list[str])
def list_languages(user: CurrentUser, db: DB):
    return service.available_languages(db)


# --- The signed-in doctor's own profile ---------------------------------------
# Declared before /{doctor_id} so "me" is not parsed as an id.


def _own_profile_out(db: Session, user) -> DoctorOwnProfile:
    profile = service.get_profile(db, user.id, bookable_only=False)
    return DoctorOwnProfile(
        **detail_fields(profile),
        verification_note=profile.verification_note,
        verified_at=profile.verified_at,
        next_available_at=service.next_available(db, [profile]).get(user.id),
    )


@router.get("/me/profile", response_model=DoctorOwnProfile)
def get_my_profile(user: DoctorUser, db: DB):
    return _own_profile_out(db, user)


@router.put("/me/profile", response_model=DoctorOwnProfile)
def update_my_profile(data: DoctorProfileUpdate, user: DoctorUser, db: DB):
    profile = service.get_profile(db, user.id, bookable_only=False)
    service.update_profile(db, profile, data)
    return _own_profile_out(db, user)


@router.get("/me/availability", response_model=AvailabilityOut)
def get_my_availability(user: DoctorUser, db: DB):
    profile = service.get_profile(db, user.id, bookable_only=False)
    return service.availability_out(db, profile)


@router.put("/me/availability", response_model=AvailabilityOut)
def update_my_availability(data: AvailabilityUpdate, user: DoctorUser, db: DB):
    profile = service.get_profile(db, user.id, bookable_only=False)
    service.replace_availability(db, profile, data)
    return service.availability_out(db, profile)


@router.post("/me/time-off", response_model=TimeOffOut, status_code=status.HTTP_201_CREATED)
def add_time_off(data: TimeOffIn, user: DoctorUser, db: DB):
    profile = service.get_profile(db, user.id, bookable_only=False)
    return service.add_time_off(db, profile, data)


@router.delete("/me/time-off/{time_off_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_off(time_off_id: int, user: DoctorUser, db: DB):
    profile = service.get_profile(db, user.id, bookable_only=False)
    service.delete_time_off(db, profile, time_off_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Public doctor profile & slots ------------------------------------------


@router.get("/{doctor_id}", response_model=DoctorDetail)
def get_doctor(doctor_id: int, user: CurrentUser, db: DB):
    profile = service.get_profile(db, doctor_id)
    return DoctorDetail(
        **detail_fields(profile),
        next_available_at=service.next_available(db, [profile]).get(doctor_id),
    )


@router.get("/{doctor_id}/slots", response_model=SlotCalendarOut)
def get_slots(
    doctor_id: int,
    user: CurrentUser,
    db: DB,
    start_date: date | None = None,
    days: Annotated[int, Query(ge=1, le=service.MAX_CALENDAR_DAYS)] = 7,
):
    """
    Bookable slots for `days` consecutive clinic-local dates. Doctors may preview
    their own calendar even before they are verified.
    """
    is_self = user.role == UserRole.DOCTOR and user.id == doctor_id
    profile = service.get_profile(db, doctor_id, bookable_only=not is_self)

    today = clinic_today()
    start_date = start_date or today
    if start_date < today:
        raise bad_request("Start date cannot be in the past.")
    horizon_end = today + timedelta(days=settings.booking_horizon_days)
    if start_date > horizon_end:
        raise bad_request(f"Appointments can be booked up to {settings.booking_horizon_days} days ahead.")
    days = min(days, (horizon_end - start_date).days + 1)

    return SlotCalendarOut(
        clinic_timezone=settings.clinic_timezone,
        duration_minutes=profile.consultation_duration_minutes,
        days=service.build_calendar(db, profile, start_date, days),
    )
