import json
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.db.session import SessionLocal, get_db
from app.models import ChatbotSetting, Conversation, Message
from app.services.context import ContextBuilder
from app.services.llm import GeminiProvider, PromptBuilder
from app.services.llm.gemini_provider import GeminiConfigurationError, GeminiGenerationError
from app.services.llm.schemas import ChatRequest, ChatResponse
from app.services.retrieval import RetrievalPipeline

router = APIRouter(prefix="/api/chat", tags=["chat"])
NO_CONTEXT = "업로드된 문서에서는 해당 내용을 확인하기 어렵습니다."


def sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def run_retrieval(db: Session, payload: ChatRequest) -> tuple[dict, str, list[dict], str | None]:
    result = RetrievalPipeline(db).retrieve(payload.question, str(workspace_id()))
    workspace_settings = db.scalar(select(ChatbotSetting).where(ChatbotSetting.workspace_id == workspace_id()))
    context, selected, _ = ContextBuilder().build(result["final_results"], workspace_settings.max_context_tokens if workspace_settings else None)
    return result, context, selected, workspace_settings.system_prompt if workspace_settings else None


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    result, context, selected, system_prompt = run_retrieval(db, payload)
    if not selected:
        return ChatResponse(answer=NO_CONTEXT, sources=[])
    prompt = PromptBuilder().build(payload.question, context, payload.conversation_history, system_prompt)
    try:
        answer = GeminiProvider().generate(prompt)
    except GeminiConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    answer = GeminiProvider.sanitize_citations(answer, {item["source_id"] for item in selected})
    return ChatResponse(answer=answer, sources=ContextBuilder.public_sources(selected))


@router.post("/stream")
def chat_stream(payload: ChatRequest) -> StreamingResponse:
    def events() -> Iterator[str]:
        yield sse("retrieval_started", {"message": "문서에서 근거를 찾고 있습니다."})
        with SessionLocal() as db:
            try:
                result, context, selected, system_prompt = run_retrieval(db, payload)
                public_sources = ContextBuilder.public_sources(selected)
                yield sse("retrieval_completed", {"count": len(selected), "duration_ms": result["duration_ms"]})
                if not selected:
                    yield sse("token", {"text": NO_CONTEXT})
                    yield sse("sources", {"sources": []})
                    yield sse("completed", {"finish_reason": "no_context"})
                    return
                prompt = PromptBuilder().build(payload.question, context, payload.conversation_history, system_prompt)
                yield sse("generation_started", {"model": "gemini"})
                allowed = {item["source_id"] for item in selected}
                for token in GeminiProvider().generate_stream(prompt):
                    yield sse("token", {"text": GeminiProvider.sanitize_citations(token, allowed)})
                yield sse("sources", {"sources": public_sources})
                yield sse("completed", {"finish_reason": "stop"})
            except GeminiConfigurationError as exc:
                yield sse("error", {"type": "configuration", "message": str(exc)})
            except GeminiGenerationError as exc:
                yield sse("error", {"type": "generation", "message": str(exc)})
            except Exception:
                yield sse("error", {"type": "internal", "message": "검색 또는 답변 생성 중 오류가 발생했습니다."})
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


conversations_router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@conversations_router.get("")
def list_conversations(db: Session = Depends(get_db)) -> list[dict[str, object]]:
    items = db.scalars(select(Conversation).where(Conversation.workspace_id == workspace_id()).order_by(Conversation.updated_at.desc())).all()
    return [{"id": str(item.id), "title": item.title, "created_at": item.created_at} for item in items]


@conversations_router.get("/{conversation_id}")
def get_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, object]:
    item = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.workspace_id == workspace_id()))
    if not item:
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    messages = db.scalars(select(Message).where(Message.conversation_id == item.id).order_by(Message.created_at)).all()
    return {"id": str(item.id), "title": item.title, "messages": [{"role": message.role, "content": message.content, "cited_source_ids": message.cited_source_ids} for message in messages]}


@conversations_router.delete("/{conversation_id}")
def delete_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.workspace_id == workspace_id()))
    if not item:
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    db.delete(item)
    db.commit()
    return {"deleted": True}
