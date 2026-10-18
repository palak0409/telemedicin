"""Doctor discovery, professional profiles, weekly availability and slot calendars."""
import json
from collections import defaultdict
from dataclasses import asdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.core.config import settings
from app.core.dates import clinic_datetime, clinic_today, to_clinic_date, utcnow
from app.core.errors import bad_request, conflict, not_found
from app.features.appointments.models import BLOCKING_STATUSES, Appointment
from app.features.doctors import slots as slot_engine
from app.features.doctors.models import (
    AvailabilityRule,
    DoctorProfile,
    Specialization,
    TimeOff,
    VerificationStatus,
)
from app.features.doctors.schemas import (
    AvailabilityOut,
    AvailabilityUpdate,
    DoctorProfileUpdate,
    DoctorSummary,
    TimeOffIn,
    summary_fields,
)
from app.features.notifications.service import notify_many
from app.features.users.models import User, UserRole

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NEXT_AVAILABLE_HORIZON_DAYS = 14
MAX_CALENDAR_DAYS = 14


def _profile_query():
    return (
        select(DoctorProfile)
        .join(DoctorProfile.user)
        .join(DoctorProfile.specialization)
        .options(
            contains_eager(DoctorProfile.user),
            contains_eager(DoctorProfile.specialization),
            selectinload(DoctorProfile.availability_rules),
        )
    )


def _bookable(stmt):
    return stmt.where(
        DoctorProfile.verification_status == VerificationStatus.VERIFIED, User.is_active.is_(True)
    )


def get_profile(db: Session, doctor_id: int, *, bookable_only: bool = True) -> DoctorProfile:
    stmt = _profile_query().where(DoctorProfile.user_id == doctor_id)
    profile = db.scalar(_bookable(stmt) if bookable_only else stmt)
    if profile is None:
        raise not_found("Doctor")
    return profile


# --- Slot calendar ------------------------------------------------------------


def _clinic_days_to_utc(first: date, last: date) -> tuple[datetime, datetime]:
    """UTC range covering the clinic-local days first..last inclusive."""
    return clinic_datetime(first, time.min), clinic_datetime(last + timedelta(days=1), time.min)


def _busy_intervals(db: Session, doctor_ids: list[int], start: datetime, end: datetime):
    rows = db.execute(
        select(Appointment.doctor_id, Appointment.start_time, Appointment.end_time).where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.status.in_(BLOCKING_STATUSES),
            Appointment.start_time < end,
            Appointment.end_time > start,
        )
    ).all()
    busy = defaultdict(list)
    for doctor_id, starts, ends in rows:
        busy[doctor_id].append((starts, ends))
    return busy


def _time_off_dates(db: Session, profile_ids: list[int], first: date, last: date):
    rows = db.execute(
        select(TimeOff.doctor_id, TimeOff.date).where(
            TimeOff.doctor_id.in_(profile_ids), TimeOff.date.between(first, last)
        )
    ).all()
    dates = defaultdict(set)
    for profile_id, day in rows:
        dates[profile_id].add(day)
    return dates


def _windows_by_weekday(profile: DoctorProfile) -> dict[int, list[tuple[time, time]]]:
    windows = defaultdict(list)
    for rule in profile.availability_rules:
        windows[rule.day_of_week].append((rule.start_time, rule.end_time))
    return windows


def build_calendar(db: Session, profile: DoctorProfile, start_date: date, days: int) -> list[dict]:
    last = start_date + timedelta(days=days - 1)
    range_start, range_end = _clinic_days_to_utc(start_date, last)
    busy = _busy_intervals(db, [profile.user_id], range_start, range_end)[profile.user_id]
    time_off = _time_off_dates(db, [profile.id], start_date, last)[profile.id]
    windows = _windows_by_weekday(profile)
    now = utcnow()

    calendar = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        is_off = day in time_off
        slots = (
            []
            if is_off
            else slot_engine.generate_day_slots(
                day,
                windows.get(day.weekday(), []),
                profile.consultation_duration_minutes,
                busy,
                now,
                settings.tz,
            )
        )
        calendar.append({"date": day, "is_time_off": is_off, "slots": [asdict(s) for s in slots]})
    return calendar


def find_bookable_slot(db: Session, profile: DoctorProfile, start: datetime) -> dict | None:
    """Returns the slot starting exactly at `start` if it exists and is free, else None."""
    day = build_calendar(db, profile, to_clinic_date(start), 1)[0]
    return next((s for s in day["slots"] if s["start"] == start and s["available"]), None)


def next_available(db: Session, profiles: list[DoctorProfile]) -> dict[int, datetime | None]:
    """Earliest free slot in the next two weeks for each doctor, keyed by doctor user id."""
    if not profiles:
        return {}
    first = clinic_today()
    last = first + timedelta(days=NEXT_AVAILABLE_HORIZON_DAYS - 1)
    range_start, range_end = _clinic_days_to_utc(first, last)
    busy = _busy_intervals(db, [p.user_id for p in profiles], range_start, range_end)
    time_off = _time_off_dates(db, [p.id for p in profiles], first, last)
    now = utcnow()

    result: dict[int, datetime | None] = {}
    for profile in profiles:
        result[profile.user_id] = None
        windows = _windows_by_weekday(profile)
        for offset in range(NEXT_AVAILABLE_HORIZON_DAYS):
            day = first + timedelta(days=offset)
            if day in time_off[profile.id] or day.weekday() not in windows:
                continue
            free = next(
                (
                    slot
                    for slot in slot_engine.generate_day_slots(
                        day,
                        windows[day.weekday()],
                        profile.consultation_duration_minutes,
                        busy[profile.user_id],
                        now,
                        settings.tz,
                    )
                    if slot.available
                ),
                None,
            )
            if free:
                result[profile.user_id] = free.start
                break
    return result


# --- Discovery ----------------------------------------------------------------


def search_doctors(
    db: Session,
    *,
    q: str | None,
    specialization_id: int | None,
    language: str | None,
    min_experience: int | None,
    available: str | None,
    sort: str,
    limit: int,
    offset: int,
) -> tuple[list[DoctorSummary], int]:
    """
    Filters run in SQL; availability filtering and sorting run in Python because
    "next available slot" is computed from schedules rather than stored.
    """
    stmt = _bookable(_profile_query())
    if q:
        stmt = stmt.where(
            or_(
                User.full_name.contains(q, autoescape=True),
                Specialization.name.contains(q, autoescape=True),
                DoctorProfile.sub_specialization.contains(q, autoescape=True),
            )
        )
    if specialization_id:
        stmt = stmt.where(DoctorProfile.specialization_id == specialization_id)
    if min_experience:
        stmt = stmt.where(DoctorProfile.years_of_practice >= min_experience)
    if language:
        stmt = stmt.where(
            func.json_contains(DoctorProfile.languages, json.dumps(language.strip().title()))
        )

    profiles = list(db.scalars(stmt).unique().all())
    availability = next_available(db, profiles)

    if available in ("today", "week"):
        days = 1 if available == "today" else 7
        cutoff = clinic_datetime(clinic_today() + timedelta(days=days), time.min)
        profiles = [p for p in profiles if availability[p.user_id] and availability[p.user_id] < cutoff]

    sort_keys = {
        "experience": lambda p: -p.years_of_practice,
        "fee_low": lambda p: p.consultation_fee,
        "fee_high": lambda p: -p.consultation_fee,
        "availability": lambda p: (availability[p.user_id] is None, availability[p.user_id] or utcnow()),
    }
    profiles.sort(key=lambda p: p.user.full_name.lower())
    if sort in sort_keys:
        profiles.sort(key=sort_keys[sort])

    page = profiles[offset : offset + limit]
    items = [
        DoctorSummary(**summary_fields(p), next_available_at=availability[p.user_id]) for p in page
    ]
    return items, len(profiles)


def available_languages(db: Session) -> list[str]:
    rows = db.scalars(
        _bookable(select(DoctorProfile.languages).join(DoctorProfile.user))
    ).all()
    return sorted({language for languages in rows for language in (languages or [])})


# --- Own profile & availability -----------------------------------------------


def _notify_admins_for_review(db: Session, doctor: User, reason: str) -> None:
    admin_ids = db.scalars(
        select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    ).all()
    notify_many(
        db,
        admin_ids,
        type="doctor_review_requested",
        title="Doctor profile needs review",
        message=f"{doctor.full_name}: {reason}",
        link=f"/admin/doctors/{doctor.id}",
    )


def update_profile(db: Session, profile: DoctorProfile, data: DoctorProfileUpdate) -> DoctorProfile:
    """
    Saves the professional profile. Changing the license number or specialization
    of a verified doctor, or updating a rejected profile, sends it back for review.
    """
    specialization = db.get(Specialization, data.specialization_id)
    if specialization is None or (
        not specialization.is_active and specialization.id != profile.specialization_id
    ):
        raise bad_request("Please choose a valid specialization.")

    duplicate = db.scalar(
        select(DoctorProfile.id).where(
            DoctorProfile.license_number == data.license_number, DoctorProfile.id != profile.id
        )
    )
    if duplicate:
        raise conflict("This license / registration number is already registered.")

    credentials_changed = (
        data.license_number != profile.license_number
        or data.specialization_id != profile.specialization_id
    )
    review_reason = None
    if profile.verification_status == VerificationStatus.VERIFIED and credentials_changed:
        review_reason = "changed license or specialization and needs re-verification."
    elif profile.verification_status == VerificationStatus.REJECTED:
        review_reason = "updated a previously rejected profile and resubmitted it for verification."

    for field, value in data.model_dump().items():
        setattr(profile, field, value)
    profile.specialization = specialization

    if review_reason:
        profile.verification_status = VerificationStatus.PENDING
        profile.verified_at = None
        profile.verification_note = None
        _notify_admins_for_review(db, profile.user, review_reason)  # commits
    else:
        db.commit()
    return profile


def availability_out(db: Session, profile: DoctorProfile) -> AvailabilityOut:
    upcoming_time_off = db.scalars(
        select(TimeOff)
        .where(TimeOff.doctor_id == profile.id, TimeOff.date >= clinic_today())
        .order_by(TimeOff.date)
    ).all()
    return AvailabilityOut(
        clinic_timezone=settings.clinic_timezone,
        consultation_duration_minutes=profile.consultation_duration_minutes,
        rules=profile.availability_rules,
        time_off=upcoming_time_off,
    )


def replace_availability(db: Session, profile: DoctorProfile, data: AvailabilityUpdate) -> None:
    """Replaces the whole weekly schedule. Existing appointments are not affected."""
    duration = data.consultation_duration_minutes
    by_day = defaultdict(list)
    for rule in data.rules:
        by_day[rule.day_of_week].append((rule.start_time, rule.end_time))

    for day, windows in by_day.items():
        if slot_engine.windows_overlap(windows):
            raise bad_request(f"{DAY_NAMES[day]} has overlapping time windows.")
        for start, end in windows:
            minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
            if minutes < duration:
                raise bad_request(
                    f"Each window must be at least as long as one consultation ({duration} min)."
                )

    profile.consultation_duration_minutes = duration
    profile.availability_rules = [
        AvailabilityRule(day_of_week=r.day_of_week, start_time=r.start_time, end_time=r.end_time)
        for r in sorted(data.rules, key=lambda r: (r.day_of_week, r.start_time))
    ]
    db.commit()


def add_time_off(db: Session, profile: DoctorProfile, data: TimeOffIn) -> TimeOff:
    today = clinic_today()
    if data.date < today:
        raise bad_request("Time off must be today or a future date.")
    if data.date > today + timedelta(days=settings.booking_horizon_days):
        raise bad_request(f"Time off can be set up to {settings.booking_horizon_days} days ahead.")
    if db.scalar(select(TimeOff.id).where(TimeOff.doctor_id == profile.id, TimeOff.date == data.date)):
        raise conflict("This date is already marked as time off.")

    start, end = _clinic_days_to_utc(data.date, data.date)
    booked = db.scalar(
        select(func.count()).where(
            Appointment.doctor_id == profile.user_id,
            Appointment.status.in_(BLOCKING_STATUSES),
            Appointment.start_time < end,
            Appointment.end_time > start,
        )
    )
    if booked:
        raise conflict(
            f"You have {booked} pending or confirmed appointment(s) on this date. "
            "Reject or cancel them before marking the day off."
        )

    time_off = TimeOff(doctor_id=profile.id, date=data.date, reason=data.reason)
    db.add(time_off)
    db.commit()
    return time_off


def delete_time_off(db: Session, profile: DoctorProfile, time_off_id: int) -> None:
    time_off = db.get(TimeOff, time_off_id)
    if time_off is None or time_off.doctor_id != profile.id:
        raise not_found("Time off entry")
    db.delete(time_off)
    db.commit()
