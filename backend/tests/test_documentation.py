"""
AI documentation pipeline tests. Groq and Gemini are replaced with fakes, so
these verify our flow (speaker merging, statuses, review, access control,
failure handling) without network access or API keys.
"""
import pytest

from app.core.config import settings
from app.features.documentation import service, speech, summarizer
from app.features.documentation.errors import AIServiceError
from tests.test_signaling import _confirmed_appointment_now, _receive, _token

SUMMARY = {
    "chief_complaint": "Cough for two weeks",
    "symptoms": "Dry cough at night",
    "medical_history": "",
    "current_medications": "",
    "allergies": "",
    "observations": "",
    "assessment": "Likely post-viral cough",
    "plan": "Honey, warm fluids",
    "follow_up": "Review in one week",
}


@pytest.fixture
def fake_ai(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "test-groq")
    monkeypatch.setattr(settings, "gemini_api_key", "test-gemini")

    def transcribe(path):
        if "doctor" in path.name:
            return [{"start": 0.0, "end": 2.0, "text": "Kya problem hai?"}, {"start": 2.5, "end": 3.0, "text": "Batayiye."}], "hindi"
        return [{"start": 1.0, "end": 4.0, "text": "Do hafte se cough hai, raat ko zyada."}], "hindi"

    monkeypatch.setattr(speech, "transcribe_file", transcribe)
    monkeypatch.setattr(summarizer, "summarize", lambda segments: dict(SUMMARY))


def _ended_consultation(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    patient_headers, patient = register("patient")
    appointment_id = _confirmed_appointment_now(patient["id"], doctor["id"])
    room_id = client.post("/api/consultations/join", json={"appointment_id": appointment_id}, headers=doctor_headers).json()["room_id"]
    with client.websocket_connect(f"/ws/consultations/{room_id}") as ws:
        ws.send_json({"type": "auth", "token": _token(doctor_headers)})
        _receive(ws, "joined")
        ws.send_json({"type": "end"})
        _receive(ws, "consultation-ended")
    consultation_id = client.get(f"/api/appointments/{appointment_id}", headers=doctor_headers).json()["consultation"]["id"]
    return doctor_headers, patient_headers, appointment_id, consultation_id


def _upload(client, headers, consultation_id):
    return client.post(
        f"/api/consultations/{consultation_id}/documentation/recordings",
        headers=headers,
        files=[
            ("files", ("doctor.webm", b"doctor-audio", "audio/webm")),
            ("files", ("patient.webm", b"patient-audio", "audio/webm;codecs=opus")),
        ],
        data={"speakers": ["doctor", "patient"], "offsets": ["0", "0.2"]},
    )


def test_config_never_exposes_keys(client, register, fake_ai):
    headers, _ = register("patient")
    body = client.get("/api/documentation/config", headers=headers).json()
    assert body == {"transcription_enabled": True, "summarization_enabled": True}


def test_merge_turns_interleaves_speakers():
    turns = service.merge_turns([
        {"speaker": "doctor", "start": 0, "end": 2, "text": "A"},
        {"speaker": "patient", "start": 1.2, "end": 4, "text": "B"},
        {"speaker": "doctor", "start": 4.5, "end": 5, "text": "C"},
        {"speaker": "doctor", "start": 5.5, "end": 6, "text": "D"},
    ])
    assert [(t["speaker"], t["text"]) for t in turns] == [("doctor", "A"), ("patient", "B"), ("doctor", "C D")]


def test_pipeline_review_and_approval(client, register, verified_doctor, fake_ai):
    doctor_headers, patient_headers, appointment_id, consultation_id = _ended_consultation(client, register, verified_doctor)

    assert _upload(client, patient_headers, consultation_id).status_code == 403
    uploaded = _upload(client, doctor_headers, consultation_id)
    assert uploaded.status_code == 202, uploaded.text

    # TestClient runs background tasks before returning, so processing is already done.
    doc = client.get(f"/api/consultations/{consultation_id}/documentation", headers=doctor_headers).json()
    assert doc["status"] == "ready_for_review"
    assert [t["speaker"] for t in doc["transcript"]] == ["doctor", "patient", "doctor"]
    assert doc["transcript"][1]["text"].startswith("Do hafte")  # Hinglish kept as spoken
    assert doc["draft_summary"]["assessment"] == "Likely post-viral cough"
    assert list((settings.recordings_dir / str(consultation_id)).glob("*")) == []  # audio deleted after transcription

    # Patients never see transcripts or unapproved drafts.
    assert client.get(f"/api/consultations/{consultation_id}/documentation", headers=patient_headers).status_code == 403
    patient_view = client.get(f"/api/appointments/{appointment_id}", headers=patient_headers).json()
    assert patient_view["consultation"]["summary"] is None

    edited = {**SUMMARY, "plan": "Honey, warm fluids. Paracetamol 500 mg if fever."}
    saved = client.put(
        f"/api/consultations/{consultation_id}/documentation",
        json={"summary": edited, "notes": "Draft"},
        headers=doctor_headers,
    )
    assert saved.json()["draft_summary"]["plan"].endswith("if fever.")
    assert saved.json()["ai_summary"]["plan"] == "Honey, warm fluids"  # original AI output preserved

    approved = client.post(
        f"/api/consultations/{consultation_id}/documentation/approve",
        json={"summary": edited, "notes": "Call if symptoms worsen."},
        headers=doctor_headers,
    )
    assert approved.json()["status"] == "approved"

    patient_view = client.get(f"/api/appointments/{appointment_id}", headers=patient_headers).json()
    assert patient_view["consultation"]["summary"]["plan"].endswith("if fever.")
    assert patient_view["consultation"]["notes"] == "Call if symptoms worsen."
    history = client.get("/api/consultations", headers=patient_headers).json()
    assert history["items"][0]["summary"]["assessment"] == "Likely post-viral cough"


def test_failure_keeps_transcript_and_retry_resumes(client, register, verified_doctor, fake_ai, monkeypatch):
    doctor_headers, _, _, consultation_id = _ended_consultation(client, register, verified_doctor)

    def broken(segments):
        raise AIServiceError("Summarization failed (503): overloaded")

    monkeypatch.setattr(summarizer, "summarize", broken)
    _upload(client, doctor_headers, consultation_id)
    doc = client.get(f"/api/consultations/{consultation_id}/documentation", headers=doctor_headers).json()
    assert doc["status"] == "failed" and doc["failed_stage"] == "summary" and doc["can_retry"]
    assert doc["transcript"]  # transcription succeeded and is kept

    # Manual notes still work while AI is failing.
    notes = client.put(f"/api/consultations/{consultation_id}/notes", json={"notes": "Manual note"}, headers=doctor_headers)
    assert notes.status_code == 200

    monkeypatch.setattr(summarizer, "summarize", lambda segments: dict(SUMMARY))
    retried = client.post(f"/api/consultations/{consultation_id}/documentation/retry", headers=doctor_headers)
    assert retried.status_code == 202
    doc = client.get(f"/api/consultations/{consultation_id}/documentation", headers=doctor_headers).json()
    assert doc["status"] == "ready_for_review"


def test_upload_rejected_when_not_configured(client, register, verified_doctor, monkeypatch):
    doctor_headers, _, _, consultation_id = _ended_consultation(client, register, verified_doctor)
    monkeypatch.setattr(settings, "groq_api_key", "")
    assert _upload(client, doctor_headers, consultation_id).status_code == 400
