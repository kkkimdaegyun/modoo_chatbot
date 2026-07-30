import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.core.accounts import Account, authenticate
from app.core.security import create_access_token, get_current_account
from app.schemas.api import AccountResponse, LoginRequest, TokenResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    account = authenticate(payload.username, payload.password)
    if not account:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    logger.info("login_succeeded", username=account.username, role=account.role)
    return TokenResponse(
        access_token=create_access_token(account.username, account.role),
        user=AccountResponse(username=account.username, name=account.name, role=account.role),
    )


@router.get("/me", response_model=AccountResponse)
def me(account: Account = Depends(get_current_account)) -> AccountResponse:
    return AccountResponse(username=account.username, name=account.name, role=account.role)
