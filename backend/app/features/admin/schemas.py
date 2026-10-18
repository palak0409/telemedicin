"""
Admin views. They deliberately omit clinical content (reason for visit,
medical profiles, consultation notes): administrators manage the platform,
they are not part of the patient's care team.
"""
from datetime import datetime

from pydantic import BaseModel, model_validator

from app.core.schemas import OptionalText, RequiredText
from app.features.appointments.models import AppointmentStatus
from app.features.consultations.models import ConsultationStatus
from app.features.doctors.models import VerificationStatus
from app.features.doctors.schemas import DoctorDetail, SpecializationOut


class AdminStats(BaseModel):
    patients: int
    doctors_verified: int
    doctors_pending: int
    appointments_today: int
    appointments_pending: int
    appointments_upcoming: int
    consultations_active: int
    consultations_completed: int


class AdminDoctorRow(BaseModel):
    id: int
    full_name: str
    email: str
    photo_url: str | None
    is_active: bool
    specialization: str
    license_number: str
    years_of_practice: int
    verification_status: VerificationStatus
    created_at: datetime


class AdminDoctorDetail(DoctorDetail):
    email: str
    phone: str | None
    is_active: bool
    created_at: datetime
    verification_note: str | None
    verified_at: datetime | None
    appointment_count: int


class VerificationUpdate(BaseModel):
    status: VerificationStatus
    note: OptionalText(255) = None

    @model_validator(mode="after")
    def _note_required_for_negative_outcomes(self):
        if self.status in (VerificationStatus.REJECTED, VerificationStatus.SUSPENDED) and not self.note:
            raise ValueError("A note is required when rejecting or suspending a doctor")
        return self


class UserStatusUpdate(BaseModel):
    is_active: bool


class AdminPatientRow(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str | None
    photo_url: str | None
    is_active: bool
    created_at: datetime
    appointment_count: int


class PartyRef(BaseModel):
    id: int
    full_name: str


class AdminAppointmentRow(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime
    status: AppointmentStatus
    status_note: str | None
    created_at: datetime
    patient: PartyRef
    doctor: PartyRef
    specialization: str | None
    consultation_status: ConsultationStatus | None


class AdminConsultationRow(BaseModel):
    id: int
    room_id: str
    status: ConsultationStatus
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    appointment_id: int
    scheduled_start: datetime
    patient: PartyRef
    doctor: PartyRef


class SpecializationIn(BaseModel):
    name: RequiredText(2, 100)
    description: OptionalText(255) = None
    is_active: bool = True


class SpecializationAdminOut(SpecializationOut):
    doctor_count: int
