"""Reusable Pydantic field types and response shapes."""
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, BeforeValidator, StringConstraints

T = TypeVar("T")


def blank_to_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def RequiredText(min_length: int, max_length: int):
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)
    ]


def OptionalText(max_length: int):
    """Optional string where blank input is stored as NULL."""
    return Annotated[
        Annotated[str, StringConstraints(max_length=max_length)] | None,
        BeforeValidator(blank_to_none),
    ]


Phone = Annotated[
    Annotated[str, StringConstraints(max_length=30, pattern=r"^[0-9+()\-\s]{6,30}$")] | None,
    BeforeValidator(blank_to_none),
]

# bcrypt only uses the first 72 bytes of a password.
Password = Annotated[str, StringConstraints(min_length=8, max_length=72)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
