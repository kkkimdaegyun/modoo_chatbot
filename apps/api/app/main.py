from contextlib import asynccontextmanager
from collections import defaultdict, deque
import threading
import time

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, chat, debug, documents, qa, settings as settings_api, system
from app.core.config import settings
from app.core.logging import configure_logging
from app.services.embeddings import BGEEmbeddingService
from app.services.ingestion import fail_interrupted_jobs
from app.services.reranking import BGERerankerService

configure_logging(settings.log_level)
logger = structlog.get_logger(__name__)


def warm_models() -> None:
    """첫 질문이 모델 로딩 시간을 물지 않도록 미리 올린다. 실패해도 서비스는 계속 뜬다."""
    try:
        BGEEmbeddingService().load_model()
    except Exception:
        logger.exception("embedding_warmup_failed")
    if settings.reranker_enabled:
        try:
            BGERerankerService().load_model()
        except Exception:
            logger.exception("reranker_warmup_failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    settings.model_cache_path.mkdir(parents=True, exist_ok=True)
    fail_interrupted_jobs()
    # 모델 다운로드가 필요한 첫 실행에서 헬스체크가 막히지 않도록 백그라운드로 올린다.
    threading.Thread(target=warm_models, name="model-warmup", daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan, docs_url="/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

request_windows: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def basic_rate_limit(request: Request, call_next):
    if request.url.path.startswith(f"{settings.base_path}/api/chat"):
        # nginx 뒤에 두면 모든 요청의 client.host 가 프록시 IP 하나로 보인다.
        # 그대로 세면 고객사 전체가 한 명으로 묶여 60건 만에 다 같이 429 를 맞는다.
        forwarded = request.headers.get("x-forwarded-for", "")
        key = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        now = time.monotonic()
        window = request_windows[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= 60:
            return JSONResponse(status_code=429, content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."})
        window.append(now)
        # 다녀간 IP마다 빈 큐가 계속 쌓이지 않도록 조용해진 항목은 정리한다.
        if len(request_windows) > 1000:
            for stale in [ip for ip, times in request_windows.items() if not times]:
                del request_windows[stale]
    return await call_next(request)

# /health 는 nginx 를 거치지 않고 docker-compose 헬스체크가 컨테이너 안에서 접두어 없이
# 직접 부르므로 base_path 를 안 붙인다. 그 외 라우트는 전부 base_path 를 붙여서, nginx 가
# 경로를 벗겨내지 않고 그대로 넘겨도(프론트엔드 basePath 라우팅과 같은 방식) 동작한다.
app.include_router(system.health_router)
for router in [system.router, auth.router, documents.router, documents.knowledge_router, qa.router, settings_api.router, settings_api.public_router, chat.router, chat.conversations_router, debug.router]:
    app.include_router(router, prefix=settings.base_path)


@app.exception_handler(Exception)
async def unhandled_exception(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "요청 처리 중 내부 오류가 발생했습니다."})
