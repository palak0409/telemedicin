from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.websocket import receive_message, send_message
from app.database.session import get_db
from app.features.auth.dependencies import CurrentUser, authenticate_websocket
from app.features.notifications.hub import hub
from app.features.notifications.models import Notification
from app.features.notifications.schemas import NotificationList

router = APIRouter(prefix="/notifications", tags=["notifications"])
ws_router = APIRouter()
DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=NotificationList)
def list_notifications(user: CurrentUser, db: DB, limit: int = Query(20, ge=1, le=100)):
    items = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    ).all()
    unread = db.scalar(
        select(func.count()).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )
    return NotificationList(items=items, unread_count=unread)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: int, user: CurrentUser, db: DB):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise not_found("Notification")
    notification.is_read = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DB):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@ws_router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket):
    """Server → client push channel. The client only sends `auth` and keep-alive `ping`s."""
    user = await authenticate_websocket(websocket)
    if user is None:
        return

    hub.connect(user.id, websocket)
    try:
        await send_message(websocket, "ready", {"user_id": user.id})
        while True:
            message = await receive_message(websocket)
            if message.get("type") == "ping":
                await send_message(websocket, "pong")
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(user.id, websocket)
