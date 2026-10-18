class AIServiceError(Exception):
    """An external AI service failed or returned unusable output. The message is safe to show to the doctor."""
