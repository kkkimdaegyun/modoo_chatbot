import pytest


@pytest.mark.integration
def test_pgvector_cosine_search_document_cascade_and_duplicate_guard() -> None:
    pytest.skip("Docker Compose integration suite에서 실행")


@pytest.mark.model
def test_real_bge_m3_and_reranker_models() -> None:
    pytest.skip("RUN_LOCAL_MODEL_TESTS=true 환경에서 별도 실행")
