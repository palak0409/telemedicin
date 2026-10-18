import enum
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UTCDateTime, str_enum


class ConsultationStatus(str, enum.Enum):
    WAITING = "waiting"  # room opened, only one participant has joined so far
    ACTIVE = "active"  # both participants have joined at least once
    ENDED = "ended"


class Consultation(TimestampMixin, Base):
    """
    The video session for a confirmed appointment. Created when the first
    participant enters the room; `room_id` is the signaling channel identifier.
    """

    __tablename__ = "consultations"

    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)
    room_id: Mapped[str] = mapped_column(String(36), unique=True)
    status: Mapped[ConsultationStatus] = mapped_column(
        str_enum(ConsultationStatus), default=ConsultationStatus.WAITING, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)

    appointment: Mapped["Appointment"] = relationship(back_populates="consultation")  # noqa: F821
    documentation: Mapped["ConsultationDocumentation | None"] = relationship(  # noqa: F821
        back_populates="consultation", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def summary(self) -> dict | None:
        """The doctor-approved structured summary; drafts and AI output are never exposed here."""
        doc = self.documentation
        return doc.approved_summary if doc and doc.status.value == "approved" else None

    @property
    def documentation_status(self) -> str | None:
        return self.documentation.status.value if self.documentation else None

    @property
    def duration_seconds(self) -> int | None:
        if self.started_at and self.ended_at:
            return int((self.ended_at - self.started_at).total_seconds())
        return None
