from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.core.security import require_admin
from app.db.session import get_db
from app.models import ChatbotSetting, Document
from app.schemas.api import ChatIntroDocument, ChatIntroResponse, SettingsUpdate, SuggestionItem

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_admin)])
# 첫 화면 문구와 예시 질문은 로그인하지 않은 고객이 보는 값이라 인증을 걸지 않는다.
# 검색 파라미터·시스템 프롬프트는 이 라우터로 나가지 않는다.
public_router = APIRouter(prefix="/api/chat-intro", tags=["chat-intro"])

DEFAULT_CHAT_TITLE = "고객상담 어시스턴트"
# "연결된 문서" 는 관리자 쪽 용어다. 고객은 무엇이 연결됐는지 알 필요도, 알 방법도 없다.
# 관리자가 시작 화면 탭에서 고객사 말투로 바꿔 쓰는 것이 전제이고, 이건 그 전까지 쓰는 기본값이다.
DEFAULT_WELCOME_HEADING = "무엇을 도와드릴까요?"
DEFAULT_WELCOME_MESSAGE = "안내 자료를 확인해서 정확한 내용으로 답변해 드립니다."
DEFAULT_SUGGESTIONS = [
    {"question": "환불은 언제까지 신청할 수 있나요?", "hint": ""},
    {"question": "배송은 보통 며칠 걸리나요?", "hint": ""},
    {"question": "주말에도 상담할 수 있나요?", "hint": ""},
]


def get_or_create(db: Session) -> ChatbotSetting:
    item = db.scalar(select(ChatbotSetting).where(ChatbotSetting.workspace_id == workspace_id()))
    if not item:
        item = ChatbotSetting(workspace_id=workspace_id())
        db.add(item)
        db.commit()
        db.refresh(item)
    return item


def _settings_payload(item: ChatbotSetting) -> dict[str, object]:
    return {
        "system_prompt": item.system_prompt,
        "final_context_top_k": item.final_context_top_k,
        "max_context_tokens": item.max_context_tokens,
        "qa_priority_boost": item.qa_priority_boost,
        "chat_title": item.chat_title,
        "welcome_heading": item.welcome_heading,
        "welcome_message": item.welcome_message,
        "suggestions": item.suggestions or [],
        "show_documents": item.show_documents,
    }


@router.get("")
def get_settings(db: Session = Depends(get_db)) -> dict[str, object]:
    return _settings_payload(get_or_create(db))


@router.put("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> dict[str, object]:
    item = get_or_create(db)
    values = payload.model_dump()
    # 빈 문자열을 그대로 저장하면 첫 화면 제목이 사라진다. 비우면 기본 문구로 되돌린다.
    for key in ["chat_title", "welcome_heading", "welcome_message"]:
        text = (values.get(key) or "").strip()
        values[key] = text or None
    values["suggestions"] = [
        {"question": item_["question"].strip(), "hint": (item_.get("hint") or "").strip()}
        for item_ in values["suggestions"]
        if item_["question"].strip()
    ]
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _settings_payload(item)


@public_router.get("", response_model=ChatIntroResponse)
def get_chat_intro(db: Session = Depends(get_db)) -> ChatIntroResponse:
    item = get_or_create(db)
    # 노출하지 않기로 한 설정이면 목록 자체를 담지 않는다. 화면에서만 감추면
    # 이 응답을 직접 열어 본 사람에게는 파일명이 그대로 보인다.
    documents = list(db.scalars(
        select(Document)
        .where(Document.workspace_id == workspace_id(), Document.status == "ready", Document.is_active.is_(True))
        .order_by(Document.original_filename)
    )) if item.show_documents else []
    raw = item.suggestions or DEFAULT_SUGGESTIONS
    return ChatIntroResponse(
        chat_title=item.chat_title or DEFAULT_CHAT_TITLE,
        welcome_heading=item.welcome_heading or DEFAULT_WELCOME_HEADING,
        welcome_message=item.welcome_message or DEFAULT_WELCOME_MESSAGE,
        suggestions=[SuggestionItem(question=one["question"], hint=one.get("hint") or "") for one in raw],
        show_documents=item.show_documents,
        documents=[
            ChatIntroDocument(name=doc.original_filename, page_count=doc.page_count, chunk_count=doc.chunk_count)
            for doc in documents
        ],
        document_count=len(documents),
        chunk_count=sum(doc.chunk_count for doc in documents),
    )
