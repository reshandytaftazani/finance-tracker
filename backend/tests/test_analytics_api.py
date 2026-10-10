"""Analytics on migrated SQLite: detect leaks, float/SQL SUM and date mistakes."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

from app.db import create_db_engine, get_session
from app.dependencies import get_current_owner_id
from app.main import app
from app.models import Category, Owner, Transaction
from scripts.migrate import upgrade_database

PREFIX = "/api/v1/analytics"
PERIOD = {"month": 10, "year": 2026}


@pytest.fixture
def analytics_api(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'analytics.db').as_posix()}")
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
                Category(id=3, owner_id=1, name="Transport", type="expense"),
                Category(id=4, owner_id=2, name="Rahasia", type="expense"),
                Category(id=5, owner_id=1, name="Kosong", type="expense"),
            ]
        )
        session.commit()
        session.add(
            Transaction(
                owner_id=2,
                category_id=4,
                type="expense",
                amount_rupiah=999,
                date=date(2026, 10, 9),
            )
        )
        session.commit()

    def sessions():
        with Session(engine) as session:
            yield session

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_session] = sessions
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def add(client, amount="100", when="2026-10-09", category=1, kind="expense"):
    response = client.post(
        "/api/v1/transactions",
        json={
            "category_id": category,
            "type": kind,
            "amount_rupiah": amount,
            "date": when,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def get(client, endpoint, params=None):
    response = client.get(
        f"{PREFIX}/{endpoint}", params=PERIOD if params is None else params
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_manual_totals_and_expense_only_breakdown(analytics_api):
    client, _ = analytics_api
    add(client, "1000", category=2, kind="income")
    add(client, "201")
    add(client, "99")
    add(client, "400", category=3)
    assert get(client, "summary") == {
        **PERIOD,
        "income": "1000",
        "expense": "700",
        "net_cash_flow": "300",
    }
    assert get(client, "by-category") == {
        **PERIOD,
        "items": [
            {"category_id": 3, "category_name": "Transport", "expense": "400"},
            {"category_id": 1, "category_name": "Makanan", "expense": "300"},
        ],
    }


@pytest.mark.parametrize(
    "kind,category,income,expense,net",
    [
        ("income", 2, "17", "0", "17"),
        ("expense", 1, "0", "17", "-17"),
    ],
)
def test_one_sided_month(analytics_api, kind, category, income, expense, net):
    client, _ = analytics_api
    add(client, "17", category=category, kind=kind)
    assert get(client, "summary") == {
        **PERIOD,
        "income": income,
        "expense": expense,
        "net_cash_flow": net,
    }
    items = get(client, "by-category")["items"]
    assert items == (
        []
        if kind == "income"
        else [
            {"category_id": 1, "category_name": "Makanan", "expense": "17"},
        ]
    )


def test_empty_month_and_client_cannot_select_foreign_owner(analytics_api):
    client, _ = analytics_api
    params = {**PERIOD, "owner_id": 2}
    assert get(client, "summary", params) == {
        **PERIOD,
        "income": "0",
        "expense": "0",
        "net_cash_flow": "0",
    }
    assert get(client, "by-category", params) == {**PERIOD, "items": []}
    app.dependency_overrides[get_current_owner_id] = lambda: 2
    assert get(client, "summary")["expense"] == "999"
    assert get(client, "by-category")["items"] == [
        {"category_id": 4, "category_name": "Rahasia", "expense": "999"},
    ]


@pytest.mark.parametrize(
    "year,month,first,last,before,after",
    [
        (2026, 10, "2026-10-01", "2026-10-31", "2026-09-30", "2026-11-01"),
        (2026, 12, "2026-12-01", "2026-12-31", "2026-11-30", "2027-01-01"),
        (2024, 2, "2024-02-01", "2024-02-29", "2024-01-31", "2024-03-01"),
        (2025, 2, "2025-02-01", "2025-02-28", "2025-01-31", "2025-03-01"),
        (1, 1, "0001-01-01", "0001-01-31", None, "0001-02-01"),
        (9999, 12, "9999-12-01", "9999-12-31", "9999-11-30", None),
    ],
)
def test_calendar_period_boundaries(
    analytics_api, year, month, first, last, before, after
):
    client, _ = analytics_api
    add(client, "2", first)
    add(client, "3", last)
    for outside in (before, after):
        if outside:
            add(client, "100", outside)
    params = {"month": month, "year": year}
    assert get(client, "summary", params) == {
        **params,
        "income": "0",
        "expense": "5",
        "net_cash_flow": "-5",
    }
    assert get(client, "by-category", params) == {
        **params,
        "items": [
            {"category_id": 1, "category_name": "Makanan", "expense": "5"},
        ],
    }


@pytest.mark.parametrize("endpoint", ["summary", "by-category"])
@pytest.mark.parametrize(
    "params",
    [
        {},
        {"month": 10},
        {"year": 2026},
        {"month": 0, "year": 2026},
        {"month": 13, "year": 2026},
        {"month": 1, "year": 0},
        {"month": 1, "year": 10000},
        {"month": "1.5", "year": 2026},
        {"month": "true", "year": 2026},
        {"month": 1, "year": "nope"},
    ],
)
def test_invalid_or_missing_period_is_422(analytics_api, endpoint, params):
    client, _ = analytics_api
    assert client.get(f"{PREFIX}/{endpoint}", params=params).status_code == 422


def test_mutations_and_category_rename_are_reflected_without_stale_cache(analytics_api):
    client, _ = analytics_api
    transaction = add(client, "10")
    assert get(client, "summary")["expense"] == "10"
    assert (
        client.patch(
            f"/api/v1/transactions/{transaction}",
            json={
                "date": "2026-11-01",
                "amount_rupiah": "20",
                "category_id": 3,
            },
        ).status_code
        == 200
    )
    assert get(client, "summary")["expense"] == "0"
    assert get(client, "by-category")["items"] == []
    november = {"month": 11, "year": 2026}
    assert get(client, "summary", november)["expense"] == "20"
    assert client.patch("/api/v1/categories/3", json={"name": "Bus"}).status_code == 200
    assert get(client, "by-category", november)["items"] == [
        {"category_id": 3, "category_name": "Bus", "expense": "20"},
    ]
    assert (
        client.patch(
            f"/api/v1/transactions/{transaction}",
            json={
                "type": "income",
                "category_id": 2,
            },
        ).status_code
        == 200
    )
    assert get(client, "summary", november) == {
        **november,
        "income": "20",
        "expense": "0",
        "net_cash_flow": "20",
    }
    assert get(client, "by-category", november)["items"] == []
    assert client.delete(f"/api/v1/transactions/{transaction}").status_code == 204
    assert get(client, "summary", november)["income"] == "0"


def test_breakdown_ties_have_stable_category_id_order(analytics_api):
    client, _ = analytics_api
    add(client, "10", category=3)
    add(client, "10", category=1)
    assert [item["category_id"] for item in get(client, "by-category")["items"]] == [
        1,
        3,
    ]


def test_totals_exceed_sqlite_sum_and_javascript_integer_limits_exactly(analytics_api):
    client, engine = analytics_api
    # Each amount is valid; combined sum 9223399999999077660 exceeds int64.
    with engine.begin() as connection:
        connection.execute(
            text("""
            WITH RECURSIVE numbers(n) AS (
                VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n < 922340
            )
            INSERT INTO transactions
                (owner_id, category_id, type, amount_rupiah, date, description,
                 created_at, updated_at)
            SELECT 1, 1, 'expense', 9999999999999, '2026-10-09', '',
                   '2026-10-09 00:00:00', '2026-10-09 00:00:00' FROM numbers
        """)
        )
    assert get(client, "summary") == {
        **PERIOD,
        "income": "0",
        "expense": "9223399999999077660",
        "net_cash_flow": "-9223399999999077660",
    }
    assert get(client, "by-category")["items"] == [
        {
            "category_id": 1,
            "category_name": "Makanan",
            "expense": "9223399999999077660",
        },
    ]
    assert (
        client.post(
            "/api/v1/budgets",
            json={
                "category_id": 1,
                "month": 10,
                "year": 2026,
                "amount_rupiah": "9999999999999",
            },
        ).status_code
        == 201
    )
    response = client.get("/api/v1/budgets/status", params=PERIOD)
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["spent"] == "9223399999999077660"
    assert item["remaining"] == "-9223389999999077661"
    assert item["percentage"] == "92234000.00"
    assert item["status"] == "over_budget"


@pytest.mark.parametrize("endpoint", ["summary", "by-category"])
def test_database_failure_is_error_not_zero(analytics_api, endpoint):
    _, engine = analytics_api
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE transactions"))
    with TestClient(app, raise_server_exceptions=False) as error_client:
        response = error_client.get(f"{PREFIX}/{endpoint}", params=PERIOD)
    assert response.status_code == 500


@pytest.mark.parametrize("endpoint", ["summary", "by-category"])
def test_missing_server_owner_is_not_successful_empty_period(analytics_api, endpoint):
    client, _ = analytics_api
    app.dependency_overrides[get_current_owner_id] = lambda: 999
    assert client.get(f"{PREFIX}/{endpoint}", params=PERIOD).status_code == 500
