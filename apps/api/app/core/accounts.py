"""로그인 계정 목록.

계정은 코드가 아니라 레포 루트의 accounts.json 에서 읽는다.
파일만 고치면 되고, 저장하는 즉시(다음 로그인 요청부터) 반영되므로 재시작도 필요 없다.

accounts.json 예시:
    {
      "accounts": [
        { "company": "테스트 고객사", "username": "test", "password": "1111", "role": "admin" }
      ]
    }

role 은 admin(관리자 페이지 사용) 또는 user(채팅만). 생략하면 admin 이다.
주의: 비밀번호가 평문이므로 accounts.json 은 절대 커밋하지 않는다(.gitignore 등록됨).
"""

import json
from dataclasses import dataclass
from pathlib import Path
from secrets import compare_digest

import structlog

from app.core.config import ROOT

logger = structlog.get_logger(__name__)

ROLE_ADMIN = "admin"
ROLE_USER = "user"
ACCOUNTS_FILE = Path(ROOT) / "accounts.json"

# 파일이 없을 때만 쓰는 최소 계정. 운영에서는 accounts.json 을 반드시 둔다.
FALLBACK_USERNAME = "test"
FALLBACK_PASSWORD = "1111"


@dataclass(frozen=True)
class Account:
    username: str
    password: str
    name: str  # 고객사 이름. 화면 우측 상단에 표시된다.
    role: str = ROLE_ADMIN


_cache: tuple[float, tuple[Account, ...]] | None = None


def _parse(raw: object) -> tuple[Account, ...]:
    """{"accounts": [...]} 와 [...] 두 형태를 모두 받아준다."""
    rows = raw.get("accounts", []) if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        logger.warning("accounts_file_invalid", reason="accounts 항목이 목록이 아닙니다.")
        return ()
    accounts: list[Account] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            logger.warning("account_entry_skipped", index=index, reason="객체가 아님")
            continue
        username = str(row.get("username") or "").strip()
        password = str(row.get("password") or "")
        if not username or not password:
            logger.warning("account_entry_skipped", index=index, reason="username 또는 password 누락")
            continue
        if username in seen:
            logger.warning("account_entry_skipped", index=index, username=username, reason="아이디 중복")
            continue
        seen.add(username)
        role = str(row.get("role") or ROLE_ADMIN).strip().lower()
        if role not in (ROLE_ADMIN, ROLE_USER):
            logger.warning("account_role_defaulted", username=username, role=role)
            role = ROLE_ADMIN
        name = str(row.get("company") or row.get("name") or username).strip()
        accounts.append(Account(username=username, password=password, name=name, role=role))
    return tuple(accounts)


def load_accounts() -> tuple[Account, ...]:
    """accounts.json 을 읽는다. 파일이 바뀌었을 때만 다시 읽고 평소에는 캐시를 쓴다."""
    global _cache
    try:
        stamp = ACCOUNTS_FILE.stat().st_mtime
    except OSError:
        if _cache is None:
            logger.warning("accounts_file_missing", path=str(ACCOUNTS_FILE))
        _cache = None
        return (Account(username=FALLBACK_USERNAME, password=FALLBACK_PASSWORD, name="테스트 계정"),)
    if _cache and _cache[0] == stamp:
        return _cache[1]
    try:
        accounts = _parse(json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as exc:
        # 편집 중 문법이 깨졌다고 로그인이 막히면 곤란하므로 직전에 읽어둔 목록을 유지한다.
        logger.error("accounts_file_unreadable", path=str(ACCOUNTS_FILE), error=str(exc))
        return _cache[1] if _cache else ()
    _cache = (stamp, accounts)
    logger.info("accounts_loaded", count=len(accounts), path=str(ACCOUNTS_FILE))
    return accounts


def find_account(username: str) -> Account | None:
    for account in load_accounts():
        if account.username == username:
            return account
    return None


def authenticate(username: str, password: str) -> Account | None:
    account = find_account(username)
    if not account or not compare_digest(account.password, password):
        return None
    return account
