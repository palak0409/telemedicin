import enum
from datetime import datetime

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UTCDateTime, str_enum


class DocumentationStatus(str, enum.Enum):
    TRANSCRIBING = "transcribing"
    SUMMARIZING = "summarizing"
    READY_FOR_REVIEW = "ready_for_review"
    FAILED = "failed"
    APPROVED = "approved"


PROCESSING_STATUSES = (DocumentationStatus.TRANSCRIBING, DocumentationStatus.SUMMARIZING)


class ConsultationDocumentation(TimestampMixin, Base):
    """
    AI-assisted documentation for one consultation.

    Keeps each stage separately so nothing is lost and every step can be audited:
    the transcript, the summary exactly as the AI produced it, the doctor's working
    draft, and the approved version — the only one that becomes part of the record.
    """

    __tablename__ = "consultation_documentation"

    id: Mapped[int] = mapped_column(primary_key=True)
    consultation_id: Mapped[int] = mapped_column(ForeignKey("consultations.id", ondelete="CASCADE"), unique=True)
    status: Mapped[DocumentationStatus] = mapped_column(str_enum(DocumentationStatus), index=True)
    failed_stage: Mapped[str | None] = mapped_column(String(20))  # "transcription" | "summary"
    error_message: Mapped[str | None] = mapped_column(String(500))

    # [{"path": str, "speaker": "doctor"|"patient", "offset_seconds": float}] until transcribed.
    pending_audio: Mapped[list | None] = mapped_column(JSON)

    # [{"speaker": "doctor"|"patient", "start": float, "end": float, "text": str}]
    transcript: Mapped[list | None] = mapped_column(JSON)
    detected_languages: Mapped[list | None] = mapped_column(JSON)
    transcription_model: Mapped[str | None] = mapped_column(String(60))

    ai_summary: Mapped[dict | None] = mapped_column(JSON)
    summary_model: Mapped[str | None] = mapped_column(String(60))
    draft_summary: Mapped[dict | None] = mapped_column(JSON)
    approved_summary: Mapped[dict | None] = mapped_column(JSON)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    consultation: Mapped["Consultation"] = relationship(back_populates="documentation")  # noqa: F821
