"""Persistent MVP models. Tables are created by migrations, not app startup."""

from datetime import date as calendar_date
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.types import TypeDecorator
from sqlmodel import Field, SQLModel

from app.validation import (
    MAX_AMOUNT_RUPIAH,
    clean_notes,
    clean_text,
    normalize_category_name,
)

TransactionType = Literal["income", "expense"]
INT64 = BigInteger().with_variant(Integer, "sqlite")
SQLModel.metadata.naming_convention = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Aware UTC in Python; naive UTC on SQLite, timestamptz on PostgreSQL."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name != "sqlite"))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timestamp must be timezone-aware")
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class TimestampedModel(SQLModel):
    created_at: datetime = Field(
        default_factory=utc_now, sa_type=UTCDateTime, nullable=False
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_type=UTCDateTime,
        nullable=False,
        sa_column_kwargs={"onupdate": utc_now},
    )


class Owner(TimestampedModel, table=True):
    __tablename__ = "owners"
    __table_args__ = (
        CheckConstraint(
            "length(display_name) BETWEEN 1 AND 100", name="display_name_length"
        ),
    )

    id: int | None = Field(default=None, sa_column=Column(INT64, primary_key=True))
    display_name: str = Field(sa_column=Column(Text, nullable=False))


class Category(TimestampedModel, table=True):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("length(name) BETWEEN 1 AND 50", name="name_length"),
        CheckConstraint(
            "length(normalized_name) BETWEEN 1 AND 150", name="normalized_name_length"
        ),
        CheckConstraint("type IN ('income', 'expense')", name="type"),
        UniqueConstraint(
            "owner_id", "type", "normalized_name", name="uq_categories_owner_type_name"
        ),
        UniqueConstraint("owner_id", "id", "type", name="uq_categories_owner_id_type"),
        ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name="fk_categories_owner",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )

    id: int | None = Field(default=None, sa_column=Column(INT64, primary_key=True))
    owner_id: int = Field(sa_column=Column(INT64, nullable=False))
    name: str = Field(sa_column=Column(Text, nullable=False))
    normalized_name: str = Field(sa_column=Column(Text, nullable=False))
    type: TransactionType = Field(sa_column=Column(Text, nullable=False))


class Budget(TimestampedModel, table=True):
    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("category_type = 'expense'", name="category_type"),
        CheckConstraint("month BETWEEN 1 AND 12", name="month_range"),
        CheckConstraint("year BETWEEN 1 AND 9999", name="year_range"),
        CheckConstraint(
            f"amount_rupiah BETWEEN 1 AND {MAX_AMOUNT_RUPIAH}", name="amount_range"
        ),
        CheckConstraint(
            "typeof(amount_rupiah) = 'integer'", name="amount_integer"
        ).ddl_if(dialect="sqlite"),
        CheckConstraint(
            "typeof(month) = 'integer' AND typeof(year) = 'integer'",
            name="period_integer",
        ).ddl_if(dialect="sqlite"),
        UniqueConstraint(
            "owner_id",
            "category_id",
            "month",
            "year",
            name="uq_budgets_owner_category_period",
        ),
        ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name="fk_budgets_owner",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["owner_id", "category_id", "category_type"],
            ["categories.owner_id", "categories.id", "categories.type"],
            name="fk_budgets_category",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )

    id: int | None = Field(default=None, sa_column=Column(INT64, primary_key=True))
    owner_id: int = Field(sa_column=Column(INT64, nullable=False))
    category_id: int = Field(sa_column=Column(INT64, nullable=False))
    category_type: Literal["expense"] = Field(
        default="expense",
        sa_column=Column(Text, nullable=False, server_default=text("'expense'")),
    )
    amount_rupiah: int = Field(sa_column=Column(INT64, nullable=False))
    month: int = Field(sa_column=Column(Integer, nullable=False))
    year: int = Field(sa_column=Column(Integer, nullable=False))


class Transaction(TimestampedModel, table=True):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("type IN ('income', 'expense')", name="type"),
        CheckConstraint(
            f"amount_rupiah BETWEEN 1 AND {MAX_AMOUNT_RUPIAH}", name="amount_range"
        ),
        CheckConstraint(
            "typeof(amount_rupiah) = 'integer'", name="amount_integer"
        ).ddl_if(dialect="sqlite"),
        CheckConstraint("length(description) <= 200", name="description_length"),
        CheckConstraint("notes IS NULL OR length(notes) <= 1000", name="notes_length"),
        ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name="fk_transactions_owner",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["owner_id", "category_id", "type"],
            ["categories.owner_id", "categories.id", "categories.type"],
            name="fk_transactions_category",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )

    id: int | None = Field(default=None, sa_column=Column(INT64, primary_key=True))
    owner_id: int = Field(sa_column=Column(INT64, nullable=False))
    category_id: int = Field(sa_column=Column(INT64, nullable=False))
    type: TransactionType = Field(sa_column=Column(Text, nullable=False))
    amount_rupiah: int = Field(sa_column=Column(INT64, nullable=False))
    date: calendar_date = Field(sa_column=Column(Date, nullable=False))
    description: str = Field(
        default="", sa_column=Column(Text, nullable=False, server_default=text("''"))
    )
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))


Index(
    "ix_transactions_owner_date_id",
    Transaction.owner_id,
    Transaction.date.desc(),
    Transaction.id.desc(),
)
Index(
    "ix_transactions_owner_category_date_id",
    Transaction.owner_id,
    Transaction.category_id,
    Transaction.date.desc(),
    Transaction.id.desc(),
)


@event.listens_for(Owner, "before_insert")
@event.listens_for(Owner, "before_update")
def clean_owner(_mapper, _connection, owner: Owner) -> None:
    owner.display_name = clean_text(owner.display_name, max_length=100, required=True)


@event.listens_for(Category, "before_insert")
@event.listens_for(Category, "before_update")
def clean_category(_mapper, _connection, category: Category) -> None:
    # Table constructors bypass Pydantic validation; normalize ORM writes as well.
    category.name, category.normalized_name = normalize_category_name(category.name)


@event.listens_for(Transaction, "before_insert")
@event.listens_for(Transaction, "before_update")
def clean_transaction(_mapper, _connection, transaction: Transaction) -> None:
    transaction.description = clean_text(transaction.description, max_length=200)
    transaction.notes = clean_notes(transaction.notes)
    if (
        type(transaction.amount_rupiah) is not int
        or not 1 <= transaction.amount_rupiah <= MAX_AMOUNT_RUPIAH
    ):
        raise ValueError("Stored amount must be an integer rupiah within range")
    if type(transaction.date) is not calendar_date:
        raise ValueError("Stored date must be a calendar date without time or timezone")


@event.listens_for(Budget, "before_insert")
@event.listens_for(Budget, "before_update")
def validate_budget(_mapper, _connection, budget: Budget) -> None:
    for value, maximum in [
        (budget.amount_rupiah, MAX_AMOUNT_RUPIAH),
        (budget.month, 12),
        (budget.year, 9999),
    ]:
        if type(value) is not int or not 1 <= value <= maximum:
            raise ValueError(
                "Stored budget amount and period must be integers within range"
            )
