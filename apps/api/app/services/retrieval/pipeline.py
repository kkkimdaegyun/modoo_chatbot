import re
import time
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatbotSetting
from app.services.embeddings import BGEEmbeddingService
from app.services.reranking import BGERerankerService


def normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", question.strip())


def reciprocal_rank_fusion(
    rankings: list[list[dict[str, Any]]],
    k: int = 60,
    qa_boost: float = 1.0,
) -> list[dict[str, Any]]:
    scores: dict[str, float] = defaultdict(float)
    items: dict[str, dict[str, Any]] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            key = str(item["id"])
            scores[key] += 1.0 / (k + rank)
            items[key] = {**items.get(key, {}), **item}
    output = []
    for key, score in scores.items():
        item = items[key]
        boost = qa_boost if item.get("source_type") == "qa" else 1.0
        output.append({**item, "rrf_score": score, "qa_boost": boost, "fused_score": score * boost})
    return sorted(output, key=lambda item: item["fused_score"], reverse=True)


class RetrievalPipeline:
    def __init__(self, db: Session, embeddings: BGEEmbeddingService | None = None, reranker: BGERerankerService | None = None) -> None:
        self.db = db
        self.embeddings = embeddings or BGEEmbeddingService()
        self.reranker = reranker or BGERerankerService()

    def retrieve(self, question: str, workspace_id: str) -> dict[str, Any]:
        started = time.perf_counter()
        normalized = normalize_question(question)
        query_vector = self.embeddings.encode_query(normalized)
        dense = self._dense_search(query_vector, workspace_id)
        keyword = self._keyword_search(normalized, workspace_id)
        workspace_settings = self.db.query(ChatbotSetting).filter(ChatbotSetting.workspace_id == uuid.UUID(workspace_id)).one_or_none()
        qa_boost = workspace_settings.qa_priority_boost if workspace_settings else settings.qa_priority_boost
        final_top_k = workspace_settings.final_context_top_k if workspace_settings else settings.final_context_top_k
        fused = reciprocal_rank_fusion([dense, keyword], settings.rrf_k, qa_boost)
        reranked, fallback = self.reranker.rerank(normalized, fused[: settings.rerank_candidates])
        deduplicated = self._deduplicate(reranked)
        final = deduplicated[:final_top_k]
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "original_question": question,
            "normalized_question": normalized,
            "search_query": normalized,
            "dense_results": dense,
            "keyword_results": keyword,
            "rrf_results": fused,
            "reranker_fallback": fallback,
            "final_results": final,
            "duration_ms": duration_ms,
        }

    def _dense_search(self, query_vector: list[float], workspace_id: str) -> list[dict[str, Any]]:
        statement = text("""
            SELECT c.id, c.document_id, c.source_type, c.content, c.page_number,
                   c.section_title, c.sheet_name, c.row_number, c.token_count,
                   d.original_filename AS document_name,
                   (c.embedding <=> CAST(:embedding AS vector)) AS cosine_distance
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            LEFT JOIN qa_items q ON q.id = c.qa_item_id
            WHERE c.workspace_id = CAST(:workspace_id AS uuid)
              AND d.is_active = true AND d.status = 'ready'
              AND (c.qa_item_id IS NULL OR q.is_active = true)
            ORDER BY c.embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """)
        rows = self.db.execute(statement, {"embedding": str(query_vector), "workspace_id": workspace_id, "top_k": settings.dense_retrieval_top_k}).mappings()
        return [{**dict(row), "id": str(row["id"]), "document_id": str(row["document_id"]), "cosine_distance": float(row["cosine_distance"]), "cosine_similarity": 1.0 - float(row["cosine_distance"])} for row in rows if 1.0 - float(row["cosine_distance"]) >= settings.similarity_threshold]

    def _keyword_search(self, question: str, workspace_id: str) -> list[dict[str, Any]]:
        statement = text("""
            SELECT c.id, c.document_id, c.source_type, c.content, c.page_number,
                   c.section_title, c.sheet_name, c.row_number, c.token_count,
                   d.original_filename AS document_name,
                   ts_rank_cd(c.search_vector, plainto_tsquery('simple', :question)) AS keyword_score
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            LEFT JOIN qa_items q ON q.id = c.qa_item_id
            WHERE c.workspace_id = CAST(:workspace_id AS uuid)
              AND d.is_active = true AND d.status = 'ready'
              AND c.search_vector @@ plainto_tsquery('simple', :question)
              AND (c.qa_item_id IS NULL OR q.is_active = true)
            ORDER BY keyword_score DESC
            LIMIT :top_k
        """)
        try:
            rows = self.db.execute(statement, {"question": question, "workspace_id": workspace_id, "top_k": settings.keyword_retrieval_top_k}).mappings()
            return [{**dict(row), "id": str(row["id"]), "document_id": str(row["document_id"]), "keyword_score": float(row["keyword_score"])} for row in rows]
        except Exception:
            self.db.rollback()
            return []

    @staticmethod
    def _deduplicate(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen_ids: set[str] = set()
        seen_normalized: set[str] = set()
        document_counts: dict[str, int] = defaultdict(int)
        output: list[dict[str, Any]] = []
        for item in items:
            item_id = str(item["id"])
            normalized = re.sub(r"\W+", "", item["content"]).lower()[:400]
            document_id = str(item["document_id"])
            if item_id in seen_ids or normalized in seen_normalized or document_counts[document_id] >= 3:
                continue
            seen_ids.add(item_id)
            seen_normalized.add(normalized)
            document_counts[document_id] += 1
            output.append(item)
        return output
