"""Public schemas; ownership and normalized names are never client inputs."""

from datetime import UTC, datetime
from datetime import date as calendar_date
from typing import Annotated, Literal

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

from app.models import TransactionType, WalletType
from app.validation import (
    MAX_AMOUNT_RUPIAH,
    clean_notes,
    clean_text,
    normalize_category_name,
    parse_amount_rupiah,
    parse_initial_balance_rupiah,
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
WalletID = Annotated[int, Field(strict=True, ge=1, le=2**63 - 1)]
WalletName = Annotated[
    str,
    BeforeValidator(lambda value: clean_text(value, max_length=50, required=True)),
    Field(min_length=1, max_length=50),
]
InitialBalanceInput = Annotated[
    int,
    BeforeValidator(parse_initial_balance_rupiah),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9]+$"}),
]
InitialBalanceRead = Annotated[
    int,
    Field(strict=True, ge=0, le=MAX_AMOUNT_RUPIAH),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9]+$"}, mode="serialization"),
]


def normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamp must be timezone-aware")
    return value.astimezone(UTC)


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
    wallet_id: WalletID
    category_id: CategoryID
    type: TransactionType
    amount_rupiah: AmountInput
    date: LocalDateInput
    description: Description = ""
    notes: Notes = None


class TransactionUpdate(InputSchema):
    wallet_id: WalletID | None = None
    category_id: CategoryID | None = None
    type: TransactionType | None = None
    amount_rupiah: AmountInput | None = None
    date: LocalDateInput | None = None
    description: Description | None = None
    notes: Notes = None

    @field_validator(
        "wallet_id",
        "category_id",
        "type",
        "amount_rupiah",
        "date",
        "description",
        mode="before",
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
    wallet_id: int
    category_id: int
    type: TransactionType
    amount_rupiah: AmountRead
    date: calendar_date
    description: str
    notes: str | None


class CategoryPage(BaseModel):
    items: list[CategoryRead]
    total: int
    page: int
    page_size: int


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    page: int
    page_size: int


class TransferCreate(InputSchema):
    from_wallet_id: WalletID
    to_wallet_id: WalletID
    amount_rupiah: AmountInput
    date: LocalDateInput
    description: Description = ""
    notes: Notes = None

    @field_validator("to_wallet_id")
    @classmethod
    def reject_self_transfer(cls, to_wallet_id, info):
        if "from_wallet_id" in info.data and to_wallet_id == info.data["from_wallet_id"]:
            raise ValueError("Source and destination wallets must be different")
        return to_wallet_id


class TransferRead(ReadSchema):
    from_wallet_id: int
    to_wallet_id: int
    amount_rupiah: AmountRead
    date: calendar_date
    description: str
    notes: str | None


class TransferPage(BaseModel):
    items: list[TransferRead]
    total: int
    page: int
    page_size: int


# Aggregates can exceed both the per-transaction limit and int64. Serialize
# exact Python integers as strings so browser clients never round money.
AggregateAmount = Annotated[
    int,
    Field(strict=True, ge=0),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9]+$"}, mode="serialization"),
]
NetCashFlow = Annotated[
    int,
    Field(strict=True),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^-?[0-9]+$"}, mode="serialization"),
]


class AnalyticsSummary(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1, le=9999)
    income: AggregateAmount
    expense: AggregateAmount
    net_cash_flow: NetCashFlow


class CategoryExpense(BaseModel):
    category_id: int
    category_name: str
    expense: AggregateAmount


class AnalyticsByCategory(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1, le=9999)
    items: list[CategoryExpense]


class MoMComparison(BaseModel):
    has_baseline: bool
    previous_expense: str | None = None
    difference: str | None = None
    percentage: str | None = None
    direction: Literal["up", "down", "equal", "no_baseline"]


class TopCategoryInsight(BaseModel):
    has_data: bool
    category_id: int | None = None
    category_name: str | None = None
    expense: str | None = None
    percentage_of_total: str | None = None


class CashFlowInsight(BaseModel):
    status: Literal["surplus", "deficit", "balanced", "no_activity"]
    savings_rate_percentage: str | None = None


class AnalyticsInsights(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1, le=9999)
    comparison: MoMComparison
    top_category: TopCategoryInsight
    cash_flow: CashFlowInsight
    narratives: list[str]


class HistoricalMonthExpense(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1, le=9999)
    expense: str
    transaction_count: int = Field(ge=0)


class BacktestEvaluation(BaseModel):
    has_backtest: bool
    test_points_count: int = Field(ge=0)
    ma_mae: str | None = None
    naive_mae: str | None = None
    better_model: Literal["ma3", "naive", "tie"] | None = None
    explanation: str


class AnalyticsForecast(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1, le=9999)
    status: Literal["sufficient_data", "insufficient_data"]
    message: str
    has_sufficient_data: bool
    historical_months: list[HistoricalMonthExpense]
    forecast_expense: str | None = None
    baseline_expense: str | None = None
    evaluation: BacktestEvaluation | None = None


BudgetMonth = Annotated[int, Field(strict=True, ge=1, le=12)]
BudgetYear = Annotated[int, Field(strict=True, ge=1, le=9999)]


class BudgetCreate(InputSchema):
    category_id: CategoryID
    amount_rupiah: AmountInput
    month: BudgetMonth
    year: BudgetYear


class BudgetUpdate(InputSchema):
    category_id: CategoryID | None = None
    amount_rupiah: AmountInput | None = None
    month: BudgetMonth | None = None
    year: BudgetYear | None = None

    @field_validator("category_id", "amount_rupiah", "month", "year", mode="before")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the existing value")
        return value


class BudgetRead(ReadSchema):
    category_id: int
    amount_rupiah: AmountRead
    month: BudgetMonth
    year: BudgetYear


class BudgetPage(BaseModel):
    items: list[BudgetRead]
    total: int
    page: int
    page_size: int


class BudgetStatusItem(BaseModel):
    id: int
    category_id: int
    category_name: str
    budget: AmountRead
    spent: AggregateAmount
    remaining: NetCashFlow
    percentage: str = Field(pattern=r"^[0-9]+\.[0-9]{2}$")
    status: Literal["normal", "warning", "over_budget"]


class BudgetStatus(BaseModel):
    month: BudgetMonth
    year: BudgetYear
    items: list[BudgetStatusItem]


class WalletCreate(InputSchema):
    name: WalletName
    type: WalletType = "bank"
    initial_balance_rupiah: InitialBalanceInput = Field(default=0)


class WalletUpdate(InputSchema):
    name: WalletName | None = None
    type: WalletType | None = None
    initial_balance_rupiah: InitialBalanceInput | None = None

    @field_validator("name", "type", "initial_balance_rupiah", mode="before")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the existing value")
        return value


class WalletRead(ReadSchema):
    name: str
    type: WalletType
    initial_balance_rupiah: InitialBalanceRead
    current_balance_rupiah: NetCashFlow


class WalletListResponse(BaseModel):
    items: list[WalletRead]
    total_net_worth_rupiah: NetCashFlow
