"""
Shared WebSocket helpers.

Every message in both directions uses one envelope:  {"type": str, "data": object}
"""
import json

from fastapi import WebSocket
from starlette.websockets import WebSocketState


async def receive_message(websocket: WebSocket) -> dict:
    """Returns the next JSON object from the client, or {} if the payload was not valid JSON."""
    raw = await websocket.receive_text()
    try:
        message = json.loads(raw)
    except ValueError:
        return {}
    return message if isinstance(message, dict) else {}


async def send_message(websocket: WebSocket, type_: str, data: dict | None = None) -> bool:
    """Sends an envelope; returns False instead of raising if the socket is already gone."""
    if websocket.application_state != WebSocketState.CONNECTED:
        return False
    try:
        await websocket.send_json({"type": type_, "data": data or {}})
        return True
    except (RuntimeError, OSError):
        return False


async def close_quietly(websocket: WebSocket, code: int = 1000, reason: str = "") -> None:
    if websocket.application_state == WebSocketState.CONNECTED:
        try:
            await websocket.close(code=code, reason=reason)
        except (RuntimeError, OSError):
            pass
