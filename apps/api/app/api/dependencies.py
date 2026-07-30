import uuid

from app.core.config import settings


def workspace_id() -> uuid.UUID:
    return uuid.UUID(settings.default_workspace_id)
