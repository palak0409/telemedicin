import enum
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import JSON, Date, ForeignKey, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.dates import utcnow
from app.database.base import Base, TimestampMixin, UTCDateTime, str_enum


class VerificationStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class Specialization(Base):
    """Admin-managed list of medical specializations."""

    __tablename__ = "specializations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class DoctorProfile(TimestampMixin, Base):
    """
    Professional profile for a doctor user. Only VERIFIED doctors appear in
    search results and can receive bookings.
    """

    __tablename__ = "doctor_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"), index=True)
    sub_specialization: Mapped[str | None] = mapped_column(String(120))
    license_number: Mapped[str] = mapped_column(String(60), unique=True)
    qualifications: Mapped[str] = mapped_column(String(255))
    medical_institution: Mapped[str | None] = mapped_column(String(160))
    clinic_affiliation: Mapped[str | None] = mapped_column(String(160))
    years_of_practice: Mapped[int] = mapped_column(default=0)
    languages: Mapped[list[str]] = mapped_column(JSON, default=list)
    consultation_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    bio: Mapped[str | None] = mapped_column(Text)
    consultation_duration_minutes: Mapped[int] = mapped_column(default=30)

    verification_status: Mapped[VerificationStatus] = mapped_column(
        str_enum(VerificationStatus), default=VerificationStatus.PENDING, index=True
    )
    verification_note: Mapped[str | None] = mapped_column(String(255))
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped["User"] = relationship(back_populates="doctor_profile")  # noqa: F821
    specialization: Mapped[Specialization] = relationship()
    availability_rules: Mapped[list["AvailabilityRule"]] = relationship(
        back_populates="doctor",
        cascade="all, delete-orphan",
        order_by="(AvailabilityRule.day_of_week, AvailabilityRule.start_time)",
    )
    time_off: Mapped[list["TimeOff"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan", order_by="TimeOff.date"
    )


class AvailabilityRule(Base):
    """
    A recurring weekly working window, e.g. Monday 09:00–12:00 (clinic time).
    Bookable slots are generated from these windows on demand rather than stored.
    """

    __tablename__ = "doctor_availability"

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctor_profiles.id", ondelete="CASCADE"), index=True
    )
    day_of_week: Mapped[int]  # 0 = Monday … 6 = Sunday
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)

    doctor: Mapped[DoctorProfile] = relationship(back_populates="availability_rules")


class TimeOff(Base):
    """A full day on which the doctor is unavailable, overriding the weekly schedule."""

    __tablename__ = "doctor_time_off"
    __table_args__ = (UniqueConstraint("doctor_id", "date", name="uq_time_off_doctor_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor_profiles.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(160))

    doctor: Mapped[DoctorProfile] = relationship(back_populates="time_off")
