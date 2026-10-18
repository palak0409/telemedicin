from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.database.session import get_db
from app.features.auth.dependencies import CurrentUser, DoctorUser
from app.features.documentation import service, speech, summarizer
from app.features.documentation.schemas import DocumentationConfig, DocumentationOut, DocumentationReview

router = APIRouter(tags=["documentation"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/documentation/config", response_model=DocumentationConfig)
def documentation_config(user: CurrentUser):
    return DocumentationConfig(
        transcription_enabled=speech.is_configured(),
        summarization_enabled=summarizer.is_configured(),
    )


@router.post(
    "/consultations/{consultation_id}/documentation/recordings",
    response_model=DocumentationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def upload_recordings(
    consultation_id: int,
    doctor: DoctorUser,
    db: DB,
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    speakers: list[str] = Form(...),
    offsets: list[float] = Form(...),
):
    """
    Receives the consultation audio recorded in the doctor's browser — one file per
    speaker segment — and starts transcription + summarization in the background.
    """
    if not speech.is_configured():
        raise bad_request("AI documentation is not configured on this server.")
    if not len(files) == len(speakers) == len(offsets):
        raise bad_request("Each recording needs a speaker and an offset.")
    consultation = service.get_consultation(db, doctor, consultation_id)
    documentation = service.save_recordings(db, consultation, list(zip(files, speakers, offsets)))
    background.add_task(service.process_documentation, documentation.id)
    return service.to_out(documentation)


@router.get("/consultations/{consultation_id}/documentation", response_model=DocumentationOut)
def get_documentation(consultation_id: int, doctor: DoctorUser, db: DB):
    return service.to_out(service.get_documentation(db, doctor, consultation_id))


@router.put("/consultations/{consultation_id}/documentation", response_model=DocumentationOut)
def save_draft(consultation_id: int, data: DocumentationReview, doctor: DoctorUser, db: DB):
    documentation = service.get_documentation(db, doctor, consultation_id)
    service.save_draft(db, documentation, data)
    return service.to_out(documentation)


@router.post("/consultations/{consultation_id}/documentation/approve", response_model=DocumentationOut)
def approve(consultation_id: int, data: DocumentationReview, doctor: DoctorUser, db: DB):
    documentation = service.get_documentation(db, doctor, consultation_id)
    service.approve(db, doctor, documentation, data)
    return service.to_out(documentation)


@router.post(
    "/consultations/{consultation_id}/documentation/retry",
    response_model=DocumentationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def retry(consultation_id: int, doctor: DoctorUser, db: DB, background: BackgroundTasks):
    documentation = service.get_documentation(db, doctor, consultation_id)
    service.prepare_retry(db, documentation)
    background.add_task(service.process_documentation, documentation.id)
    return service.to_out(documentation)
