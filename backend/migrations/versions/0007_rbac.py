"""Explicit organisation/workspace membership and private connection/conversation ownership."""

import sqlalchemy as sa
from alembic import op

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    from app.db import Organisation, OrganisationMember, WorkspaceMember

    connection = op.get_bind()
    for model in (Organisation, OrganisationMember, WorkspaceMember):
        model.__table__.create(connection, checkfirst=True)
    additions = {
        'workspaces': [sa.Column('organisation_id', sa.String())],
        'conversations': [sa.Column('author_id', sa.String())],
        'external_connections': [
            sa.Column('connected_by', sa.String()),
            sa.Column('shared', sa.Boolean(), nullable=False, server_default=sa.false()),
        ],
        'gmail_connections': [
            sa.Column('connected_by', sa.String()),
            sa.Column('shared', sa.Boolean(), nullable=False, server_default=sa.false()),
        ],
    }
    for table, columns in additions.items():
        existing = {c['name'] for c in sa.inspect(connection).get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)
    # Existing workspaces remain personal. Existing credentials stay private.
    for table, field in [
        ('conversations', 'author_id'),
        ('external_connections', 'connected_by'),
        ('gmail_connections', 'connected_by'),
    ]:
        connection.execute(
            sa.text(
                f'UPDATE {table} SET {field} = (SELECT owner_id FROM workspaces WHERE workspaces.id = {table}.workspace_id) WHERE {field} IS NULL'
            )
        )
    for table, field in [('workspaces', 'organisation_id'), ('conversations', 'author_id')]:
        op.execute(sa.text(f'CREATE INDEX IF NOT EXISTS ix_{table}_{field} ON {table} ({field})'))


def downgrade():
    raise RuntimeError(
        'RBAC downgrade would discard access and privacy metadata. Restore a pre-upgrade backup instead.'
    )
