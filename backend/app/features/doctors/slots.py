"""
Appointment slot generation.

Slots are never stored. For a given date they are derived from:

    weekly availability windows (clinic-local time)
      − days marked as time off
      − intervals already taken by pending/confirmed appointments
      − anything that has already started

Computing slots on demand means editing a schedule never leaves stale slot rows
behind, and the same function is used both to display slots and to validate a
booking request, so the two can never disagree.
"""
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class Slot:
    start: datetime  # UTC
    end: datetime  # UTC
    available: bool


def overlaps(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    """Half-open interval overlap: back-to-back appointments do not conflict."""
    return start_a < end_b and start_b < end_a


def generate_day_slots(
    day: date,
    windows: Iterable[tuple[time, time]],
    duration_minutes: int,
    busy: Sequence[Interval],
    now: datetime,
    tz: ZoneInfo,
) -> list[Slot]:
    """
    Splits each availability window on `day` into fixed-length slots.
    A slot is unavailable if it has started or overlaps a busy interval.
    """
    step = timedelta(minutes=duration_minutes)
    slots: list[Slot] = []

    for window_start, window_end in sorted(windows):
        cursor = datetime.combine(day, window_start, tzinfo=tz)
        closes = datetime.combine(day, window_end, tzinfo=tz)
        while cursor + step <= closes:
            start = cursor.astimezone(timezone.utc)
            end = (cursor + step).astimezone(timezone.utc)
            free = start > now and not any(overlaps(start, end, b_start, b_end) for b_start, b_end in busy)
            slots.append(Slot(start=start, end=end, available=free))
            cursor += step

    return slots


def windows_overlap(windows: Sequence[tuple[time, time]]) -> bool:
    """True if any two windows on the same day overlap (input need not be sorted)."""
    ordered = sorted(windows)
    return any(prev_end > next_start for (_, prev_end), (next_start, _) in zip(ordered, ordered[1:]))
