import threading
from typing import Any

import numpy as np
import structlog

from app.core.config import settings
from app.services.embeddings.base import EmbeddingService
from app.services.embeddings.schemas import EmbeddingVector

logger = structlog.get_logger(__name__)


class BGEEmbeddingService(EmbeddingService):
    _instance: "BGEEmbeddingService | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "BGEEmbeddingService":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self.model: Any = None
        self.device = self._resolve_device()
        self.loading = False
        self.load_error: str | None = None
        self._initialized = True

    @staticmethod
    def _resolve_device() -> str:
        if settings.embedding_device != "auto":
            return settings.embedding_device
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    def load_model(self) -> None:
        if self.model is not None:
            return
        with self._lock:
            if self.model is not None:
                return
            self.loading = True
            try:
                from FlagEmbedding import BGEM3FlagModel
                use_fp16 = settings.embedding_use_fp16 and self.device == "cuda"
                logger.info("embedding_model_loading", model=settings.embedding_model, device=self.device, use_fp16=use_fp16)
                self.model = BGEM3FlagModel(
                    settings.embedding_model,
                    use_fp16=use_fp16,
                    device=self.device,
                    cache_dir=str(settings.model_cache_path),
                )
                self.load_error = None
                logger.info("embedding_model_loaded", model=settings.embedding_model, device=self.device)
            except Exception as exc:
                self.load_error = type(exc).__name__
                logger.exception("embedding_model_load_failed", error_type=type(exc).__name__)
                raise
            finally:
                self.loading = False

    def encode_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts or any(not text.strip() for text in texts):
            raise ValueError("빈 문서는 임베딩할 수 없습니다.")
        self.load_model()
        result = self.model.encode(
            texts,
            batch_size=settings.embedding_batch_size,
            max_length=settings.embedding_max_length,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )
        return self._validate_matrix(result["dense_vecs"])

    def encode_query(self, text: str) -> list[float]:
        if not text.strip():
            raise ValueError("빈 질문은 임베딩할 수 없습니다.")
        return self.encode_documents([text])[0]

    def _validate_matrix(self, matrix: Any) -> list[list[float]]:
        vectors = np.asarray(matrix, dtype=np.float32)
        if vectors.ndim != 2 or vectors.shape[1] != settings.embedding_dimension:
            raise ValueError(f"임베딩 차원이 올바르지 않습니다: expected={settings.embedding_dimension}, actual={vectors.shape}")
        if settings.normalize_embeddings:
            norms = np.linalg.norm(vectors, axis=1, keepdims=True)
            if np.any(norms == 0) or not np.all(np.isfinite(norms)):
                raise ValueError("유효하지 않은 임베딩 벡터입니다.")
            vectors = vectors / norms
        return [EmbeddingVector(values=row.tolist()).values for row in vectors]

    def health_check(self) -> dict[str, object]:
        return {"loaded": self.model is not None, "loading": self.loading, "device": self.device, "dimension": settings.embedding_dimension, "error": self.load_error}

    def get_dimension(self) -> int:
        return settings.embedding_dimension
