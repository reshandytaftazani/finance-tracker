import sqlite3
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import Engine, make_url
from sqlmodel import Session, create_engine

from app.config import get_settings


def enable_sqlite_foreign_keys(connection, _connection_record) -> None:
    """Enable FK checks on every SQLite connection, including test engines."""
    if isinstance(connection, sqlite3.Connection):
        autocommit = getattr(connection, "autocommit", None)
        if autocommit is not None:
            connection.autocommit = True
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()
            if autocommit is not None:
                connection.autocommit = autocommit


def create_db_engine(database_url: str, *, echo: bool = False) -> Engine:
    """Use the same SQLite FK policy for the app, migration, and test engines."""
    url = make_url(database_url)
    connect_args: dict[str, bool] = {}
    if url.get_backend_name() == "sqlite":
        connect_args["check_same_thread"] = False
        if url.database and url.database != ":memory:":
            Path(url.database).expanduser().parent.mkdir(parents=True, exist_ok=True)
    db_engine = create_engine(url, connect_args=connect_args, echo=echo)
    event.listen(db_engine, "connect", enable_sqlite_foreign_keys)
    return db_engine


settings = get_settings()
engine = create_db_engine(settings.database_url, echo=settings.debug)


def get_session() -> Generator[Session, None, None]:
    """Yield a synchronous SQLModel database session per request."""
    with Session(engine) as session:
        yield session
