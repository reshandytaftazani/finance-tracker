import pytest
from datetime import date
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import create_db_engine, enable_sqlite_foreign_keys
from app.models import (
    Owner,
    Category,
    Transaction,
    Wallet,
    Transfer,
)


@pytest.fixture
def session():
    from sqlalchemy import event
    engine = create_db_engine("sqlite:///:memory:")
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        owner = Owner(display_name="Owner 1")
        s.add(owner)
        s.commit()
        s.refresh(owner)
        yield s


def test_wallet_creation_and_constraints(session: Session):
    owner = session.exec(select(Owner)).first()
    assert owner is not None

    wallet = Wallet(
        owner_id=owner.id,
        name="BCA",
        type="bank",
        initial_balance_rupiah=1000000,
    )
    session.add(wallet)
    session.commit()
    session.refresh(wallet)

    assert wallet.id is not None
    assert wallet.name == "BCA"
    assert wallet.type == "bank"
    assert wallet.initial_balance_rupiah == 1000000


def test_wallet_duplicate_name_for_same_owner_rejected(session: Session):
    owner = session.exec(select(Owner)).first()
    w1 = Wallet(owner_id=owner.id, name="Kas", type="cash", initial_balance_rupiah=0)
    session.add(w1)
    session.commit()

    w2 = Wallet(owner_id=owner.id, name="Kas", type="cash", initial_balance_rupiah=50000)
    session.add(w2)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_transfer_creation_and_self_transfer_rejected(session: Session):
    owner = session.exec(select(Owner)).first()
    w1 = Wallet(owner_id=owner.id, name="Bank A", type="bank", initial_balance_rupiah=500000)
    w2 = Wallet(owner_id=owner.id, name="E-Wallet", type="ewallet", initial_balance_rupiah=50000)
    session.add_all([w1, w2])
    session.commit()

    # Valid transfer
    t = Transfer(
        owner_id=owner.id,
        from_wallet_id=w1.id,
        to_wallet_id=w2.id,
        amount_rupiah=100000,
        date=date(2026, 10, 19),
        description="Top up e-wallet",
    )
    session.add(t)
    session.commit()
    assert t.id is not None

    # Self-transfer should fail constraint
    invalid_t = Transfer(
        owner_id=owner.id,
        from_wallet_id=w1.id,
        to_wallet_id=w1.id,
        amount_rupiah=50000,
        date=date(2026, 10, 19),
        description="Self transfer",
    )
    session.add(invalid_t)
    with pytest.raises((IntegrityError, ValueError)):
        session.commit()
    session.rollback()


def test_transaction_requires_valid_wallet_id(session: Session):
    owner = session.exec(select(Owner)).first()
    cat = Category(owner_id=owner.id, name="Makan", type="expense")
    wallet = Wallet(owner_id=owner.id, name="Dompet", type="cash", initial_balance_rupiah=0)
    session.add_all([cat, wallet])
    session.commit()

    tx = Transaction(
        owner_id=owner.id,
        category_id=cat.id,
        wallet_id=wallet.id,
        type="expense",
        amount_rupiah=25000,
        date=date(2026, 10, 19),
        description="Makan siang",
    )
    session.add(tx)
    session.commit()
    assert tx.id is not None
    assert tx.wallet_id == wallet.id
