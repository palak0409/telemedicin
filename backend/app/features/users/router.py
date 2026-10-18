"""Account-level settings shared by all roles: name, phone, photo and password."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import bad_request
from app.core.security import hash_password, verify_password
from app.database.session import get_db
from app.features.auth.dependencies import CurrentUser
from app.features.users.models import User
from app.features.users.schemas import PasswordChange, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])
DB = Annotated[Session, Depends(get_db)]

AVATAR_DIR = settings.upload_dir / "avatars"
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: CurrentUser, db: DB):
    user.full_name = data.full_name
    user.phone = data.phone
    db.commit()
    return UserOut.from_user(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, user: CurrentUser, db: DB):
    if not verify_password(data.current_password, user.password_hash):
        raise bad_request("Current password is incorrect.")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _remove_photo_file(user: User) -> None:
    if user.photo_url and user.photo_url.startswith("/uploads/avatars/"):
        (AVATAR_DIR / user.photo_url.rsplit("/", 1)[-1]).unlink(missing_ok=True)


@router.post("/me/photo", response_model=UserOut)
def upload_photo(user: CurrentUser, db: DB, file: UploadFile = File(...)):
    extension = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if extension is None:
        raise bad_request("Upload a JPEG, PNG or WebP image.")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise bad_request(f"Image must be smaller than {settings.max_upload_mb} MB.")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    # Random file names so photo URLs cannot be guessed from user ids.
    filename = f"{uuid.uuid4().hex}.{extension}"
    (AVATAR_DIR / filename).write_bytes(content)

    _remove_photo_file(user)
    user.photo_url = f"/uploads/avatars/{filename}"
    db.commit()
    return UserOut.from_user(user)


@router.delete("/me/photo", response_model=UserOut)
def delete_photo(user: CurrentUser, db: DB):
    _remove_photo_file(user)
    user.photo_url = None
    db.commit()
    return UserOut.from_user(user)
