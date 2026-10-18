from pydantic import BaseModel, EmailStr, Field

from app.core.schemas import Password, Phone, RequiredText
from app.features.users.schemas import UserOut


class PatientRegister(BaseModel):
    full_name: RequiredText(2, 120)
    email: EmailStr
    password: Password
    phone: Phone = None


class DoctorRegister(PatientRegister):
    specialization_id: int
    license_number: RequiredText(3, 60)
    qualifications: RequiredText(2, 255)
    years_of_practice: int = Field(ge=0, le=70)


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=72)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
