"""Bootstrap one local owner; never re-create deleted or renamed categories."""

from sqlalchemy.engine import Engine
from sqlmodel import Session

from app.config import get_settings
from app.db import engine
from app.models import Category, Owner, TransactionType
from app.validation import normalize_category_name

LOCAL_OWNER_ID = 1
DEFAULT_CATEGORIES: tuple[tuple[str, TransactionType], ...] = (
    ("Gaji", "income"),
    ("Makanan", "expense"),
    ("Transport", "expense"),
    ("Hiburan", "expense"),
)


def bootstrap_local_owner(bind: Engine, *, mode: str = "local") -> bool:
    """Return True only when the owner and all defaults were created atomically."""
    if mode != "local":
        raise ValueError("Bootstrap owner lokal hanya diizinkan pada APP_ENV=local")
    with Session(bind) as session, session.begin():
        if session.get(Owner, LOCAL_OWNER_ID) is not None:
            return False
        session.add(Owner(id=LOCAL_OWNER_ID, display_name="Pemilik Lokal"))
        session.flush()
        for raw_name, category_type in DEFAULT_CATEGORIES:
            name, normalized_name = normalize_category_name(raw_name)
            session.add(
                Category(
                    owner_id=LOCAL_OWNER_ID,
                    name=name,
                    normalized_name=normalized_name,
                    type=category_type,
                )
            )
    return True


def main() -> None:
    try:
        created = bootstrap_local_owner(engine, mode=get_settings().env)
        print(
            "Owner lokal dan kategori awal dibuat."
            if created
            else "Owner lokal sudah ada; data tidak diubah."
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
