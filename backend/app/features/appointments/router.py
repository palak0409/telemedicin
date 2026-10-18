from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.schemas import Page
from app.database.session import get_db
from app.features.appointments import service
from app.features.appointments.models import AppointmentStatus
from app.features.appointments.schemas import (
    AppointmentCreate,
    AppointmentDetail,
    AppointmentOut,
    StatusReason,
)
from app.features.auth.dependencies import CurrentUser, DoctorUser, PatientUser, require_roles
from app.features.users.models import User, UserRole

router = APIRouter(prefix="/appointments", tags=["appointments"])
DB = Annotated[Session, Depends(get_db)]
Participant = Annotated[User, Depends(require_roles(UserRole.PATIENT, UserRole.DOCTOR))]


@router.post("", response_model=AppointmentDetail, status_code=status.HTTP_201_CREATED)
def book_appointment(data: AppointmentCreate, patient: PatientUser, db: DB):
    return service.to_detail(service.book(db, patient, data), patient)


@router.get("", response_model=Page[AppointmentOut])
def list_appointments(
    user: Participant,
    db: DB,
    scope: Literal["upcoming", "past", "all"] = "upcoming",
    status: AppointmentStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = service.list_for_user(
        db, user, scope=scope, status=status, limit=limit, offset=offset
    )
    return Page(items=[service.to_out(a) for a in items], total=total)


@router.get("/{appointment_id}", response_model=AppointmentDetail)
def get_appointment(appointment_id: int, user: CurrentUser, db: DB):
    return service.to_detail(service.get_for_user(db, user, appointment_id), user)


@router.post("/{appointment_id}/accept", response_model=AppointmentDetail)
def accept_appointment(appointment_id: int, doctor: DoctorUser, db: DB):
    return service.to_detail(service.accept(db, doctor, appointment_id), doctor)


@router.post("/{appointment_id}/reject", response_model=AppointmentDetail)
def reject_appointment(appointment_id: int, data: StatusReason, doctor: DoctorUser, db: DB):
    return service.to_detail(service.reject(db, doctor, appointment_id, data.reason), doctor)


@router.post("/{appointment_id}/cancel", response_model=AppointmentDetail)
def cancel_appointment(appointment_id: int, data: StatusReason, user: Participant, db: DB):
    return service.to_detail(service.cancel(db, user, appointment_id, data.reason), user)
