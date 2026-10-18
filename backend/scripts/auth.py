"""CLI management script for owner credentials."""

import argparse
import getpass
import sys
from collections.abc import Sequence

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.auth import hash_password
from app.db import engine
from app.models import Owner


def set_owner_password(bind: Engine, password: str, owner_id: int = 1) -> None:
    """Set or update the password hash for a specific owner in the database."""
    if not password or len(password) < 8:
        raise ValueError("Password harus memiliki panjang minimal 8 karakter.")

    with Session(bind) as session:
        owner = session.exec(select(Owner).where(Owner.id == owner_id)).first()
        if owner is None:
            raise ValueError(f"Owner dengan ID {owner_id} tidak ditemukan di database.")

        owner.password_hash = hash_password(password)
        session.add(owner)
        session.commit()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Kelola kredensial dan autentikasi pemilik finance-tracker."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    set_pwd_parser = subparsers.add_parser(
        "set-password", help="Atur atau perbarui password pemilik."
    )
    set_pwd_parser.add_argument(
        "--password",
        type=str,
        default=None,
        help="Password baru (jika tidak diisi, prompt interaktif akan muncul).",
    )
    set_pwd_parser.add_argument(
        "--env",
        action="store_true",
        help="Baca password baru dari environment variable APP_OWNER_PASSWORD.",
    )
    set_pwd_parser.add_argument(
        "--owner-id",
        type=int,
        default=1,
        help="ID pemilik target (default: 1).",
    )

    return parser


def main(args: Sequence[str] | None = None) -> int:
    import os

    parser = build_parser()
    parsed_args = parser.parse_args(args)

    if parsed_args.command == "set-password":
        password = parsed_args.password
        if parsed_args.env:
            password = os.environ.get("APP_OWNER_PASSWORD")
            if not password:
                print(
                    "Error: Environment variable APP_OWNER_PASSWORD tidak diset atau kosong.",
                    file=sys.stderr,
                )
                return 1
        elif not password:
            password = getpass.getpass("Masukkan password baru (min 8 karakter): ")
            confirm = getpass.getpass("Konfirmasi password baru: ")
            if password != confirm:
                print("Error: Konfirmasi password tidak cocok.", file=sys.stderr)
                return 1

        try:
            set_owner_password(engine, password=password, owner_id=parsed_args.owner_id)
            print(f"Sukses: Password untuk Owner ID {parsed_args.owner_id} berhasil disimpan.")
            return 0
        except ValueError as err:
            print(f"Error: {err}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
