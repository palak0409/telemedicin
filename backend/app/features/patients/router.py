from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.features.appointments import service as appointments_service
from app.features.appointments.models import Appointment
from app.features.appointments.schemas import AppointmentOut
from app.features.auth.dependencies import DoctorUser, PatientUser
from app.features.patients import service
from app.features.patients.schemas import MedicalProfileIn, MedicalProfileOut, PatientListItem

router = APIRouter(prefix="/patients", tags=["patients"])
DB = Annotated[Session, Depends(get_db)]


class PatientRecord(BaseModel):
    """What a treating doctor sees on a patient's page."""

    id: int
    full_name: str
    photo_url: str | None
    email: str
    phone: str | None
    age: int | None
    medical: MedicalProfileOut
    appointments: list[AppointmentOut]


@router.get("/me/medical-profile", response_model=MedicalProfileOut)
def get_my_medical_profile(patient: PatientUser, db: DB):
    return service.get_or_create_profile(db, patient)


@router.put("/me/medical-profile", response_model=MedicalProfileOut)
def update_my_medical_profile(data: MedicalProfileIn, patient: PatientUser, db: DB):
    return service.update_profile(db, patient, data)


@router.get("", response_model=list[PatientListItem])
def list_my_patients(doctor: DoctorUser, db: DB, q: Annotated[str | None, Query(max_length=100)] = None):
    return service.patients_of_doctor(db, doctor.id, q.strip() if q else None)


@router.get("/{patient_id}", response_model=PatientRecord)
def get_patient_record(patient_id: int, doctor: DoctorUser, db: DB):
    patient = service.get_patient_for_doctor(db, doctor.id, patient_id)
    medical = service.get_or_create_profile(db, patient)
    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.doctor_id == doctor.id, Appointment.patient_id == patient.id)
        .options(*appointments_service.LOAD_RELATED)
        .order_by(Appointment.start_time.desc())
    ).all()
    return PatientRecord(
        id=patient.id,
        full_name=patient.full_name,
        photo_url=patient.photo_url,
        email=patient.email,
        phone=patient.phone,
        age=service.age_from(medical.date_of_birth),
        medical=MedicalProfileOut.model_validate(medical),
        appointments=[appointments_service.to_out(a) for a in appointments],
    )
