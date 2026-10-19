"""Owner-scoped transfer CRUD between wallets."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import or_
from sqlmodel import func, select

from app.api.common import (
    OwnerDep,
    PageNumber,
    PageSize,
    ResourceID,
    SessionDep,
    commit_or_conflict,
    find_transfer,
    find_wallet,
)
from app.models import Transfer
from app.schemas import TransferCreate, TransferPage, TransferRead

router = APIRouter(prefix="/api/v1/transfers", tags=["transfers"])


@router.get("", response_model=TransferPage)
def list_transfers(
    session: SessionDep,
    owner: OwnerDep,
    wallet_id: Annotated[int | None, Query(ge=1, le=2**63 - 1)] = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    predicates = [Transfer.owner_id == owner.id]
    if wallet_id is not None:
        find_wallet(session, owner.id, wallet_id)
        predicates.append(
            or_(
                Transfer.from_wallet_id == wallet_id,
                Transfer.to_wallet_id == wallet_id,
            )
        )
    total = session.exec(
        select(func.count()).select_from(Transfer).where(*predicates)
    ).one()
    items = session.exec(
        select(Transfer)
        .where(*predicates)
        .order_by(Transfer.date.desc(), Transfer.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=TransferRead, status_code=201)
def create_transfer(
    payload: TransferCreate,
    session: SessionDep,
    owner: OwnerDep,
):
    if payload.from_wallet_id == payload.to_wallet_id:
        raise HTTPException(
            status_code=422,
            detail="Source and destination wallets must be different",
        )
    find_wallet(session, owner.id, payload.from_wallet_id)
    find_wallet(session, owner.id, payload.to_wallet_id)

    transfer = Transfer(owner_id=owner.id, **payload.model_dump())
    session.add(transfer)
    commit_or_conflict(session)
    session.refresh(transfer)
    return transfer


@router.delete("/{transfer_id}", status_code=204)
def delete_transfer(
    transfer_id: ResourceID,
    session: SessionDep,
    owner: OwnerDep,
):
    transfer = find_transfer(session, owner.id, transfer_id)
    session.delete(transfer)
    commit_or_conflict(session)
    return Response(status_code=204)
