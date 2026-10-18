from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, field_validator

from app.core.schemas import OptionalText, Phone, blank_to_none

Gender = Literal["female", "male", "other", "prefer_not_to_say"]
BloodGroup = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


class MedicalProfileIn(BaseModel):
    date_of_birth: date | None = None
    gender: Annotated[Gender | None, BeforeValidator(blank_to_none)] = None
    blood_group: Annotated[BloodGroup | None, BeforeValidator(blank_to_none)] = None
    allergies: OptionalText(2000) = None
    existing_conditions: OptionalText(2000) = None
    chronic_conditions: OptionalText(2000) = None
    current_medications: OptionalText(2000) = None
    previous_surgeries: OptionalText(2000) = None
    family_history: OptionalText(2000) = None
    emergency_contact_name: OptionalText(120) = None
    emergency_contact_phone: Phone = None

    @field_validator("date_of_birth")
    @classmethod
    def _plausible_birth_date(cls, value: date | None) -> date | None:
        if value and (value > date.today() or value.year < date.today().year - 130):
            raise ValueError("Enter a valid date of birth")
        return value


class MedicalProfileOut(MedicalProfileIn):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime | None = None


class PatientListItem(BaseModel):
    """A patient as seen in a doctor's patient list."""

    id: int
    full_name: str
    photo_url: str | None
    gender: str | None
    age: int | None
    total_appointments: int
    last_visit_at: datetime | None
    next_appointment_at: datetime | None
