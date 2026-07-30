"""로그인 계정 목록.

계정을 추가·수정·삭제하려면 아래 ACCOUNTS 목록만 고치고 API를 재시작하면 된다.
사용 인원이 적어서 회원가입과 DB 대신 코드에 직접 정의한다.

주의: 비밀번호가 평문으로 저장되므로 이 파일이 공개 저장소에 올라가면 안 된다.
"""
from dataclasses import dataclass
from secrets import compare_digest

ROLE_ADMIN = "admin"
ROLE_USER = "user"


@dataclass(frozen=True)
class Account:
    username: str
    password: str
    name: str
    role: str = ROLE_ADMIN  # admin: 관리자 페이지 사용 / user: 채팅만


# ─────────────────────────────────────────────────────────────
# 계정은 여기에 추가한다. Account(...) 한 줄이 계정 하나.
# ─────────────────────────────────────────────────────────────
ACCOUNTS: tuple[Account, ...] = (
    Account(username="test", password="1111", name="테스트", role=ROLE_ADMIN),
)


def find_account(username: str) -> Account | None:
    for account in ACCOUNTS:
        if account.username == username:
            return account
    return None


def authenticate(username: str, password: str) -> Account | None:
    account = find_account(username)
    if not account or not compare_digest(account.password, password):
        return None
    return account
