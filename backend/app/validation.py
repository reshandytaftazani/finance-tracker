"""Shared domain rules for request schemas, ORM writes, and future seeds."""

import re
import unicodedata
from datetime import date

MAX_AMOUNT_RUPIAH = 9_999_999_999_999


def clean_text(value: str, *, max_length: int, required: bool = False) -> str:
    if not isinstance(value, str) or "\x00" in value:
        raise ValueError("Text must be a string without NUL characters")
    value = value.strip()
    if len(value) > max_length or (required and not value):
        raise ValueError(f"Text length must be {'1' if required else '0'}–{max_length}")
    return value


def normalize_category_name(value: str) -> tuple[str, str]:
    if not isinstance(value, str):
        # Pydantic v2 propagates TypeError instead of reporting a validation error.
        raise ValueError("Category name must be a string")  # noqa: TRY004
    name = clean_text(
        unicodedata.normalize("NFKC", value), max_length=50, required=True
    )
    normalized_name = name.casefold()
    if len(normalized_name) > 150:
        raise ValueError("Normalized category name is too long")
    return name, normalized_name


def clean_notes(value: str | None) -> str | None:
    if value is None:
        return None
    return clean_text(value, max_length=1000) or None


def parse_amount_rupiah(value: object) -> int:
    if not isinstance(value, str) or re.fullmatch(r"[0-9]+", value) is None:
        raise ValueError("Amount must be an ASCII digit string")
    # Compare before int() so arbitrarily long input never hits Python's digit limit.
    digits = value.lstrip("0") or "0"
    maximum = str(MAX_AMOUNT_RUPIAH)
    if (
        digits == "0"
        or len(digits) > len(maximum)
        or (len(digits) == len(maximum) and digits > maximum)
    ):
        raise ValueError(f"Amount must be between 1 and {MAX_AMOUNT_RUPIAH}")
    return int(digits)


def parse_local_date(value: object) -> date:
    if (
        not isinstance(value, str)
        or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) is None
    ):
        raise ValueError("Date must use YYYY-MM-DD without time or timezone")
    return date.fromisoformat(value)
