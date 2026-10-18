from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.core.schemas import OptionalText, RequiredText
from app.features.doctors.models import DoctorProfile, VerificationStatus

Language = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


class SpecializationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    is_active: bool


class SpecializationBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


# --- Availability -----------------------------------------------------------


class AvailabilityRuleIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _start_before_end(self):
        if self.start_time >= self.end_time:
            raise ValueError("Start time must be before end time")
        return self


class AvailabilityRuleOut(AvailabilityRuleIn):
    model_config = ConfigDict(from_attributes=True)


class AvailabilityUpdate(BaseModel):
    consultation_duration_minutes: Literal[15, 20, 30, 45, 60]
    rules: list[AvailabilityRuleIn] = Field(max_length=42)


class TimeOffIn(BaseModel):
    date: date
    reason: OptionalText(160) = None


class TimeOffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    reason: str | None


class AvailabilityOut(BaseModel):
    clinic_timezone: str
    consultation_duration_minutes: int
    rules: list[AvailabilityRuleOut]
    time_off: list[TimeOffOut]


class SlotOut(BaseModel):
    start: datetime
    end: datetime
    available: bool


class DaySlotsOut(BaseModel):
    date: date
    is_time_off: bool
    slots: list[SlotOut]


class SlotCalendarOut(BaseModel):
    clinic_timezone: str
    duration_minutes: int
    days: list[DaySlotsOut]


# --- Profiles ---------------------------------------------------------------


class DoctorProfileUpdate(BaseModel):
    specialization_id: int
    sub_specialization: OptionalText(120) = None
    license_number: RequiredText(3, 60)
    qualifications: RequiredText(2, 255)
    medical_institution: OptionalText(160) = None
    clinic_affiliation: OptionalText(160) = None
    years_of_practice: int = Field(ge=0, le=70)
    languages: list[Language] = Field(min_length=1, max_length=10)
    consultation_fee: Decimal = Field(ge=0, le=100000, max_digits=10, decimal_places=2)
    bio: OptionalText(3000) = None

    @field_validator("languages")
    @classmethod
    def _normalize_languages(cls, value: list[str]) -> list[str]:
        # Title-cased and de-duplicated so the language filter can match exactly.
        return list(dict.fromkeys(language.title() for language in value))


class DoctorSummary(BaseModel):
    """Card-level information shown in search results. `id` is the doctor's user id."""

    id: int
    full_name: str
    photo_url: str | None
    specialization: SpecializationBrief
    sub_specialization: str | None
    qualifications: str
    years_of_practice: int
    languages: list[str]
    consultation_fee: Decimal
    clinic_affiliation: str | None
    verification_status: VerificationStatus
    next_available_at: datetime | None = None


class DoctorDetail(DoctorSummary):
    license_number: str
    medical_institution: str | None
    bio: str | None
    consultation_duration_minutes: int
    weekly_schedule: list[AvailabilityRuleOut]


class DoctorOwnProfile(DoctorDetail):
    verification_note: str | None
    verified_at: datetime | None


def summary_fields(profile: DoctorProfile) -> dict:
    user = profile.user
    return {
        "id": user.id,
        "full_name": user.full_name,
        "photo_url": user.photo_url,
        "specialization": profile.specialization,
        "sub_specialization": profile.sub_specialization,
        "qualifications": profile.qualifications,
        "years_of_practice": profile.years_of_practice,
        "languages": profile.languages or [],
        "consultation_fee": profile.consultation_fee,
        "clinic_affiliation": profile.clinic_affiliation,
        "verification_status": profile.verification_status,
    }


def detail_fields(profile: DoctorProfile) -> dict:
    return {
        **summary_fields(profile),
        "license_number": profile.license_number,
        "medical_institution": profile.medical_institution,
        "bio": profile.bio,
        "consultation_duration_minutes": profile.consultation_duration_minutes,
        "weekly_schedule": profile.availability_rules,
    }
