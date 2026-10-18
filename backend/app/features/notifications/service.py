"""
Creating notifications.

`notify` commits the session — together with any pending business change made
by the caller, so the event and its notification are saved atomically — and
only then pushes the notification to the user's open sockets.
"""
from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.features.notifications.hub import hub
from app.features.notifications.models import Notification
from app.features.notifications.schemas import NotificationOut


def notify_many(
    db: Session,
    user_ids: Iterable[int],
    *,
    type: str,
    title: str,
    message: str,
    link: str | None = None,
) -> list[Notification]:
    items = [
        Notification(user_id=user_id, type=type, title=title, message=message, link=link)
        for user_id in user_ids
    ]
    db.add_all(items)
    db.commit()
    for item in items:
        payload = NotificationOut.model_validate(item).model_dump(mode="json")
        hub.send_from_thread(item.user_id, "notification", payload)
    return items


def notify(
    db: Session, user_id: int, *, type: str, title: str, message: str, link: str | None = None
) -> Notification:
    return notify_many(db, [user_id], type=type, title=title, message=message, link=link)[0]
