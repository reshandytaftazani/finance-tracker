"""Create, verify, and restore SQLite database backups safely using SQLite's Backup API."""

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy.engine import make_url

from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def get_default_database_path() -> Path:
    """Resolve the SQLite database path configured in settings."""
    settings = get_settings()
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite":
        raise RuntimeError("Hanya database SQLite yang didukung untuk script backup ini.")
    if not url.database or url.database == ":memory:":
        raise RuntimeError("Database berbasis file SQLite diperlukan untuk backup.")
    db_path = Path(url.database).expanduser()
    if not db_path.is_absolute():
        db_path = (BACKEND_DIR / db_path).resolve()
    return db_path


def verify_backup(backup_path: Path | str) -> bool:
    """Verify integrity of an existing SQLite backup file."""
    path = Path(backup_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"File backup tidak ditemukan: {path}")

    try:
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            quick_check = connection.execute("PRAGMA quick_check").fetchall()
            if quick_check != [("ok",)]:
                raise RuntimeError(f"PRAGMA quick_check failed: {quick_check}")
            integrity = connection.execute("PRAGMA integrity_check").fetchall()
            if integrity != [("ok",)]:
                raise RuntimeError(f"PRAGMA integrity_check failed: {integrity}")
        finally:
            connection.close()
    except sqlite3.DatabaseError as error:
        raise RuntimeError(f"File backup rusak atau bukan database SQLite valid: {error}") from error

    return True


def create_backup(
    source: Path | str | None = None,
    backup_dir: Path | str | None = None,
    *,
    prefix: str = "finance-backup",
) -> Path:
    """Safely back up a SQLite database (even under active WAL) using SQLite's Backup API."""
    if source is None:
        source_path = get_default_database_path()
    else:
        source_path = Path(source).expanduser().resolve()

    if not source_path.is_file():
        raise FileNotFoundError(f"Source database not found: {source_path}")

    if backup_dir is None:
        target_dir = (BACKEND_DIR / "backups").resolve()
    else:
        target_dir = Path(backup_dir).expanduser().resolve()

    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = target_dir / f"{prefix}-{timestamp}-{uuid4().hex[:8]}.db"

    # Reserve the file; avoid any possibility of overwriting
    with destination.open("xb"):
        pass

    try:
        source_connection = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        try:
            backup_connection = sqlite3.connect(destination)
            try:
                source_connection.backup(backup_connection)
                if backup_connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise RuntimeError("Backup integrity check failed")
            finally:
                backup_connection.close()
        finally:
            source_connection.close()
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return destination


def restore_backup(
    backup_path: Path | str,
    target_path: Path | str | None = None,
    *,
    force: bool = False,
) -> Path:
    """Restore a verified backup into a target database location."""
    backup = Path(backup_path).expanduser().resolve()
    verify_backup(backup)

    if target_path is None:
        target = get_default_database_path()
    else:
        target = Path(target_path).expanduser().resolve()

    target_existed_before = target.exists()
    if target_existed_before and not force:
        raise FileExistsError(
            f"Target database '{target}' already exists. Use force=True / --force to overwrite."
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    temp_target = target.parent / f".tmp-restore-{uuid4().hex[:8]}.db"

    backup_connection = sqlite3.connect(f"file:{backup.as_posix()}?mode=ro", uri=True)
    try:
        temp_connection = sqlite3.connect(temp_target)
        try:
            backup_connection.backup(temp_connection)
            if temp_connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise RuntimeError("Restored database integrity check failed")
            temp_connection.execute("PRAGMA foreign_keys=ON")
        finally:
            temp_connection.close()

        temp_target.replace(target)
        target.with_name(f"{target.name}-wal").unlink(missing_ok=True)
        target.with_name(f"{target.name}-shm").unlink(missing_ok=True)
    except Exception:
        temp_target.unlink(missing_ok=True)
        raise
    finally:
        backup_connection.close()

    return target


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backup and restore utilitas untuk Personal Finance Tracker (SQLite)."
    )
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Path database SQLite sumber (default: sesuai konfigurasi APP_DATABASE_URL).",
    )
    parser.add_argument(
        "--backup-dir",
        type=str,
        default=None,
        help="Direktori penyimpanan file backup (default: backend/backups).",
    )
    parser.add_argument(
        "--restore",
        type=str,
        default=None,
        help="Path file backup yang akan dipulihkan (restore).",
    )
    parser.add_argument(
        "--target",
        type=str,
        default=None,
        help="Path database target untuk restore (default: sesuai konfigurasi APP_DATABASE_URL).",
    )
    parser.add_argument(
        "--verify",
        type=str,
        default=None,
        help="Path file backup yang ingin diperiksa integritasnya.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Izinkan penimpaan database target bila file sudah ada saat restore.",
    )
    return parser.parse_args(args)


def main(args: list[str] | None = None) -> int:
    parsed = parse_args(args)
    try:
        if parsed.verify:
            verify_backup(parsed.verify)
            print(f"Integritas backup valid: {parsed.verify}")
            return 0

        if parsed.restore:
            restored = restore_backup(
                parsed.restore,
                target_path=parsed.target,
                force=parsed.force,
            )
            print(f"Restore berhasil ke: {restored}")
            return 0

        created = create_backup(
            source=parsed.source,
            backup_dir=parsed.backup_dir,
        )
        print(f"Backup berhasil dibuat: {created}")
        return 0
    except (FileNotFoundError, FileExistsError, RuntimeError, sqlite3.Error, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
