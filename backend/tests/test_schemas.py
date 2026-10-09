import json
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas import (
    CategoryCreate,
    CategoryUpdate,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)
from app.validation import MAX_AMOUNT_RUPIAH, normalize_category_name


def transaction_data(**changes):
    return {
        "category_id": 1,
        "type": "expense",
        "amount_rupiah": "150000",
        "date": "2024-02-29",
        **changes,
    }


@pytest.mark.parametrize(
    "value",
    [
        "",
        "0",
        "000",
        "-1",
        "+1",
        " 1",
        "1 ",
        "1.0",
        "1,000",
        "1e3",
        "١",
        "１",
        str(MAX_AMOUNT_RUPIAH + 1),
        "9" * 5000,
        1,
        1.0,
        True,
        False,
        None,
    ],
)
def test_amount_rejects_invalid_input(value):
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(transaction_data(amount_rupiah=value))
    with pytest.raises(ValidationError):
        TransactionUpdate.model_validate({"amount_rupiah": value})


@pytest.mark.parametrize(
    "value,expected",
    [("1", 1), ("00015", 15), (str(MAX_AMOUNT_RUPIAH), MAX_AMOUNT_RUPIAH)],
)
def test_amount_is_integer_in_python_and_string_in_json(value, expected):
    result = TransactionCreate.model_validate(transaction_data(amount_rupiah=value))
    assert result.amount_rupiah == expected
    assert type(result.amount_rupiah) is int
    assert result.model_dump()["amount_rupiah"] == expected
    assert json.loads(result.model_dump_json())["amount_rupiah"] == str(expected)


@pytest.mark.parametrize(
    "value",
    [
        "2023-02-29",
        "2024-04-31",
        "0000-01-01",
        "10000-01-01",
        "2024-2-01",
        "2024-01-01T00:00:00Z",
        "2024-01-01 ",
        "２０２４-01-01",
        1704067200,
        date(2024, 1, 1),
        None,
    ],
)
def test_date_requires_iso_calendar_string(value):
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(transaction_data(date=value))


@pytest.mark.parametrize(
    "schema", [CategoryCreate, CategoryUpdate, TransactionCreate, TransactionUpdate]
)
@pytest.mark.parametrize(
    "field", ["owner_id", "normalized_name", "id", "created_at", "updated_at"]
)
def test_client_cannot_supply_server_fields(schema, field):
    data = {"name": "Gaji", "type": "income"} if schema is CategoryCreate else {}
    if schema is TransactionCreate:
        data = transaction_data()
    with pytest.raises(ValidationError):
        schema.model_validate({**data, field: 1})


def test_name_pipeline_and_unicode_expansion():
    assert normalize_category_name("  ＧＡＪＩ  ") == ("GAJI", "gaji")
    assert normalize_category_name("Straße") == ("Straße", "strasse")
    category = CategoryCreate(name="  ＧＡＪＩ  ", type="income")
    assert category.name == "GAJI"
    assert CategoryCreate(name="ﬃ" * 16, type="expense").name == "ffi" * 16
    with pytest.raises(ValidationError):
        CategoryCreate(name="ﬃ" * 17, type="expense")


@pytest.mark.parametrize("name", ["", "   ", "a" * 51, "a\x00", None, 1])
def test_category_name_invalid(name):
    with pytest.raises(ValidationError):
        CategoryCreate(name=name, type="expense")


@pytest.mark.parametrize("type_value", ["transfer", "Income", "", 1, None])
def test_category_type_invalid(type_value):
    with pytest.raises(ValidationError):
        CategoryCreate(name="Gaji", type=type_value)
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(transaction_data(type=type_value))


@pytest.mark.parametrize(
    "field,value",
    [
        ("description", "a" * 201),
        ("notes", "a" * 1001),
        ("description", "a\x00"),
        ("notes", "a\x00"),
        ("description", None),
        ("description", 1),
        ("notes", False),
        ("category_id", 0),
        ("category_id", True),
        ("category_id", "1"),
        ("category_id", 2**63),
    ],
)
def test_transaction_text_and_category_id_invalid(field, value):
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(transaction_data(**{field: value}))


def test_text_boundaries_trim_and_empty_notes():
    result = TransactionCreate.model_validate(
        transaction_data(description=" a ", notes=" \n ")
    )
    assert result.description == "a"
    assert result.notes is None
    result = TransactionCreate.model_validate(
        transaction_data(description="a" * 200, notes="a" * 1000)
    )
    assert len(result.description) == 200
    assert len(result.notes) == 1000


def test_patch_distinguishes_omitted_fields_and_null_notes():
    assert TransactionUpdate().model_dump(exclude_unset=True) == {}
    assert CategoryUpdate().model_dump(exclude_unset=True) == {}
    assert TransactionUpdate(notes=None).model_dump(exclude_unset=True) == {
        "notes": None
    }
    assert TransactionUpdate(notes="  ").model_dump(exclude_unset=True) == {
        "notes": None
    }
    assert TransactionUpdate(description="  ").model_dump(exclude_unset=True) == {
        "description": ""
    }


@pytest.mark.parametrize(
    "schema,field",
    [
        (CategoryUpdate, "name"),
        (CategoryUpdate, "type"),
        *[
            (TransactionUpdate, field)
            for field in ["category_id", "type", "amount_rupiah", "date", "description"]
        ],
    ],
)
def test_patch_rejects_explicit_null_for_required_columns(schema, field):
    with pytest.raises(ValidationError):
        schema.model_validate({field: None})


def test_read_serializes_amount_and_normalized_utc_without_private_fields():
    timestamp = datetime(2024, 1, 1, 7, tzinfo=timezone(timedelta(hours=7)))
    result = TransactionRead.model_validate(
        {
            **transaction_data(amount_rupiah=MAX_AMOUNT_RUPIAH, date=date(2024, 2, 29)),
            "id": 1,
            "owner_id": 99,
            "description": "",
            "notes": None,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
    )
    data = json.loads(result.model_dump_json())
    assert data["amount_rupiah"] == str(MAX_AMOUNT_RUPIAH)
    assert data["created_at"] == "2024-01-01T00:00:00Z"
    assert data["date"] == "2024-02-29"
    assert "owner_id" not in data
    with pytest.raises(ValidationError):
        TransactionRead.model_validate(
            {**result.model_dump(), "created_at": timestamp.replace(tzinfo=None)}
        )


def test_fastapi_request_validation_without_adding_production_crud():
    test_app = FastAPI()

    @test_app.post("/transactions", response_model=TransactionCreate)
    def validate_transaction(payload: TransactionCreate):
        return payload

    with TestClient(test_app) as client:
        for value in [1, 1.0, True, "0", "1.5", str(MAX_AMOUNT_RUPIAH + 1)]:
            response = client.post(
                "/transactions", json=transaction_data(amount_rupiah=value)
            )
            assert response.status_code == 422
        response = client.post("/transactions", json=transaction_data())
        assert response.status_code == 200
        assert response.json()["amount_rupiah"] == "150000"
        openapi = client.get("/openapi.json").json()
        request_schema = openapi["paths"]["/transactions"]["post"]["requestBody"][
            "content"
        ]["application/json"]["schema"]
        name = request_schema["$ref"].split("/")[-1]
        assert (
            openapi["components"]["schemas"][name]["properties"]["amount_rupiah"][
                "type"
            ]
            == "string"
        )
