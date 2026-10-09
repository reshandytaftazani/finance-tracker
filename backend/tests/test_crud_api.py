"""Production CRUD contract on migrated SQLite, never the personal database.

These tests catch missing owner predicates, partial-update data loss, incorrect
category relations, non-exact amounts, unstable pagination, and lost commits.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.config import Settings, get_settings
from app.db import create_db_engine, get_session
from app.dependencies import get_current_owner_id
from app.main import app
from app.models import Category, Owner, Transaction
from scripts.migrate import upgrade_database


@pytest.fixture
def api(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'api.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")
    with Session(engine) as session:
        session.add_all(
            [Owner(id=1, display_name="Lokal"), Owner(id=2, display_name="Lain")]
        )
        session.commit()
        session.add_all(
            [
                Category(id=1, owner_id=1, name="Makanan", type="expense"),
                Category(id=2, owner_id=1, name="Gaji", type="income"),
                Category(id=3, owner_id=2, name="Rahasia", type="expense"),
            ]
        )
        session.commit()
        session.add(
            Transaction(
                id=100,
                owner_id=2,
                category_id=3,
                type="expense",
                amount_rupiah=999,
                date=date(2026, 10, 9),
            )
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
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def payload(**changes):
    return {
        "category_id": 1,
        "type": "expense",
        "amount_rupiah": "150000",
        "date": "2026-10-09",
        "description": "  Makan  ",
        "notes": "  Catatan  ",
        **changes,
    }


def create_transaction(client, **changes):
    response = client.post("/api/v1/transactions", json=payload(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_transaction_create_read_patch_delete_are_persistent(api):
    client, engine = api
    created = create_transaction(client, amount_rupiah="9999999999999")
    assert created["amount_rupiah"] == "9999999999999"
    assert created["description"] == "Makan"
    assert created["notes"] == "Catatan"
    assert created["created_at"].endswith("Z")
    assert "owner_id" not in created
    path = f"/api/v1/transactions/{created['id']}"
    assert client.get(path).json() == created
    changed = client.patch(path, json={"notes": None, "amount_rupiah": "42"})
    assert changed.status_code == 200
    assert changed.json()["notes"] is None
    assert changed.json()["date"] == created["date"]
    assert changed.json()["description"] == "Makan"
    assert changed.json()["created_at"] == created["created_at"]
    assert changed.json()["updated_at"] > created["updated_at"]
    with Session(engine) as session:
        saved = session.get(Transaction, created["id"])
        assert saved.owner_id == 1
        assert saved.amount_rupiah == 42 and type(saved.amount_rupiah) is int
        assert saved.notes is None
    deleted = client.delete(path)
    assert deleted.status_code == 204 and deleted.content == b""
    assert client.get(path).status_code == 404
    with Session(engine) as session:
        assert session.get(Transaction, created["id"]) is None


def test_category_crud_normalization_conflicts_and_rollback(api):
    client, engine = api
    response = client.post(
        "/api/v1/categories", json={"name": "  ＴＲＡＮＳＰＯＲＴ  ", "type": "expense"}
    )
    assert response.status_code == 201
    category = response.json()
    assert category["name"] == "TRANSPORT"
    assert "normalized_name" not in category and "owner_id" not in category
    assert (
        client.post(
            "/api/v1/categories", json={"name": "transport", "type": "expense"}
        ).status_code
        == 409
    )
    path = f"/api/v1/categories/{category['id']}"
    assert client.patch(path, json={"name": "makanan"}).status_code == 409
    assert (
        client.patch(path, json={"name": " Transportasi "}).json()["name"]
        == "Transportasi"
    )
    assert client.patch(path, json={"type": "income"}).status_code == 200
    assert client.delete(path).status_code == 204
    with Session(engine) as session:
        assert session.get(Category, category["id"]) is None
    assert (
        client.post(
            "/api/v1/categories", json={"name": "Makanan", "type": "income"}
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/categories", json={"name": "Rahasia", "type": "expense"}
        ).status_code
        == 201
    )


def test_used_category_cannot_be_deleted_or_retyped_but_can_be_renamed(api):
    client, _ = api
    transaction = create_transaction(client)
    assert client.delete("/api/v1/categories/1").status_code == 409
    assert (
        client.patch("/api/v1/categories/1", json={"type": "income"}).status_code == 409
    )
    assert (
        client.patch("/api/v1/categories/1", json={"name": "Konsumsi"}).status_code
        == 200
    )
    assert (
        client.patch("/api/v1/categories/1", json={"type": "expense"}).status_code
        == 200
    )
    assert client.delete(f"/api/v1/transactions/{transaction['id']}").status_code == 204
    assert client.delete("/api/v1/categories/1").status_code == 204


@pytest.mark.parametrize(
    "category_id,kind,status",
    [(3, "expense", 404), (999, "expense", 404), (2, "expense", 422)],
)
def test_transaction_category_lookup_is_owner_scoped_and_type_checked(
    api, category_id, kind, status
):
    client, _ = api
    assert (
        client.post(
            "/api/v1/transactions", json=payload(category_id=category_id, type=kind)
        ).status_code
        == status
    )
    created = create_transaction(client)
    path = f"/api/v1/transactions/{created['id']}"
    assert (
        client.patch(path, json={"category_id": category_id, "type": kind}).status_code
        == status
    )
    assert client.get(path).json() == created


def test_patch_validates_merged_category_and_type_atomically(api):
    client, _ = api
    created = create_transaction(client)
    path = f"/api/v1/transactions/{created['id']}"
    assert client.patch(path, json={"type": "income"}).status_code == 422
    assert client.patch(path, json={"category_id": 2}).status_code == 422
    changed = client.patch(path, json={"type": "income", "category_id": 2})
    assert changed.status_code == 200
    assert changed.json()["category_id"] == 2 and changed.json()["type"] == "income"


@pytest.mark.parametrize(
    "resource,identifier",
    [
        ("transactions", 100),
        ("categories", 3),
        ("transactions", 999),
        ("categories", 999),
    ],
)
def test_missing_and_foreign_ids_return_404_for_mutations(api, resource, identifier):
    client, engine = api
    path = f"/api/v1/{resource}/{identifier}"
    if resource == "transactions":
        assert client.get(path).status_code == 404
    assert client.patch(path, json={}).status_code == 404
    assert client.delete(path).status_code == 404
    with Session(engine) as session:
        assert session.get(Transaction, 100).owner_id == 2
        assert session.get(Category, 3).name == "Rahasia"


def test_list_filters_totals_pagination_and_tie_breaker(api):
    client, _ = api
    first = create_transaction(client, date="2026-10-01")
    second = create_transaction(client, date="2026-10-09")
    third = create_transaction(client, date="2026-10-09")
    create_transaction(client, category_id=2, type="income", date="2026-10-31")
    create_transaction(client, date="2026-11-01")
    params = {
        "start_date": "2026-10-01",
        "end_date": "2026-10-09",
        "type": "expense",
        "category_id": 1,
        "page_size": 2,
    }
    page = client.get("/api/v1/transactions", params=params).json()
    assert page["total"] == 3 and page["page"] == 1 and page["page_size"] == 2
    assert [row["id"] for row in page["items"]] == [third["id"], second["id"]]
    page2 = client.get("/api/v1/transactions", params={**params, "page": 2}).json()
    assert [row["id"] for row in page2["items"]] == [first["id"]]
    assert page2["total"] == 3
    beyond = client.get("/api/v1/transactions", params={"page": 100}).json()
    assert beyond["items"] == [] and beyond["total"] == 5
    income = client.get("/api/v1/transactions", params={"type": "income"}).json()
    assert income["total"] == 1
    assert (
        client.get("/api/v1/transactions", params={"category_id": 3}).status_code == 404
    )


def test_category_list_is_owner_scoped_paginated_and_type_filtered(api):
    client, _ = api
    page = client.get("/api/v1/categories", params={"page_size": 1}).json()
    assert page["total"] == 2
    assert page["items"][0]["id"] == 2
    page2 = client.get("/api/v1/categories", params={"page_size": 1, "page": 2}).json()
    assert page2["items"][0]["id"] == 1
    assert (
        client.get("/api/v1/categories", params={"type": "expense"}).json()["total"]
        == 1
    )


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page_size": 0},
        {"page_size": 101},
        {"page": "no"},
        {"type": "transfer"},
        {"category_id": 0},
        {"category_id": 2**63},
        {"start_date": "2026-02-30"},
        {"start_date": "20261009"},
        {"start_date": "2026-10-10", "end_date": "2026-10-09"},
    ],
)
def test_invalid_transaction_filters_are_422(api, params):
    client, _ = api
    assert client.get("/api/v1/transactions", params=params).status_code == 422


@pytest.mark.parametrize(
    "amount",
    ["", "0", "-1", "1.5", "10000000000000", 12, 1.5, True, " 1", "+1", "１２"],
)
def test_invalid_amounts_rejected_by_production_create_and_patch(api, amount):
    client, _ = api
    assert (
        client.post(
            "/api/v1/transactions", json=payload(amount_rupiah=amount)
        ).status_code
        == 422
    )
    created = create_transaction(client)
    path = f"/api/v1/transactions/{created['id']}"
    assert client.patch(path, json={"amount_rupiah": amount}).status_code == 422
    assert client.get(path).json() == created


@pytest.mark.parametrize(
    "field", ["category_id", "type", "amount_rupiah", "date", "description"]
)
def test_required_transaction_fields_reject_explicit_patch_null(api, field):
    client, _ = api
    created = create_transaction(client)
    path = f"/api/v1/transactions/{created['id']}"
    assert client.patch(path, json={field: None}).status_code == 422
    assert client.patch(path, json={}).json() == created


@pytest.mark.parametrize("field", ["name", "type"])
def test_category_patch_rejects_null_and_preserves_absent_fields(api, field):
    client, _ = api
    assert client.patch("/api/v1/categories/1", json={field: None}).status_code == 422
    original = client.get("/api/v1/categories").json()
    assert client.patch("/api/v1/categories/1", json={}).status_code == 200
    assert client.get("/api/v1/categories").json() == original


def test_owner_is_never_accepted_from_request_and_second_owner_isolated(api):
    client, _ = api
    assert (
        client.post("/api/v1/transactions", json=payload(owner_id=2)).status_code == 422
    )
    assert (
        client.post(
            "/api/v1/categories", json={"name": "X", "type": "expense", "owner_id": 2}
        ).status_code
        == 422
    )
    created = create_transaction(client)
    assert (
        client.patch(
            f"/api/v1/transactions/{created['id']}", json={"owner_id": 2}
        ).status_code
        == 422
    )
    spoofed = client.get(
        "/api/v1/transactions?owner_id=2", headers={"X-Owner-Id": "2"}
    ).json()
    assert spoofed["total"] == 1 and spoofed["items"][0]["id"] == created["id"]
    app.dependency_overrides[get_current_owner_id] = lambda: 2
    assert client.get(f"/api/v1/transactions/{created['id']}").status_code == 404
    own = client.get("/api/v1/transactions").json()
    assert own["total"] == 1 and own["items"][0]["id"] == 100
    assert client.get("/api/v1/categories").json()["total"] == 1
    assert client.post("/api/v1/transactions", json=payload()).status_code == 404
    assert (
        client.patch(
            f"/api/v1/transactions/{created['id']}", json={"description": "Attack"}
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/transactions/{created['id']}").status_code == 404
    assert (
        client.patch("/api/v1/categories/1", json={"name": "Attack"}).status_code == 404
    )
    assert client.delete("/api/v1/categories/1").status_code == 404
    assert (
        client.patch("/api/v1/transactions/100", json={"category_id": 1}).status_code
        == 404
    )
    own_created = create_transaction(client, category_id=3)
    assert client.get(f"/api/v1/transactions/{own_created['id']}").status_code == 200


def test_three_added_one_deleted_survive_reopened_engine_and_client(api, tmp_path):
    client, engine = api
    first = create_transaction(client)
    second = create_transaction(client)
    third = create_transaction(client)
    client.delete(f"/api/v1/transactions/{second['id']}")
    url = str(engine.url)
    engine.dispose()
    reopened = create_db_engine(url)
    try:

        def session_override():
            with Session(reopened) as session:
                yield session

        app.dependency_overrides[get_session] = session_override
        with TestClient(app) as new_client:
            page = new_client.get("/api/v1/transactions").json()
            assert page["total"] == 2
            assert [row["id"] for row in page["items"]] == [third["id"], first["id"]]
        with Session(reopened) as session:
            assert (
                len(
                    session.exec(
                        select(Transaction).where(Transaction.owner_id == 1)
                    ).all()
                )
                == 2
            )
    finally:
        reopened.dispose()


@pytest.mark.parametrize(
    "changes",
    [
        {"date": "2026-02-30"},
        {"date": "2026-10-09T00:00:00Z"},
        {"type": "transfer"},
        {"category_id": True},
        {"category_id": 2**63},
        {"description": "x" * 201},
        {"description": "NUL\u0000"},
        {"notes": "x" * 1001},
        {"notes": "NUL\u0000"},
    ],
)
def test_invalid_transaction_fields_do_not_mutate_saved_data(api, changes):
    client, _ = api
    assert (
        client.post("/api/v1/transactions", json=payload(**changes)).status_code == 422
    )
    created = create_transaction(client)
    path = f"/api/v1/transactions/{created['id']}"
    assert client.patch(path, json=changes).status_code == 422
    assert client.get(path).json() == created


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "  "},
        {"name": "x" * 51},
        {"name": "NUL\u0000"},
        {"type": "transfer"},
        {"normalized_name": "forged"},
        {"owner_id": 2},
    ],
)
def test_invalid_category_fields_rejected_in_create_and_patch(api, changes):
    client, _ = api
    assert (
        client.post(
            "/api/v1/categories", json={"name": "X", "type": "expense", **changes}
        ).status_code
        == 422
    )
    assert client.patch("/api/v1/categories/1", json=changes).status_code == 422
    assert client.get("/api/v1/categories").json()["total"] == 2


def test_defaults_and_empty_notes_are_serialized_without_data_loss(api):
    client, _ = api
    response = client.post(
        "/api/v1/transactions",
        json={
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "0001",
            "date": "2024-02-29",
        },
    )
    assert response.status_code == 201
    created = response.json()
    assert created["amount_rupiah"] == "1"
    assert created["description"] == "" and created["notes"] is None
    path = f"/api/v1/transactions/{created['id']}"
    assert client.patch(path, json={"notes": " X "}).json()["notes"] == "X"
    changed = client.patch(path, json={"description": " Changed "}).json()
    assert changed["notes"] == "X" and changed["description"] == "Changed"
    assert client.patch(path, json={"notes": "  "}).json()["notes"] is None


@pytest.mark.parametrize("resource", ["categories", "transactions"])
def test_empty_period_and_huge_pagination_are_safe(api, resource):
    client, _ = api
    path = f"/api/v1/{resource}"
    assert client.get(path, params={"page": 2**100}).status_code == 422
    assert client.get(path, params={"page_size": 100}).status_code == 200
    assert client.get(path, params={"page_size": 101}).status_code == 422
    if resource == "transactions":
        assert client.get(path).json() == {
            "items": [],
            "total": 0,
            "page": 1,
            "page_size": 20,
        }


def test_production_routes_keep_host_origin_and_remote_protection(api):
    client, _ = api
    assert (
        client.post(
            "/api/v1/transactions",
            json=payload(),
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/transactions",
            json=payload(),
            headers={"Sec-Fetch-Site": "cross-site"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/transactions", content="{}", headers={"Content-Type": "text/plain"}
        ).status_code
        == 415
    )
    assert (
        client.get("/api/v1/categories", headers={"Host": "evil.example"}).status_code
        == 400
    )
    assert client.get("/api/v1/transactions").json()["total"] == 0
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, env="remote"
    )
    assert client.get("/api/v1/transactions").status_code == 401
    assert (
        client.post(
            "/api/v1/categories", json={"name": "X", "type": "expense"}
        ).status_code
        == 401
    )
