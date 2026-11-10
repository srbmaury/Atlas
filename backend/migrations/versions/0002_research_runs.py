"""Persisted research queue and investigation history.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    if 'research_runs' not in inspector.get_table_names():
        op.create_table(
            'research_runs',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('workspace_id', sa.String(), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
            sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('scope', sa.JSON(), nullable=False),
            sa.Column('status', sa.String(), nullable=False),
            sa.Column('stages', sa.JSON(), nullable=False),
            sa.Column('findings', sa.JSON(), nullable=False),
            sa.Column('error', sa.Text()),
            sa.Column('created', sa.Float(), nullable=False),
            sa.Column('updated', sa.Float(), nullable=False),
            sa.Column('lease', sa.Float(), nullable=False, server_default='0'),
            sa.Column('generation', sa.Integer(), nullable=False, server_default='0'),
        )
        op.create_index('ix_research_runs_workspace_id', 'research_runs', ['workspace_id'])
    else:
        columns = {item['name'] for item in inspector.get_columns('research_runs')}
        if 'lease' not in columns:
            op.add_column('research_runs', sa.Column('lease', sa.Float(), nullable=False, server_default='0'))
        if 'generation' not in columns:
            op.add_column('research_runs', sa.Column('generation', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_table('research_runs')
