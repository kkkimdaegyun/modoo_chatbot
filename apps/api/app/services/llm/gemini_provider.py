import re
import threading
import uuid
from collections.abc import Iterator
from typing import Any

import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.services.llm.base import LLMProvider

logger = structlog.get_logger(__name__)


class GeminiConfigurationError(RuntimeError):
    pass


class GeminiGenerationError(RuntimeError):
    pass


class GeminiProvider(LLMProvider):
    _instance: "GeminiProvider | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "GeminiProvider":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self.client: Any = None
        self._initialized = True

    def validate_configuration(self) -> None:
        if not settings.gemini_api_key:
            raise GeminiConfigurationError("Gemini API Key가 설정되지 않았습니다.")

    def _client(self) -> Any:
        self.validate_configuration()
        if self.client is None:
            from google import genai
            from google.genai import types
            self.client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=settings.gemini_timeout_seconds * 1000),
            )
        return self.client

    def _config(self) -> Any:
        from google.genai import types
        return types.GenerateContentConfig(
            temperature=settings.gemini_temperature,
            top_p=settings.gemini_top_p,
            max_output_tokens=settings.gemini_max_output_tokens,
        )

    @retry(
        retry=retry_if_exception_type((TimeoutError, ConnectionError)),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        stop=stop_after_attempt(settings.gemini_max_retries),
        reraise=True,
    )
    def generate(self, prompt: str) -> str:
        request_id = str(uuid.uuid4())
        try:
            response = self._client().models.generate_content(model=settings.gemini_model, contents=prompt, config=self._config())
            text = (response.text or "").strip()
            if not text:
                raise GeminiGenerationError("Gemini가 빈 응답을 반환했습니다.")
            return text
        except GeminiConfigurationError:
            raise
        except Exception as exc:
            logger.warning("gemini_generate_failed", request_id=request_id, error_type=type(exc).__name__)
            raise GeminiGenerationError("답변 생성 서비스에 연결하지 못했습니다.") from exc

    def generate_stream(self, prompt: str) -> Iterator[str]:
        request_id = str(uuid.uuid4())
        try:
            stream = self._client().models.generate_content_stream(model=settings.gemini_model, contents=prompt, config=self._config())
            emitted = False
            for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    emitted = True
                    yield text
            if not emitted:
                raise GeminiGenerationError("Gemini가 빈 응답을 반환했습니다.")
        except GeminiConfigurationError:
            raise
        except GeminiGenerationError:
            raise
        except Exception as exc:
            logger.warning("gemini_stream_failed", request_id=request_id, error_type=type(exc).__name__)
            raise GeminiGenerationError("답변 스트리밍 연결이 중단되었습니다.") from exc

    def health_check(self) -> dict[str, object]:
        return {"configured": bool(settings.gemini_api_key), "model": settings.gemini_model}

    @staticmethod
    def sanitize_citations(text: str, allowed_ids: set[str]) -> str:
        return re.sub(r"\[(S\d+)\]", lambda match: match.group(0) if match.group(1) in allowed_ids else "", text)
