"""
Speech-to-text through Groq's hosted Whisper API (no local inference).

The language is deliberately *not* fixed: Whisper detects it per recording, so
English, Hindi and Hinglish are transcribed as spoken rather than translated.
The prompt only lists common clinical vocabulary, which improves spelling of
drug names and units without steering the output toward one language.
"""
from pathlib import Path

import httpx

from app.core.config import settings
from app.features.documentation.errors import AIServiceError

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
VOCABULARY_PROMPT = (
    "Doctor-patient consultation. Paracetamol, ibuprofen, amoxicillin, azithromycin, metformin, amlodipine, "
    "cetirizine, BP, blood sugar, HbA1c, ECG, mg, ml, twice daily, before food, after food."
)
TIMEOUT_SECONDS = 180


def is_configured() -> bool:
    return bool(settings.groq_api_key)


def transcribe_file(path: Path) -> tuple[list[dict], str | None]:
    """Returns ([{start, end, text}], detected_language) for one audio file."""
    if not is_configured():
        raise AIServiceError("Speech-to-text is not configured (GROQ_API_KEY is missing).")

    try:
        with path.open("rb") as audio:
            response = httpx.post(
                GROQ_TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                files={"file": (path.name, audio, "application/octet-stream")},
                data={
                    "model": settings.groq_whisper_model,
                    "response_format": "verbose_json",
                    "temperature": "0",
                    "prompt": VOCABULARY_PROMPT,
                },
                timeout=TIMEOUT_SECONDS,
            )
    except httpx.HTTPError as exc:
        raise AIServiceError(f"Could not reach the speech-to-text service: {exc.__class__.__name__}") from exc

    if response.status_code != 200:
        raise AIServiceError(f"Speech-to-text failed ({response.status_code}): {_error_text(response)}")

    body = response.json()
    segments = [
        {"start": float(s["start"]), "end": float(s["end"]), "text": s["text"].strip()}
        for s in body.get("segments", [])
        if s.get("text", "").strip()
    ]
    if not segments and body.get("text", "").strip():
        segments = [{"start": 0.0, "end": float(body.get("duration") or 0), "text": body["text"].strip()}]
    return segments, body.get("language")


def _error_text(response: httpx.Response) -> str:
    try:
        return response.json()["error"]["message"][:200]
    except (ValueError, KeyError, TypeError):
        return response.text[:200]
