from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)


class AccountResponse(BaseModel):
    username: str
    name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AccountResponse | None = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    original_filename: str
    status: str
    page_count: int
    chunk_count: int
    created_at: datetime
    progress: int = 0
    stage: str | None = None
    error_message: str | None = None


class KnowledgeDocument(BaseModel):
    """채팅 화면에 공개되는 최소 정보. 저장 경로나 내부 상태는 노출하지 않는다."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    original_filename: str
    page_count: int
    chunk_count: int


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    stage: str
    progress: int
    error_message: str | None = None


class QaCreate(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    answer: str = Field(min_length=2, max_length=12_000)
    category: str = Field(default="일반", max_length=160)
    is_active: bool = True


class QaResponse(QaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class SuggestionItem(BaseModel):
    """첫 화면 예시 질문 카드 하나. hint 에는 근거 문서명처럼 짧은 부연을 넣는다."""
    question: str = Field(min_length=2, max_length=200)
    hint: str = Field(default="", max_length=120)


class SettingsUpdate(BaseModel):
    system_prompt: str | None = None
    final_context_top_k: int = Field(default=7, ge=1, le=12)
    max_context_tokens: int = Field(default=10_000, ge=1000, le=50_000)
    qa_priority_boost: float = Field(default=1.15, ge=1.0, le=2.0)
    chat_title: str | None = Field(default=None, max_length=120)
    welcome_heading: str | None = Field(default=None, max_length=200)
    welcome_message: str | None = Field(default=None, max_length=400)
    # 카드가 너무 많으면 첫 화면이 스크롤되므로 9개로 제한한다.
    suggestions: list[SuggestionItem] = Field(default_factory=list, max_length=9)
    # 파일명이 고객에게 그대로 보이므로 기본은 꺼 둔다.
    show_documents: bool = False


class ChatIntroDocument(BaseModel):
    name: str
    page_count: int
    chunk_count: int


class ChatIntroResponse(BaseModel):
    """인증 없이 채팅 화면이 읽는 첫 화면 구성. 내부 검색 설정은 담지 않는다."""
    chat_title: str
    welcome_heading: str
    welcome_message: str
    suggestions: list[SuggestionItem]
    show_documents: bool
    documents: list[ChatIntroDocument]
    document_count: int
    chunk_count: int


class DebugRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
