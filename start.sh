#!/usr/bin/env bash
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# The directory name ends in "__", which some Compose versions turn into
# an invalid generated image name (for example: chatbot__-api).
export COMPOSE_PROJECT_NAME="book"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "오류: docker compose 또는 docker-compose 명령을 찾을 수 없습니다." >&2
  exit 1
fi

echo "Compose command: ${COMPOSE[*]}"
echo "Compose project: ${COMPOSE_PROJECT_NAME}"

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
