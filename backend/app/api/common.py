"""Small shared request dependencies and category relation checks."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path, Query
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import get_current_owner
from app.models import Category, Owner

SessionDep = Annotated[Session, Depends(get_session)]
OwnerDep = Annotated[Owner, Depends(get_current_owner)]
ResourceID = Annotated[int, Path(ge=1, le=2**63 - 1)]
PageNumber = Annotated[int, Query(ge=1, le=2**31 - 1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def find_category(session: Session, owner_id: int, category_id: int) -> Category:
    category = session.exec(
        select(Category).where(
            Category.owner_id == owner_id, Category.id == category_id
        )
    ).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def commit_or_conflict(session: Session) -> None:
    """Keep DB constraints authoritative, including concurrent relation changes."""
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Operation conflicts with existing data"
        ) from None
