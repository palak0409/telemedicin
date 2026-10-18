import enum
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UTCDateTime, str_enum


class AppointmentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


# Appointments in these states occupy the doctor's time slot.
BLOCKING_STATUSES = (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)


class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_doctor_start", "doctor_id", "start_time"),
        Index("ix_appointments_patient_start", "patient_id", "start_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    start_time: Mapped[datetime] = mapped_column(UTCDateTime)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[AppointmentStatus] = mapped_column(
        str_enum(AppointmentStatus), default=AppointmentStatus.PENDING, index=True
    )
    # Reason supplied when an appointment is rejected or cancelled.
    status_note: Mapped[str | None] = mapped_column(String(255))
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    patient: Mapped["User"] = relationship(foreign_keys=[patient_id])  # noqa: F821
    doctor: Mapped["User"] = relationship(foreign_keys=[doctor_id])  # noqa: F821
    consultation: Mapped["Consultation | None"] = relationship(  # noqa: F821
        back_populates="appointment", uselist=False
    )
