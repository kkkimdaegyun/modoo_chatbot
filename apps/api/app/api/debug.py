from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.core.security import require_admin
from app.db.session import get_db
from app.schemas.api import DebugRequest
from sqlalchemy import select
from app.models import ChatbotSetting
from app.services.context import ContextBuilder
from app.services.llm import PromptBuilder
from app.services.retrieval import RetrievalPipeline

router = APIRouter(prefix="/api/retrieval/debug", tags=["retrieval"], dependencies=[Depends(require_admin)])


def compact(item: dict) -> dict:
    return {
        "id": str(item.get("id")),
        "document": item.get("document_name"),
        "source_type": item.get("source_type"),
        "cosine_distance": item.get("cosine_distance"),
        "cosine_similarity": item.get("cosine_similarity"),
        "keyword_score": item.get("keyword_score"),
        "rrf_score": item.get("rrf_score"),
        "qa_boost": item.get("qa_boost"),
        "reranker_score": item.get("reranker_score"),
        "excerpt": str(item.get("content", ""))[:180],
    }


@router.post("")
def retrieval_debug(payload: DebugRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    result = RetrievalPipeline(db).retrieve(payload.question, str(workspace_id()))
    workspace_settings = db.scalar(select(ChatbotSetting).where(ChatbotSetting.workspace_id == workspace_id()))
    context, selected, token_count = ContextBuilder().build(result["final_results"], workspace_settings.max_context_tokens if workspace_settings else None)
    prompt = PromptBuilder().build(payload.question, context, system_policy=workspace_settings.system_prompt if workspace_settings else None)
    return {
        "original_question": result["original_question"],
        "normalized_question": result["normalized_question"],
        "search_query": result["search_query"],
        "dense_results": [compact(item) for item in result["dense_results"]],
        "keyword_results": [compact(item) for item in result["keyword_results"]],
        "rrf_results": [compact(item) for item in result["rrf_results"]],
        "reranker_fallback": result["reranker_fallback"],
        "final_results": [compact(item) for item in selected],
        "context_token_count": token_count,
        "prompt_preview": prompt[:6000],
        "duration_ms": result["duration_ms"],
    }
