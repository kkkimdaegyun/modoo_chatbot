#!/usr/bin/env bash
# 서버 상태를 한 번에 확인한다. 인프라를 매일 들여다보지 않아도 이것만 보면 된다.
#   ./status.sh            현재 폴더(고객사) 상태
#   ./status.sh --all      이 서버에 올라간 모든 고객사 + 서버 전체 자원
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [ -z "${COMPOSE_PROJECT_NAME:-}" ] && ! grep -qs '^COMPOSE_PROJECT_NAME=' .env; then
  export COMPOSE_PROJECT_NAME="book"
fi
PROJECT="${COMPOSE_PROJECT_NAME:-$(grep -s '^COMPOSE_PROJECT_NAME=' .env | cut -d= -f2- | tr -d '\r')}"
API_PORT="$(grep -s '^API_PORT=' .env | cut -d= -f2- | tr -d '\r')"
API_PORT="${API_PORT:-7127}"
FRONTEND_PORT="$(grep -s '^FRONTEND_PORT=' .env | cut -d= -f2- | tr -d '\r')"
FRONTEND_PORT="${FRONTEND_PORT:-7128}"

line() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m정상\033[0m  %s\n' "$1"; }
bad()  { printf '  \033[31m확인\033[0m  %s\n' "$1"; }

line "[$PROJECT] 컨테이너"
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null || bad "컨테이너를 찾을 수 없습니다. ./start.sh 를 실행했나요?"

line "[$PROJECT] 서비스 응답"
if curl -fsS -m 5 "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then ok "API (:${API_PORT})"; else bad "API (:${API_PORT}) 응답 없음"; fi
if curl -fsS -m 10 "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1; then ok "화면 (:${FRONTEND_PORT})"; else bad "화면 (:${FRONTEND_PORT}) 응답 없음"; fi

if status=$(curl -fsS -m 5 "http://localhost:${API_PORT}/api/system/status" 2>/dev/null); then
  python3 - "$status" <<'PY' 2>/dev/null || true
import json, sys
d = json.loads(sys.argv[1])
mark = lambda v: "정상" if v else "확인"
print(f"  {mark(d['database_connected'])}  데이터베이스")
print(f"  {mark(d['embedding_model_loaded'])}  문서 분석 모델 {'(로드 완료)' if d['embedding_model_loaded'] else '(아직 로딩 전 — 첫 질문 때 올라옵니다)'}")
print(f"  {mark(d['gemini_configured'])}  답변 생성 API 키")
avg = d.get("answer_seconds_avg")
print(f"  정보  최근 답변 시간 {avg}초 (최근 {d.get('answer_samples', 0)}건)" if avg else "  정보  답변 기록 없음")
PY
fi

line "[$PROJECT] 자원 사용량"
names=$(docker compose ps -q 2>/dev/null | tr '\n' ' ')
if [ -n "${names// /}" ]; then
  # shellcheck disable=SC2086
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' $names
fi

line "서버 전체"
free -h | awk 'NR<=2'
df -h / | awk 'NR<=2'
docker system df --format 'table {{.Type}}\t{{.Size}}\t{{.Reclaimable}}' 2>/dev/null | head -5

if [ "${1:-}" = "--all" ]; then
  line "이 서버의 모든 고객사 컨테이너"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
fi

line "메모리·디스크 경고"
mem_free=$(free -m | awk 'NR==2 {print $7}')
[ "$mem_free" -lt 1024 ] && bad "남은 메모리 ${mem_free}MB — 인스턴스를 키우거나 컨테이너를 줄이세요" || ok "남은 메모리 ${mem_free}MB"
disk_used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "$disk_used" -gt 80 ] && bad "디스크 ${disk_used}% 사용 — 모델 캐시와 도커 이미지를 정리하세요 (docker system prune)" || ok "디스크 ${disk_used}% 사용"
echo
