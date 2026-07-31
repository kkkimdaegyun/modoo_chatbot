# ELA Chatbot

기업 문서를 업로드하면 로컬 BGE-M3 임베딩, PostgreSQL/pgvector 하이브리드 검색, BGE 리랭킹을 거쳐 Google Gemini가 검색된 근거만으로 답변하는 고객상담 SaaS MVP입니다.

## 핵심 원칙

- Gemini는 최종 답변 생성에만 사용합니다.
- 임베딩은 `BAAI/bge-m3`, 리랭킹은 `BAAI/bge-reranker-v2-m3`를 로컬에서 실행합니다.
- Dense 검색은 pgvector cosine distance, Keyword 검색은 PostgreSQL FTS를 사용합니다.
- 두 검색 순위는 RRF로 결합하고 QA에 소폭의 설정 가능 가중치를 준 뒤 로컬 리랭커로 재정렬합니다.
- 검색 결과가 없으면 Gemini를 호출하지 않고 문서에서 확인할 수 없다고 답변합니다.
- Gemini API Key는 서버 환경변수에서만 읽으며 DB, 브라우저, 로그에 저장하지 않습니다.

## 구조

```text
.
├─ app/                         # Next.js App Router 프론트엔드
│  ├─ page.tsx                  # 랜딩
│  ├─ app/page.tsx              # 실제 스트리밍 채팅
│  ├─ admin/page.tsx            # 문서/QA/검색설정/디버그
│  └─ widget/page.tsx           # 임베드 위젯 및 설치 코드
├─ apps/api/
│  ├─ app/api/                  # FastAPI 라우터
│  ├─ app/core/                 # 환경설정, 보안, 로깅
│  ├─ app/models/               # SQLAlchemy 모델
│  ├─ app/services/
│  │  ├─ parsers/               # PDF, DOCX, TXT, MD, CSV, XLSX, JSON
│  │  ├─ chunking/              # 구조 보존 청킹
│  │  ├─ embeddings/            # BGE-M3 singleton
│  │  ├─ retrieval/             # Dense + FTS + RRF
│  │  ├─ reranking/             # BGE reranker singleton
│  │  ├─ context/               # 중복 제거 후 토큰 예산
│  │  ├─ ingestion/             # 실제 파일 인덱싱
│  │  └─ llm/                   # PromptBuilder + GeminiProvider
│  ├─ alembic/                  # pgvector/FTS 포함 초기 migration
│  └─ tests/
├─ samples/                     # 한국어 정책/FAQ/QA/보안 테스트 문서
├─ e2e/                         # Playwright
├─ docker-compose.yml
└─ .env.example
```

## 실행

### Docker Compose 권장

1. `.env.example`을 `.env`로 복사합니다.
2. `.env`의 `GEMINI_API_KEY`를 설정합니다.
3. 아래 명령을 실행합니다. 스크립트는 `docker compose` 또는 `docker-compose`를 자동 감지하고, 안전한 Compose 프로젝트명 `book`을 사용해 기존 컨테이너를 `stop → rm → run` 순서로 재기동합니다.

```bash
bash start.sh
```

첫 문서를 인덱싱할 때 Hugging Face 모델이 캐시에 다운로드됩니다. GPU가 없으면 자동으로 CPU를 사용하고 FP16을 끕니다.

접속 주소:

- 채팅(기본 화면): http://localhost:7128
- 관리자: http://localhost:7128/admin
- 서비스 소개: http://localhost:7128/landing
- 위젯: http://localhost:7128/widget
- API: http://localhost:7127
- Swagger: http://localhost:7127/docs
- Health: http://localhost:7127/health

호스트 포트가 이미 사용 중이면 `.env`의 `FRONTEND_PORT`, `API_PORT`, `POSTGRES_PORT`를 바꾸세요. 프론트엔드 포트를 바꿀 때는 `FRONTEND_URL`과 `CORS_ORIGINS`도 같이 맞춰야 브라우저 요청이 CORS에서 막히지 않습니다.

### 고객사 계정 추가

회원가입은 없고, 레포 루트의 `accounts.json` 에 적힌 계정만 로그인할 수 있습니다. 코드는 건드리지 않습니다.

```json
{
  "accounts": [
    { "company": "테스트 고객사", "username": "test", "password": "1111", "role": "admin" },
    { "company": "OO 주식회사", "username": "oo-corp", "password": "발급한-비밀번호", "role": "admin" }
  ]
}
```

- `company` 는 관리자 화면 우측 상단에 표시되는 고객사 이름입니다.
- `role` 은 `admin`(관리자 페이지 사용) 또는 `user`(채팅만)이며 생략하면 `admin` 입니다.
- 저장하면 다음 로그인 요청부터 바로 반영됩니다. 컨테이너 재시작이 필요하면 `./start.sh` 를 실행하세요.
- 파일이 없으면 `./start.sh` 가 `accounts.example.json` 을 복사해 만들어 줍니다.
- 비밀번호가 평문이라 `accounts.json` 은 `.gitignore` 에 등록돼 있습니다. 커밋하지 마세요.

### CPU

기본 설정인 `EMBEDDING_DEVICE=auto`, `RERANKER_DEVICE=auto`를 유지하면 CUDA가 없을 때 CPU로 전환됩니다. 메모리가 부족하면 배치 크기를 줄이세요.

```env
EMBEDDING_BATCH_SIZE=4
RERANKER_BATCH_SIZE=2
EMBEDDING_USE_FP16=false
RERANKER_USE_FP16=false
```

### GPU

호스트의 CUDA 버전에 맞는 PyTorch 이미지를 사용하도록 `apps/api/Dockerfile`의 기반 이미지를 CUDA 런타임으로 바꾸고 Compose에 GPU 예약을 추가합니다.

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

`EMBEDDING_DEVICE=cuda`, `RERANKER_DEVICE=cuda`로 고정할 수 있습니다.

## RAG 처리 흐름

```text
업로드 → 서버 저장 → 형식별 추출 → 구조 보존 청킹
→ BGE-M3 normalized embedding → pgvector + tsvector 저장

질문 → 정규화 → BGE-M3 query embedding
→ cosine dense search + PostgreSQL keyword search
→ RRF → QA boost → BGE reranking → deduplication
→ Context token budget → PromptBuilder → Gemini stream
→ 서버가 검증한 실제 출처 metadata 반환
```

## Gemini 흐름

`GeminiProvider`는 설치된 `google-genai` 2.x의 `client.models.generate_content_stream()`을 사용합니다. Gemini에는 시스템 정책, 최근 8개 대화 턴, 최종 검색 Context, 현재 질문만 전달합니다. 원본 파일이나 전체 QA 목록은 전달하지 않습니다.

API Key가 없을 때 문서 업로드와 검색은 계속 사용할 수 있고 채팅만 `Gemini API Key가 설정되지 않았습니다.` 오류를 반환합니다.

## 주요 API

- `GET /health`
- `GET /api/system/status`
- `POST /api/admin/login`
- `GET|POST /api/documents`
- `POST /api/documents/upload`
- `DELETE /api/documents/{id}`
- `POST /api/documents/{id}/reindex`
- `GET /api/ingestion-jobs/{id}`
- `GET|POST /api/qa`
- `PUT|DELETE /api/qa/{id}`
- `POST /api/qa/import`
- `GET|PUT /api/settings`
- `POST /api/chat`
- `POST /api/chat/stream`
- `GET|DELETE /api/conversations`
- `POST /api/retrieval/debug`

스트리밍 이벤트는 `retrieval_started`, `retrieval_completed`, `generation_started`, `token`, `sources`, `completed`, `error` 순서로 전송됩니다.

## 테스트

```bash
npm test
npm run test:e2e
cd apps/api
python -m pytest tests -m "not integration and not model"
```

실제 pgvector 통합 테스트는 Docker Compose가 실행 중인 환경에서 수행해야 합니다. 실제 Gemini 비용이 발생하는 테스트는 `RUN_GEMINI_INTEGRATION_TESTS=true`인 경우에만 실행합니다.

## 프로덕션 체크리스트

- 강력한 관리자 비밀번호와 JWT secret 설정
- TLS, WAF/rate limit, 백업, 모니터링 구성
- 한국어 FTS 품질 향상을 위한 `pg_bigm` 또는 전문 형태소 분석 전략 검토
- 비동기 작업 큐로 인덱싱 분리
- 멀티테넌트 권한 검증과 workspace 발급 플로우 강화
- 모델 워밍업, GPU 용량 산정, 부하·복구 테스트
- 악성 파일 검사, OCR 워커, PII 보존정책 추가
