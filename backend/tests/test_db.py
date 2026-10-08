from sqlmodel import Session, text

from app.db import get_session


def test_get_session_yields_session_with_foreign_keys_enabled() -> None:
    session_gen = get_session()
    session = next(session_gen)
    try:
        assert isinstance(session, Session)
        result = session.exec(text("PRAGMA foreign_keys")).first()
        # In SQLite, PRAGMA foreign_keys returns (1,) when enabled
        assert result is not None
        assert result[0] == 1
    finally:
        try:
            next(session_gen)
        except StopIteration:
            pass
