"""Integration tests for Transfers API, wallet balance impacts, and transaction wallet integration."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import create_db_engine, get_session
from app.main import app
from app.models import Category, Owner, Wallet
from scripts.migrate import upgrade_database


@pytest.fixture
def api(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'transfers_api.db').as_posix()}")
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
                    owner_id=1,
                    name="Dompet Tunai",
                    type="cash",
                    initial_balance_rupiah=500000,
                ),
                Wallet(
                    id=3,
                    owner_id=2,
                    name="Dompet Asing",
                    type="bank",
                    initial_balance_rupiah=700000,
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


def test_create_transfer_success_and_balance_impact(api):
    client, _ = api
    payload = {
        "from_wallet_id": 1,
        "to_wallet_id": 2,
        "amount_rupiah": "200000",
        "date": "2026-10-10",
        "description": "Tarik tunai",
        "notes": "Untuk keperluan jajan",
    }
    response = client.post("/api/v1/transfers", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["from_wallet_id"] == 1
    assert data["to_wallet_id"] == 2
    assert data["amount_rupiah"] == "200000"
    assert data["date"] == "2026-10-10"
    assert data["description"] == "Tarik tunai"
    assert data["notes"] == "Untuk keperluan jajan"
    assert "owner_id" not in data
    assert data["created_at"].endswith("Z")

    # Check wallets live balances
    wallets = client.get("/api/v1/wallets").json()
    # Wallet 1 was 1,000,000 -> now 800,000
    # Wallet 2 was 500,000 -> now 700,000
    # Total net worth remains 1,500,000
    items_by_id = {item["id"]: item for item in wallets["items"]}
    assert items_by_id[1]["current_balance_rupiah"] == "800000"
    assert items_by_id[2]["current_balance_rupiah"] == "700000"
    assert wallets["total_net_worth_rupiah"] == "1500000"


def test_transfer_rejects_self_transfer(api):
    client, _ = api
    payload = {
        "from_wallet_id": 1,
        "to_wallet_id": 1,
        "amount_rupiah": "50000",
        "date": "2026-10-10",
    }
    response = client.post("/api/v1/transfers", json=payload)
    assert response.status_code == 422


def test_transfer_rejects_nonexistent_or_foreign_wallets(api):
    client, _ = api
    # Nonexistent from_wallet
    assert (
        client.post(
            "/api/v1/transfers",
            json={
                "from_wallet_id": 999,
                "to_wallet_id": 2,
                "amount_rupiah": "50000",
                "date": "2026-10-10",
            },
        ).status_code
        == 404
    )

    # Nonexistent to_wallet
    assert (
        client.post(
            "/api/v1/transfers",
            json={
                "from_wallet_id": 1,
                "to_wallet_id": 999,
                "amount_rupiah": "50000",
                "date": "2026-10-10",
            },
        ).status_code
        == 404
    )

    # Foreign wallet (wallet 3 belongs to owner 2)
    assert (
        client.post(
            "/api/v1/transfers",
            json={
                "from_wallet_id": 1,
                "to_wallet_id": 3,
                "amount_rupiah": "50000",
                "date": "2026-10-10",
            },
        ).status_code
        == 404
    )


def test_list_transfers_pagination_and_wallet_filter(api):
    client, _ = api
    # Create 3 transfers
    for i in range(3):
        res = client.post(
            "/api/v1/transfers",
            json={
                "from_wallet_id": 1,
                "to_wallet_id": 2,
                "amount_rupiah": str((i + 1) * 10000),
                "date": f"2026-10-0{i + 1}",
                "description": f"Transfer {i + 1}",
            },
        )
        assert res.status_code == 201

    # List all
    response = client.get("/api/v1/transfers")
    assert response.status_code == 200
    listing = response.json()
    assert listing["total"] == 3
    assert len(listing["items"]) == 3
    # Stable ordering: newest date first
    assert listing["items"][0]["description"] == "Transfer 3"

    # Pagination
    paged = client.get("/api/v1/transfers", params={"page": 2, "page_size": 2}).json()
    assert paged["total"] == 3
    assert len(paged["items"]) == 1
    assert paged["items"][0]["description"] == "Transfer 1"

    # Filter by wallet_id
    by_wallet = client.get("/api/v1/transfers", params={"wallet_id": 1}).json()
    assert by_wallet["total"] == 3

    # Filter by foreign wallet_id returns 404
    assert client.get("/api/v1/transfers", params={"wallet_id": 3}).status_code == 404


def test_delete_transfer_reverts_balance(api):
    client, _ = api
    create_res = client.post(
        "/api/v1/transfers",
        json={
            "from_wallet_id": 1,
            "to_wallet_id": 2,
            "amount_rupiah": "300000",
            "date": "2026-10-10",
        },
    )
    t_id = create_res.json()["id"]

    # Before delete: w1=700,000, w2=800,000
    w_before = client.get("/api/v1/wallets").json()
    items = {item["id"]: item for item in w_before["items"]}
    assert items[1]["current_balance_rupiah"] == "700000"
    assert items[2]["current_balance_rupiah"] == "800000"

    # Delete transfer
    del_res = client.delete(f"/api/v1/transfers/{t_id}")
    assert del_res.status_code == 204

    # After delete: w1=1,000,000, w2=500,000 (reverted!)
    w_after = client.get("/api/v1/wallets").json()
    items_after = {item["id"]: item for item in w_after["items"]}
    assert items_after[1]["current_balance_rupiah"] == "1000000"
    assert items_after[2]["current_balance_rupiah"] == "500000"

    # Deleting nonexistent transfer returns 404
    assert client.delete(f"/api/v1/transfers/{t_id}").status_code == 404


def test_analytics_summary_unaffected_by_transfers(api):
    client, _ = api
    # Add income transaction
    client.post(
        "/api/v1/transactions",
        json={
            "wallet_id": 1,
            "category_id": 2,
            "type": "income",
            "amount_rupiah": "1000000",
            "date": "2026-10-15",
        },
    )
    # Add expense transaction
    client.post(
        "/api/v1/transactions",
        json={
            "wallet_id": 1,
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "300000",
            "date": "2026-10-16",
        },
    )
    # Add transfer
    client.post(
        "/api/v1/transfers",
        json={
            "from_wallet_id": 1,
            "to_wallet_id": 2,
            "amount_rupiah": "500000",
            "date": "2026-10-17",
        },
    )

    analytics = client.get(
        "/api/v1/analytics/summary", params={"month": 10, "year": 2026}
    ).json()
    assert analytics["income"] == "1000000"
    assert analytics["expense"] == "300000"
    assert analytics["net_cash_flow"] == "700000"


def test_transaction_wallet_id_integration(api):
    client, _ = api
    # Missing wallet_id rejected with 422
    missing_res = client.post(
        "/api/v1/transactions",
        json={
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "50000",
            "date": "2026-10-10",
        },
    )
    assert missing_res.status_code == 422

    # Foreign wallet_id rejected with 404
    foreign_res = client.post(
        "/api/v1/transactions",
        json={
            "wallet_id": 3,
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "50000",
            "date": "2026-10-10",
        },
    )
    assert foreign_res.status_code == 404

    # Valid transaction with wallet_id
    create_res = client.post(
        "/api/v1/transactions",
        json={
            "wallet_id": 1,
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "50000",
            "date": "2026-10-10",
        },
    )
    assert create_res.status_code == 201
    assert create_res.json()["wallet_id"] == 1

    # Filter transactions by wallet_id
    t_list = client.get("/api/v1/transactions", params={"wallet_id": 1}).json()
    assert t_list["total"] >= 1
    assert all(item["wallet_id"] == 1 for item in t_list["items"])

    # Filter transactions by foreign wallet_id returns 404
    assert client.get("/api/v1/transactions", params={"wallet_id": 3}).status_code == 404
