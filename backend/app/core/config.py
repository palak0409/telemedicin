"""
Application settings, loaded from environment variables and backend/.env.

Every environment-specific value (database, secrets, ICE servers) lives here so
the rest of the code never reads os.environ directly.
"""
from functools import cached_property, lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Telemed"
    database_url: str
    cors_origins: str = "http://localhost:5173"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # Doctor schedules are entered in clinic-local time; everything is stored in UTC.
    clinic_timezone: str = "UTC"
    booking_horizon_days: int = 60
    consultation_join_window_minutes: int = 15

    stun_server: str = "stun:stun.l.google.com:19302"
    turn_server: str = ""
    turn_username: str = ""
    turn_password: str = ""
    # "relay" forces all media through TURN, which is useful for verifying a TURN setup.
    ice_transport_policy: str = "all"

    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Platform Administrator"
    seed_demo_data: bool = False
    demo_password: str = ""

    upload_dir: Path = BACKEND_DIR / "uploads"
    max_upload_mb: int = 2

    # AI-assisted documentation (optional). Keys stay on the server only.
    groq_api_key: str = ""
    groq_whisper_model: str = "whisper-large-v3"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    # Consultation audio awaiting transcription; deleted once transcribed. Never served publicly.
    recordings_dir: Path = BACKEND_DIR / "recordings"
    max_recording_mb: int = 25

    @field_validator("jwt_secret")
    @classmethod
    def _secret_strength(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")
        return value

    @field_validator("ice_transport_policy")
    @classmethod
    def _ice_policy(cls, value: str) -> str:
        if value not in ("all", "relay"):
            raise ValueError("ICE_TRANSPORT_POLICY must be 'all' or 'relay'")
        return value

    @cached_property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.clinic_timezone)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
