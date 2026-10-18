"""Authentication API endpoints for login, logout, and session verification."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import generate_session_token, hash_token, verify_password
from app.config import Settings, get_settings
from app.db import get_session
from app.dependencies import get_current_owner
from app.models import Owner, UserSession, utc_now

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str = Field(min_length=1)


@router.post("/login")
def login(
    credentials: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    owner = session.exec(select(Owner).where(Owner.id == 1)).first()
    if (
        owner is None
        or not owner.password_hash
        or not verify_password(credentials.password, owner.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    raw_token, token_hash = generate_session_token()
    expires_at = utc_now() + timedelta(days=settings.session_expire_days)

    user_session = UserSession(
        token_hash=token_hash,
        owner_id=owner.id,
        expires_at=expires_at,
    )
    session.add(user_session)
    session.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        httponly=True,
        samesite=settings.session_cookie_samesite,
        secure=settings.session_cookie_secure,
        expires=expires_at,
        path="/",
    )

    return {
        "status": "ok",
        "owner_id": owner.id,
        "display_name": owner.display_name,
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token:
        token_h = hash_token(raw_token)
        existing = session.exec(
            select(UserSession).where(UserSession.token_hash == token_h)
        ).first()
        if existing:
            session.delete(existing)
            session.commit()

    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
    )
    return {"status": "ok"}


@router.get("/me")
def get_me(
    owner: Annotated[Owner, Depends(get_current_owner)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    return {
        "authenticated": True,
        "auth_enabled": settings.auth_enabled,
        "owner_id": owner.id,
        "display_name": owner.display_name,
    }
