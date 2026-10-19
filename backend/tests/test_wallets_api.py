"""Integration tests for Wallets API endpoints and balance calculations."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import create_db_engine, get_session
from app.main import app
from app.models import Category, Owner, Transaction, Transfer, Wallet
from app.validation import MAX_AMOUNT_RUPIAH
from scripts.migrate import upgrade_database


@pytest.fixture
def api(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'wallets_api.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")
    with Session(engine) as session:
        session.add_all(
            [Owner(id=1, display_name="Lokal"), Owner(id=2, display_name="Lain")]
        )
        session.commit()
        session.add_all(
            [
                Wallet(
                    id=1,
                    owner_id=1,
                    name="Dompet Utama",
                    type="bank",
                    initial_balance_rupiah=1000000,
                ),
                Wallet(
                    id=2,
                    owner_id=2,
                    name="Dompet Rahasia",
                    type="cash",
                    initial_balance_rupiah=500000,
                ),
                Category(id=1, owner_id=1, name="Makanan", type="expense"),
                Category(id=2, owner_id=1, name="Gaji", type="income"),
                Category(id=3, owner_id=2, name="Bisnis", type="income"),
            ]
        )
        session.commit()

    def session_override():
        with Session(engine) as session:
            yield session

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_session] = session_override
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides = previous


def test_list_wallets(api):
    client, _ = api
    response = client.get("/api/v1/wallets")
    assert response.status_code == 200, response.text
    data = response.json()
    assert "items" in data
    assert "total_net_worth_rupiah" in data
    assert len(data["items"]) == 1
    wallet = data["items"][0]
    assert wallet["id"] == 1
    assert wallet["name"] == "Dompet Utama"
    assert wallet["type"] == "bank"
    assert wallet["initial_balance_rupiah"] == "1000000"
    assert wallet["current_balance_rupiah"] == "1000000"
    assert data["total_net_worth_rupiah"] == "1000000"
    assert "owner_id" not in wallet
    assert wallet["created_at"].endswith("Z")
    assert wallet["updated_at"].endswith("Z")


def test_create_wallet_success_and_isolation(api):
    client, _ = api
    payload = {
        "name": "BCA Tabungan",
        "type": "bank",
        "initial_balance_rupiah": "5000000",
    }
    response = client.post("/api/v1/wallets", json=payload)
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["name"] == "BCA Tabungan"
    assert created["type"] == "bank"
    assert created["initial_balance_rupiah"] == "5000000"
    assert created["current_balance_rupiah"] == "5000000"
    assert "owner_id" not in created

    # Default initial_balance_rupiah is "0"
    response_default = client.post(
        "/api/v1/wallets", json={"name": "Dompet Tunai", "type": "cash"}
    )
    assert response_default.status_code == 201
    assert response_default.json()["initial_balance_rupiah"] == "0"
    assert response_default.json()["current_balance_rupiah"] == "0"

    # Duplicate name for same owner rejected
    response_dup = client.post("/api/v1/wallets", json=payload)
    assert response_dup.status_code == 409


@pytest.mark.parametrize(
    "invalid_payload",
    [
        {"name": "", "type": "bank"},
        {"name": "   ", "type": "bank"},
        {"name": "x" * 51, "type": "bank"},
        {"name": "Dompet Baru", "type": "crypto"},
        {"name": "Dompet Baru", "type": "bank", "initial_balance_rupiah": "-1"},
        {"name": "Dompet Baru", "type": "bank", "initial_balance_rupiah": "abc"},
        {"name": "Dompet Baru", "type": "bank", "initial_balance_rupiah": "100.50"},
        {"name": "Dompet Baru", "type": "bank", "initial_balance_rupiah": 1000},
        {"name": "Dompet Baru", "type": "bank", "initial_balance_rupiah": str(MAX_AMOUNT_RUPIAH + 1)},
    ],
)
def test_create_wallet_validation_failures(api, invalid_payload):
    client, _ = api
    response = client.post("/api/v1/wallets", json=invalid_payload)
    assert response.status_code == 422


def test_get_wallet_detail_and_isolation(api):
    client, _ = api
    response = client.get("/api/v1/wallets/1")
    assert response.status_code == 200
    assert response.json()["name"] == "Dompet Utama"

    # Nonexistent wallet
    assert client.get("/api/v1/wallets/999").status_code == 404

    # Another owner's wallet (id=2 belongs to owner 2)
    assert client.get("/api/v1/wallets/2").status_code == 404


def test_patch_wallet(api):
    client, _ = api
    response = client.patch(
        "/api/v1/wallets/1",
        json={"name": "Dompet Utama Update", "type": "cash", "initial_balance_rupiah": "2000000"},
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["name"] == "Dompet Utama Update"
    assert updated["type"] == "cash"
    assert updated["initial_balance_rupiah"] == "2000000"
    assert updated["current_balance_rupiah"] == "2000000"

    # Reject null on patch
    assert client.patch("/api/v1/wallets/1", json={"name": None}).status_code == 422
    assert client.patch("/api/v1/wallets/1", json={"type": None}).status_code == 422
    assert (
        client.patch(
            "/api/v1/wallets/1", json={"initial_balance_rupiah": None}
        ).status_code
        == 422
    )

    # Patch other owner's wallet returns 404
    assert client.patch("/api/v1/wallets/2", json={"name": "Hacked"}).status_code == 404


def test_delete_wallet_guard_and_isolation(api):
    client, engine = api
    # Create unused wallet
    res = client.post("/api/v1/wallets", json={"name": "Dompet Hapus", "type": "cash"})
    w_id = res.json()["id"]

    # Delete unused wallet succeeds
    del_res = client.delete(f"/api/v1/wallets/{w_id}")
    assert del_res.status_code == 204
    assert client.get(f"/api/v1/wallets/{w_id}").status_code == 404

    # Wallet with transaction cannot be deleted
    with Session(engine) as session:
        session.add(
            Transaction(
                owner_id=1,
                wallet_id=1,
                category_id=1,
                type="expense",
                amount_rupiah=50000,
                date=date(2026, 10, 1),
            )
        )
        session.commit()

    del_conflict = client.delete("/api/v1/wallets/1")
    assert del_conflict.status_code == 409

    # Cannot delete other owner's wallet
    assert client.delete("/api/v1/wallets/2").status_code == 404


def test_wallet_balance_and_net_worth_calculation(api):
    client, engine = api
    # Create wallet 2 for owner 1
    res2 = client.post(
        "/api/v1/wallets",
        json={"name": "E-Wallet Gopay", "type": "ewallet", "initial_balance_rupiah": "300000"},
    )
    w2_id = res2.json()["id"]

    with Session(engine) as session:
        # Transaction on wallet 1: Income +200,000
        session.add(
            Transaction(
                owner_id=1,
                wallet_id=1,
                category_id=2,
                type="income",
                amount_rupiah=200000,
                date=date(2026, 10, 5),
            )
        )
        # Transaction on wallet 1: Expense -50,000
        session.add(
            Transaction(
                owner_id=1,
                wallet_id=1,
                category_id=1,
                type="expense",
                amount_rupiah=50000,
                date=date(2026, 10, 6),
            )
        )
        # Transfer from wallet 1 to wallet 2: 100,000
        session.add(
            Transfer(
                owner_id=1,
                from_wallet_id=1,
                to_wallet_id=w2_id,
                amount_rupiah=100000,
                date=date(2026, 10, 7),
                description="Topup Gopay",
            )
        )
        session.commit()

    # Wallet 1: 1,000,000 (init) + 200,000 (inc) - 50,000 (exp) - 100,000 (tf out) = 1,050,000
    # Wallet 2: 300,000 (init) + 100,000 (tf in) = 400,000
    # Total net worth: 1,050,000 + 400,000 = 1,450,000
    list_res = client.get("/api/v1/wallets").json()
    assert list_res["total_net_worth_rupiah"] == "1450000"

    items_by_id = {item["id"]: item for item in list_res["items"]}
    assert items_by_id[1]["current_balance_rupiah"] == "1050000"
    assert items_by_id[w2_id]["current_balance_rupiah"] == "400000"

    w1_res = client.get("/api/v1/wallets/1").json()
    assert w1_res["current_balance_rupiah"] == "1050000"

    w2_detail = client.get(f"/api/v1/wallets/{w2_id}").json()
    assert w2_detail["current_balance_rupiah"] == "400000"
