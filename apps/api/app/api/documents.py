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
from app.schemas.api import DocumentResponse, JobResponse, KnowledgeDocument
from app.services.ingestion import IngestionService, safe_filename
from app.services.parsers import DocumentParser

router = APIRouter(prefix="/api", tags=["documents"], dependencies=[Depends(require_admin)])
# 채팅 화면은 로그인이 없으므로 "무엇이 임베딩됐는지"만 보여주는 공개 라우터를 따로 둔다.
# 파일명이 내부 문서 구성을 드러내므로 인증을 요구한다.
# 예전에는 채팅 화면 우측 패널이 인증 없이 이 목록을 읽었지만, 그 패널을 없애면서
# 고객 화면에서 쓰는 곳이 사라졌다. 고객에게 학습 범위를 알리고 싶을 때는
# 관리자 페이지에서 노출을 켜고 /api/chat-intro 를 쓴다.
knowledge_router = APIRouter(prefix="/api/knowledge", tags=["knowledge"], dependencies=[Depends(require_admin)])
allowed_mimes = {
    "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown", "text/csv", "application/csv", "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream",
}


def run_ingestion(document_id: uuid.UUID, job_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        IngestionService(db).process(document_id, job_id)


def _with_progress(document: Document, job: IngestionJob | None) -> DocumentResponse:
    response = DocumentResponse.model_validate(document)
    if document.status == "ready":
        response.progress = 100
        response.stage = job.stage if job else "지식 반영 완료"
        return response
    if job:
        response.progress = job.progress
        response.stage = job.stage
        response.error_message = job.error_message
    return response


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db)) -> list[DocumentResponse]:
    documents = list(db.scalars(select(Document).where(Document.workspace_id == workspace_id()).order_by(Document.created_at.desc())))
    if not documents:
        return []
    # 문서별 최신 작업만 남긴다. 오름차순으로 넣으므로 마지막 값이 최신이다.
    latest: dict[uuid.UUID, IngestionJob] = {}
    for job in db.scalars(
        select(IngestionJob)
        .where(IngestionJob.document_id.in_([document.id for document in documents]))
        .order_by(IngestionJob.created_at)
    ):
        latest[job.document_id] = job
    return [_with_progress(document, latest.get(document.id)) for document in documents]


@knowledge_router.get("/documents", response_model=list[KnowledgeDocument])
def list_knowledge(db: Session = Depends(get_db)) -> list[Document]:
    """답변 근거로 쓸 수 있는(임베딩 완료된) 문서 목록. 파일명과 규모만 노출한다."""
    return list(db.scalars(
        select(Document)
        .where(Document.workspace_id == workspace_id(), Document.status == "ready", Document.is_active.is_(True))
        .order_by(Document.original_filename)
    ))


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
