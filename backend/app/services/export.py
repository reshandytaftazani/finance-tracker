"""CSV text safety; this export is not a lossless database backup."""

import unicodedata


def spreadsheet_text(value: str) -> str:
    """Prefix formula-like cells, preserving original text and stored data.

    Inspect compatibility-normalized text and skip leading whitespace/control
    characters that spreadsheet importers may ignore. CSV quoting alone does
    not prevent a quoted cell from being interpreted as a formula.
    """
    for character in unicodedata.normalize("NFKC", value):
        if character.isspace() or unicodedata.category(character) in {"Cc", "Cf"}:
            continue
        return "'" + value if character in "=+-@" else value
    return value
