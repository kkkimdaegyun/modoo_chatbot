from contextlib import asynccontextmanager
from collections import defaultdict, deque
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, chat, debug, documents, qa, settings as settings_api, system
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    settings.model_cache_path.mkdir(parents=True, exist_ok=True)
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
    if request.url.path.startswith("/api/chat"):
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = request_windows[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= 60:
            return JSONResponse(status_code=429, content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."})
        window.append(now)
    return await call_next(request)

for router in [system.router, admin.router, documents.router, qa.router, settings_api.router, chat.router, chat.conversations_router, debug.router]:
    app.include_router(router)


@app.exception_handler(Exception)
async def unhandled_exception(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "요청 처리 중 내부 오류가 발생했습니다."})
