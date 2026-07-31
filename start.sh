#!/usr/bin/env bash
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# 한 서버에 고객사를 여러 개 올릴 때는 폴더마다 .env 의 COMPOSE_PROJECT_NAME 을 다르게 준다.
# 같은 이름을 쓰면 B 를 띄우는 순간 compose 가 A 의 컨테이너를 남의 것으로 보고 정지·삭제한다.
# 폴더 이름을 그대로 쓰지 않는 이유: 디렉터리명이 "__" 로 끝나면 잘못된 이미지 이름이 만들어진다.
if [ -z "${COMPOSE_PROJECT_NAME:-}" ] && ! grep -qs '^COMPOSE_PROJECT_NAME=' .env; then
  export COMPOSE_PROJECT_NAME="book"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "오류: docker compose 또는 docker-compose 명령을 찾을 수 없습니다." >&2
  exit 1
fi

echo "Compose command: ${COMPOSE[*]}"
echo "Compose project: ${COMPOSE_PROJECT_NAME:-$(grep -s '^COMPOSE_PROJECT_NAME=' .env | cut -d= -f2- | tr -d '\r')}"

# 계정 파일이 없으면 컴포즈가 같은 이름의 디렉터리를 만들어 버려서 로그인이 통째로 막힌다.
# 예시 파일을 복사해 항상 실제 파일이 있도록 보장한다.
if [ ! -f accounts.json ]; then
  cp accounts.example.json accounts.json
  echo "[init] accounts.json 을 새로 만들었습니다. 고객사 계정을 이 파일에서 관리하세요."
fi

if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c 'import json,sys; json.load(open("accounts.json"))' 2>/dev/null; then
    echo "오류: accounts.json 의 JSON 형식이 잘못되었습니다. 쉼표나 따옴표를 확인해 주세요." >&2
    exit 1
  fi
  echo "[check] accounts.json 계정 $(python3 -c 'import json; d=json.load(open("accounts.json")); print(len(d.get("accounts", d) if isinstance(d, dict) else d))')개를 확인했습니다."
fi

echo "[stop] 실행 중인 ELA Chatbot 컨테이너를 중지합니다."
"${COMPOSE[@]}" stop

echo "[rm] 중지된 ELA Chatbot 컨테이너를 제거합니다."
"${COMPOSE[@]}" rm --force

echo "[run] 이미지를 빌드하고 컨테이너를 백그라운드로 실행합니다."
"${COMPOSE[@]}" up --detach --build

echo
"${COMPOSE[@]}" ps
echo
echo "Frontend: http://localhost:${FRONTEND_PORT:-7128}"
echo "Backend:  http://localhost:${API_PORT:-7127}"
echo "API Docs: http://localhost:${API_PORT:-7127}/docs"
