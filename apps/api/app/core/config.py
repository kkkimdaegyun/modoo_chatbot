from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[2]


def _resolve_root() -> Path:
    """레포 루트를 찾는다. 컨테이너에는 .env/.git이 없으므로 /app으로 폴백한다."""
    for candidate in (API_DIR, *API_DIR.parents):
        if (candidate / ".env").is_file() or (candidate / ".git").exists():
            return candidate
    return API_DIR


ROOT = _resolve_root()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT / ".env", ROOT / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "ELA Chatbot"
    app_env: str = "development"
    app_debug: bool = False
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"
    # NoDecode: 콤마 구분 문자열을 쓰므로 pydantic-settings의 JSON 파싱을 끄고 아래 validator로 처리한다.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://ela:change-me@localhost:5432/ela_chatbot"
    jwt_secret: str = "replace-with-a-long-random-secret"
    jwt_expire_minutes: int = 480

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    gemini_temperature: float = 0.2
    gemini_top_p: float = 0.9
    gemini_max_output_tokens: int = 2048
    gemini_timeout_seconds: int = 60
    gemini_max_retries: int = 3

    embedding_provider: str = "local"
    embedding_model: str = "BAAI/bge-m3"
    embedding_dimension: int = 1024
    embedding_device: str = "auto"
    embedding_use_fp16: bool = True
    embedding_batch_size: int = 16
    embedding_max_length: int = 8192
    normalize_embeddings: bool = True

    # bge-reranker-v2-m3(XLM-R large)는 CPU에서 후보 1개당 약 0.85초가 든다.
    # 후보 30개면 25초라 대화형으로 못 쓰기 때문에 기본은 끄고, GPU가 있으면 켠다.
    reranker_enabled: bool = False
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    reranker_device: str = "auto"
    reranker_use_fp16: bool = True
    reranker_max_length: int = 1024
    reranker_batch_size: int = 8

    chunk_target_tokens: int = 750
    chunk_max_tokens: int = 900
    chunk_overlap_tokens: int = 130
    chunk_min_tokens: int = 80

    dense_retrieval_top_k: int = 30
    keyword_retrieval_top_k: int = 30
    rrf_k: int = 60
    rerank_candidates: int = 30
    final_context_top_k: int = 7
    similarity_threshold: float = 0.25
    max_context_tokens: int = 10_000
    qa_priority_boost: float = 1.15

    storage_path: Path = ROOT / "data" / "uploads"
    max_upload_size_mb: int = 50
    model_cache_path: Path = ROOT / ".cache" / "huggingface"
    default_workspace_id: str = "00000000-0000-0000-0000-000000000001"
    run_gemini_integration_tests: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
