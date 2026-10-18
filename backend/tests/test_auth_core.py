"""Unit tests for core authentication: password hashing, token generation, and session persistence."""

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.auth import generate_session_token, hash_password, hash_token, verify_password
from app.db import create_db_engine
from app.models import Owner, UserSession
from scripts.migrate import upgrade_database


def test_password_hashing_and_verification():
    password = "secret-secure-password-123"
    hashed = hash_password(password)

    assert hashed.startswith("$argon2id$")
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password-xyz", hashed) is False
    assert verify_password("", hashed) is False


def test_generate_session_token_and_hashing():
    raw_token, token_hash = generate_session_token()

    assert len(raw_token) >= 32
    assert len(token_hash) == 64
    assert hash_token(raw_token) == token_hash
    # Hashing a different token produces a different hash
    assert hash_token("different_token") != token_hash


def test_owner_password_and_user_session_persistence(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'auth_core.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")

    with Session(engine) as session:
        # Create owner with password hash
        owner = Owner(
            id=1,
            display_name="Owner Utama",
            password_hash=hash_password("admin-password-123"),
        )
        session.add(owner)
        session.commit()

        # Create session
        _raw_token, token_hash = generate_session_token()
        expiry = datetime.now(UTC) + timedelta(days=7)
        user_session = UserSession(
            token_hash=token_hash,
            owner_id=owner.id,
            expires_at=expiry,
        )
        session.add(user_session)
        session.commit()

        # Query session back
        found = session.exec(
            select(UserSession).where(UserSession.token_hash == token_hash)
        ).first()
        assert found is not None
        assert found.owner_id == owner.id
        assert found.token_hash == token_hash
        assert found.expires_at > datetime.now(UTC)
