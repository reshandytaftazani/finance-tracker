"""Dependencies for request handling and server-enforced ownership.

In local-only MVP mode, ownership is determined strictly by the server.
Client requests cannot supply, choose, or override owner_id.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlmodel import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.models import Owner

LOCAL_OWNER_ID: int = 1


def get_current_owner_id(
    settings: Annotated[Settings, Depends(get_settings)],
) -> int:
    """Resolve active owner ID strictly on the server side.

    In local mode, ownership is fixed to LOCAL_OWNER_ID (1) initialized during bootstrap.
    If the application environment is configured for non-local access without authentication,
    the server rejects the request with 401 Unauthorized.
    """
    if settings.env == "local":
        return LOCAL_OWNER_ID

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required for non-local environment",
    )


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
