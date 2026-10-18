"""
Structured consultation summary via the Google Gemini API.

The model is used strictly as a documentation assistant: it extracts what was
said in the transcript into fixed sections, returns JSON matching a schema, and
is instructed to leave a section empty rather than infer anything. The doctor
reviews and approves the result before it becomes part of the record.
"""
import json

import httpx

from app.core.config import settings
from app.features.documentation.errors import AIServiceError
from app.features.documentation.fields import SUMMARY_FIELDS, normalize_summary

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SECONDS = 90

SYSTEM_INSTRUCTION = """You help a doctor document a telemedicine consultation.
You receive a transcript with speaker labels (Doctor / Patient). It may be in English, Hindi or Hinglish.

Rules:
- Use ONLY information stated in the transcript. Never add diagnoses, medicines, doses, test results or advice that were not said.
- If a section was not discussed, return an empty string for it.
- Write concise clinical notes in English. Translate Hindi/Hinglish faithfully; keep medicine names, doses and numbers exactly as spoken.
- "assessment" is only what the doctor said about the likely cause or diagnosis. Do not give your own opinion.
- "plan" is only the treatment, medicines, tests or advice the doctor actually gave.
- Use short lines or "- " bullet points inside a section when there are several items."""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {key: {"type": "STRING", "description": label} for key, label in SUMMARY_FIELDS.items()},
    "required": list(SUMMARY_FIELDS),
}


def is_configured() -> bool:
    return bool(settings.gemini_api_key)


def format_transcript(segments: list[dict]) -> str:
    return "\n".join(f"{s['speaker'].title()}: {s['text']}" for s in segments)


def summarize(segments: list[dict]) -> dict[str, str]:
    if not is_configured():
        raise AIServiceError("Summarization is not configured (GEMINI_API_KEY is missing).")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": f"Transcript:\n{format_transcript(segments)}"}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }
    try:
        response = httpx.post(
            GEMINI_URL.format(model=settings.gemini_model),
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise AIServiceError(f"Could not reach the summarization service: {exc.__class__.__name__}") from exc

    if response.status_code != 200:
        try:
            detail = response.json()["error"]["message"][:200]
        except (ValueError, KeyError, TypeError):
            detail = response.text[:200]
        raise AIServiceError(f"Summarization failed ({response.status_code}): {detail}")

    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return normalize_summary(json.loads(text))
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIServiceError("The summarization service returned an unexpected response.") from exc
