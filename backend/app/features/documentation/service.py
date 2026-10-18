"""
AI-assisted consultation documentation: pipeline and doctor review.

    recordings uploaded → TRANSCRIBING (Groq Whisper) → SUMMARIZING (Gemini) → READY_FOR_REVIEW
                                                                                    │ doctor edits, approves
                                                                                    ▼
                                                                                 APPROVED  → visible to the patient
    Any AI failure → FAILED, with the stage recorded so a retry resumes there.

Processing runs as a background task after the upload request returns, so it
never blocks other API calls. The consultation itself, and manual notes, work
the same whether or not any of this succeeds.
"""
import logging
import shutil
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dates import utcnow
from app.core.errors import bad_request, conflict, not_found
from app.database.session import SessionLocal
from app.features.consultations.models import Consultation, ConsultationStatus
from app.features.documentation import speech, summarizer
from app.features.documentation.errors import AIServiceError
from app.features.documentation.fields import normalize_summary
from app.features.documentation.models import PROCESSING_STATUSES, ConsultationDocumentation, DocumentationStatus
from app.features.documentation.schemas import DocumentationOut, DocumentationReview
from app.features.notifications.service import notify
from app.features.users.models import User

logger = logging.getLogger(__name__)

SPEAKERS = ("doctor", "patient")
MAX_RECORDINGS = 12
MERGE_GAP_SECONDS = 1.5
STALE_AFTER = timedelta(minutes=10)
AUDIO_EXTENSIONS = {"audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}


# --- Access & serialization ---------------------------------------------------


def get_consultation(db: Session, doctor: User, consultation_id: int) -> Consultation:
    """Only the doctor of the consultation's appointment may work on its documentation."""
    consultation = db.get(Consultation, consultation_id)
    if consultation is None or consultation.appointment.doctor_id != doctor.id:
        raise not_found("Consultation")
    return consultation


def get_documentation(db: Session, doctor: User, consultation_id: int) -> ConsultationDocumentation:
    documentation = get_consultation(db, doctor, consultation_id).documentation
    if documentation is None:
        raise not_found("Documentation")
    return documentation


def _is_stale(documentation: ConsultationDocumentation) -> bool:
    """Processing that never finished, e.g. because the server restarted mid-way."""
    return documentation.status in PROCESSING_STATUSES and documentation.updated_at < utcnow() - STALE_AFTER


def to_out(documentation: ConsultationDocumentation) -> DocumentationOut:
    out = DocumentationOut.model_validate(documentation)
    out.notes = documentation.consultation.notes
    out.can_retry = documentation.status == DocumentationStatus.FAILED or _is_stale(documentation)
    return out


# --- Upload -------------------------------------------------------------------


def save_recordings(
    db: Session, consultation: Consultation, recordings: list[tuple[UploadFile, str, float]]
) -> ConsultationDocumentation:
    """Stores the uploaded audio privately and (re)starts documentation for this consultation."""
    if consultation.status != ConsultationStatus.ENDED:
        raise conflict("Recordings can be uploaded once the consultation has ended.")
    if not 0 < len(recordings) <= MAX_RECORDINGS:
        raise bad_request(f"Upload between 1 and {MAX_RECORDINGS} recordings.")

    documentation = consultation.documentation
    if documentation and documentation.status == DocumentationStatus.APPROVED:
        raise conflict("Documentation for this consultation has already been approved.")
    if documentation and documentation.status in PROCESSING_STATUSES and not _is_stale(documentation):
        raise conflict("This consultation is already being processed.")

    folder = settings.recordings_dir / str(consultation.id)
    if documentation:
        _delete_audio(documentation)
    folder.mkdir(parents=True, exist_ok=True)

    max_bytes = settings.max_recording_mb * 1024 * 1024
    pending = []
    for upload, speaker, offset in recordings:
        if speaker not in SPEAKERS:
            raise bad_request("Speaker must be 'doctor' or 'patient'.")
        extension = AUDIO_EXTENSIONS.get((upload.content_type or "").split(";")[0].strip())
        if extension is None:
            raise bad_request("Unsupported audio format.")
        content = upload.file.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise bad_request(f"Each recording must be smaller than {settings.max_recording_mb} MB.")
        if not content:
            continue
        path = folder / f"{speaker}-{uuid.uuid4().hex}.{extension}"
        path.write_bytes(content)
        pending.append({"path": str(path), "speaker": speaker, "offset_seconds": max(0.0, float(offset))})
    if not pending:
        raise bad_request("The recordings were empty.")

    if documentation is None:
        documentation = ConsultationDocumentation(consultation_id=consultation.id)
        db.add(documentation)
    documentation.status = DocumentationStatus.TRANSCRIBING
    documentation.pending_audio = pending
    documentation.failed_stage = None
    documentation.error_message = None
    documentation.transcript = None
    documentation.detected_languages = None
    documentation.ai_summary = None
    documentation.draft_summary = None
    db.commit()
    return documentation


# --- Background pipeline ------------------------------------------------------


def process_documentation(documentation_id: int) -> None:
    """Background task: transcribe (if not done yet), then summarize. Uses its own DB session."""
    with SessionLocal() as db:
        documentation = db.get(ConsultationDocumentation, documentation_id)
        if documentation is None:
            return
        appointment = documentation.consultation.appointment
        try:
            if documentation.transcript is None:
                _transcribe(db, documentation)
            _summarize(db, documentation)
        except AIServiceError as exc:
            logger.warning("Documentation %s failed at %s: %s", documentation_id, documentation.failed_stage, exc)
            documentation.status = DocumentationStatus.FAILED
            documentation.error_message = str(exc)[:500]
            notify(
                db,
                appointment.doctor_id,
                type="documentation_failed",
                title="AI documentation could not be completed",
                message="Open the consultation to retry, or write your notes manually.",
                link=f"/doctor/appointments/{appointment.id}",
            )
            return

        notify(
            db,
            appointment.doctor_id,
            type="documentation_ready",
            title="Consultation notes ready for review",
            message=f"An AI draft for your consultation with {appointment.patient.full_name} is ready to review.",
            link=f"/doctor/appointments/{appointment.id}",
        )


def merge_turns(segments: list[dict]) -> list[dict]:
    """Joins consecutive segments from the same speaker into conversational turns."""
    turns: list[dict] = []
    for segment in sorted(segments, key=lambda s: s["start"]):
        last = turns[-1] if turns else None
        if last and last["speaker"] == segment["speaker"] and segment["start"] - last["end"] <= MERGE_GAP_SECONDS:
            last["text"] = f"{last['text']} {segment['text']}"
            last["end"] = max(last["end"], segment["end"])
        else:
            turns.append(dict(segment))
    return turns


def _transcribe(db: Session, documentation: ConsultationDocumentation) -> None:
    """
    Each recording holds one speaker (the doctor's microphone or the patient's
    incoming audio), so speaker labels come from the recording, and segment times
    are shifted by the recording's offset to interleave both sides correctly.
    """
    documentation.status = DocumentationStatus.TRANSCRIBING
    documentation.failed_stage = "transcription"
    db.commit()

    segments, languages = [], []
    for item in documentation.pending_audio or []:
        path = Path(item["path"])
        if not path.exists():
            raise AIServiceError("The consultation recording is no longer available. Please write the notes manually.")
        file_segments, language = speech.transcribe_file(path)
        if language and language not in languages:
            languages.append(language)
        offset = item["offset_seconds"]
        segments += [
            {"speaker": item["speaker"], "start": round(s["start"] + offset, 2), "end": round(s["end"] + offset, 2), "text": s["text"]}
            for s in file_segments
        ]

    turns = merge_turns(segments)
    if not turns:
        raise AIServiceError("No speech was detected in the recording.")

    documentation.transcript = turns
    documentation.detected_languages = languages
    documentation.transcription_model = settings.groq_whisper_model
    _delete_audio(documentation)
    db.commit()


def _summarize(db: Session, documentation: ConsultationDocumentation) -> None:
    documentation.status = DocumentationStatus.SUMMARIZING
    documentation.failed_stage = "summary"
    db.commit()

    summary = summarizer.summarize(documentation.transcript)
    documentation.ai_summary = summary
    documentation.summary_model = settings.gemini_model
    if documentation.draft_summary is None:
        documentation.draft_summary = summary
    documentation.status = DocumentationStatus.READY_FOR_REVIEW
    documentation.failed_stage = None
    documentation.error_message = None
    db.commit()


def _delete_audio(documentation: ConsultationDocumentation) -> None:
    """Audio is only kept until it has been transcribed."""
    shutil.rmtree(settings.recordings_dir / str(documentation.consultation_id), ignore_errors=True)
    documentation.pending_audio = None


def prepare_retry(db: Session, documentation: ConsultationDocumentation) -> None:
    if not (documentation.status == DocumentationStatus.FAILED or _is_stale(documentation)):
        raise conflict("There is nothing to retry.")
    if documentation.transcript is None and not documentation.pending_audio:
        raise conflict("The recording is no longer available. Please write the notes manually.")
    documentation.status = (
        DocumentationStatus.TRANSCRIBING if documentation.transcript is None else DocumentationStatus.SUMMARIZING
    )
    documentation.error_message = None
    db.commit()


# --- Doctor review ------------------------------------------------------------


def save_draft(db: Session, documentation: ConsultationDocumentation, data: DocumentationReview) -> None:
    if documentation.status in PROCESSING_STATUSES and not _is_stale(documentation):
        raise conflict("Wait for processing to finish before editing.")
    documentation.draft_summary = normalize_summary(data.summary)
    documentation.consultation.notes = data.notes
    db.commit()


def approve(db: Session, doctor: User, documentation: ConsultationDocumentation, data: DocumentationReview) -> None:
    """
    The doctor's reviewed text becomes the final consultation record. Approving
    again later amends the record; the original AI output is kept unchanged.
    """
    if documentation.status in PROCESSING_STATUSES and not _is_stale(documentation):
        raise conflict("Wait for processing to finish before approving.")
    summary = normalize_summary(data.summary)
    if not any(summary.values()) and not data.notes:
        raise bad_request("Add at least one section or a note before approving.")

    first_approval = documentation.approved_at is None
    documentation.draft_summary = summary
    documentation.approved_summary = summary
    documentation.approved_at = utcnow()
    documentation.approved_by_id = doctor.id
    documentation.status = DocumentationStatus.APPROVED
    documentation.failed_stage = None
    documentation.error_message = None
    documentation.consultation.notes = data.notes
    _delete_audio(documentation)

    appointment = documentation.consultation.appointment
    notify(
        db,
        appointment.patient_id,
        type="consultation_summary_available" if first_approval else "consultation_summary_updated",
        title="Visit summary available" if first_approval else "Visit summary updated",
        message=f"{doctor.display_name} has {'added' if first_approval else 'updated'} the summary of your consultation.",
        link=f"/patient/appointments/{appointment.id}",
    )
