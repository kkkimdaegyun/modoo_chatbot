from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.accounts import ROLE_ADMIN, Account, find_account
from app.core.config import settings


bearer = HTTPBearer(auto_error=False)


def create_access_token(subject: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": subject, "role": role, "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def get_current_account(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Account:
    if not credentials:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        username = str(payload["sub"])
    except (jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 인증입니다.") from exc
    # 계정 목록에서 지운 계정의 토큰은 즉시 무효가 된다.
    account = find_account(username)
    if not account:
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 인증입니다.")
    return account


def require_admin(account: Account = Depends(get_current_account)) -> Account:
    if account.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return account
