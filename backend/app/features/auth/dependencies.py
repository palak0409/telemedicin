"""
Authentication dependencies for HTTP routes and WebSockets.

HTTP: `Authorization: Bearer <jwt>` → `get_current_user`.
WebSocket: the first client message must be {"type": "auth", "token": "<jwt>"}.
"""
import asyncio
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.errors import forbidden
from app.core.security import decode_access_token
from app.database.session import SessionLocal, get_db
from app.features.users.models import User, UserRole

WS_AUTH_TIMEOUT_SECONDS = 10
WS_CLOSE_UNAUTHORIZED = 4401

bearer_scheme = HTTPBearer(auto_error=False)


def user_from_token(db: Session, token: str) -> User | None:
    try:
        user_id = int(decode_access_token(token)["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        return None
    user = db.get(User, user_id)
    return user if user and user.is_active else None


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = user_from_token(db, credentials.credentials) if credentials else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: UserRole):
    def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return checker


CurrentUser = Annotated[User, Depends(get_current_user)]
PatientUser = Annotated[User, Depends(require_roles(UserRole.PATIENT))]
DoctorUser = Annotated[User, Depends(require_roles(UserRole.DOCTOR))]
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


def _load_user_for_socket(token: str) -> User | None:
    with SessionLocal() as db:
        return user_from_token(db, token)


async def authenticate_websocket(websocket: WebSocket) -> User | None:
    """
    Accepts the socket and waits for the auth message.

    Browsers cannot set an Authorization header on a WebSocket, and a token in
    the query string would end up in proxy/server access logs, so the token is
    sent as the first message instead. Unauthenticated sockets are closed with 4401.
    """
    await websocket.accept()
    try:
        message = await asyncio.wait_for(websocket.receive_json(), WS_AUTH_TIMEOUT_SECONDS)
    except WebSocketDisconnect:
        return None
    except (asyncio.TimeoutError, ValueError):
        message = None

    user = None
    if isinstance(message, dict) and message.get("type") == "auth" and isinstance(message.get("token"), str):
        user = await run_in_threadpool(_load_user_for_socket, message["token"])

    if user is None:
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
    return user
