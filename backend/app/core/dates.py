"""
Time helpers.

Convention: every datetime inside the application is timezone-aware UTC.
Clinic-local time is only used when interpreting a doctor's weekly schedule
and when deciding what "today" means.
"""
from datetime import date, datetime, time, timezone

from app.core.config import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def clinic_today() -> date:
    return utcnow().astimezone(settings.tz).date()


def clinic_datetime(day: date, at: time) -> datetime:
    """Combines a clinic-local date and wall-clock time into an aware UTC datetime."""
    return datetime.combine(day, at, tzinfo=settings.tz).astimezone(timezone.utc)


def to_clinic_date(moment: datetime) -> date:
    return moment.astimezone(settings.tz).date()


def ensure_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("Datetime must include a timezone offset")
    return moment.astimezone(timezone.utc)


def format_clinic_time(moment: datetime) -> str:
    """Clinic-local time for notification text, e.g. 'Tue 7 Oct, 10:30'."""
    local = moment.astimezone(settings.tz)
    return f"{local:%a} {local.day} {local:%b}, {local:%H:%M}"
