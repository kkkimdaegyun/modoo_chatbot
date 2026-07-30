from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[5]


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
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://ela:change-me@localhost:5432/ela_chatbot"
    admin_email: str = "admin@example.com"
    admin_password: str = "change-me"
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

    reranker_enabled: bool = True
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
