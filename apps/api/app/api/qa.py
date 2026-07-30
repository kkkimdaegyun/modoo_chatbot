import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.core.config import settings
from app.core.security import require_admin
from app.db.session import get_db
from app.models import Document, DocumentChunk, QaItem
from app.schemas.api import QaCreate, QaResponse
from app.services.chunking.chunker import TokenCounter
from app.services.embeddings import BGEEmbeddingService
from app.services.parsers import DocumentParser

router = APIRouter(prefix="/api/qa", tags=["qa"], dependencies=[Depends(require_admin)])


def qa_document(db: Session) -> Document:
    document = db.scalar(select(Document).where(Document.workspace_id == workspace_id(), Document.original_filename == "관리자 QA"))
    if document:
        return document
    document = Document(workspace_id=workspace_id(), original_filename="관리자 QA", stored_filename="", mime_type="application/x-ela-qa", file_size=0, content_hash=hashlib.sha256(b"admin-qa").hexdigest(), status="ready", is_active=True)
    db.add(document)
    db.flush()
    return document


def add_qa(payload: QaCreate, db: Session) -> QaItem:
    digest = hashlib.sha256(payload.question.strip().lower().encode()).hexdigest()
    if db.scalar(select(QaItem).where(QaItem.workspace_id == workspace_id(), QaItem.question_hash == digest)):
        raise HTTPException(status_code=409, detail="동일한 질문이 이미 등록되어 있습니다.")
    item = QaItem(workspace_id=workspace_id(), question=payload.question, answer=payload.answer, category=payload.category, question_hash=digest, is_active=payload.is_active)
    db.add(item)
    db.flush()
    content = DocumentParser.qa_embedding_text(payload.model_dump())
    vector = BGEEmbeddingService().encode_query(content)
    document = qa_document(db)
    db.add(DocumentChunk(workspace_id=workspace_id(), document_id=document.id, qa_item_id=item.id, source_type="qa", content=content, embedding=vector, section_title=item.category, token_count=TokenCounter().count(content), chunk_index=document.chunk_count, chunk_metadata={"source": "admin"}, content_hash=hashlib.sha256(content.encode()).hexdigest()))
    document.chunk_count += 1
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[QaResponse])
def list_qa(db: Session = Depends(get_db)) -> list[QaItem]:
    return list(db.scalars(select(QaItem).where(QaItem.workspace_id == workspace_id()).order_by(QaItem.created_at.desc())))


@router.post("", response_model=QaResponse)
def create_qa(payload: QaCreate, db: Session = Depends(get_db)) -> QaItem:
    return add_qa(payload, db)


@router.put("/{qa_id}", response_model=QaResponse)
def update_qa(qa_id: uuid.UUID, payload: QaCreate, db: Session = Depends(get_db)) -> QaItem:
    item = db.scalar(select(QaItem).where(QaItem.id == qa_id, QaItem.workspace_id == workspace_id()))
    if not item:
        raise HTTPException(status_code=404, detail="QA를 찾을 수 없습니다.")
    db.execute(delete(DocumentChunk).where(DocumentChunk.qa_item_id == item.id))
    item.question, item.answer, item.category, item.is_active = payload.question, payload.answer, payload.category, payload.is_active
    item.question_hash = hashlib.sha256(payload.question.strip().lower().encode()).hexdigest()
    content = DocumentParser.qa_embedding_text(payload.model_dump())
    vector = BGEEmbeddingService().encode_query(content)
    document = qa_document(db)
    db.add(DocumentChunk(workspace_id=workspace_id(), document_id=document.id, qa_item_id=item.id, source_type="qa", content=content, embedding=vector, section_title=item.category, token_count=TokenCounter().count(content), chunk_index=document.chunk_count, chunk_metadata={"source": "admin"}, content_hash=hashlib.sha256(content.encode()).hexdigest()))
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{qa_id}")
def delete_qa(qa_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.scalar(select(QaItem).where(QaItem.id == qa_id, QaItem.workspace_id == workspace_id()))
    if not item:
        raise HTTPException(status_code=404, detail="QA를 찾을 수 없습니다.")
    db.delete(item)
    db.commit()
    return {"deleted": True}


@router.post("/import")
async def import_qa(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict[str, int]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".csv", ".json"}:
        raise HTTPException(status_code=415, detail="QA 가져오기는 CSV와 JSON 형식만 지원합니다.")
    content = await file.read(settings.max_upload_size_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="파일 크기 제한을 초과했습니다.")
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    temporary = settings.storage_path / f"qa-import-{uuid.uuid4().hex}{suffix}"
    temporary.write_bytes(content)
    try:
        parsed = DocumentParser().parse(temporary)
        if parsed.source_type != "qa":
            raise HTTPException(status_code=422, detail="question, answer 필드를 가진 QA 데이터가 아닙니다.")
        imported = 0
        duplicates = 0
        for item in parsed.qa_items:
            try:
                add_qa(QaCreate(**item), db)
                imported += 1
            except HTTPException as exc:
                if exc.status_code == 409:
                    duplicates += 1
                else:
                    raise
        return {"imported": imported, "duplicates": duplicates}
    finally:
        temporary.unlink(missing_ok=True)
