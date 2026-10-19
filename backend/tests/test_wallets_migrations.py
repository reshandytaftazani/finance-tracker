import pytest
from datetime import date
from sqlalchemy import event, inspect
from sqlmodel import Session, create_engine
from alembic import command

from app.db import enable_sqlite_foreign_keys
from app.models import Category, Owner, Transaction, Wallet, Transfer
from scripts.migrate import alembic_config, upgrade_database


def test_migration_creates_wallets_and_transfers_on_empty_db(tmp_path):
    db_file = tmp_path / "test_migration.db"
    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    upgrade_database(engine, backup_dir=tmp_path / "backups")

    table_names = set(inspect(engine).get_table_names())
    assert "wallets" in table_names
    assert "transfers" in table_names

    with engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_migration_with_existing_transactions_bootstraps_default_wallet(tmp_path):
    db_file = tmp_path / "test_existing.db"
    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    config = alembic_config()

    # 1. Upgrade to 0003_owner_password_and_sessions first
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.upgrade(config, "0003_owner_password_and_sessions")

    # 2. Insert owner, category, transaction (which has no wallet_id at 0003)
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "INSERT INTO owners (id, display_name, created_at, updated_at) "
            "VALUES (1, 'Test Owner', '2026-10-19 00:00:00', '2026-10-19 00:00:00')"
        )
        conn.exec_driver_sql(
            "INSERT INTO categories (id, owner_id, name, normalized_name, type, created_at, updated_at) "
            "VALUES (1, 1, 'Makan', 'makan', 'expense', '2026-10-19 00:00:00', '2026-10-19 00:00:00')"
        )
        conn.exec_driver_sql(
            "INSERT INTO transactions (id, owner_id, category_id, type, amount_rupiah, date, description, created_at, updated_at) "
            "VALUES (1, 1, 1, 'expense', 50000, '2026-10-19', 'Makan siang', '2026-10-19 00:00:00', '2026-10-19 00:00:00')"
        )
        conn.commit()

    # 3. Upgrade to 0004_wallets_and_transfers
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.upgrade(config, "0004_wallets_and_transfers")

    # 4. Verify wallet was created and transaction's wallet_id points to it
    with engine.connect() as conn:
        wallets = conn.exec_driver_sql("SELECT id, owner_id, name, type, initial_balance_rupiah FROM wallets").all()
        assert len(wallets) == 1
        w_id, w_owner, w_name, w_type, w_balance = wallets[0]
        assert w_owner == 1
        assert w_name == "Dompet Utama"
        assert w_type == "bank"
        assert w_balance == 0

        txs = conn.exec_driver_sql("SELECT id, owner_id, wallet_id FROM transactions").all()
        assert len(txs) == 1
        assert txs[0][2] == w_id

        # Integrity check
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []
