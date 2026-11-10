"""Add Drive and Slack resource allowlists and pause existing broad shares."""

import sqlalchemy as sa
from alembic import op

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = inspector.get_columns('external_connections')
    if not any(column['name'] == 'shared_resource_ids' for column in columns):
        op.add_column(
            'external_connections', sa.Column('shared_resource_ids', sa.JSON(), nullable=True)
        )
    op.execute(
        "UPDATE external_connections SET shared = false WHERE provider IN ('drive', 'slack')"
    )
    op.execute("DELETE FROM source_grants WHERE provider IN ('drive', 'slack')")
    if inspector.has_table('source_health_checks'):
        op.execute("DELETE FROM source_health_checks WHERE provider IN ('drive', 'slack')")


def downgrade():
    raise RuntimeError('Restore a pre-upgrade backup instead of dropping source access controls.')
