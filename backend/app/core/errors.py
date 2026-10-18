"""Small helpers for consistent HTTP errors across features."""
from fastapi import HTTPException, status


def not_found(what: str = "Resource") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def forbidden(message: str = "You do not have access to this resource") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, message)


def conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, message)


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)
