import hashlib
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.core.config import settings
from app.core.security import require_admin
from app.db.session import SessionLocal, get_db
from app.models import Document, IngestionJob
from app.schemas.api import DocumentResponse, JobResponse
from app.services.ingestion import IngestionService, safe_filename
from app.services.parsers import DocumentParser

router = APIRouter(prefix="/api", tags=["documents"], dependencies=[Depends(require_admin)])
allowed_mimes = {
    "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown", "text/csv", "application/csv", "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream",
}


def run_ingestion(document_id: uuid.UUID, job_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        IngestionService(db).process(document_id, job_id)


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return list(db.scalars(select(Document).where(Document.workspace_id == workspace_id()).order_by(Document.created_at.desc())))


@router.post("/documents/upload", response_model=JobResponse)
async def upload_document(background: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)) -> IngestionJob:
    original = safe_filename(file.filename or "")
    suffix = Path(original).suffix.lower()
    if suffix not in DocumentParser.supported:
        raise HTTPException(status_code=415, detail="지원하지 않는 파일 형식입니다.")
    mime = file.content_type or mimetypes.guess_type(original)[0] or "application/octet-stream"
    if mime not in allowed_mimes:
        raise HTTPException(status_code=415, detail="허용되지 않은 MIME 형식입니다.")
    content = await file.read(settings.max_upload_size_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"파일은 {settings.max_upload_size_mb}MB를 초과할 수 없습니다.")
    digest = hashlib.sha256(content).hexdigest()
    duplicate = db.scalar(select(Document).where(Document.workspace_id == workspace_id(), Document.content_hash == digest))
    if duplicate:
        raise HTTPException(status_code=409, detail="이미 업로드된 동일한 문서입니다.")
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    stored = settings.storage_path / f"{uuid.uuid4().hex}{suffix}"
    stored.write_bytes(content)
    document = Document(workspace_id=workspace_id(), original_filename=original, stored_filename=str(stored), mime_type=mime, file_size=len(content), content_hash=digest, status="queued")
    db.add(document)
    db.flush()
    job = IngestionJob(workspace_id=workspace_id(), document_id=document.id, status="queued", stage="문서 분석 대기", progress=0)
    db.add(job)
    db.commit()
    db.refresh(job)
    background.add_task(run_ingestion, document.id, job.id)
    return job


@router.delete("/documents/{document_id}")
def delete_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, bool]:
    document = db.scalar(select(Document).where(Document.id == document_id, Document.workspace_id == workspace_id()))
    if not document:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    stored = Path(document.stored_filename)
    db.delete(document)
    db.commit()
    if stored.is_file() and settings.storage_path.resolve() in stored.resolve().parents:
        stored.unlink(missing_ok=True)
    return {"deleted": True}


@router.post("/documents/{document_id}/reindex", response_model=JobResponse)
def reindex_document(document_id: uuid.UUID, background: BackgroundTasks, db: Session = Depends(get_db)) -> IngestionJob:
    try:
        job = IngestionService(db).reindex(document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    background.add_task(run_ingestion, document_id, job.id)
    return job


@router.get("/ingestion-jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db)) -> IngestionJob:
    job = db.scalar(select(IngestionJob).where(IngestionJob.id == job_id, IngestionJob.workspace_id == workspace_id()))
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job
