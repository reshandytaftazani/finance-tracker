import csv
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import create_db_engine, get_session
from app.main import app
from app.models import Category, Owner, Transaction
from scripts.migrate import upgrade_database


@pytest.fixture
def search_api(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'search.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")
    with Session(engine) as session:
        session.add(Owner(id=1, display_name="Lokal"))
        session.commit()
        session.add_all(
            [
                Category(id=1, owner_id=1, name="Makanan", type="expense"),
                Category(id=2, owner_id=1, name="Gaji", type="income"),
            ]
        )
        session.commit()
        session.add_all(
            [
                Transaction(
                    id=1,
                    owner_id=1,
                    category_id=1,
                    type="expense",
                    amount_rupiah=25000,
                    date=date(2026, 10, 1),
                    description="Nasi Padang Siang",
                    notes="Makan bersama tim",
                ),
                Transaction(
                    id=2,
                    owner_id=1,
                    category_id=1,
                    type="expense",
                    amount_rupiah=150000,
                    date=date(2026, 10, 2),
                    description="Belanja Supermarket 100% segar",
                    notes="Beli buah dan sayur",
                ),
                Transaction(
                    id=3,
                    owner_id=1,
                    category_id=2,
                    type="income",
                    amount_rupiah=5000000,
                    date=date(2026, 10, 5),
                    description="Gaji Bulanan",
                    notes="Bonus project Q3",
                ),
                Transaction(
                    id=4,
                    owner_id=1,
                    category_id=1,
                    type="expense",
                    amount_rupiah=50000,
                    date=date(2026, 10, 10),
                    description="Kopi Sore",
                    notes="Tempat di Caffe_Latte",
                ),
            ]
        )
        session.commit()

    def session_override():
        with Session(engine) as s:
            yield s

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_session] = session_override
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides = previous


def test_search_by_description_case_insensitive(search_api):
    response = search_api.get("/api/v1/transactions", params={"search": "nasi"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["description"] == "Nasi Padang Siang"


def test_search_by_notes(search_api):
    response = search_api.get("/api/v1/transactions", params={"search": "Bonus project"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["description"] == "Gaji Bulanan"


def test_search_wildcard_escaping(search_api):
    # Search for literal '%' in "100% segar"
    response = search_api.get("/api/v1/transactions", params={"search": "100%"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == 2

    # Search for literal '_' in "Caffe_Latte"
    response = search_api.get("/api/v1/transactions", params={"search": "Caffe_"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == 4


def test_filter_min_amount(search_api):
    response = search_api.get("/api/v1/transactions", params={"min_amount": 100000})
    assert response.status_code == 200
    data = response.json()
    # Expect 150,000 and 5,000,000
    assert data["total"] == 2
    assert {item["id"] for item in data["items"]} == {2, 3}


def test_filter_max_amount(search_api):
    response = search_api.get("/api/v1/transactions", params={"max_amount": 50000})
    assert response.status_code == 200
    data = response.json()
    # Expect 25,000 and 50,000
    assert data["total"] == 2
    assert {item["id"] for item in data["items"]} == {1, 4}


def test_filter_amount_range(search_api):
    response = search_api.get(
        "/api/v1/transactions", params={"min_amount": 30000, "max_amount": 200000}
    )
    assert response.status_code == 200
    data = response.json()
    # Expect 50,000 (id 4) and 150,000 (id 2)
    assert data["total"] == 2
    assert {item["id"] for item in data["items"]} == {2, 4}


def test_filter_min_greater_than_max_rejected(search_api):
    response = search_api.get(
        "/api/v1/transactions", params={"min_amount": 500000, "max_amount": 100000}
    )
    assert response.status_code == 422
    assert "min_amount must not exceed max_amount" in response.text


def test_export_csv_respects_search_and_amount_filters(search_api):
    response = search_api.get(
        "/api/v1/transactions/export/csv",
        params={"search": "Nasi", "max_amount": 30000},
    )
    assert response.status_code == 200
    reader = csv.reader(io.StringIO(response.text.lstrip("\ufeff")))
    header = next(reader)
    assert header == ["tanggal", "tipe", "kategori", "nominal_rupiah", "deskripsi"]
    rows = list(reader)
    assert len(rows) == 1
    assert rows[0][4] == "Nasi Padang Siang"
    assert rows[0][3] == "25000"
