"""
Consultation room + WebSocket signaling tests. Media is not exercised here
(that needs browsers); these verify the signaling protocol and lifecycle.
"""
from datetime import timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.dates import utcnow
from app.database.session import SessionLocal
from app.features.appointments.models import Appointment, AppointmentStatus


def _token(headers: dict) -> str:
    return headers["Authorization"].split()[1]


def _confirmed_appointment_now(patient_id: int, doctor_id: int) -> int:
    start = utcnow().replace(second=0, microsecond=0)
    with SessionLocal() as db:
        appointment = Appointment(
            patient_id=patient_id,
            doctor_id=doctor_id,
            start_time=start,
            end_time=start + timedelta(minutes=30),
            reason="Signaling test",
            status=AppointmentStatus.CONFIRMED,
        )
        db.add(appointment)
        db.commit()
        return appointment.id


def _receive(ws, expected_type: str) -> dict:
    message = ws.receive_json()
    assert message["type"] == expected_type, message
    return message["data"]


def test_socket_rejects_invalid_token(client):
    with client.websocket_connect("/ws/notifications") as ws:
        ws.send_json({"type": "auth", "token": "not-a-jwt"})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4401


def test_full_signaling_exchange(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    patient_headers, patient = register("patient")
    appointment_id = _confirmed_appointment_now(patient["id"], doctor["id"])

    patient_join = client.post("/api/consultations/join", json={"appointment_id": appointment_id}, headers=patient_headers)
    assert patient_join.status_code == 200, patient_join.text
    room_id = patient_join.json()["room_id"]
    assert patient_join.json()["rtc_config"]["iceServers"]

    doctor_join = client.post("/api/consultations/join", json={"appointment_id": appointment_id}, headers=doctor_headers)
    assert doctor_join.json()["room_id"] == room_id

    with client.websocket_connect(f"/ws/consultations/{room_id}") as patient_ws:
        patient_ws.send_json({"type": "auth", "token": _token(patient_headers)})
        assert _receive(patient_ws, "joined")["peer"] is None

        with client.websocket_connect(f"/ws/consultations/{room_id}") as doctor_ws:
            doctor_ws.send_json({"type": "auth", "token": _token(doctor_headers)})
            assert _receive(doctor_ws, "joined")["peer"]["id"] == patient["id"]
            # The participant who was waiting is told to make the offer.
            assert _receive(patient_ws, "peer-joined")["peer"]["id"] == doctor["id"]

            patient_ws.send_json({"type": "offer", "data": {"sdp": {"type": "offer", "sdp": "v=0..."}}})
            offer = _receive(doctor_ws, "offer")
            assert offer["sdp"]["type"] == "offer" and offer["from"] == patient["id"]

            doctor_ws.send_json({"type": "answer", "data": {"sdp": {"type": "answer", "sdp": "v=0..."}}})
            assert _receive(patient_ws, "answer")["from"] == doctor["id"]

            doctor_ws.send_json({"type": "ice-candidate", "data": {"candidate": {"candidate": "candidate:1 1 udp ..."}}})
            assert "candidate" in _receive(patient_ws, "ice-candidate")

            patient_ws.send_json({"type": "media-state", "data": {"audio": False, "video": True}})
            assert _receive(doctor_ws, "media-state")["audio"] is False

            doctor_ws.send_json({"type": "end"})
            assert _receive(doctor_ws, "consultation-ended")["ended_by"]["id"] == doctor["id"]
            assert _receive(patient_ws, "consultation-ended")["ended_by"]["id"] == doctor["id"]

    detail = client.get(f"/api/appointments/{appointment_id}", headers=patient_headers).json()
    assert detail["status"] == "completed"
    assert detail["consultation"]["status"] == "ended"
    assert detail["consultation"]["started_at"] is not None

    # Ended consultations cannot be rejoined.
    rejoin = client.post("/api/consultations/join", json={"appointment_id": appointment_id}, headers=patient_headers)
    assert rejoin.status_code == 409

    history = client.get("/api/consultations", headers=doctor_headers).json()
    assert history["items"][0]["appointment_id"] == appointment_id
    notes = client.put(
        f"/api/consultations/{history['items'][0]['id']}/notes",
        json={"notes": "Viral URTI. Fluids and rest."},
        headers=doctor_headers,
    )
    assert notes.json()["notes"] == "Viral URTI. Fluids and rest."


def test_peer_left_and_rejoin(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    patient_headers, patient = register("patient")
    appointment_id = _confirmed_appointment_now(patient["id"], doctor["id"])
    room_id = client.post(
        "/api/consultations/join", json={"appointment_id": appointment_id}, headers=patient_headers
    ).json()["room_id"]
    client.post("/api/consultations/join", json={"appointment_id": appointment_id}, headers=doctor_headers)

    with client.websocket_connect(f"/ws/consultations/{room_id}") as doctor_ws:
        doctor_ws.send_json({"type": "auth", "token": _token(doctor_headers)})
        _receive(doctor_ws, "joined")

        with client.websocket_connect(f"/ws/consultations/{room_id}") as patient_ws:
            patient_ws.send_json({"type": "auth", "token": _token(patient_headers)})
            _receive(patient_ws, "joined")
            _receive(doctor_ws, "peer-joined")
            patient_ws.send_json({"type": "leave"})

        assert _receive(doctor_ws, "peer-left")["peer"]["id"] == patient["id"]


def test_non_participant_cannot_join(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    _, patient = register("patient")
    outsider_headers, _ = register("patient")
    appointment_id = _confirmed_appointment_now(patient["id"], doctor["id"])

    assert client.post(
        "/api/consultations/join", json={"appointment_id": appointment_id}, headers=outsider_headers
    ).status_code == 404

    room_id = client.post(
        "/api/consultations/join", json={"appointment_id": appointment_id}, headers=doctor_headers
    ).json()["room_id"]
    with client.websocket_connect(f"/ws/consultations/{room_id}") as ws:
        ws.send_json({"type": "auth", "token": _token(outsider_headers)})
        assert _receive(ws, "error")["message"]
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4403
