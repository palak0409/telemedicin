"""Declarative base, shared column types and mixins used by every feature's models."""
import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.core.dates import utcnow


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """
    Stores datetimes as naive UTC (MySQL DATETIME has no timezone) and returns
    timezone-aware UTC values, so API responses always carry an explicit offset.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; use timezone-aware UTC")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


def str_enum(enum_cls: type[enum.Enum]) -> Enum:
    """Maps a Python str-Enum to a MySQL ENUM column storing the enum *values*."""
    return Enum(enum_cls, values_callable=lambda members: [m.value for m in members], length=20)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
