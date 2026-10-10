"""Add owned expense-only monthly budgets without changing existing finance rows."""

import sqlalchemy as sa

from alembic import context, op

revision = "0002_budgets"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    int64 = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    checks = [
        sa.CheckConstraint(condition, name=op.f(f"ck_budgets_{name}"))
        for name, condition in [
            ("category_type", "category_type = 'expense'"),
            ("month_range", "month BETWEEN 1 AND 12"),
            ("year_range", "year BETWEEN 1 AND 9999"),
            ("amount_range", "amount_rupiah BETWEEN 1 AND 9999999999999"),
        ]
    ]
    if op.get_context().dialect.name == "sqlite":
        checks.append(
            sa.CheckConstraint(
                "typeof(amount_rupiah) = 'integer'",
                name=op.f("ck_budgets_amount_integer"),
            )
        )
        checks.append(
            sa.CheckConstraint(
                "typeof(month) = 'integer' AND typeof(year) = 'integer'",
                name=op.f("ck_budgets_period_integer"),
            )
        )
    op.create_table(
        "budgets",
        sa.Column("id", int64, nullable=False),
        sa.Column("owner_id", int64, nullable=False),
        sa.Column("category_id", int64, nullable=False),
        sa.Column(
            "category_type",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'expense'"),
        ),
        sa.Column("amount_rupiah", int64, nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=op.get_context().dialect.name != "sqlite"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=op.get_context().dialect.name != "sqlite"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_budgets")),
        sa.UniqueConstraint(
            "owner_id",
            "category_id",
            "month",
            "year",
            name=op.f("uq_budgets_owner_category_period"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_budgets_owner"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id", "category_id", "category_type"],
            ["categories.owner_id", "categories.id", "categories.type"],
            name=op.f("fk_budgets_category"),
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        *checks,
    )


def downgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "Offline downgrade cannot verify data safety; restore a verified backup instead"
        )
    if (
        op.get_bind().execute(sa.text("SELECT 1 FROM budgets LIMIT 1")).first()
        is not None
    ):
        raise RuntimeError(
            "Downgrade would delete budget data; restore a verified backup instead"
        )
    op.drop_table("budgets")
