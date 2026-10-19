"""Add wallets and transfers tables and attach wallet_id to transactions."""

from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import context, op

revision = "0004_wallets_and_transfers"
down_revision = "0003_owner_password_and_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    int64 = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    is_sqlite = op.get_context().dialect.name == "sqlite"

    # 1. Create wallets table
    wallet_checks = [
        sa.CheckConstraint("length(name) BETWEEN 1 AND 50", name=op.f("ck_wallets_wallet_name_length")),
        sa.CheckConstraint(
            "type IN ('cash', 'bank', 'ewallet', 'investment', 'other')",
            name=op.f("ck_wallets_wallet_type"),
        ),
        sa.CheckConstraint(
            "initial_balance_rupiah BETWEEN 0 AND 9999999999999",
            name=op.f("ck_wallets_initial_balance_range"),
        ),
    ]
    if is_sqlite:
        wallet_checks.append(
            sa.CheckConstraint(
                "typeof(initial_balance_rupiah) = 'integer'",
                name=op.f("ck_wallets_initial_balance_integer"),
            )
        )

    op.create_table(
        "wallets",
        sa.Column("id", int64, primary_key=True),
        sa.Column("owner_id", int64, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False, server_default=sa.text("'bank'")),
        sa.Column("initial_balance_rupiah", int64, nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=not is_sqlite),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=not is_sqlite),
            nullable=False,
        ),
        *wallet_checks,
        sa.UniqueConstraint("owner_id", "name", name=op.f("uq_wallets_owner_name")),
        sa.UniqueConstraint("owner_id", "id", name=op.f("uq_wallets_owner_id")),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_wallets_owner"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )

    # 2. Create transfers table
    transfer_checks = [
        sa.CheckConstraint(
            "amount_rupiah BETWEEN 1 AND 9999999999999",
            name=op.f("ck_transfers_transfer_amount_range"),
        ),
        sa.CheckConstraint(
            "from_wallet_id != to_wallet_id",
            name=op.f("ck_transfers_different_wallets"),
        ),
        sa.CheckConstraint(
            "length(description) <= 200",
            name=op.f("ck_transfers_transfer_description_length"),
        ),
        sa.CheckConstraint(
            "notes IS NULL OR length(notes) <= 1000",
            name=op.f("ck_transfers_transfer_notes_length"),
        ),
    ]
    if is_sqlite:
        transfer_checks.append(
            sa.CheckConstraint(
                "typeof(amount_rupiah) = 'integer'",
                name=op.f("ck_transfers_transfer_amount_integer"),
            )
        )

    op.create_table(
        "transfers",
        sa.Column("id", int64, primary_key=True),
        sa.Column("owner_id", int64, nullable=False),
        sa.Column("from_wallet_id", int64, nullable=False),
        sa.Column("to_wallet_id", int64, nullable=False),
        sa.Column("amount_rupiah", int64, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=not is_sqlite),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=not is_sqlite),
            nullable=False,
        ),
        *transfer_checks,
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_transfers_owner"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id", "from_wallet_id"],
            ["wallets.owner_id", "wallets.id"],
            name=op.f("fk_transfers_from_wallet"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id", "to_wallet_id"],
            ["wallets.owner_id", "wallets.id"],
            name=op.f("fk_transfers_to_wallet"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_transfers_owner_date_id",
        "transfers",
        ["owner_id", sa.text("date DESC"), sa.text("id DESC")],
    )

    # 3. Bootstrap default 'Dompet Utama' for every existing owner if online
    if not context.is_offline_mode():
        connection = op.get_bind()
        now = datetime.now(UTC)
        now_val = now.strftime("%Y-%m-%d %H:%M:%S") if is_sqlite else now
        owners = connection.execute(sa.text("SELECT id FROM owners")).fetchall()
        for (owner_id,) in owners:
            existing = connection.execute(
                sa.text("SELECT id FROM wallets WHERE owner_id = :oid LIMIT 1"),
                {"oid": owner_id},
            ).first()
            if not existing:
                connection.execute(
                    sa.text(
                        "INSERT INTO wallets (owner_id, name, type, initial_balance_rupiah, created_at, updated_at) "
                        "VALUES (:oid, 'Dompet Utama', 'bank', 0, :now, :now)"
                    ),
                    {"oid": owner_id, "now": now_val},
                )

    # 4. Attach wallet_id to transactions table
    if context.is_offline_mode():
        op.add_column(
            "transactions",
            sa.Column("wallet_id", int64, nullable=False, server_default=sa.text("1")),
        )
        op.create_index(
            "ix_transactions_owner_wallet_date_id",
            "transactions",
            ["owner_id", "wallet_id", sa.text("date DESC"), sa.text("id DESC")],
        )
        return

    # Drop expression indexes before batch alter so SQLite table recreation succeeds
    op.drop_index("ix_transactions_owner_date_id", table_name="transactions")
    op.drop_index("ix_transactions_owner_category_date_id", table_name="transactions")

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("wallet_id", int64, nullable=False, server_default=sa.text("1"))
        )
        batch_op.create_foreign_key(
            "fk_transactions_wallet",
            "wallets",
            ["owner_id", "wallet_id"],
            ["owner_id", "id"],
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        )

    # Populate existing transactions with owner's default wallet
    for (owner_id,) in owners:
        wallet_row = connection.execute(
            sa.text("SELECT id FROM wallets WHERE owner_id = :oid ORDER BY id ASC LIMIT 1"),
            {"oid": owner_id},
        ).first()
        if wallet_row:
            connection.execute(
                sa.text("UPDATE transactions SET wallet_id = :wid WHERE owner_id = :oid"),
                {"wid": wallet_row[0], "oid": owner_id},
            )

    # Recreate all transaction indexes including the new wallet index
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
    op.create_index(
        "ix_transactions_owner_wallet_date_id",
        "transactions",
        ["owner_id", "wallet_id", sa.text("date DESC"), sa.text("id DESC")],
    )


def downgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "Offline downgrade cannot verify data safety; restore a verified backup instead"
        )
    connection = op.get_bind()
    if (
        connection.execute(sa.text("SELECT 1 FROM transfers LIMIT 1")).first() is not None
        or connection.execute(
            sa.text("SELECT 1 FROM wallets WHERE name != 'Dompet Utama' OR initial_balance_rupiah != 0 LIMIT 1")
        ).first() is not None
    ):
        raise RuntimeError(
            "Downgrade would delete wallet or transfer data; restore a verified backup instead"
        )

    op.drop_index("ix_transactions_owner_wallet_date_id", table_name="transactions")
    op.drop_index("ix_transactions_owner_date_id", table_name="transactions")
    op.drop_index("ix_transactions_owner_category_date_id", table_name="transactions")

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_transactions_wallet", type_="foreignkey")
        batch_op.drop_column("wallet_id")

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

    op.drop_index("ix_transfers_owner_date_id", table_name="transfers")
    op.drop_table("transfers")
    op.drop_table("wallets")
