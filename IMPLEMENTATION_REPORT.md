# ELA Chatbot 구현 보고

## 구현 범위

- 레퍼런스를 반영한 밝은 반응형 SaaS 랜딩 페이지
- 스트리밍 채팅, 생성 중단, 추천 질문, 출처 패널
- 관리자 로그인, 문서 업로드/삭제/재인덱싱, QA CRUD/가져오기
- 시스템 상태, 검색 설정, 시스템 프롬프트 추가 지침, Retrieval Debug
- 독립 위젯 화면 및 설치 코드 복사
- PDF/DOCX/TXT/Markdown/CSV/XLSX/JSON 파서
- 구조 보존 청킹, BGE-M3 임베딩, pgvector cosine 검색
- PostgreSQL FTS, RRF, QA boost, BGE 리랭킹, 중복 제거, Context 예산
- `google-genai` 기반 Gemini 생성 및 SSE
- SQLAlchemy 모델, Alembic migration, Docker Compose, 샘플 문서, 테스트

## 실제 검증 상태

- PASS: 프론트엔드 production build
- PASS: 서버 렌더링 테스트 2개
- PASS: API unit test 12개
- PASS: Playwright 랜딩/관리자 로그인/채팅 이동
- PASS: FastAPI import, OpenAPI 필수 경로, `/health`
- NOT RUN: Docker Compose 기동(현재 호스트에 Docker 없음)
- NOT RUN: PostgreSQL/pgvector 실제 DB 통합
- NOT RUN: 실 BGE 모델 다운로드 및 모델 추론
- NOT RUN: 실제 Gemini API 호출(`GEMINI_API_KEY` 없음)
- NOT RUN: 업로드부터 Gemini 답변까지 전체 Playwright 시나리오(DB/모델 전제)

## 발견 및 수정

- Windows의 한글/공백 경로에서 vinext가 native crash를 일으켜 ASCII junction 경로에서 검증
- 초기 npm/pnpm 혼용으로 React가 중복 로드되어 `node_modules`를 npm lockfile 기준으로 재설치
- 구조 청킹의 overlap이 최대 토큰을 넘길 수 있는 문제를 테스트로 발견해 수정
- Playwright 브라우저 런타임을 설치하고 hydration 이후 로그인하도록 E2E 안정화

## 남은 프로덕션 작업

Docker가 설치된 GPU 또는 충분한 RAM의 CPU 호스트에서 Compose를 기동한 뒤 모델 캐시 다운로드, migration, 샘플 업로드, pgvector/FTS/RRF/리랭커, Gemini 스트림, 삭제 cascade를 통합 검증해야 합니다. 운영 전 관리자 자격 증명, JWT secret, TLS, 외부 rate limit, 악성 파일 검사, 백업/모니터링, 작업 큐가 필요합니다.
