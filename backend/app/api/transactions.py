"""Synchronous, owner-scoped transaction CRUD with exact integer amounts."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.common import (
    OwnerDep,
    PageNumber,
    PageSize,
    ResourceID,
    SessionDep,
    commit_or_conflict,
    find_category,
)
from app.models import Transaction, TransactionType, utc_now
from app.schemas import (
    LocalDateInput,
    TransactionCreate,
    TransactionPage,
    TransactionRead,
    TransactionUpdate,
)

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


def find_transaction(
    session: Session, owner_id: int, transaction_id: int
) -> Transaction:
    transaction = session.exec(
        select(Transaction).where(
            Transaction.owner_id == owner_id, Transaction.id == transaction_id
        )
    ).first()
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


def validate_category(
    session: Session, owner_id: int, category_id: int, kind: TransactionType
) -> None:
    category = find_category(session, owner_id, category_id)
    if category.type != kind:
        raise HTTPException(
            status_code=422, detail="Category type must match transaction type"
        )


@router.get("", response_model=TransactionPage)
def list_transactions(
    session: SessionDep,
    owner: OwnerDep,
    start_date: LocalDateInput | None = None,
    end_date: LocalDateInput | None = None,
    category_id: Annotated[int | None, Query(ge=1, le=2**63 - 1)] = None,
    type: TransactionType | None = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=422, detail="start_date must not exceed end_date"
        )
    predicates = [Transaction.owner_id == owner.id]
    if start_date is not None:
        predicates.append(Transaction.date >= start_date)
    if end_date is not None:
        predicates.append(Transaction.date <= end_date)
    if category_id is not None:
        find_category(session, owner.id, category_id)
        predicates.append(Transaction.category_id == category_id)
    if type is not None:
        predicates.append(Transaction.type == type)
    total = session.exec(
        select(func.count()).select_from(Transaction).where(*predicates)
    ).one()
    items = session.exec(
        select(Transaction)
        .where(*predicates)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(
    payload: TransactionCreate, session: SessionDep, owner: OwnerDep
):
    validate_category(session, owner.id, payload.category_id, payload.type)
    transaction = Transaction(owner_id=owner.id, **payload.model_dump())
    session.add(transaction)
    commit_or_conflict(session)
    session.refresh(transaction)
    return transaction


# Task 3.3 must register its static /export/csv route before the ID routes below.
@router.get("/{transaction_id}", response_model=TransactionRead)
def read_transaction(transaction_id: ResourceID, session: SessionDep, owner: OwnerDep):
    return find_transaction(session, owner.id, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: ResourceID,
    payload: TransactionUpdate,
    session: SessionDep,
    owner: OwnerDep,
):
    transaction = find_transaction(session, owner.id, transaction_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        validate_category(
            session,
            owner.id,
            changes.get("category_id", transaction.category_id),
            changes.get("type", transaction.type),
        )
        transaction.sqlmodel_update(changes)
        transaction.updated_at = utc_now()
        session.add(transaction)
        commit_or_conflict(session)
        session.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: ResourceID, session: SessionDep, owner: OwnerDep
):
    transaction = find_transaction(session, owner.id, transaction_id)
    session.delete(transaction)
    commit_or_conflict(session)
    return Response(status_code=204)
