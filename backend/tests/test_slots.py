"""Unit tests for slot generation (pure functions, no database)."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.features.doctors.slots import generate_day_slots, overlaps, windows_overlap

UTC = timezone.utc
DAY = date(2030, 1, 7)  # a Monday
EARLY = datetime(2030, 1, 1, tzinfo=UTC)


def test_splits_window_into_fixed_slots():
    slots = generate_day_slots(DAY, [(time(9), time(11))], 30, [], EARLY, ZoneInfo("UTC"))
    assert [s.start.hour * 60 + s.start.minute for s in slots] == [540, 570, 600, 630]
    assert all(s.available for s in slots)


def test_partial_slot_at_end_of_window_is_dropped():
    slots = generate_day_slots(DAY, [(time(9), time(10, 15))], 30, [], EARLY, ZoneInfo("UTC"))
    assert len(slots) == 2


def test_busy_intervals_and_past_slots_are_unavailable():
    busy = [(datetime(2030, 1, 7, 9, 30, tzinfo=UTC), datetime(2030, 1, 7, 10, tzinfo=UTC))]
    now = datetime(2030, 1, 7, 9, 5, tzinfo=UTC)
    slots = generate_day_slots(DAY, [(time(9), time(11))], 30, busy, now, ZoneInfo("UTC"))
    assert [s.available for s in slots] == [False, False, True, True]


def test_clinic_timezone_is_converted_to_utc():
    slots = generate_day_slots(DAY, [(time(9), time(9, 30))], 30, [], EARLY, ZoneInfo("Asia/Kolkata"))
    assert slots[0].start == datetime(2030, 1, 7, 3, 30, tzinfo=UTC)


def test_overlap_is_half_open():
    a = datetime(2030, 1, 7, 9, tzinfo=UTC)
    b = a + timedelta(minutes=30)
    c = b + timedelta(minutes=30)
    assert not overlaps(a, b, b, c)
    assert overlaps(a, c, b, c)


def test_windows_overlap_detection():
    assert windows_overlap([(time(13), time(15)), (time(9), time(14))])
    assert not windows_overlap([(time(9), time(12)), (time(12), time(15))])
