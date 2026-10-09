"""Apply migrations, backing up existing SQLite data before a pending upgrade."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from alembic import command
from app.db import engine

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


def backup_before_upgrade(bind: Engine, backup_dir: Path) -> Path | None:
    """Copy through SQLite's backup API, not a copy of a possibly live DB file."""
    if bind.dialect.name != "sqlite":
        raise RuntimeError("This local migration command supports SQLite only")
    with bind.connect() as connection:
        current = MigrationContext.configure(connection).get_current_heads()
        heads = ScriptDirectory.from_config(alembic_config()).get_heads()
        if set(current) == set(heads):
            return None
        tables = set(inspect(connection).get_table_names()) - {"alembic_version"}
        quote = connection.dialect.identifier_preparer.quote
        has_data = any(
            connection.exec_driver_sql(f"SELECT 1 FROM {quote(table)} LIMIT 1").first()
            is not None
            for table in tables
        )
    if not has_data:
        return None
    database = bind.url.database
    if not database or database == ":memory:" or bind.url.query.get("uri"):
        raise RuntimeError(
            "A file-based SQLite database is required for the migration backup"
        )
    source = Path(database).expanduser().resolve()
    backup_dir = backup_dir.resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = (
        backup_dir / f"finance-before-migration-{timestamp}-{uuid4().hex[:8]}.db"
    )
    # Reserve a new file; never overwrite an existing backup.
    with destination.open("xb"):
        pass
    try:
        source_connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
        try:
            backup_connection = sqlite3.connect(destination)
            try:
                source_connection.backup(backup_connection)
                if backup_connection.execute("PRAGMA quick_check").fetchall() != [
                    ("ok",)
                ]:
                    raise RuntimeError(
                        "Backup integrity check failed; migration cancelled"
                    )
            finally:
                backup_connection.close()
        finally:
            source_connection.close()
    except Exception:
        destination.unlink()  # Only the incomplete file created by this invocation.
        raise
    return destination


def upgrade_database(bind: Engine, *, backup_dir: Path | None = None) -> Path | None:
    backup = backup_before_upgrade(bind, backup_dir or BACKEND_DIR / "backups")
    if backup is not None:
        # Report only the location, never personal rows, amounts, or a database URL.
        print(f"Backup sebelum migration: {backup}")
    config = alembic_config()
    with bind.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    return backup


def main() -> None:
    try:
        upgrade_database(engine)
        print("Schema database sudah pada revision terbaru.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
