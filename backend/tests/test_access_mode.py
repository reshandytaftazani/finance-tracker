"""Tests for Task 2.1: Access Mode, Server-enforced Ownership, and Loopback Isolation."""

from typing import Annotated

import pytest
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings
from app.dependencies import LOCAL_OWNER_ID, get_current_owner, get_current_owner_id
from app.main import app
from app.models import Owner


def test_server_enforces_local_owner_id() -> None:
    """In local mode, the server resolves owner strictly to LOCAL_OWNER_ID (1)."""
    settings = Settings(_env_file=None, env="local")
    resolved_id = get_current_owner_id(settings=settings)
    assert resolved_id == LOCAL_OWNER_ID
    assert resolved_id == 1


def test_non_local_mode_without_auth_is_rejected() -> None:
    """Non-local environment without configured authentication must be rejected."""
    for remote_env in ["remote", "production", "staging"]:
        settings = Settings(_env_file=None, env=remote_env)
        with pytest.raises(HTTPException) as exc_info:
            get_current_owner_id(settings=settings)
        assert exc_info.value.status_code == 401
        assert "Authentication required" in exc_info.value.detail


def test_get_current_owner_returns_database_owner() -> None:
    """When owner exists in DB, get_current_owner returns the model instance."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Owner(id=LOCAL_OWNER_ID, display_name="Pemilik Lokal"))
        session.commit()

        owner = get_current_owner(session=session, owner_id=LOCAL_OWNER_ID)
        assert owner is not None
        assert owner.id == LOCAL_OWNER_ID
        assert owner.display_name == "Pemilik Lokal"


def test_get_current_owner_raises_when_unbootstrapped() -> None:
    """If database has not been bootstrapped, get_current_owner raises 500."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        with pytest.raises(HTTPException) as exc_info:
            get_current_owner(session=session, owner_id=LOCAL_OWNER_ID)
        assert exc_info.value.status_code == 500
        assert "not bootstrapped" in exc_info.value.detail


def test_client_cannot_override_owner_id() -> None:
    """Client cannot forge or supply owner_id via query param, header, or body."""
    test_app = FastAPI()
    router = APIRouter()

    @router.post("/items")
    def create_item(
        payload: dict,
        owner_id: Annotated[int, Depends(get_current_owner_id)],
    ) -> dict:
        return {"assigned_owner_id": owner_id, "data": payload}

    test_app.include_router(router)
    client = TestClient(test_app)

    # Client attempts to spoof owner_id = 999 via query string, body, and header
    response = client.post(
        "/items?owner_id=999",
        json={"name": "test", "owner_id": 999},
        headers={"X-Owner-Id": "999", "Owner-Id": "999"},
    )
    assert response.status_code == 200
    # Server strictly assigned LOCAL_OWNER_ID (1) regardless of client claims
    assert response.json()["assigned_owner_id"] == LOCAL_OWNER_ID


def test_no_public_auth_or_user_routes_in_local_mvp() -> None:
    """Verify that no register, login, profile, user, or role routes are exposed."""
    client = TestClient(app)
    openapi = client.get("/openapi.json").json()
    paths = list(openapi.get("paths", {}).keys())
    prohibited_keywords = ["auth", "register", "login", "profile", "user", "role"]
    for path in paths:
        for keyword in prohibited_keywords:
            assert keyword not in path.lower(), f"Unexpected route {path} found in MVP app"


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "::1"])
def test_bind_host_allows_only_loopback(host: str) -> None:
    """Only loopback addresses are allowed for unauthenticated local binding."""
    settings = Settings(_env_file=None, host=host)
    assert settings.host == host


@pytest.mark.parametrize(
    "host",
    ["0.0.0.0", "192.168.1.1", "10.0.0.1", "172.16.0.1", "localhost", "example.com"],
)
def test_bind_host_rejects_non_loopback_and_network_binds(host: str) -> None:
    """Network binds and hostnames are rejected to prevent unauthenticated network exposure."""
    with pytest.raises(ValidationError):
        Settings(_env_file=None, host=host)


def test_app_rejects_untrusted_host_header() -> None:
    """Requests with untrusted Host header are rejected with 400."""
    client = TestClient(app)
    response = client.get("/health", headers={"host": "unauthorized-domain.com"})
    assert response.status_code == 400


def test_app_allows_trusted_host_header() -> None:
    """Requests with trusted Host header (localhost, 127.0.0.1, testserver) pass."""
    client = TestClient(app)
    for host in ["localhost", "127.0.0.1", "testserver"]:
        response = client.get("/health", headers={"host": host})
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

