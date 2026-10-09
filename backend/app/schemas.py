"""Public schemas; ownership and normalized names are never client inputs."""

from datetime import date as calendar_date
from datetime import datetime, timezone
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
    field_validator,
)

from app.models import TransactionType
from app.validation import (
    MAX_AMOUNT_RUPIAH,
    clean_notes,
    clean_text,
    normalize_category_name,
    parse_amount_rupiah,
    parse_local_date,
)

AmountInput = Annotated[
    int,
    BeforeValidator(parse_amount_rupiah),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9]+$"}),
]
AmountRead = Annotated[
    int,
    Field(strict=True, ge=1, le=MAX_AMOUNT_RUPIAH),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9]+$"}, mode="serialization"),
]
LocalDateInput = Annotated[calendar_date, BeforeValidator(parse_local_date)]
CategoryName = Annotated[
    str,
    BeforeValidator(lambda value: normalize_category_name(value)[0]),
    Field(min_length=1, max_length=50),
]
Description = Annotated[
    str,
    BeforeValidator(lambda value: clean_text(value, max_length=200)),
    Field(max_length=200),
]
Notes = Annotated[
    Annotated[str, Field(max_length=1000)] | None, BeforeValidator(clean_notes)
]
CategoryID = Annotated[int, Field(strict=True, ge=1, le=2**63 - 1)]


def normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamp must be timezone-aware")
    return value.astimezone(timezone.utc)


UTCTimestamp = Annotated[datetime, AfterValidator(normalize_utc)]


class InputSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CategoryCreate(InputSchema):
    name: CategoryName
    type: TransactionType


class CategoryUpdate(InputSchema):
    name: CategoryName | None = None
    type: TransactionType | None = None

    @field_validator("name", "type", mode="before")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the existing value")
        return value


class TransactionCreate(InputSchema):
    category_id: CategoryID
    type: TransactionType
    amount_rupiah: AmountInput
    date: LocalDateInput
    description: Description = ""
    notes: Notes = None


class TransactionUpdate(InputSchema):
    category_id: CategoryID | None = None
    type: TransactionType | None = None
    amount_rupiah: AmountInput | None = None
    date: LocalDateInput | None = None
    description: Description | None = None
    notes: Notes = None

    @field_validator(
        "category_id", "type", "amount_rupiah", "date", "description", mode="before"
    )
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the existing value")
        return value


class ReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: UTCTimestamp
    updated_at: UTCTimestamp


class OwnerRead(ReadSchema):
    display_name: str


class CategoryRead(ReadSchema):
    name: str
    type: TransactionType


class TransactionRead(ReadSchema):
    category_id: int
    type: TransactionType
    amount_rupiah: AmountRead
    date: calendar_date
    description: str
    notes: str | None
