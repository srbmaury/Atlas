"""Per-member source access and durable security history."""

from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    from app.db import AccessEvent, SourceGrant

    for model in (SourceGrant, AccessEvent):
        model.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError(
        'Restore a pre-upgrade backup instead of discarding security history and grants.'
    )
