"""Run the real API on a fresh migrated test DB, never a personal database."""

import os
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.db import engine
from scripts.migrate import upgrade_database
from scripts.seed import bootstrap_local_owner

upgrade_database(engine)
bootstrap_local_owner(engine)

uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ["APP_PORT"]))
