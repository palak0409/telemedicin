from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.core.schemas import OptionalText
from app.features.documentation.fields import SUMMARY_FIELDS
from app.features.documentation.models import DocumentationStatus

SectionText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]


class DocumentationConfig(BaseModel):
    """Lets the UI offer recording only when the server can process it. Never contains keys."""

    transcription_enabled: bool
    summarization_enabled: bool


class TranscriptSegment(BaseModel):
    speaker: Literal["doctor", "patient"]
    start: float
    end: float
    text: str


class DocumentationReview(BaseModel):
    summary: dict[str, SectionText]
    notes: OptionalText(5000) = None

    @field_validator("summary")
    @classmethod
    def _known_sections_only(cls, value: dict[str, str]) -> dict[str, str]:
        unknown = set(value) - set(SUMMARY_FIELDS)
        if unknown:
            raise ValueError(f"Unknown summary sections: {', '.join(sorted(unknown))}")
        return {key: value.get(key, "") for key in SUMMARY_FIELDS}


class DocumentationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    consultation_id: int
    status: DocumentationStatus
    failed_stage: str | None
    error_message: str | None
    can_retry: bool = False
    transcript: list[TranscriptSegment] | None
    detected_languages: list[str] | None
    transcription_model: str | None
    ai_summary: dict | None
    summary_model: str | None
    draft_summary: dict | None
    approved_summary: dict | None
    approved_at: datetime | None
    notes: str | None = None
    updated_at: datetime
