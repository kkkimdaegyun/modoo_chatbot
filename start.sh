#!/usr/bin/env bash
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# 한 서버에 고객사를 여러 개 올릴 때는 폴더마다 .env 의 COMPOSE_PROJECT_NAME 을 다르게 준다.
# 이 이름이 컨테이너·볼륨·이미지 이름을 전부 결정한다. 같은 이름을 쓰면
# B 를 띄우는 순간 compose 가 A 의 컨테이너를 남의 것으로 보고 정지·삭제하고,
# 더 나쁜 것은 볼륨까지 공유해서 두 고객사가 같은 DB 와 같은 문서 저장소를 쓰게 된다.
# 폴더 이름을 그대로 쓰지 않는 이유: 디렉터리명이 "__" 로 끝나면 잘못된 이미지 이름이 만들어진다.
# grep 이 못 찾으면 1 을 돌려주는데, pipefail + set -e 조합에서는 그것만으로
# 스크립트가 여기서 죽는다. 값이 없는 것은 오류가 아니라 기본값으로 갈 상황이라 || true 로 받는다.
PROJECT="${COMPOSE_PROJECT_NAME:-}"
if [ -z "$PROJECT" ] && [ -f .env ]; then
  PROJECT="$(grep -s '^COMPOSE_PROJECT_NAME=' .env | tail -1 | cut -d= -f2- | tr -d '\r' | tr -d '[:space:]' || true)"
fi
if [ -z "$PROJECT" ]; then
  PROJECT="book"
  export COMPOSE_PROJECT_NAME="$PROJECT"
  cat >&2 <<'WARN'

[경고] .env 에 COMPOSE_PROJECT_NAME 이 없어서 "book" 으로 진행합니다.

  고객사를 한 대에 여러 개 올릴 계획이면 지금 정하세요. 이 값이 비어 있는 폴더는
  전부 "book" 이 되고, 그러면 컨테이너뿐 아니라 볼륨(DB·업로드 문서)까지 공유돼
  다른 고객사 문서가 검색 결과에 섞입니다.

    .env 에 한 줄 추가:  COMPOSE_PROJECT_NAME=leehk

WARN
fi
export COMPOSE_PROJECT_NAME="$PROJECT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "오류: docker compose 또는 docker-compose 명령을 찾을 수 없습니다." >&2
  exit 1
fi

# 같은 프로젝트 이름을 다른 폴더가 이미 쓰고 있으면 여기서 멈춘다.
# compose 는 이름만 보고 남의 스택을 자기 것으로 여기므로, 그냥 두면
# 남의 고객사 컨테이너를 조용히 내리고 볼륨을 넘겨받는다.
HERE="$(pwd -P)"
OWNER="$(docker ps -a --filter "label=com.docker.compose.project=${PROJECT}" \
  --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | grep -v '^$' | head -1 || true)"
if [ -n "$OWNER" ] && [ "$OWNER" != "$HERE" ]; then
  cat >&2 <<EOF

[중지] 프로젝트 이름 "${PROJECT}" 은 이미 다른 폴더가 쓰고 있습니다.

  쓰는 곳 : ${OWNER}
  여기    : ${HERE}

  이대로 진행하면 저 폴더의 컨테이너가 정지·삭제되고, 볼륨(DB·업로드 문서)을
  이 폴더가 넘겨받아 두 고객사 데이터가 섞입니다.

  이 폴더의 .env 에서 COMPOSE_PROJECT_NAME 을 다른 이름으로 바꾸고 다시 실행하세요.
    예)  COMPOSE_PROJECT_NAME=kbs

EOF
  exit 1
fi

echo "Compose command: ${COMPOSE[*]}"
echo "Compose project: ${PROJECT}   (컨테이너 ${PROJECT}-api-1 / 볼륨 ${PROJECT}_postgres_data)"

# .env 가 없으면 compose 가 곧바로 실패한다(env_file 지정). clone 직후가 이 상태다.
if [ ! -f .env ]; then
  if [ -f .env.example ]; then cp .env.example .env; else echo "오류: .env 도 .env.example 도 없습니다." >&2; exit 1; fi
  cat >&2 <<'GUIDE'

[중지] .env 를 새로 만들었습니다. 아래 항목을 채운 뒤 다시 실행하세요.

  COMPOSE_PROJECT_NAME   고객사마다 다른 이름 (예: modoo-a / modoo-b)
  FRONTEND_PORT          고객사마다 다른 포트 (예: 7128 / 7228)
  API_PORT               고객사마다 다른 포트 (예: 7127 / 7227)
  POSTGRES_PORT          고객사마다 다른 포트 (예: 5432 / 5532)
  GEMINI_API_KEY         비어 있으면 답변이 생성되지 않습니다
  POSTGRES_PASSWORD      change-me 를 그대로 두지 마세요
  JWT_SECRET             길고 무작위인 값으로, 고객사마다 다르게
  NEXT_PUBLIC_BACKEND_URL 도메인으로 서비스할 때 (예: https://a.example.com)

GUIDE
  exit 1
fi

# 계정 파일이 없으면 컴포즈가 같은 이름의 디렉터리를 만들어 버려서 로그인이 통째로 막힌다.
if [ ! -f accounts.json ]; then
  if [ -f accounts.example.json ]; then
    cp accounts.example.json accounts.json
  else
    # 예시 파일이 없어도 배포가 멈추지 않도록 최소 계정을 만들어 둔다.
    printf '{\n  "accounts": [\n    { "company": "관리자", "username": "admin", "password": "change-me-now", "role": "admin" }\n  ]\n}\n' > accounts.json
  fi
  echo "[init] accounts.json 을 새로 만들었습니다. 고객사 계정과 비밀번호를 반드시 바꾸세요."
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
