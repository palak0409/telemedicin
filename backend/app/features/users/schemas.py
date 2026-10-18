from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.schemas import Password, Phone, RequiredText
from app.features.doctors.models import VerificationStatus
from app.features.users.models import User, UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: UserRole
    full_name: str
    phone: str | None
    photo_url: str | None
    is_active: bool
    created_at: datetime
    # Present for doctors so the UI can explain why they are not yet listed.
    verification_status: VerificationStatus | None = None

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        out = cls.model_validate(user)
        if user.role == UserRole.DOCTOR and user.doctor_profile:
            out.verification_status = user.doctor_profile.verification_status
        return out


class PersonSummary(BaseModel):
    """Minimal public identity used inside other resources."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    photo_url: str | None


class UserUpdate(BaseModel):
    full_name: RequiredText(2, 120)
    phone: Phone = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password
