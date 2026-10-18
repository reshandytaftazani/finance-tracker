import sqlite3
from datetime import date
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.db import create_db_engine
from app.models import Budget, Category, Owner, Transaction
from app.services.analytics import monthly_category_expenses, monthly_summary
from scripts.backup import create_backup, main, restore_backup, verify_backup
from scripts.migrate import upgrade_database
from scripts.seed import bootstrap_local_owner


@pytest.fixture
def populated_db_path(tmp_path):
    """Create a temporary SQLite database with migration, seed, transactions, and budgets."""
    db_path = tmp_path / "finance_source.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        upgrade_database(engine, backup_dir=tmp_path / "backups")
        bootstrap_local_owner(engine)

        with Session(engine) as session:
            owner = session.exec(select(Owner)).first()
            assert owner is not None
            categories = session.exec(
                select(Category).where(Category.owner_id == owner.id)
            ).all()
            cat_map = {c.name: c for c in categories}

            # Add sample transactions
            tx1 = Transaction(
                owner_id=owner.id,
                category_id=cat_map["Makanan"].id,
                type="expense",
                amount_rupiah=125_000,
                date=date(2026, 10, 5),
                description="Makan Siang",
                notes="Bersama teman",
            )
            tx2 = Transaction(
                owner_id=owner.id,
                category_id=cat_map["Gaji"].id,
                type="income",
                amount_rupiah=15_000_000,
                date=date(2026, 10, 1),
                description="Gaji Bulanan",
            )
            tx3 = Transaction(
                owner_id=owner.id,
                category_id=cat_map["Transport"].id,
                type="expense",
                amount_rupiah=50_000,
                date=date(2026, 10, 6),
                description="Bensin",
            )
            session.add_all([tx1, tx2, tx3])

            # Add sample budget
            budget = Budget(
                owner_id=owner.id,
                category_id=cat_map["Makanan"].id,
                month=10,
                year=2026,
                amount_rupiah=2_000_000,
            )
            session.add(budget)
            session.commit()
    finally:
        engine.dispose()

    return db_path


def test_create_backup_creates_valid_sqlite_backup(populated_db_path, tmp_path):
    backup_dir = tmp_path / "backups"
    backup_file = create_backup(populated_db_path, backup_dir)

    assert backup_file.exists()
    assert backup_file.parent == backup_dir
    assert backup_file.name.startswith("finance-backup-")
    assert backup_file.name.endswith(".db")

    # Check integrity of backup file
    conn = sqlite3.connect(f"file:{backup_file.as_posix()}?mode=ro", uri=True)
    try:
        check = conn.execute("PRAGMA quick_check").fetchall()
        assert check == [("ok",)]
    finally:
        conn.close()


def test_create_backup_wal_mode_captures_uncheckpointed_data(tmp_path):
    db_path = tmp_path / "wal_source.db"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE test_data (id INTEGER PRIMARY KEY, note TEXT)")
    conn.execute("INSERT INTO test_data (note) VALUES ('written in WAL')")
    conn.commit()

    # Verify WAL file exists
    wal_file = Path(f"{db_path.as_posix()}-wal")
    assert wal_file.exists()

    backup_dir = tmp_path / "backups"
    backup_file = create_backup(db_path, backup_dir)

    conn.close()

    # Check backup has the committed record without needing manual checkpoint
    bconn = sqlite3.connect(backup_file)
    try:
        rows = bconn.execute("SELECT note FROM test_data").fetchall()
        assert rows == [("written in WAL",)]
    finally:
        bconn.close()


def test_create_backup_nonexistent_source_raises(tmp_path):
    fake_source = tmp_path / "nonexistent.db"
    with pytest.raises(FileNotFoundError, match="Source database not found"):
        create_backup(fake_source, tmp_path / "backups")


def test_verify_backup_valid_and_invalid(populated_db_path, tmp_path):
    backup_dir = tmp_path / "backups"
    backup_file = create_backup(populated_db_path, backup_dir)
    assert verify_backup(backup_file) is True

    corrupt_file = tmp_path / "corrupt.db"
    corrupt_file.write_bytes(b"not a sqlite database file at all")
    with pytest.raises(RuntimeError, match="integrity check failed|not a database"):
        verify_backup(corrupt_file)


def test_restore_backup_exact_data_and_analytics_match(populated_db_path, tmp_path):
    backup_dir = tmp_path / "backups"
    backup_file = create_backup(populated_db_path, backup_dir)

    restored_db_path = tmp_path / "restored.db"
    restored_result = restore_backup(backup_file, restored_db_path)

    assert restored_result == restored_db_path
    assert restored_db_path.exists()

    # Verify both databases give identical analytics summaries and category breakdowns
    source_engine = create_db_engine(f"sqlite:///{populated_db_path.as_posix()}")
    restored_engine = create_db_engine(f"sqlite:///{restored_db_path.as_posix()}")

    try:
        with Session(source_engine) as src_session, Session(restored_engine) as res_session:
            # Check owner
            src_owner = src_session.exec(select(Owner)).first()
            res_owner = res_session.exec(select(Owner)).first()
            assert src_owner is not None
            assert res_owner is not None
            assert src_owner.id == res_owner.id

            # Check monthly summary
            src_summary = monthly_summary(src_session, src_owner.id, 10, 2026)
            res_summary = monthly_summary(res_session, res_owner.id, 10, 2026)
            assert src_summary == res_summary
            assert res_summary.income == 15_000_000
            assert res_summary.expense == 175_000
            assert res_summary.net_cash_flow == 14_825_000

            # Check monthly category expenses
            src_by_cat = monthly_category_expenses(src_session, src_owner.id, 10, 2026)
            res_by_cat = monthly_category_expenses(res_session, res_owner.id, 10, 2026)
            assert src_by_cat == res_by_cat

            # Check transactions count
            src_txs = src_session.exec(select(Transaction)).all()
            res_txs = res_session.exec(select(Transaction)).all()
            assert len(src_txs) == 3
            assert len(res_txs) == 3
            assert [(t.id, t.amount_rupiah, t.description) for t in src_txs] == [
                (t.id, t.amount_rupiah, t.description) for t in res_txs
            ]

            # Check budgets count
            src_budgets = src_session.exec(select(Budget)).all()
            res_budgets = res_session.exec(select(Budget)).all()
            assert len(src_budgets) == 1
            assert len(res_budgets) == 1
            assert src_budgets[0].amount_rupiah == res_budgets[0].amount_rupiah
    finally:
        source_engine.dispose()
        restored_engine.dispose()


def test_restore_target_exists_without_force_raises(populated_db_path, tmp_path):
    backup_file = create_backup(populated_db_path, tmp_path / "backups")
    target_path = tmp_path / "target_exists.db"
    target_path.write_text("existing content")

    with pytest.raises(FileExistsError, match="already exists"):
        restore_backup(backup_file, target_path, force=False)

    # With force=True, it should overwrite successfully
    restored = restore_backup(backup_file, target_path, force=True)
    assert restored == target_path
    assert verify_backup(target_path) is True


def test_restore_corrupt_backup_raises_and_cleans_up(tmp_path):
    corrupt_backup = tmp_path / "corrupt.db"
    corrupt_backup.write_bytes(b"corrupted backup content")
    target_path = tmp_path / "target.db"

    with pytest.raises(RuntimeError):
        restore_backup(corrupt_backup, target_path)

    assert not target_path.exists()


def test_cli_backup_and_restore(populated_db_path, tmp_path, capsys):
    backup_dir = tmp_path / "cli_backups"

    # 1. CLI create backup
    exit_code = main(["--source", str(populated_db_path), "--backup-dir", str(backup_dir)])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "Backup berhasil dibuat:" in captured.out

    # Find the backup file created
    backup_files = list(backup_dir.glob("finance-backup-*.db"))
    assert len(backup_files) == 1
    backup_file = backup_files[0]

    # 2. CLI verify backup
    exit_code_verify = main(["--verify", str(backup_file)])
    assert exit_code_verify == 0
    captured_verify = capsys.readouterr()
    assert "Integritas backup valid:" in captured_verify.out

    # 3. CLI restore backup
    restored_target = tmp_path / "cli_restored.db"
    exit_code_restore = main([
        "--restore", str(backup_file),
        "--target", str(restored_target),
    ])
    assert exit_code_restore == 0
    captured_restore = capsys.readouterr()
    assert "Restore berhasil ke:" in captured_restore.out
    assert restored_target.exists()
    assert verify_backup(restored_target) is True
