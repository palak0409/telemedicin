"""
WebRTC signaling over WebSocket.

The server never sees audio or video. It authenticates each participant,
tracks who is in which room, and relays the messages two browsers need to set
up a direct RTCPeerConnection: SDP offers/answers and ICE candidates.

Client → server
    auth            first message, {"token": "<jwt>"} at the envelope top level
    offer           {"sdp": {...}}            relayed to the peer
    answer          {"sdp": {...}}            relayed to the peer
    ice-candidate   {"candidate": {...}}      relayed to the peer
    media-state     {"audio": bool, "video": bool}  relayed (mute / camera-off indicators)
    recording-state {"recording": bool}       relayed, so the patient always sees when audio is recorded
    end             ends the consultation for both participants
    leave           leaves the room; the consultation stays open for rejoining
    ping            keep-alive

Server → client
    joined              you are in the room; includes whether the peer is already present
    peer-joined         the other participant arrived → *you* create the SDP offer
    peer-left           the other participant disconnected
    offer / answer / ice-candidate / media-state / recording-state   relayed, with "from": <user id>
    consultation-ended  the consultation is over; the socket is then closed
    error               {"message": str}

Negotiation rule: whoever is already waiting in the room makes the offer when
the other participant arrives. Joins are processed one at a time on the event
loop, so exactly one side offers and the two never collide ("glare").
"""
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.websocket import close_quietly, receive_message, send_message
from app.features.auth.dependencies import authenticate_websocket
from app.features.consultations import service

ws_router = APIRouter()

RELAYED_TYPES = {"offer", "answer", "ice-candidate", "media-state", "recording-state"}
MAX_RELAY_BYTES = 64 * 1024

WS_CLOSE_FORBIDDEN = 4403
WS_CLOSE_REPLACED = 4409


@dataclass
class Participant:
    user_id: int
    full_name: str
    websocket: WebSocket

    def public(self) -> dict:
        return {"id": self.user_id, "full_name": self.full_name}


class RoomManager:
    """
    In-memory room membership: room_id → {user_id: Participant}.

    Each user has at most one connection per room; joining again from a new tab
    replaces the old connection. Like the notification hub this is per-process
    state — scaling out would move it to a shared store such as Redis.
    """

    def __init__(self) -> None:
        self._rooms: dict[str, dict[int, Participant]] = {}

    def join(self, room_id: str, participant: Participant) -> Participant | None:
        room = self._rooms.setdefault(room_id, {})
        replaced = room.get(participant.user_id)
        room[participant.user_id] = participant
        return replaced

    def leave(self, room_id: str, user_id: int, websocket: WebSocket) -> bool:
        """Removes the user only if `websocket` is still their current connection."""
        room = self._rooms.get(room_id)
        if not room or user_id not in room or room[user_id].websocket is not websocket:
            return False
        del room[user_id]
        if not room:
            del self._rooms[room_id]
        return True

    def peer_of(self, room_id: str, user_id: int) -> Participant | None:
        room = self._rooms.get(room_id, {})
        return next((p for uid, p in room.items() if uid != user_id), None)

    def close(self, room_id: str) -> list[Participant]:
        """Removes the room entirely and returns everyone who was in it."""
        return list(self._rooms.pop(room_id, {}).values())


rooms = RoomManager()


@ws_router.websocket("/ws/consultations/{room_id}")
async def consultation_socket(websocket: WebSocket, room_id: str):
    user = await authenticate_websocket(websocket)
    if user is None:
        return

    room = await run_in_threadpool(service.load_room, room_id, user.id)
    if room is None:
        await send_message(websocket, "error", {"message": "This consultation room is not available."})
        await close_quietly(websocket, WS_CLOSE_FORBIDDEN)
        return

    # Joining and looking up the peer happen with no `await` in between, so two
    # participants arriving together can never both see the other as "already here".
    me = Participant(user.id, user.display_name, websocket)
    replaced = rooms.join(room_id, me)
    peer = rooms.peer_of(room_id, user.id)

    await send_message(websocket, "joined", {"self": me.public(), "peer": peer.public() if peer else None})
    if peer:
        await send_message(peer.websocket, "peer-joined", {"peer": me.public()})
    if replaced:
        await send_message(replaced.websocket, "error", {"message": "You joined this consultation from another window."})
        await close_quietly(replaced.websocket, WS_CLOSE_REPLACED)
    await run_in_threadpool(service.record_presence, room.consultation_id, peer is not None)

    try:
        while True:
            message = await receive_message(websocket)
            kind = message.get("type")
            data = message.get("data") if isinstance(message.get("data"), dict) else {}

            if kind in RELAYED_TYPES:
                if len(str(data)) > MAX_RELAY_BYTES:
                    continue
                if peer := rooms.peer_of(room_id, user.id):
                    await send_message(peer.websocket, kind, {**data, "from": user.id})
            elif kind == "end":
                await run_in_threadpool(service.end_consultation, room.consultation_id, user.id)
                for participant in rooms.close(room_id):
                    await send_message(participant.websocket, "consultation-ended", {"ended_by": me.public()})
                    if participant.websocket is not websocket:
                        await close_quietly(participant.websocket)
                break
            elif kind == "leave":
                break
            elif kind == "ping":
                await send_message(websocket, "pong")
            else:
                await send_message(websocket, "error", {"message": f"Unknown message type: {kind}"})
    except WebSocketDisconnect:
        pass
    finally:
        if rooms.leave(room_id, user.id, websocket):
            if peer := rooms.peer_of(room_id, user.id):
                await send_message(peer.websocket, "peer-left", {"peer": me.public()})
        await close_quietly(websocket)
