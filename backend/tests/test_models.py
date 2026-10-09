from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import event, inspect, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.schema import CreateIndex, CreateTable
from sqlmodel import Session, SQLModel, create_engine

from app.db import enable_sqlite_foreign_keys
from app.models import Category, Owner, Transaction, UTCDateTime
from app.schemas import CategoryRead, TransactionRead
from app.validation import MAX_AMOUNT_RUPIAH
from scripts.migrate import upgrade_database


@pytest.fixture(params=["models", "migration"])
def db_engine(tmp_path, request):
    # create_all is only a test fixture, never a migration of the private DB.
    engine = create_engine(f"sqlite:///{(tmp_path / 'models.db').as_posix()}")
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    if request.param == "migration":
        upgrade_database(engine, backup_dir=tmp_path / "backups")
    else:
        SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            [Owner(id=1, display_name="Local"), Owner(id=2, display_name="Other")]
        )
        session.commit()
        session.add_all(
            [
                Category(id=1, owner_id=1, name="Makanan", type="expense"),
                Category(id=2, owner_id=1, name="Gaji", type="income"),
                Category(id=3, owner_id=2, name="Makanan", type="expense"),
            ]
        )
        session.commit()
    yield engine
    engine.dispose()


def insert_transaction(connection, **changes):
    values = {
        "owner_id": 1,
        "category_id": 1,
        "type": "expense",
        "amount_rupiah": 150000,
        "date": "2024-02-29",
        "description": "",
        "notes": None,
        "created_at": "2024-01-01 00:00:00",
        "updated_at": "2024-01-01 00:00:00",
        **changes,
    }
    return connection.execute(
        text(
            f"INSERT INTO transactions ({', '.join(values)}) VALUES ({', '.join(':' + key for key in values)})"
        ),
        values,
    )


@pytest.mark.parametrize("value", [0, -1, 1.5, MAX_AMOUNT_RUPIAH + 1, "invalid", None])
def test_db_amount_check(db_engine, value):
    with db_engine.begin() as connection, pytest.raises(IntegrityError):
        insert_transaction(connection, amount_rupiah=value)


@pytest.mark.parametrize("value", [1.0, "1", 1, MAX_AMOUNT_RUPIAH])
def test_sqlite_check_validates_stored_integer_not_input_type(db_engine, value):
    with db_engine.begin() as connection:
        insert_transaction(connection, amount_rupiah=value)
        assert (
            connection.execute(
                text("SELECT typeof(amount_rupiah) FROM transactions")
            ).scalar_one()
            == "integer"
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"owner_id": 999},
        {"owner_id": None},
        {"category_id": 999},
        {"category_id": None},
        {"category_id": 2},
        {"category_id": 3},
        {"owner_id": 2},
        {"type": "transfer"},
        {"description": "a" * 201},
        {"description": None},
        {"notes": "a" * 1001},
        {"date": None},
        {"created_at": None},
        {"updated_at": None},
    ],
)
def test_db_foreign_keys_required_fields_and_text_checks(db_engine, changes):
    with db_engine.begin() as connection, pytest.raises(IntegrityError):
        insert_transaction(connection, **changes)


@pytest.mark.parametrize(
    "statement",
    [
        "DELETE FROM categories WHERE id=1",
        "UPDATE categories SET owner_id=2 WHERE id=1",
        "UPDATE categories SET type='income' WHERE id=1",
        "DELETE FROM owners WHERE id=1",
        "UPDATE owners SET id=9 WHERE id=1",
    ],
)
def test_restrict_referenced_category_and_owner(db_engine, statement):
    with db_engine.begin() as connection:
        insert_transaction(connection)
        with pytest.raises(IntegrityError):
            connection.execute(text(statement))


@pytest.mark.parametrize(
    "changes",
    [
        {"display_name": ""},
        {"display_name": "a" * 101},
        {"display_name": None},
        {"created_at": None},
        {"updated_at": None},
    ],
)
def test_owner_db_checks(db_engine, changes):
    values = {
        "display_name": "Name",
        "created_at": "2024-01-01",
        "updated_at": "2024-01-01",
        **changes,
    }
    with db_engine.begin() as connection, pytest.raises(IntegrityError):
        connection.execute(
            text(
                "INSERT INTO owners (display_name, created_at, updated_at) VALUES (:display_name, :created_at, :updated_at)"
            ),
            values,
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": "a" * 51},
        {"normalized_name": ""},
        {"normalized_name": "a" * 151},
        {"name": None},
        {"normalized_name": None},
        {"owner_id": None},
        {"owner_id": 999},
        {"type": "transfer"},
        {"type": None},
    ],
)
def test_category_db_checks(db_engine, changes):
    values = {
        "owner_id": 1,
        "name": "New",
        "normalized_name": "new",
        "type": "expense",
        **changes,
    }
    with db_engine.begin() as connection, pytest.raises(IntegrityError):
        connection.execute(
            text(
                "INSERT INTO categories (owner_id,name,normalized_name,type,created_at,updated_at) "
                "VALUES (:owner_id,:name,:normalized_name,:type,'2024-01-01','2024-01-01')"
            ),
            values,
        )


def test_category_normalization_uniqueness_and_rename(db_engine):
    with Session(db_engine) as session:
        session.add(Category(owner_id=1, name="  ＭＡＫＡＮＡＮ  ", type="expense"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add_all(
            [
                Category(owner_id=1, name="Makanan", type="income"),
                Category(
                    owner_id=1,
                    name=" Straße ",
                    type="expense",
                    normalized_name="client lie",
                ),
                Category(owner_id=2, name="Straße", type="expense"),
            ]
        )
        session.commit()
        session.add(Category(owner_id=1, name="STRASSE", type="expense"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        category = session.get(Category, 2)
        category.name = "  ＧＡＪＩ Baru  "
        session.commit()
        session.refresh(category)
        assert (category.name, category.normalized_name) == ("GAJI Baru", "gaji baru")
        assert (
            "normalized_name" not in CategoryRead.model_validate(category).model_dump()
        )


def test_utc_round_trip_timestamps_text_and_read_schema(db_engine):
    original = datetime(2024, 2, 29, 7, tzinfo=timezone(timedelta(hours=7)))
    with Session(db_engine) as session:
        transaction = Transaction(
            owner_id=1,
            category_id=1,
            type="expense",
            amount_rupiah=MAX_AMOUNT_RUPIAH,
            date=date(2024, 2, 29),
            description="  Lunch  ",
            notes="  ",
            created_at=original,
            updated_at=original,
        )
        session.add(transaction)
        session.commit()
        session.refresh(transaction)
        assert transaction.id is not None
        assert transaction.created_at == original.astimezone(timezone.utc)
        assert transaction.created_at.tzinfo is timezone.utc
        assert transaction.updated_at == transaction.created_at
        assert transaction.description == "Lunch"
        assert transaction.notes is None
        assert TransactionRead.model_validate(transaction).model_dump(mode="json")[
            "amount_rupiah"
        ] == str(MAX_AMOUNT_RUPIAH)
        transaction.description = " Dinner "
        session.commit()
        session.refresh(transaction)
        assert transaction.updated_at > transaction.created_at
        assert transaction.created_at == original.astimezone(timezone.utc)
        assert transaction.description == "Dinner"
        stored = session.exec(text("SELECT created_at FROM transactions")).one()[0]
        assert stored.startswith("2024-02-29 00:00:00")
        assert "+" not in stored


@pytest.mark.parametrize(
    "model,values",
    [
        (Owner, {"display_name": "a\x00"}),
        (Category, {"owner_id": 1, "name": "a\x00", "type": "expense"}),
        (
            Transaction,
            {
                "owner_id": 1,
                "category_id": 1,
                "type": "expense",
                "amount_rupiah": 1,
                "date": date(2024, 1, 1),
                "notes": "a\x00",
            },
        ),
        (
            Transaction,
            {
                "owner_id": 1,
                "category_id": 1,
                "type": "expense",
                "amount_rupiah": 1.0,
                "date": date(2024, 1, 1),
            },
        ),
        (
            Transaction,
            {
                "owner_id": 1,
                "category_id": 1,
                "type": "expense",
                "amount_rupiah": 1,
                "date": datetime(2024, 1, 1, tzinfo=timezone.utc),
            },
        ),
    ],
)
def test_orm_validation_cannot_be_bypassed_by_table_constructor(
    db_engine, model, values
):
    with Session(db_engine) as session:
        session.add(model(**values))
        with pytest.raises(ValueError):
            session.commit()
        session.rollback()


def test_naive_timestamp_rejected_by_adapter(db_engine):
    with Session(db_engine) as session:
        naive = datetime(2024, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)
        session.add(Owner(display_name="New", created_at=naive))
        with pytest.raises(StatementError, match="timezone-aware"):
            session.commit()
        session.rollback()


def test_rename_conflict_rolls_back_without_losing_category(db_engine):
    with Session(db_engine) as session:
        category = Category(owner_id=1, name="Transport", type="expense")
        session.add(category)
        session.commit()
        session.refresh(category)
        category_id = category.id
        previous_timestamp = category.updated_at
        category.name = "  ＭＡＫＡＮＡＮ  "
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        category = session.get(Category, category_id)
        assert category.name == "Transport"
        assert category.normalized_name == "transport"
        assert category.updated_at == previous_timestamp


def test_foreign_keys_enabled_on_every_new_connection(db_engine):
    with db_engine.connect() as first, db_engine.connect() as second:
        assert first.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert second.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    db_engine.dispose()
    with db_engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_schema_names_composite_foreign_keys_and_indexes(db_engine):
    inspector = inspect(db_engine)
    for name in ["owners", "categories", "transactions"]:
        assert inspector.get_pk_constraint(name)["name"] == f"pk_{name}"
        assert all(
            check["name"].startswith(f"ck_{name}_")
            for check in inspector.get_check_constraints(name)
        )
    foreign_keys = {fk["name"]: fk for fk in inspector.get_foreign_keys("transactions")}
    assert foreign_keys["fk_transactions_category"]["constrained_columns"] == [
        "owner_id",
        "category_id",
        "type",
    ]
    assert foreign_keys["fk_transactions_category"]["referred_columns"] == [
        "owner_id",
        "id",
        "type",
    ]
    assert {index["name"] for index in inspector.get_indexes("transactions")} == {
        "ix_transactions_owner_date_id",
        "ix_transactions_owner_category_date_id",
    }
    assert Category.__table__.c.owner_id.default is None
    assert Category.__table__.c.owner_id.server_default is None
    assert Transaction.__table__.c.owner_id.server_default is None


def test_sqlite_postgres_ddl_portability_without_claiming_postgres_integration():
    sqlite_ddl = str(
        CreateTable(Transaction.__table__).compile(dialect=sqlite.dialect())
    )
    postgres_ddl = str(
        CreateTable(Transaction.__table__).compile(dialect=postgresql.dialect())
    )
    assert "id INTEGER NOT NULL" in sqlite_ddl
    assert "amount_rupiah INTEGER NOT NULL" in sqlite_ddl
    assert "typeof(amount_rupiah)" in sqlite_ddl
    assert "id BIGSERIAL NOT NULL" in postgres_ddl
    assert "amount_rupiah BIGINT NOT NULL" in postgres_ddl
    assert "TIMESTAMP WITH TIME ZONE" in postgres_ddl
    assert "typeof" not in postgres_ddl
    for index in Transaction.__table__.indexes:
        assert "date DESC, id DESC" in str(
            CreateIndex(index).compile(dialect=sqlite.dialect())
        )
    adapter = UTCDateTime()
    jakarta = datetime(2024, 1, 1, 7, tzinfo=timezone(timedelta(hours=7)))
    assert adapter.process_bind_param(jakarta, postgresql.dialect()) == datetime(
        2024, 1, 1, tzinfo=timezone.utc
    )
