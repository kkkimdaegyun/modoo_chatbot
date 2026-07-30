import threading
from typing import Any

import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


class BGERerankerService:
    _instance: "BGERerankerService | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "BGERerankerService":
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
        self.load_error: str | None = None
        self._initialized = True

    @staticmethod
    def _resolve_device() -> str:
        if settings.reranker_device != "auto":
            return settings.reranker_device
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    def load_model(self) -> None:
        if self.model is not None or not settings.reranker_enabled:
            return
        with self._lock:
            if self.model is not None:
                return
            try:
                from FlagEmbedding import FlagReranker
                use_fp16 = settings.reranker_use_fp16 and self.device == "cuda"
                self.model = FlagReranker(settings.reranker_model, use_fp16=use_fp16, device=self.device, cache_dir=str(settings.model_cache_path))
                self.load_error = None
                logger.info("reranker_model_loaded", model=settings.reranker_model, device=self.device)
            except Exception as exc:
                self.load_error = type(exc).__name__
                logger.exception("reranker_model_load_failed", error_type=type(exc).__name__)
                raise

    def rerank(self, query: str, candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
        if not candidates or not settings.reranker_enabled:
            return candidates, False
        try:
            self.load_model()
            pairs = [[query, self._truncate(item["content"])] for item in candidates[: settings.rerank_candidates]]
            scores = self.model.compute_score(pairs, batch_size=settings.reranker_batch_size, max_length=settings.reranker_max_length, normalize=False)
            if not isinstance(scores, list):
                scores = [float(scores)]
            enriched = [{**item, "reranker_score": float(score)} for item, score in zip(candidates, scores)]
            return sorted(enriched, key=lambda item: item["reranker_score"], reverse=True), False
        except Exception as exc:
            logger.warning("reranker_fallback_to_rrf", error_type=type(exc).__name__)
            return candidates, True

    @staticmethod
    def _truncate(text: str) -> str:
        return text[: settings.reranker_max_length * 4]

    def health_check(self) -> dict[str, object]:
        return {"loaded": self.model is not None, "device": self.device, "error": self.load_error}
