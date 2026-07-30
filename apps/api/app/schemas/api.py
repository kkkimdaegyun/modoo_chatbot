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


class SettingsUpdate(BaseModel):
    system_prompt: str | None = None
    final_context_top_k: int = Field(default=7, ge=1, le=12)
    max_context_tokens: int = Field(default=10_000, ge=1000, le=50_000)
    qa_priority_boost: float = Field(default=1.15, ge=1.0, le=2.0)


class DebugRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
