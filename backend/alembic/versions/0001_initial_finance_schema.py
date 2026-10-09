"""Create the owned finance schema; no bootstrap or demo data in schema history.

Revision ID: 0001_initial
Revises: none
"""

import sqlalchemy as sa

from alembic import context, op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def int64():
    return sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def timestamps():
    # Freeze the historical storage type here instead of importing live models.
    timezone = op.get_context().dialect.name != "sqlite"
    return (
        sa.Column("created_at", sa.DateTime(timezone=timezone), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=timezone), nullable=False),
    )


def upgrade() -> None:
    if not context.is_offline_mode():
        existing = set(sa.inspect(op.get_bind()).get_table_names())
        if existing & {"owners", "categories", "transactions"}:
            raise RuntimeError(
                "Unversioned finance tables already exist. No tables were replaced. "
                "Back up and inspect the schema; a reviewed legacy/backfill migration is required. "
                "Do not stamp or delete the database to bypass this check."
            )
    op.create_table(
        "owners",
        sa.Column("id", int64(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_owners")),
        sa.CheckConstraint(
            "length(display_name) BETWEEN 1 AND 100",
            name=op.f("ck_owners_display_name_length"),
        ),
    )
    op.create_table(
        "categories",
        sa.Column("id", int64(), nullable=False),
        sa.Column("owner_id", int64(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 50", name=op.f("ck_categories_name_length")
        ),
        sa.CheckConstraint(
            "length(normalized_name) BETWEEN 1 AND 150",
            name=op.f("ck_categories_normalized_name_length"),
        ),
        sa.CheckConstraint(
            "type IN ('income', 'expense')", name=op.f("ck_categories_type")
        ),
        sa.UniqueConstraint(
            "owner_id",
            "type",
            "normalized_name",
            name=op.f("uq_categories_owner_type_name"),
        ),
        sa.UniqueConstraint(
            "owner_id", "id", "type", name=op.f("uq_categories_owner_id_type")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_categories_owner"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )
    sqlite_checks = []
    if op.get_context().dialect.name == "sqlite":
        sqlite_checks.append(
            sa.CheckConstraint(
                "typeof(amount_rupiah) = 'integer'",
                name=op.f("ck_transactions_amount_integer"),
            )
        )
    op.create_table(
        "transactions",
        sa.Column("id", int64(), nullable=False),
        sa.Column("owner_id", int64(), nullable=False),
        sa.Column("category_id", int64(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("amount_rupiah", int64(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "description", sa.Text(), nullable=False, server_default=sa.text("''")
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
        sa.CheckConstraint(
            "type IN ('income', 'expense')", name=op.f("ck_transactions_type")
        ),
        sa.CheckConstraint(
            "amount_rupiah BETWEEN 1 AND 9999999999999",
            name=op.f("ck_transactions_amount_range"),
        ),
        *sqlite_checks,
        sa.CheckConstraint(
            "length(description) <= 200",
            name=op.f("ck_transactions_description_length"),
        ),
        sa.CheckConstraint(
            "notes IS NULL OR length(notes) <= 1000",
            name=op.f("ck_transactions_notes_length"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_transactions_owner"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id", "category_id", "type"],
            ["categories.owner_id", "categories.id", "categories.type"],
            name=op.f("fk_transactions_category"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_transactions_owner_date_id",
        "transactions",
        ["owner_id", sa.text("date DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "ix_transactions_owner_category_date_id",
        "transactions",
        ["owner_id", "category_id", sa.text("date DESC"), sa.text("id DESC")],
    )


def downgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "Offline downgrade cannot verify data safety; restore a verified backup instead"
        )
    connection = op.get_bind()
    for name in ("transactions", "categories", "owners"):
        if (
            connection.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1")).first()
            is not None
        ):
            raise RuntimeError(
                "Downgrade would delete finance data; restore a verified backup instead"
            )
    op.drop_table("transactions")
    op.drop_table("categories")
    op.drop_table("owners")
