"""Dependencies for request handling and server-enforced ownership.

In local-only MVP mode, ownership is determined strictly by the server.
Client requests cannot supply, choose, or override owner_id.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth import hash_token
from app.config import Settings, get_settings
from app.db import get_session
from app.models import Owner, UserSession, utc_now

LOCAL_OWNER_ID: int = 1


def get_current_owner_id(
    settings: Annotated[Settings, Depends(get_settings)],
    request: Request = None,  # type: ignore[assignment]
    session: Annotated[Session, Depends(get_session)] = None,  # type: ignore[assignment]
) -> int:
    """Resolve active owner ID strictly on the server side.

    In local mode with auth disabled, ownership is fixed to LOCAL_OWNER_ID (1).
    When auth is enabled (or environment is non-local), a valid session cookie
    must be provided and active.
    """
    if not settings.auth_enabled and settings.env == "local":
        return LOCAL_OWNER_ID

    if request is None or session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token_h = hash_token(raw_token)
    now = utc_now()
    user_session = session.exec(
        select(UserSession).where(
            UserSession.token_hash == token_h,
            UserSession.expires_at > now,
        )
    ).first()

    if user_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return user_session.owner_id


def get_current_owner(
    session: Annotated[Session, Depends(get_session)],
    owner_id: Annotated[int, Depends(get_current_owner_id)],
) -> Owner:
    """Resolve and verify the current owner entity from the database.

    Raises 500 if the database has not been bootstrapped with the local owner.
    """
    owner = session.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Owner ID {owner_id} is not bootstrapped in the database",
        )
    return owner
