import pytest

from app.services.llm.gemini_provider import (
    GeminiConfigurationError, GeminiGenerationError, GeminiProvider,
)


class EmptyModels:
    def generate_content(self, **_):
        return type("Response", (), {"text": ""})()

    def generate_content_stream(self, **_):
        yield type("Chunk", (), {"text": ""})()


class FakeClient:
    models = EmptyModels()


def test_missing_gemini_api_key(monkeypatch) -> None:
    monkeypatch.setattr("app.services.llm.gemini_provider.settings.gemini_api_key", "")
    with pytest.raises(GeminiConfigurationError):
        GeminiProvider().validate_configuration()


def test_gemini_empty_response(monkeypatch) -> None:
    provider = GeminiProvider()
    original = provider.client
    provider.client = FakeClient()
    monkeypatch.setattr("app.services.llm.gemini_provider.settings.gemini_api_key", "test-key")
    monkeypatch.setattr(provider, "_config", lambda: {})
    try:
        with pytest.raises(GeminiGenerationError):
            provider.generate("prompt")
        with pytest.raises(GeminiGenerationError):
            list(provider.generate_stream("prompt"))
    finally:
        provider.client = original


@pytest.mark.integration
def test_optional_gemini_integration() -> None:
    from app.core.config import settings
    if not settings.run_gemini_integration_tests:
        pytest.skip("RUN_GEMINI_INTEGRATION_TESTS=false")
    assert GeminiProvider().generate("한 단어로 '정상'이라고 답하세요.")
