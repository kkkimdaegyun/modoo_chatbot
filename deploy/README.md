# helpcenter.elasolution.com 배포 안내

한 EC2 위에 고객사를 여러 개 올리고, 한 도메인의 **서브패스**로 나눠 서비스하는 구성이다.

| 주소 | 무엇 |
| --- | --- |
| `https://helpcenter.elasolution.com/leehk` | 고객이 쓰는 채팅 화면 |
| `https://helpcenter.elasolution.com/leehk/admin` | 관리자 (화면 어디에도 링크가 없고 주소로만 들어간다) |
| `https://helpcenter.elasolution.com/leehk/widget` | 위젯·연동 안내 (관리자 로그인 필요) |
| `https://helpcenter.elasolution.com/leehk/landing` | 서비스 소개 (관리자 로그인 필요) |
| `https://helpcenter.elasolution.com/kbs` | 두 번째 고객사 |

서브도메인(`leehk.helpcenter…`)이 아니라 서브패스를 쓰면 **인증서 하나로 고객사를 계속 늘릴 수 있다.**
서브도메인으로 가려면 `*.helpcenter.elasolution.com` 와일드카드 인증서가 필요하다.

---

## 0. EC2 사양

아래 숫자는 추정이 아니라 **이 스택을 실제로 띄워 놓고 측정한 값**이다
(문서 7개·45문단 인덱싱 완료, 임베딩 CPU, 리랭커 꺼짐, `2026-07-31` 측정).

| 항목 | 대기 중 실측 | 컨테이너 상한(기본값) |
| --- | --- | --- |
| API (BGE-M3 로드됨) | **713 MiB** | 3 GiB |
| 프론트엔드 (Node) | 76 MiB | 2 GiB |
| PostgreSQL + pgvector | 24 MiB | 1 GiB |
| 답변 1건 소요 | **7.5초** (CPU, 리랭커 꺼짐) | — |

디스크가 메모리보다 먼저 문제가 된다.

| 항목 | 실측 |
| --- | --- |
| Hugging Face 모델 캐시 (`BAAI/bge-m3`) | **6.5 GB** ← 고객사마다 볼륨이 따로 생긴다 |
| 도커 이미지 (api 2.14 GB + web 1.22 GB + pg 438 MB) | 약 3.8 GB (고객사 간 레이어 공유) |
| 업로드 문서 + DB | 문서량에 비례, 초기 1 GB 미만 |

### 권장 사양

| 고객사 수 | 인스턴스 | vCPU / RAM | 루트 볼륨 |
| --- | --- | --- | --- |
| 1개 (최소) | `t3.large` | 2 / 8 GB | gp3 60 GB |
| **2개 (leehk + kbs) — 권장** | **`t3.xlarge`** | **4 / 16 GB** | **gp3 100 GB** |
| 인덱싱이 잦거나 3개 이상 | `m7i.xlarge` | 4 / 16 GB | gp3 150 GB |

리전은 `ap-northeast-2`(서울)로 둔다. `api.elasolution.com`(3.37.116.107)과 같은 리전이라
지연이 낮고, Route 53 설정도 이미 그쪽에 있다.

### 사양을 정할 때 실제로 걸리는 것들

- **t3 는 버스터블이라 CPU 크레딧이 떨어지면 느려진다.** BGE-M3 임베딩은 문서를 인덱싱하는
  동안 코어를 계속 붙잡는 작업이라, 큰 PDF 를 연달아 올리면 크레딧을 다 쓰고 성능이 반토막 난다.
  인덱싱이 하루에 몇 번 있는 정도면 `t3.xlarge` 로 충분하다. 상시 인덱싱이면 크레딧 개념이 없는
  `m7i.xlarge` 로 가거나 t3 를 unlimited 모드로 켠다(초과분 과금).
- **4 vCPU 를 권하는 이유**는 고객사가 둘이라서다. 2 vCPU 에서는 한쪽이 문서를 인덱싱하는 동안
  다른 쪽 고객의 답변이 같이 느려진다.
- **모델 캐시 6.5 GB 는 고객사마다 중복된다.** 폴더별로 `huggingface_cache` 볼륨이 따로 생기기
  때문이다. 디스크를 아끼려면 두 `docker-compose.yml` 이 같은 외부 볼륨을 쓰게 바꾼다.
  (모델 파일은 읽기 전용이라 공유해도 안전하다.)
- **첫 기동은 오래 걸린다.** 모델 6.5 GB 를 내려받는 동안 API 헬스체크가 실패로 보일 수 있어
  `start_period: 300s` 를 걸어 뒀다. 놀라지 않아도 된다.
- **답변 생성은 Gemini(외부 API)가 한다.** 서버에서 LLM 을 돌리지 않으므로 GPU 없이도 동작한다.
  지금 7.5초는 대부분 검색+Gemini 왕복 시간이다.
- **리랭커를 켤 거면 GPU 를 봐야 한다.** `RERANKER_ENABLED=true` 는 CPU 에서 후보 1건당
  약 0.85초가 붙어 답변이 수십 초로 늘어난다. 꼭 필요하면 `g4dn.xlarge`(T4, 4 vCPU / 16 GB)에
  올리고 `EMBEDDING_DEVICE=cuda`, `RERANKER_DEVICE=cuda` 로 바꾼다.
- **루트 볼륨은 gp3.** gp2 보다 싸고 기본 3000 IOPS 가 나온다. 60 GB 미만으로 잡으면
  모델 캐시 두 벌 + 이미지만으로 가득 찬다.

---

## 1. 열어야 하는 포트 (EC2 보안 그룹)

**인바운드는 지금 그대로 두면 된다. 추가로 열 것이 없다.**

| 포트 | 용도 | 원본 |
| --- | --- | --- |
| 443 | HTTPS. 실제 서비스가 전부 이 포트로 들어온다 | `0.0.0.0/0` |
| 80 | HTTPS 로 넘기는 리다이렉트 + 인증서 갱신 검증 | `0.0.0.0/0` |
| 22 | SSH. 가능하면 사무실 IP 로 좁힐 것 (아래 참고) | 현재 `0.0.0.0/0` |

`7127`, `7128`, `5432` 는 **열지 않는다.** nginx 가 서버 안에서 `127.0.0.1` 로 넘기므로
보안 그룹에 구멍을 내면 인증서를 우회해 평문으로 접속할 길만 생긴다.
그래서 각 고객사 `.env` 에 `BIND_HOST=127.0.0.1` 을 넣어 컨테이너가 외부에 뜨지 않게 한다.

한 가지만 손보길 권한다: **22번(SSH)의 원본을 `0.0.0.0/0` → 사무실 고정 IP/32 로 좁히는 것.**
지금은 전 세계에서 SSH 로그인 시도가 들어온다. 고정 IP 가 없으면 AWS Systems Manager
Session Manager 로 바꾸면 22번을 아예 닫을 수 있다.

아웃바운드 전체 허용은 그대로 둔다. Gemini API 와 Hugging Face 모델 다운로드에 필요하다.

---

## 2. SSL 인증서 — 현재 상태 확인 결과

`2026-07-31` 기준으로 확인한 내용이다.

| 확인 항목 | 결과 |
| --- | --- |
| `helpcenter.elasolution.com` DNS A 레코드 | **없음 (NXDOMAIN)** ← 먼저 해결해야 한다 |
| `api.elasolution.com` | `3.37.116.107`, GoGetSSL RSA DV 인증서 정상 (`Verify return code: 0`) |
| `elasolution.com` | `3.37.7.39` |
| DNS 운영 | AWS Route 53 (`ns-1173.awsdns-18.org` 등) |

즉 **인증서를 받아 뒀더라도 지금은 아무도 그 주소로 접속할 수 없다.**
`helpcenter` 서브도메인이 Route 53 에 아직 없기 때문이다. 순서는 이렇다.

1. Route 53 의 `elasolution.com` 호스팅 영역에 A 레코드 추가
   → 이름 `helpcenter`, 값 = 이 챗봇을 올릴 EC2 의 **탄력적 IP**
   (탄력적 IP 가 아니면 재부팅 때 주소가 바뀌어 인증서가 무용지물이 된다)
2. 전파 확인: `dig +short helpcenter.elasolution.com` 이 그 IP 를 돌려주는지 본다
3. 인증서 파일 설치 (아래)
4. `sudo nginx -t && sudo systemctl reload nginx`

### 인증서 파일 설치

`api.elasolution.com` 과 같은 GoGetSSL DV 인증서를 받았다면 보통 세 파일이 온다.

```bash
sudo mkdir -p /etc/nginx/ssl

# 서버 인증서 + 중간 인증서를 한 파일로 이어 붙인다. 순서가 중요하다.
# (내 인증서 → 중간 인증서). 순서를 뒤집으면 크롬은 되고 일부 안드로이드에서만 실패한다.
cat helpcenter_elasolution_com.crt helpcenter_elasolution_com.ca-bundle \
  | sudo tee /etc/nginx/ssl/helpcenter.elasolution.com.fullchain.crt > /dev/null

sudo cp helpcenter.elasolution.com.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/helpcenter.elasolution.com.key
sudo chown root:root /etc/nginx/ssl/*
```

설치 후 검증 — 이 세 가지가 모두 통과해야 실제로 끝난 것이다.

```bash
openssl x509 -in /etc/nginx/ssl/helpcenter.elasolution.com.fullchain.crt -noout -subject -dates
```

```bash
openssl s_client -connect helpcenter.elasolution.com:443 -servername helpcenter.elasolution.com </dev/null 2>/dev/null | grep -E 'Verify return code|subject='
```

```bash
curl -sI https://helpcenter.elasolution.com/leehk/ | head -1
```

`Verify return code: 0 (ok)` 가 나와야 중간 인증서까지 제대로 붙은 것이다.
`21 (unable to verify the first certificate)` 이 나오면 ca-bundle 을 안 이어 붙인 경우다.

> **인증서 하나로 `/leehk` 와 `/kbs` 둘 다 된다.** TLS 는 호스트명만 보고 경로는 보지 않기 때문에,
> 고객사를 열 개 늘려도 인증서는 그대로 쓴다. 이 점에서 서브패스 선택은 맞다.

### Let's Encrypt 로 갈 경우

이 서버의 `certbot` 은 실행이 깨져 있다(`/usr/bin/certbot` 실행 시 traceback).
쓸 거라면 다시 설치한 뒤 nginx 플러그인으로 발급하면 90일마다 자동 갱신된다.

```bash
sudo apt-get install --reinstall python3-certbot-nginx
sudo certbot --nginx -d helpcenter.elasolution.com
```

---

## 3. 고객사별 `.env`

고객사마다 폴더를 따로 두고(`~/chatbot-leehk`, `~/chatbot-kbs`) 아래 값을 **전부 다르게** 준다.
겹치면 나중에 띄운 쪽이 먼저 띄운 고객사의 컨테이너를 내려버린다.

```env
# 고객사 1: leehk
COMPOSE_PROJECT_NAME=leehk
BASE_PATH=/leehk
NEXT_PUBLIC_BACKEND_URL=/leehk
BIND_HOST=127.0.0.1
FRONTEND_PORT=7128
API_PORT=7127
POSTGRES_PORT=5432
FRONTEND_URL=https://helpcenter.elasolution.com/leehk
BACKEND_URL=https://helpcenter.elasolution.com/leehk
CORS_ORIGINS=https://helpcenter.elasolution.com
```

```env
# 고객사 2: kbs
COMPOSE_PROJECT_NAME=kbs
BASE_PATH=/kbs
NEXT_PUBLIC_BACKEND_URL=/kbs
BIND_HOST=127.0.0.1
FRONTEND_PORT=7228
API_PORT=7227
POSTGRES_PORT=5532
FRONTEND_URL=https://helpcenter.elasolution.com/kbs
BACKEND_URL=https://helpcenter.elasolution.com/kbs
CORS_ORIGINS=https://helpcenter.elasolution.com
```

주의할 점 두 가지.

- **`BASE_PATH` 는 빌드 시점에 번들에 박힌다.** 값을 바꾸면 `./start.sh` 로 이미지를
  다시 빌드해야 반영된다. 컨테이너만 재시작하면 옛 경로가 그대로 남는다.
- **`NEXT_PUBLIC_BACKEND_URL` 은 `/leehk` 처럼 경로만 적는다.** 브라우저가
  `https://helpcenter.elasolution.com/leehk/api/chat` 으로 호출하고, nginx 가 앞자리를 떼고
  API 컨테이너로 넘긴다. 같은 출처라서 CORS 문제도 생기지 않는다.

`accounts.json` 도 폴더마다 따로 두고 고객사 계정만 넣는다.

---

## 4. nginx 설치

```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/nginx/snippets/ela-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx/helpcenter.elasolution.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/helpcenter.elasolution.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

이 설정은 nginx 1.18 과 1.27 양쪽에서 `nginx -t` 통과를 확인했다.

고객사를 추가할 때는 `helpcenter.elasolution.com.conf` 에서 `upstream` 두 줄과
`location` 블록 네 개를 복사해 이름·포트만 바꾸면 된다.

### 이 설정이 하는 일 중 빠뜨리기 쉬운 것

- `proxy_buffering off` — 답변 스트리밍(SSE)용. 없으면 답변이 다 끝난 뒤 한꺼번에 도착해서
  타이핑 효과가 사라지고 사용자는 몇십 초 동안 빈 화면을 본다.
- `X-Forwarded-For` — API 의 분당 60건 제한이 이 헤더로 사람을 구분한다.
  빠뜨리면 고객사 전체가 nginx IP 하나로 묶여 다 같이 429 를 맞는다.
- `client_max_body_size 60m` — 문서 업로드 한도가 50MB 라서 nginx 기본값(1m)이면 413 이 난다.
- `frame-ancestors *` — 위젯을 고객사 웹사이트에서 iframe 으로 띄우기 때문에
  `X-Frame-Options DENY` 를 걸면 위젯이 안 열린다. 허용 도메인을 좁히려면 여기에 나열한다.

---

## 5. 배포 순서 정리

```bash
# 각 고객사 폴더에서
./start.sh          # .env 를 읽어 빌드 + 기동
./status.sh         # 상태 확인
```

```bash
# nginx 를 거치지 않고 컨테이너가 살아 있는지 먼저 본다
curl -s localhost:7127/health
curl -sI localhost:7128/leehk/ | head -1
```

```bash
# 그다음 도메인으로 확인
curl -sI https://helpcenter.elasolution.com/leehk/ | head -1
curl -s https://helpcenter.elasolution.com/leehk/api/chat-intro | head -c 300
```
