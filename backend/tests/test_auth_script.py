"""Unit tests for owner credential management CLI."""

import pytest
from sqlmodel import Session, select

from app.auth import verify_password
from app.db import create_db_engine
from app.models import Owner
from scripts.auth import main, set_owner_password
from scripts.migrate import upgrade_database
from scripts.seed import bootstrap_local_owner


@pytest.fixture
def auth_db(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'auth_script.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")
    bootstrap_local_owner(engine)
    return engine


def test_set_owner_password_direct(auth_db):
    new_password = "very-strong-secret-123"
    set_owner_password(auth_db, password=new_password, owner_id=1)

    with Session(auth_db) as session:
        owner = session.exec(select(Owner).where(Owner.id == 1)).first()
        assert owner is not None
        assert owner.password_hash is not None
        assert verify_password(new_password, owner.password_hash) is True


def test_set_owner_password_rejects_short_password(auth_db):
    with pytest.raises(ValueError, match="minimal 8 karakter"):
        set_owner_password(auth_db, password="short", owner_id=1)


def test_set_owner_password_rejects_nonexistent_owner(auth_db):
    with pytest.raises(ValueError, match="tidak ditemukan"):
        set_owner_password(auth_db, password="valid-password-123", owner_id=999)


def test_cli_set_password_entrypoint(auth_db, monkeypatch):
    monkeypatch.setattr("scripts.auth.engine", auth_db)
    exit_code = main(["set-password", "--password", "super-secret-password", "--owner-id", "1"])
    assert exit_code == 0

    with Session(auth_db) as session:
        owner = session.exec(select(Owner).where(Owner.id == 1)).first()
        assert owner is not None
        assert verify_password("super-secret-password", owner.password_hash) is True
