"""
Live delivery of notifications over WebSocket.

The hub keeps an in-memory map of user id → open sockets (a user can have
several tabs). It lives in a single API process; running several instances
would require a shared broker such as Redis pub/sub to fan events out.
"""
import asyncio
from collections import defaultdict

from fastapi import WebSocket

from app.core.websocket import send_message


class NotificationHub:
    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connect(self, user_id: int, websocket: WebSocket) -> None:
        self._sockets[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self._sockets.get(user_id)
        if sockets is not None:
            sockets.discard(websocket)
            if not sockets:
                del self._sockets[user_id]

    async def send(self, user_id: int, type_: str, data: dict) -> None:
        for websocket in list(self._sockets.get(user_id, ())):
            if not await send_message(websocket, type_, data):
                self.disconnect(user_id, websocket)

    def send_from_thread(self, user_id: int, type_: str, data: dict) -> None:
        """
        Schedules a push onto the event loop. Synchronous route handlers run in
        a worker thread, so they cannot await the socket send directly.
        """
        if self._loop is None or not self._loop.is_running() or user_id not in self._sockets:
            return
        asyncio.run_coroutine_threadsafe(self.send(user_id, type_, data), self._loop)


hub = NotificationHub()
