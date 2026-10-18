"""The structured consultation summary: one free-text value per section."""

SUMMARY_FIELDS: dict[str, str] = {
    "chief_complaint": "Chief complaint",
    "symptoms": "Symptoms",
    "medical_history": "Relevant medical history",
    "current_medications": "Current medications",
    "allergies": "Allergies",
    "observations": "Important observations",
    "assessment": "Assessment / diagnosis discussed",
    "plan": "Treatment / medication plan",
    "follow_up": "Follow-up instructions",
}


def normalize_summary(raw: dict) -> dict[str, str]:
    """Keeps exactly the known sections as trimmed strings (missing → empty)."""
    return {key: str(raw.get(key) or "").strip() for key in SUMMARY_FIELDS}
