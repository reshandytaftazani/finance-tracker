from collections.abc import Generator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlmodel import Session, create_engine

from app.config import get_settings

settings = get_settings()
database_url = make_url(settings.database_url)

connect_args: dict[str, bool] = {}
if database_url.get_backend_name() == "sqlite":
    connect_args["check_same_thread"] = False

    if database_url.database and database_url.database != ":memory:":
        Path(database_url.database).expanduser().parent.mkdir(
            parents=True, exist_ok=True
        )

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=settings.debug,
)


if database_url.get_backend_name() == "sqlite":

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _connection_record) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_session() -> Generator[Session, None, None]:
    """Yield a synchronous SQLModel database session per request."""
    with Session(engine) as session:
        yield session
