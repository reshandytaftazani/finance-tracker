"""Budget contracts: exact thresholds, scoped CRUD and migration-backed storage."""

import sqlite3
from datetime import date

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from alembic import command
from app.db import create_db_engine
from app.models import Transaction
from scripts.migrate import alembic_config, upgrade_database
from tests import test_crud_api

api = test_crud_api.api


def create(client, **changes):
    response = client.post(
        "/api/v1/budgets",
        json={
            "category_id": 1,
            "amount_rupiah": "100",
            "month": 10,
            "year": 2026,
            **changes,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_budget_crud_pagination_conflict_and_partial_update(api):
    client, engine = api
    first = create(client)
    assert first["amount_rupiah"] == "100"
    assert "owner_id" not in first and "category_type" not in first
    assert first["created_at"].endswith("Z")
    assert (
        client.post(
            "/api/v1/budgets",
            json={
                "category_id": 1,
                "amount_rupiah": "200",
                "month": 10,
                "year": 2026,
            },
        ).status_code
        == 409
    )
    second = create(client, month=11)
    listing = client.get("/api/v1/budgets", params={"month": 10, "year": 2026}).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == first["id"]
    listing = client.get("/api/v1/budgets", params={"page_size": 1, "page": 2}).json()
    assert listing["total"] == 2 and len(listing["items"]) == 1
    url = f"/api/v1/budgets/{first['id']}"
    assert client.get(url).json() == first
    assert client.patch(url, json={}).json() == first
    changed = client.patch(url, json={"amount_rupiah": "9999999999999"}).json()
    assert changed["month"] == 10 and changed["created_at"] == first["created_at"]
    assert changed["updated_at"] != first["updated_at"]
    assert client.patch(url, json={"month": 11}).status_code == 409
    assert client.get(url).json()["month"] == 10
    with engine.connect() as connection:
        assert (
            connection.exec_driver_sql(
                "SELECT amount_rupiah FROM budgets WHERE id = ?", (first["id"],)
            ).scalar_one()
            == 9999999999999
        )
    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.get(f"/api/v1/budgets/{second['id']}").status_code == 200


@pytest.mark.parametrize(
    "changes",
    [
        {"amount_rupiah": value}
        for value in [0, True, 1.5, "0", "-1", "1.2", " 1", "10000000000000"]
    ]
    + [{"month": v} for v in [0, 13, True, 1.5]]
    + [{"year": v} for v in [0, 10000, True, 1.5]]
    + [{"owner_id": 2}, {"category_type": "expense"}, {"category_id": True}],
)
def test_budget_invalid_inputs(api, changes):
    client, _ = api
    response = client.post(
        "/api/v1/budgets",
        json={
            "category_id": 1,
            "amount_rupiah": "100",
            "month": 10,
            "year": 2026,
            **changes,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["category_id", "amount_rupiah", "month", "year"])
def test_patch_rejects_explicit_null(api, field):
    client, _ = api
    budget = create(client)
    assert (
        client.patch(f"/api/v1/budgets/{budget['id']}", json={field: None}).status_code
        == 422
    )


def test_budget_category_validation_and_owner_isolation(api):
    client, _ = api
    for category, code in [(2, 422), (3, 404), (999, 404)]:
        assert (
            client.post(
                "/api/v1/budgets",
                json={
                    "category_id": category,
                    "amount_rupiah": "100",
                    "month": 10,
                    "year": 2026,
                },
            ).status_code
            == code
        )
    budget = create(client)
    assert client.delete("/api/v1/categories/1").status_code == 409
    assert (
        client.patch("/api/v1/categories/1", json={"type": "income"}).status_code == 409
    )
    assert client.get("/api/v1/budgets", params={"category_id": 3}).status_code == 404
    from app.dependencies import get_current_owner_id
    from app.main import app

    app.dependency_overrides[get_current_owner_id] = lambda: 2
    try:
        other = create(client, category_id=3)
        assert client.get("/api/v1/budgets").json()["total"] == 1
        assert (
            client.get(
                "/api/v1/budgets/status", params={"month": 10, "year": 2026}
            ).json()["items"][0]["id"]
            == other["id"]
        )
        url = f"/api/v1/budgets/{budget['id']}"
        assert client.get(url).status_code == 404
        assert client.patch(url, json={"amount_rupiah": "2"}).status_code == 404
        assert client.delete(url).status_code == 404
    finally:
        del app.dependency_overrides[get_current_owner_id]


@pytest.mark.parametrize(
    "spent,percentage,status,remaining",
    [
        (0, "0.00", "normal", "100"),
        (79, "79.00", "normal", "21"),
        (80, "80.00", "warning", "20"),
        (99, "99.00", "warning", "1"),
        (100, "100.00", "over_budget", "0"),
        (125, "125.00", "over_budget", "-25"),
    ],
)
def test_status_exact_thresholds_and_month_scoping(
    api, spent, percentage, status, remaining
):
    client, engine = api
    budget = create(client)
    with Session(engine) as session:
        rows = [
            Transaction(
                owner_id=1,
                category_id=1,
                type="expense",
                amount_rupiah=999,
                date=date(2026, 11, 1),
            ),
            Transaction(
                owner_id=1,
                category_id=2,
                type="income",
                amount_rupiah=999,
                date=date(2026, 10, 1),
            ),
        ]
        if spent:
            rows.append(
                Transaction(
                    owner_id=1,
                    category_id=1,
                    type="expense",
                    amount_rupiah=spent,
                    date=date(2026, 10, 31),
                )
            )
        session.add_all(rows)
        session.commit()
    response = client.get("/api/v1/budgets/status", params={"month": 10, "year": 2026})
    assert response.status_code == 200
    assert response.json() == {
        "month": 10,
        "year": 2026,
        "items": [
            {
                "id": budget["id"],
                "category_id": 1,
                "category_name": "Makanan",
                "budget": "100",
                "spent": str(spent),
                "remaining": remaining,
                "percentage": percentage,
                "status": status,
            }
        ],
    }


@pytest.mark.parametrize(
    "params", [{}, {"month": 13, "year": 2026}, {"month": 1, "year": 10000}]
)
def test_status_requires_valid_period(api, params):
    client, _ = api
    assert client.get("/api/v1/budgets/status", params=params).status_code == 422


@pytest.mark.parametrize(
    "column,value",
    [
        ("owner_id", None),
        ("owner_id", 2),
        ("category_id", 2),
        ("category_id", 3),
        ("amount_rupiah", 0),
        ("amount_rupiah", -1),
        ("amount_rupiah", 1.5),
        ("amount_rupiah", 10000000000000),
        ("month", 0),
        ("month", 13),
        ("year", 0),
        ("year", 10000),
        ("category_type", "income"),
        ("month", 1.5),
        ("year", 2026.5),
    ],
)
def test_database_enforces_budget_invariants(api, column, value):
    client, engine = api
    budget = create(client)
    with engine.begin() as connection, pytest.raises(IntegrityError):
        connection.exec_driver_sql(
            f"UPDATE budgets SET {column} = ? WHERE id = ?", (value, budget["id"])
        )


@pytest.mark.parametrize(
    "field,value",
    [("amount_rupiah", 1.0), ("amount_rupiah", True), ("month", 1.0), ("year", True)],
)
def test_orm_budget_rejects_non_integer_values(api, field, value):
    from app.models import Budget

    _, engine = api
    values = {
        "owner_id": 1,
        "category_id": 1,
        "amount_rupiah": 100,
        "month": 10,
        "year": 2026,
        field: value,
    }
    with Session(engine) as session:
        session.add(Budget(**values))
        with pytest.raises(ValueError):
            session.commit()


def test_upgrade_from_populated_initial_revision_preserves_rows_and_backups(tmp_path):
    from app.models import Category, Owner

    engine = create_db_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    config = alembic_config()
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0001_initial")
        with Session(engine) as session:
            session.add(Owner(id=1, display_name="Lokal"))
            session.commit()
            session.add(Category(id=2**40, owner_id=1, name="Makanan", type="expense"))
            session.commit()
            session.add(
                Transaction(
                    id=2**41,
                    owner_id=1,
                    category_id=2**40,
                    type="expense",
                    amount_rupiah=9999999999999,
                    date=date(2024, 2, 29),
                )
            )
            session.commit()
        with engine.connect() as connection:
            before = {
                t: connection.exec_driver_sql(f"SELECT * FROM {t} ORDER BY id").all()
                for t in ["owners", "categories", "transactions"]
            }
        backup = upgrade_database(engine, backup_dir=tmp_path / "backups")
        assert backup is not None
        with sqlite3.connect(backup) as saved:
            assert saved.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone() == ("0001_initial",)
            assert saved.execute(
                "SELECT id, amount_rupiah FROM transactions"
            ).fetchall() == [(2**41, 9999999999999)]
        with engine.connect() as connection:
            for table, rows in before.items():
                assert (
                    connection.exec_driver_sql(
                        f"SELECT * FROM {table} ORDER BY id"
                    ).all()
                    == rows
                )
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert "budgets" in inspect(engine).get_table_names()
        assert upgrade_database(engine, backup_dir=tmp_path / "backups") is None
    finally:
        engine.dispose()


def test_status_tracks_transaction_mutations_and_empty_period(api):
    client, _ = api
    create(client)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "category_id": 1,
            "type": "expense",
            "amount_rupiah": "80",
            "date": "2026-10-01",
        },
    ).json()

    def status():
        return client.get(
            "/api/v1/budgets/status", params={"month": 10, "year": 2026}
        ).json()["items"][0]

    assert status()["spent"] == "80"
    url = f"/api/v1/transactions/{transaction['id']}"
    assert client.patch(url, json={"amount_rupiah": "125"}).status_code == 200
    assert status()["remaining"] == "-25"
    assert client.patch(url, json={"date": "2026-11-01"}).status_code == 200
    assert status()["spent"] == "0"
    assert client.patch(url, json={"date": "2026-10-01"}).status_code == 200
    assert client.delete(url).status_code == 204
    assert status()["spent"] == "0"
    assert (
        client.get("/api/v1/budgets/status", params={"month": 11, "year": 2026}).json()[
            "items"
        ]
        == []
    )


@pytest.mark.parametrize(
    "amount,spent,percentage,status",
    [
        ("9999999999999", 7999999999999, "80.00", "normal"),
        ("9999999999999", 9999999999998, "100.00", "warning"),
        ("3", 1, "33.33", "normal"),
        ("32", 1, "3.13", "normal"),
    ],
)
def test_percentage_rounding_does_not_change_exact_thresholds(
    api, amount, spent, percentage, status
):
    client, _ = api
    create(client, amount_rupiah=amount)
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                "category_id": 1,
                "type": "expense",
                "amount_rupiah": str(spent),
                "date": "2026-10-01",
            },
        ).status_code
        == 201
    )
    item = client.get(
        "/api/v1/budgets/status", params={"month": 10, "year": 2026}
    ).json()["items"][0]
    assert item["percentage"] == percentage and item["status"] == status


def test_downgrade_refuses_budget_data(api):
    client, engine = api
    create(client)
    config = alembic_config()
    with pytest.raises(RuntimeError, match="budget data"), engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0001_initial")
    assert client.get("/api/v1/budgets").json()["total"] == 1


@pytest.mark.parametrize(
    "month,year,day",
    [(2, 2024, "2024-02-29"), (12, 9999, "9999-12-31"), (1, 1, "0001-01-01")],
)
def test_status_calendar_extremes(api, month, year, day):
    client, _ = api
    create(client, month=month, year=year)
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                "category_id": 1,
                "type": "expense",
                "amount_rupiah": "80",
                "date": day,
            },
        ).status_code
        == 201
    )
    item = client.get(
        "/api/v1/budgets/status", params={"month": month, "year": year}
    ).json()["items"][0]
    assert item["spent"] == "80" and item["status"] == "warning"


def test_status_database_failure_is_error_not_zero(api):
    from fastapi.testclient import TestClient

    from app.main import app

    client, engine = api
    create(client)
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE transactions")
    with TestClient(app, raise_server_exceptions=False) as failing_client:
        assert (
            failing_client.get(
                "/api/v1/budgets/status", params={"month": 10, "year": 2026}
            ).status_code
            == 500
        )
