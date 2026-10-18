from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.features.auth import service
from app.features.auth.dependencies import CurrentUser
from app.features.auth.schemas import AuthResponse, DoctorRegister, LoginRequest, PatientRegister
from app.features.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
DB = Annotated[Session, Depends(get_db)]


@router.post("/register/patient", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_patient(data: PatientRegister, db: DB):
    return service.auth_response(service.register_patient(db, data))


@router.post("/register/doctor", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_doctor(data: DoctorRegister, db: DB):
    return service.auth_response(service.register_doctor(db, data))


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: DB):
    return service.auth_response(service.authenticate(db, data.email, data.password))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.from_user(user)
