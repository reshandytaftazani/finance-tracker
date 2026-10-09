import io
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from datetime import date
from pathlib import Path
from unittest.mock import Mock

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import event, inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from alembic import command
from app.config import Settings
from app.db import create_db_engine
from app.models import Category, Owner, Transaction
from app.validation import MAX_AMOUNT_RUPIAH
from scripts import seed
from scripts.migrate import BACKEND_DIR, alembic_config, upgrade_database


@pytest.fixture
def empty_engine(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'finance.db').as_posix()}")
    yield engine
    engine.dispose()


@pytest.fixture
def migrated_engine(empty_engine, tmp_path):
    upgrade_database(empty_engine, backup_dir=tmp_path / "backups")
    return empty_engine


def snapshot(engine):
    with engine.connect() as connection:
        return {
            table: connection.exec_driver_sql(
                f"SELECT * FROM {table} ORDER BY id"
            ).all()
            for table in ("owners", "categories", "transactions")
        }


def test_empty_database_upgrade_twice_matches_models_and_has_no_seed_data(
    empty_engine, tmp_path
):
    backups = tmp_path / "backups"
    assert upgrade_database(empty_engine, backup_dir=backups) is None
    assert upgrade_database(empty_engine, backup_dir=backups) is None
    assert not backups.exists()
    assert set(inspect(empty_engine).get_table_names()) == {
        "alembic_version",
        "owners",
        "categories",
        "transactions",
    }
    assert snapshot(empty_engine) == {
        "owners": [],
        "categories": [],
        "transactions": [],
    }
    with empty_engine.connect() as connection:
        migration = MigrationContext.configure(
            connection, opts={"compare_type": True, "compare_server_default": True}
        )
        assert migration.get_current_heads() == ("0001_initial",)
        assert compare_metadata(migration, SQLModel.metadata) == []
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_migration_constraints_and_index_definitions_match_models(
    migrated_engine, tmp_path
):
    reference = create_db_engine(f"sqlite:///{(tmp_path / 'reference.db').as_posix()}")
    try:
        SQLModel.metadata.create_all(reference)
        expected = inspect(reference)
        actual = inspect(migrated_engine)
        for table in ("owners", "categories", "transactions"):
            for method in (
                "get_pk_constraint",
                "get_foreign_keys",
                "get_unique_constraints",
                "get_check_constraints",
                "get_indexes",
            ):
                assert getattr(actual, method)(table) == getattr(expected, method)(
                    table
                )
        with reference.connect() as first, migrated_engine.connect() as second:
            query = "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
            assert (
                first.exec_driver_sql(query).all()
                == second.exec_driver_sql(query).all()
            )
    finally:
        reference.dispose()


def test_bootstrap_twice_is_idempotent_and_creates_no_transactions(migrated_engine):
    assert seed.bootstrap_local_owner(migrated_engine) is True
    before = snapshot(migrated_engine)
    assert seed.bootstrap_local_owner(migrated_engine) is False
    assert snapshot(migrated_engine) == before
    with Session(migrated_engine) as session:
        owner = session.get(Owner, 1)
        assert owner.display_name == "Pemilik Lokal"
        assert owner.created_at.utcoffset().total_seconds() == 0
        assert [
            (category.name, category.type)
            for category in session.exec(select(Category).order_by(Category.id)).all()
        ] == list(seed.DEFAULT_CATEGORIES)
        assert len(session.exec(select(Owner)).all()) == 1
        assert session.exec(select(Transaction)).all() == []


def test_seed_preserves_user_edits_deletions_and_other_owners(migrated_engine):
    seed.bootstrap_local_owner(migrated_engine)
    with Session(migrated_engine) as session:
        session.get(Owner, 1).display_name = "Nama Pilihan Saya"
        category = session.exec(
            select(Category).where(Category.name == "Makanan")
        ).one()
        category.name = "  ＫＯＮＳＵＭＳＩ  "
        session.delete(
            session.exec(select(Category).where(Category.name == "Hiburan")).one()
        )
        session.add(Owner(id=2, display_name="Owner fixture lain"))
        session.commit()
        session.add(Category(owner_id=2, name="Makanan", type="expense"))
        session.commit()
    before = snapshot(migrated_engine)
    assert seed.bootstrap_local_owner(migrated_engine) is False
    assert snapshot(migrated_engine) == before


def test_existing_owner_without_categories_is_not_seeded(migrated_engine):
    with Session(migrated_engine) as session:
        session.add(Owner(id=1, display_name="Owner lama"))
        session.commit()
    before = snapshot(migrated_engine)
    assert seed.bootstrap_local_owner(migrated_engine) is False
    assert snapshot(migrated_engine) == before


def test_bootstrap_failure_rolls_back_owner_and_all_categories(
    migrated_engine, monkeypatch
):
    defaults = seed.DEFAULT_CATEGORIES
    monkeypatch.setattr(
        seed, "DEFAULT_CATEGORIES", (*defaults, ("  ＧＡＪＩ  ", "income"))
    )
    with pytest.raises(IntegrityError):
        seed.bootstrap_local_owner(migrated_engine)
    assert snapshot(migrated_engine) == {
        "owners": [],
        "categories": [],
        "transactions": [],
    }
    monkeypatch.setattr(seed, "DEFAULT_CATEGORIES", defaults)
    assert seed.bootstrap_local_owner(migrated_engine) is True


@pytest.mark.parametrize("mode", ["remote", "production", "", "development"])
def test_local_bootstrap_rejects_other_modes_without_writing(migrated_engine, mode):
    with pytest.raises(ValueError, match="APP_ENV=local"):
        seed.bootstrap_local_owner(migrated_engine, mode=mode)
    assert snapshot(migrated_engine) == {
        "owners": [],
        "categories": [],
        "transactions": [],
    }


def test_initial_migration_failure_rolls_back_ddl_and_version(empty_engine, tmp_path):
    def fail_on_transactions(
        _connection, _cursor, statement, _parameters, _context, _executemany
    ):
        if "CREATE TABLE transactions" in statement:
            raise RuntimeError("injected migration failure")

    event.listen(empty_engine, "before_cursor_execute", fail_on_transactions)
    try:
        with pytest.raises(RuntimeError, match="injected"):
            upgrade_database(empty_engine, backup_dir=tmp_path / "backups")
    finally:
        event.remove(empty_engine, "before_cursor_execute", fail_on_transactions)
    assert inspect(empty_engine).get_table_names() == []
    upgrade_database(empty_engine, backup_dir=tmp_path / "backups")
    assert "transactions" in inspect(empty_engine).get_table_names()


def test_populated_legacy_schema_is_backed_up_and_refused_without_changes(
    empty_engine, tmp_path
):
    with empty_engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO categories VALUES (42, 'Kategori lama')"
        )
    backups = tmp_path / "backups"
    with pytest.raises(RuntimeError, match="reviewed legacy/backfill migration"):
        upgrade_database(empty_engine, backup_dir=backups)
    assert inspect(empty_engine).get_table_names() == ["categories"]
    with empty_engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT * FROM categories").all() == [
            (42, "Kategori lama")
        ]
    backup_files = list(backups.glob("*.db"))
    assert len(backup_files) == 1
    with closing(sqlite3.connect(backup_files[0])) as backup:
        assert backup.execute("SELECT * FROM categories").fetchall() == [
            (42, "Kategori lama")
        ]
        assert backup.execute("PRAGMA quick_check").fetchall() == [("ok",)]


def test_upgrade_existing_non_finance_data_backs_up_wal_and_preserves_rows(
    empty_engine, tmp_path
):
    # Keep a connection open so SQLite has not necessarily checkpointed the WAL.
    with empty_engine.connect() as open_connection:
        assert (
            open_connection.exec_driver_sql("PRAGMA journal_mode=WAL").scalar_one()
            == "wal"
        )
        open_connection.exec_driver_sql(
            "CREATE TABLE existing_records (id INTEGER PRIMARY KEY, value TEXT)"
        )
        open_connection.exec_driver_sql(
            "INSERT INTO existing_records VALUES (5000000001, 'fixture')"
        )
        open_connection.commit()
        backup_path = upgrade_database(empty_engine, backup_dir=tmp_path / "backups")
        assert backup_path is not None
        with closing(sqlite3.connect(backup_path)) as backup:
            assert backup.execute("SELECT * FROM existing_records").fetchall() == [
                (5000000001, "fixture")
            ]
            assert (
                backup.execute(
                    "SELECT name FROM sqlite_master WHERE name='owners'"
                ).fetchall()
                == []
            )
        assert open_connection.exec_driver_sql(
            "SELECT * FROM existing_records"
        ).all() == [(5000000001, "fixture")]


def test_backup_failure_prevents_any_migration(empty_engine, tmp_path, monkeypatch):
    with empty_engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE existing_records (id INTEGER PRIMARY KEY)"
        )
        connection.exec_driver_sql("INSERT INTO existing_records VALUES (42)")

    def fail_backup(_bind, _backup_dir):
        raise OSError("injected backup failure")

    monkeypatch.setattr("scripts.migrate.backup_before_upgrade", fail_backup)
    with pytest.raises(OSError, match="backup failure"):
        upgrade_database(empty_engine, backup_dir=tmp_path / "backups")
    assert inspect(empty_engine).get_table_names() == ["existing_records"]


def test_failed_sqlite_backup_removes_only_its_incomplete_file(
    empty_engine, tmp_path, monkeypatch
):
    with empty_engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE existing_records (id INTEGER PRIMARY KEY)"
        )
        connection.exec_driver_sql("INSERT INTO existing_records VALUES (42)")
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()
    existing_backup = backup_dir / "keep.db"
    existing_backup.write_bytes(b"previous backup fixture")
    real_connect = sqlite3.connect
    source = Mock()
    source.backup.side_effect = sqlite3.DatabaseError("injected SQLite backup failure")

    def connect(database, **kwargs):
        return source if kwargs.get("uri") else real_connect(database, **kwargs)

    monkeypatch.setattr("scripts.migrate.sqlite3.connect", connect)
    with pytest.raises(sqlite3.DatabaseError, match="backup failure"):
        upgrade_database(empty_engine, backup_dir=backup_dir)
    source.close.assert_called_once()
    assert list(backup_dir.iterdir()) == [existing_backup]
    assert existing_backup.read_bytes() == b"previous backup fixture"
    assert inspect(empty_engine).get_table_names() == ["existing_records"]


def test_migration_refuses_connection_without_foreign_key_enforcement(empty_engine):
    config = alembic_config()
    with (
        pytest.raises(RuntimeError, match="foreign_keys=ON"),
        empty_engine.begin() as connection,
    ):
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    assert inspect(empty_engine).get_table_names() == []


def test_upgrade_populated_copy_preserves_ids_owners_relations_and_exact_totals(
    migrated_engine, tmp_path
):
    seed.bootstrap_local_owner(migrated_engine)
    with Session(migrated_engine) as session:
        session.add(Owner(id=2, display_name="Owner fixture lain"))
        session.commit()
        session.add(
            Category(id=5_000_000_001, owner_id=2, name="Kategori lain", type="expense")
        )
        session.commit()
        session.add_all(
            [
                Transaction(
                    id=6_000_000_001,
                    owner_id=1,
                    category_id=2,
                    type="expense",
                    amount_rupiah=MAX_AMOUNT_RUPIAH,
                    date=date(2024, 2, 29),
                ),
                Transaction(
                    id=6_000_000_002,
                    owner_id=2,
                    category_id=5_000_000_001,
                    type="expense",
                    amount_rupiah=150000,
                    date=date(2024, 3, 1),
                    description="fixture",
                ),
            ]
        )
        session.commit()
    before = snapshot(migrated_engine)
    copy_path = tmp_path / "copy.db"
    source = sqlite3.connect(
        Path(migrated_engine.url.database).as_uri() + "?mode=ro", uri=True
    )
    destination = sqlite3.connect(copy_path)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    copied_engine = create_db_engine(f"sqlite:///{copy_path.as_posix()}")
    try:
        assert (
            upgrade_database(copied_engine, backup_dir=tmp_path / "copy-backups")
            is None
        )
        assert seed.bootstrap_local_owner(copied_engine) is False
        copied_engine.dispose()
        assert snapshot(copied_engine) == before
        with Session(copied_engine) as session:
            transactions = session.exec(
                select(Transaction).order_by(Transaction.id)
            ).all()
            assert (
                sum(transaction.amount_rupiah for transaction in transactions)
                == MAX_AMOUNT_RUPIAH + 150000
            )
            assert [
                (transaction.id, transaction.owner_id, transaction.category_id)
                for transaction in transactions
            ] == [
                (6_000_000_001, 1, 2),
                (6_000_000_002, 2, 5_000_000_001),
            ]
        assert snapshot(migrated_engine) == before
        with copied_engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        copied_engine.dispose()


def test_downgrade_populated_database_is_refused(migrated_engine):
    seed.bootstrap_local_owner(migrated_engine)
    before = snapshot(migrated_engine)
    config = alembic_config()
    with (
        pytest.raises(RuntimeError, match="would delete finance data"),
        migrated_engine.begin() as connection,
    ):
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert snapshot(migrated_engine) == before


def test_empty_database_can_downgrade_and_upgrade_again(migrated_engine, tmp_path):
    config = alembic_config()
    with migrated_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert inspect(migrated_engine).get_table_names() == ["alembic_version"]
    upgrade_database(migrated_engine, backup_dir=tmp_path / "backups")
    assert snapshot(migrated_engine) == {
        "owners": [],
        "categories": [],
        "transactions": [],
    }


@pytest.mark.parametrize(
    "url,sqlite_dialect",
    [
        ("sqlite:///offline.db", True),
        ("postgresql://localhost/offline", False),
    ],
)
def test_offline_migration_ddl_is_dialect_specific(monkeypatch, url, sqlite_dialect):
    monkeypatch.setattr(
        "app.config.get_settings", lambda: Settings(_env_file=None, database_url=url)
    )
    output = io.StringIO()
    config = alembic_config()
    config.output_buffer = output
    command.upgrade(config, "head", sql=True)
    ddl = output.getvalue()
    assert "CREATE TABLE owners" in ddl
    assert ("typeof(amount_rupiah)" in ddl) is sqlite_dialect
    assert ("TIMESTAMP WITH TIME ZONE" in ddl) is not sqlite_dialect
    assert "ix_transactions_owner_category_date_id" in ddl


def test_actual_commands_and_backend_restart_keep_fixture_transactions(tmp_path):
    database = tmp_path / "commands.db"
    url = f"sqlite:///{database.as_posix()}"
    environment = {
        **os.environ,
        "APP_DATABASE_URL": url,
        "APP_ENV": "local",
        "APP_DEBUG": "false",
    }

    def run(*arguments):
        result = subprocess.run(
            [sys.executable, *arguments],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        return result.stdout

    run("-m", "scripts.migrate")
    assert "0001_initial" in run("-m", "alembic", "current")
    run("-m", "alembic", "check")
    assert "dibuat" in run("-m", "scripts.seed")
    assert "tidak diubah" in run("-m", "scripts.seed")
    bind = create_db_engine(url)
    try:
        with Session(bind) as session:
            session.add(
                Transaction(
                    owner_id=1,
                    category_id=2,
                    type="expense",
                    amount_rupiah=150000,
                    date=date(2024, 1, 1),
                )
            )
            session.commit()
    finally:
        bind.dispose()
    run("-m", "scripts.migrate")
    # Fresh interpreter loads the backend and exercises health; no startup reset.
    run(
        "-c",
        "from app.main import app; from fastapi.testclient import TestClient; "
        "from app.db import engine; from app.models import Transaction; from sqlmodel import Session, select; "
        "client=TestClient(app); assert client.get('/health').status_code == 200; "
        "session=Session(engine); rows=session.exec(select(Transaction)).all(); "
        "assert len(rows)==1 and rows[0].amount_rupiah==150000; session.close(); engine.dispose()",
    )
