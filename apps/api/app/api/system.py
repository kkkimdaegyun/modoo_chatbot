from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.embeddings import BGEEmbeddingService
from app.services.llm import GeminiProvider
from app.services.reranking import BGERerankerService

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@router.get("/api/system/status")
def system_status() -> dict[str, object]:
    database_connected = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            database_connected = True
    except Exception:
        pass
    try:
        settings.storage_path.mkdir(parents=True, exist_ok=True)
        storage_available = settings.storage_path.is_dir()
    except OSError:
        storage_available = False
    embedding = BGEEmbeddingService().health_check()
    reranker = BGERerankerService().health_check()
    gemini = GeminiProvider().health_check()
    return {
        "database_connected": database_connected,
        "embedding_model_loaded": embedding["loaded"],
        "embedding_device": embedding["device"],
        "reranker_model_loaded": reranker["loaded"],
        "reranker_device": reranker["device"],
        "gemini_configured": gemini["configured"],
        "gemini_model": gemini["model"],
        "storage_available": storage_available,
    }
