"""Integration tests for authentication API endpoints and session guard."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import generate_session_token, hash_password
from app.config import get_settings
from app.db import create_db_engine, get_session
from app.main import app
from app.models import Category, Owner, UserSession
from scripts.migrate import upgrade_database


@pytest.fixture
def auth_api_env(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'auth_api_test.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")

    with Session(engine) as session:
        owner = Owner(
            id=1,
            display_name="Owner Utama",
            password_hash=hash_password("correct-secret-123"),
        )
        session.add(owner)
        session.commit()

    with Session(engine) as session:
        session.add(Category(id=1, owner_id=1, name="Makanan", type="expense"))
        session.commit()

    def sessions():
        with Session(engine) as session:
            yield session

    settings = get_settings().model_copy(update={"auth_enabled": True})

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_session] = sessions
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            yield client, engine, settings
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def test_login_success_sets_http_only_cookie(auth_api_env):
    client, _, settings = auth_api_env
    response = client.post(
        "/api/v1/auth/login",
        json={"password": "correct-secret-123"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "ok"
    assert data["owner_id"] == 1
    assert data["display_name"] == "Owner Utama"

    # Check cookie
    cookie = response.cookies.get(settings.session_cookie_name)
    assert cookie is not None
    assert len(cookie) >= 32


def test_login_invalid_password_returns_401(auth_api_env):
    client, _, _ = auth_api_env
    response = client.post(
        "/api/v1/auth/login",
        json={"password": "wrong-password-999"},
    )
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]


def test_me_endpoint_requires_auth_when_enabled(auth_api_env):
    client, _, _ = auth_api_env
    # Unauthenticated request to /me
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401

    # Login and try again
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"password": "correct-secret-123"},
    )
    assert login_resp.status_code == 200

    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["authenticated"] is True
    assert me_resp.json()["owner_id"] == 1


def test_logout_revokes_session(auth_api_env):
    client, _, _ = auth_api_env
    # Login
    client.post("/api/v1/auth/login", json={"password": "correct-secret-123"})
    assert client.get("/api/v1/auth/me").status_code == 200

    # Logout
    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # Subsequent /me call should now fail with 401
    assert client.get("/api/v1/auth/me").status_code == 401


def test_protected_endpoints_require_session_when_auth_enabled(auth_api_env):
    client, _, _ = auth_api_env
    # Without cookie, protected data routes must return 401
    assert client.get("/api/v1/transactions").status_code == 401
    assert client.get("/api/v1/analytics/summary?month=10&year=2026").status_code == 401
    assert client.get("/api/v1/transactions/export/csv").status_code == 401

    # After login, protected routes succeed
    client.post("/api/v1/auth/login", json={"password": "correct-secret-123"})
    assert client.get("/api/v1/transactions").status_code == 200
    assert client.get("/api/v1/analytics/summary?month=10&year=2026").status_code == 200


def test_expired_session_returns_401(auth_api_env):
    client, engine, settings = auth_api_env
    # Manually inject an already expired session into the database
    raw_token, token_hash = generate_session_token()
    expired_time = datetime.now(timezone.utc) - timedelta(hours=1)
    with Session(engine) as session:
        session.add(
            UserSession(
                token_hash=token_hash,
                owner_id=1,
                expires_at=expired_time,
            )
        )
        session.commit()

    # Client sends expired cookie
    client.cookies.set(settings.session_cookie_name, raw_token)
    assert client.get("/api/v1/transactions").status_code == 401
