from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.dates import ensure_utc
from app.core.schemas import OptionalText, RequiredText
from app.features.appointments.models import Appointment, AppointmentStatus
from app.features.consultations.models import ConsultationStatus
from app.features.patients.schemas import MedicalProfileOut
from app.features.users.schemas import PersonSummary


class AppointmentCreate(BaseModel):
    doctor_id: int
    start_time: datetime
    reason: RequiredText(5, 1000)

    @field_validator("start_time")
    @classmethod
    def _aware(cls, value: datetime) -> datetime:
        return ensure_utc(value)


class StatusReason(BaseModel):
    reason: OptionalText(255) = None


class DoctorBrief(PersonSummary):
    specialization: str | None = None


class ConsultationBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ConsultationStatus
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    notes: str | None
    summary: dict | None = None
    documentation_status: str | None = None


class AppointmentOut(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime
    reason: str
    status: AppointmentStatus
    status_note: str | None
    cancelled_by_id: int | None
    created_at: datetime
    patient: PersonSummary
    doctor: DoctorBrief
    consultation: ConsultationBrief | None
    # Computed by the server so every client applies the same join-window rule.
    can_join: bool


class PatientClinicalInfo(BaseModel):
    """Patient details a doctor needs for an appointment they are part of."""

    age: int | None
    gender: str | None
    phone: str | None
    medical: MedicalProfileOut | None


class AppointmentDetail(AppointmentOut):
    consultation_fee: Decimal | None
    duration_minutes: int
    patient_info: PatientClinicalInfo | None = None


def doctor_brief(appointment: Appointment) -> DoctorBrief:
    doctor = appointment.doctor
    profile = doctor.doctor_profile
    return DoctorBrief(
        id=doctor.id,
        full_name=doctor.full_name,
        photo_url=doctor.photo_url,
        specialization=profile.specialization.name if profile else None,
    )
