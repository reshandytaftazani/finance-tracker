"""Owner-scoped wallet CRUD and live balance calculations."""

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import func, or_
from sqlmodel import select

from app.api.common import (
    OwnerDep,
    ResourceID,
    SessionDep,
    commit_or_conflict,
    find_wallet,
)
from app.models import Transaction, Transfer, Wallet, utc_now
from app.schemas import (
    WalletCreate,
    WalletListResponse,
    WalletRead,
    WalletUpdate,
)

router = APIRouter(prefix="/api/v1/wallets", tags=["wallets"])


def get_wallet_balances(
    session: SessionDep, owner_id: int, wallet_ids: list[int] | None = None
) -> dict[int, int]:
    """Calculate live balances per wallet using integer arithmetic."""
    income_stmt = select(
        Transaction.wallet_id, func.coalesce(func.sum(Transaction.amount_rupiah), 0)
    ).where(
        Transaction.owner_id == owner_id,
        Transaction.type == "income",
    )
    expense_stmt = select(
        Transaction.wallet_id, func.coalesce(func.sum(Transaction.amount_rupiah), 0)
    ).where(
        Transaction.owner_id == owner_id,
        Transaction.type == "expense",
    )
    tf_out_stmt = select(
        Transfer.from_wallet_id, func.coalesce(func.sum(Transfer.amount_rupiah), 0)
    ).where(Transfer.owner_id == owner_id)
    tf_in_stmt = select(
        Transfer.to_wallet_id, func.coalesce(func.sum(Transfer.amount_rupiah), 0)
    ).where(Transfer.owner_id == owner_id)

    if wallet_ids:
        income_stmt = income_stmt.where(Transaction.wallet_id.in_(wallet_ids))
        expense_stmt = expense_stmt.where(Transaction.wallet_id.in_(wallet_ids))
        tf_out_stmt = tf_out_stmt.where(Transfer.from_wallet_id.in_(wallet_ids))
        tf_in_stmt = tf_in_stmt.where(Transfer.to_wallet_id.in_(wallet_ids))

    income_map = dict(session.exec(income_stmt.group_by(Transaction.wallet_id)).all())
    expense_map = dict(session.exec(expense_stmt.group_by(Transaction.wallet_id)).all())
    tf_out_map = dict(session.exec(tf_out_stmt.group_by(Transfer.from_wallet_id)).all())
    tf_in_map = dict(session.exec(tf_in_stmt.group_by(Transfer.to_wallet_id)).all())

    w_stmt = select(Wallet.id, Wallet.initial_balance_rupiah).where(
        Wallet.owner_id == owner_id
    )
    if wallet_ids:
        w_stmt = w_stmt.where(Wallet.id.in_(wallet_ids))
    initial_map = dict(session.exec(w_stmt).all())

    balances: dict[int, int] = {}
    for wid, init_bal in initial_map.items():
        balances[wid] = (
            init_bal
            + income_map.get(wid, 0)
            - expense_map.get(wid, 0)
            - tf_out_map.get(wid, 0)
            + tf_in_map.get(wid, 0)
        )
    return balances


@router.get("", response_model=WalletListResponse)
def list_wallets(session: SessionDep, owner: OwnerDep):
    wallets = session.exec(
        select(Wallet).where(Wallet.owner_id == owner.id).order_by(Wallet.id)
    ).all()
    balances = get_wallet_balances(session, owner.id)
    items = []
    total_net_worth = 0
    for w in wallets:
        bal = balances.get(w.id, w.initial_balance_rupiah)
        total_net_worth += bal
        items.append(
            WalletRead(
                id=w.id,
                name=w.name,
                type=w.type,
                initial_balance_rupiah=w.initial_balance_rupiah,
                current_balance_rupiah=bal,
                created_at=w.created_at,
                updated_at=w.updated_at,
            )
        )
    return WalletListResponse(
        items=items,
        total_net_worth_rupiah=total_net_worth,
    )


@router.post("", response_model=WalletRead, status_code=201)
def create_wallet(payload: WalletCreate, session: SessionDep, owner: OwnerDep):
    wallet = Wallet(owner_id=owner.id, **payload.model_dump())
    session.add(wallet)
    commit_or_conflict(session)
    session.refresh(wallet)
    return WalletRead(
        id=wallet.id,
        name=wallet.name,
        type=wallet.type,
        initial_balance_rupiah=wallet.initial_balance_rupiah,
        current_balance_rupiah=wallet.initial_balance_rupiah,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


@router.get("/{wallet_id}", response_model=WalletRead)
def get_wallet(wallet_id: ResourceID, session: SessionDep, owner: OwnerDep):
    wallet = find_wallet(session, owner.id, wallet_id)
    balances = get_wallet_balances(session, owner.id, [wallet.id])
    bal = balances.get(wallet.id, wallet.initial_balance_rupiah)
    return WalletRead(
        id=wallet.id,
        name=wallet.name,
        type=wallet.type,
        initial_balance_rupiah=wallet.initial_balance_rupiah,
        current_balance_rupiah=bal,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


@router.patch("/{wallet_id}", response_model=WalletRead)
def update_wallet(
    wallet_id: ResourceID,
    payload: WalletUpdate,
    session: SessionDep,
    owner: OwnerDep,
):
    wallet = find_wallet(session, owner.id, wallet_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        wallet.sqlmodel_update(changes)
        wallet.updated_at = utc_now()
        session.add(wallet)
        commit_or_conflict(session)
        session.refresh(wallet)
    balances = get_wallet_balances(session, owner.id, [wallet.id])
    bal = balances.get(wallet.id, wallet.initial_balance_rupiah)
    return WalletRead(
        id=wallet.id,
        name=wallet.name,
        type=wallet.type,
        initial_balance_rupiah=wallet.initial_balance_rupiah,
        current_balance_rupiah=bal,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


@router.delete("/{wallet_id}", status_code=204)
def delete_wallet(wallet_id: ResourceID, session: SessionDep, owner: OwnerDep):
    wallet = find_wallet(session, owner.id, wallet_id)

    tx_count = session.exec(
        select(func.count()).select_from(Transaction).where(
            Transaction.owner_id == owner.id, Transaction.wallet_id == wallet_id
        )
    ).one()
    if tx_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Wallet cannot be deleted because it has associated transactions",
        )

    tf_count = session.exec(
        select(func.count()).select_from(Transfer).where(
            Transfer.owner_id == owner.id,
            or_(
                Transfer.from_wallet_id == wallet_id,
                Transfer.to_wallet_id == wallet_id,
            ),
        )
    ).one()
    if tf_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Wallet cannot be deleted because it has associated transfers",
        )

    session.delete(wallet)
    commit_or_conflict(session)
    return Response(status_code=204)
