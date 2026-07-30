import hashlib
import re
import uuid
from pathlib import Path

import structlog
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Document, DocumentChunk, IngestionJob, QaItem
from app.services.chunking import StructureAwareChunker
from app.services.embeddings import BGEEmbeddingService
from app.services.parsers import DocumentParser

logger = structlog.get_logger(__name__)

# 임베딩 단계가 차지하는 진행률 구간.
EMBED_PROGRESS_START = 50
EMBED_PROGRESS_END = 75


def safe_filename(filename: str) -> str:
    name = Path(filename).name
    stem = re.sub(r"[^\w가-힣.-]+", "_", name, flags=re.UNICODE).strip("._")
    return stem[:180] or "document"


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def fail_interrupted_jobs() -> None:
    """인제스션은 API 프로세스 안에서 돌기 때문에 재시작하면 중단된다.

    그대로 두면 문서가 'processing'에 영구히 멈춘 것처럼 보이므로, 시작할 때
    실패로 정리해서 관리자가 재인덱싱을 누를 수 있게 한다.
    """
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        jobs = list(db.scalars(select(IngestionJob).where(IngestionJob.status.in_(["queued", "processing"]))))
        if not jobs:
            return
        for job in jobs:
            job.status = "failed"
            job.stage = "서버 재시작으로 중단"
            job.error_message = "처리 중 서버가 재시작되었습니다. 재인덱싱을 실행해 주세요."
            document = db.get(Document, job.document_id)
            if document and document.status not in ("ready",):
                document.status = "failed"
                document.error_message = job.error_message
        db.commit()
        logger.warning("interrupted_ingestion_jobs_failed", count=len(jobs))


class IngestionService:
    def __init__(self, db: Session, embeddings: BGEEmbeddingService | None = None) -> None:
        self.db = db
        self.embeddings = embeddings or BGEEmbeddingService()
        self.parser = DocumentParser()
        self.chunker = StructureAwareChunker()

    def process(self, document_id: uuid.UUID, job_id: uuid.UUID) -> None:
        document = self.db.get(Document, document_id)
        job = self.db.get(IngestionJob, job_id)
        if not document or not job:
            return
        try:
            self._stage(document, job, "processing", "문서 분석 중", 10)
            path = Path(document.stored_filename)
            parsed = self.parser.parse(path)
            self._stage(document, job, "processing", "청크 생성 중", 30)
            chunks = self.chunker.chunk(parsed.blocks)
            if not chunks:
                raise ValueError("문서에서 검색 가능한 텍스트를 찾지 못했습니다.")
            vectors = self._embed_with_progress(document, job, [chunk.content for chunk in chunks])
            self._stage(document, job, "processing", "검색 인덱스 생성 중", 78)
            qa_models: list[QaItem] = []
            if parsed.source_type == "qa":
                for item in parsed.qa_items:
                    digest = hashlib.sha256(item["question"].strip().lower().encode("utf-8")).hexdigest()
                    existing = self.db.scalar(select(QaItem).where(QaItem.workspace_id == document.workspace_id, QaItem.question_hash == digest))
                    if existing:
                        qa_models.append(existing)
                    else:
                        qa = QaItem(workspace_id=document.workspace_id, question=item["question"], answer=item["answer"], category=item["category"], question_hash=digest)
                        self.db.add(qa)
                        self.db.flush()
                        qa_models.append(qa)
            for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
                digest = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
                self.db.add(DocumentChunk(
                    workspace_id=document.workspace_id,
                    document_id=document.id,
                    qa_item_id=qa_models[index].id if index < len(qa_models) else None,
                    source_type=parsed.source_type,
                    content=chunk.content,
                    embedding=vector,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    sheet_name=chunk.sheet_name,
                    row_number=chunk.row_number,
                    token_count=chunk.token_count,
                    chunk_index=chunk.chunk_index,
                    chunk_metadata=chunk.metadata,
                    content_hash=digest,
                ))
            document.page_count = parsed.page_count
            document.chunk_count = len(chunks)
            document.status = "ready"
            document.error_message = "\n".join(parsed.warnings) if parsed.warnings else None
            job.status = "completed"
            job.stage = "지식 반영 완료"
            job.progress = 100
            self.db.commit()
            logger.info("document_ingestion_completed", document_id=str(document.id), chunks=len(chunks))
        except Exception as exc:
            self.db.rollback()
            document = self.db.get(Document, document_id)
            job = self.db.get(IngestionJob, job_id)
            if document and job:
                document.status = "failed"
                document.error_message = str(exc)[:500]
                job.status = "failed"
                job.stage = "처리 실패"
                job.error_message = str(exc)[:500]
                self.db.commit()
            logger.exception("document_ingestion_failed", document_id=str(document_id), error_type=type(exc).__name__)

    def reindex(self, document_id: uuid.UUID) -> IngestionJob:
        document = self.db.get(Document, document_id)
        if not document:
            raise ValueError("문서를 찾을 수 없습니다.")
        self.db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        document.status = "queued"
        document.chunk_count = 0
        job = IngestionJob(workspace_id=document.workspace_id, document_id=document.id, status="queued", stage="재인덱싱 대기", progress=0)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def _embed_with_progress(self, document: Document, job: IngestionJob, texts: list[str]) -> list[list[float]]:
        """임베딩이 가장 오래 걸리는 단계라, 배치마다 진행률을 올려서 막대가 실제로 움직이게 한다."""
        total = len(texts)
        batch_size = max(settings.embedding_batch_size, 1)
        span = EMBED_PROGRESS_END - EMBED_PROGRESS_START
        vectors: list[list[float]] = []
        self._stage(document, job, "processing", f"임베딩 생성 중 (0/{total} 청크)", EMBED_PROGRESS_START)
        for start in range(0, total, batch_size):
            vectors.extend(self.embeddings.encode_documents(texts[start:start + batch_size]))
            done = min(start + batch_size, total)
            self._stage(
                document, job, "processing",
                f"임베딩 생성 중 ({done}/{total} 청크)",
                EMBED_PROGRESS_START + round(span * done / total),
            )
        return vectors

    def _stage(self, document: Document, job: IngestionJob, status: str, stage: str, progress: int) -> None:
        document.status = status
        job.status = status
        job.stage = stage
        job.progress = progress
        self.db.commit()
