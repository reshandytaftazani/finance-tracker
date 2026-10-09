"""Owner-scoped category CRUD; no public ownership or normalization inputs."""

from fastapi import APIRouter, Response
from sqlalchemy import func
from sqlmodel import select

from app.api.common import (
    OwnerDep,
    PageNumber,
    PageSize,
    ResourceID,
    SessionDep,
    commit_or_conflict,
    find_category,
)
from app.models import Category, TransactionType, utc_now
from app.schemas import CategoryCreate, CategoryPage, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.get("", response_model=CategoryPage)
def list_categories(
    session: SessionDep,
    owner: OwnerDep,
    type: TransactionType | None = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    predicates = [Category.owner_id == owner.id]
    if type is not None:
        predicates.append(Category.type == type)
    total = session.exec(
        select(func.count()).select_from(Category).where(*predicates)
    ).one()
    items = session.exec(
        select(Category)
        .where(*predicates)
        .order_by(Category.normalized_name, Category.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(payload: CategoryCreate, session: SessionDep, owner: OwnerDep):
    category = Category(owner_id=owner.id, **payload.model_dump())
    session.add(category)
    commit_or_conflict(session)
    session.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: ResourceID,
    payload: CategoryUpdate,
    session: SessionDep,
    owner: OwnerDep,
):
    category = find_category(session, owner.id, category_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        category.sqlmodel_update(changes)
        category.updated_at = utc_now()
        session.add(category)
        commit_or_conflict(session)
        session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: ResourceID, session: SessionDep, owner: OwnerDep):
    category = find_category(session, owner.id, category_id)
    session.delete(category)
    commit_or_conflict(session)
    return Response(status_code=204)
