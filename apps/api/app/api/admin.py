from fastapi import APIRouter, HTTPException

from app.core.security import authenticate_admin, create_access_token
from app.schemas.api import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if not authenticate_admin(payload.email, payload.password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    return TokenResponse(access_token=create_access_token(payload.email))
