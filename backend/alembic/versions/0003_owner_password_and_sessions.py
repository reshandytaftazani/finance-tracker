"""Add owner password_hash and user_sessions table."""

import sqlalchemy as sa
from alembic import context, op

revision = "0003_owner_password_and_sessions"
down_revision = "0002_budgets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    int64 = sa.BigInteger().with_variant(sa.Integer(), "sqlite")

    # 1. Add password_hash to owners
    op.add_column("owners", sa.Column("password_hash", sa.Text(), nullable=True))

    # 2. Create user_sessions table
    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.Text(), primary_key=True),
        sa.Column("owner_id", int64, nullable=False),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=op.get_context().dialect.name != "sqlite"),
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owners.id"],
            name=op.f("fk_user_sessions_owner"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_user_sessions_owner_id",
        "user_sessions",
        ["owner_id"],
    )
    op.create_index(
        "ix_user_sessions_expires_at",
        "user_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "Offline downgrade cannot verify data safety; restore a verified backup instead"
        )
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_owner_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    with op.batch_alter_table("owners") as batch_op:
        batch_op.drop_column("password_hash")
