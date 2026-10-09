"""Online migrations use the app settings and an explicit SQLite DDL transaction."""

from sqlmodel import SQLModel

from alembic import context
from app import models  # noqa: F401 -- register the tables for autogenerate
from app.config import get_settings
from app.db import create_db_engine
from scripts.migrate import BACKEND_DIR, backup_before_upgrade

config = context.config
target_metadata = SQLModel.metadata


def migrate_connection(connection) -> None:
    if connection.dialect.name == "sqlite":
        if connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() != 1:
            raise RuntimeError("Migration requires SQLite foreign_keys=ON")
        # Legacy sqlite3 transaction control does not begin a transaction for DDL.
        # The caller owns the SQLAlchemy transaction; start the physical one too.
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        if connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
            raise RuntimeError(
                "Existing foreign key violations; repair a copy before migration"
            )
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=connection.dialect.name == "sqlite",
        transactional_ddl=True,
    )
    with context.begin_transaction():
        context.run_migrations()
    if (
        connection.dialect.name == "sqlite"
        and connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None
    ):
        raise RuntimeError("Migration produced foreign key violations; rolling back")


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        # Programmatic callers own commit/rollback (see scripts.migrate).
        migrate_connection(connection)
        return
    engine = create_db_engine(get_settings().database_url)
    try:
        if engine.dialect.name == "sqlite":
            backup = backup_before_upgrade(engine, BACKEND_DIR / "backups")
            if backup is not None:
                print(f"Backup sebelum migration: {backup}")
        with engine.begin() as connection:
            migrate_connection(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
