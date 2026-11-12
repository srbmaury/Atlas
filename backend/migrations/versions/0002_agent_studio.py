"""Add Agent Studio definitions and queued research runs.

Revision ID: 0011_agent_studio
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = '0011_agent_studio'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_definitions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column(
            'workspace_id',
            sa.String(),
            sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('created', sa.Float()),
    )
    op.create_index('ix_agent_definitions_workspace_id', 'agent_definitions', ['workspace_id'])
    op.create_table(
        'agent_runs',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column(
            'workspace_id',
            sa.String(),
            sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('agent_id', sa.String(), nullable=False),
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('lease', sa.Float()),
        sa.Column('generation', sa.Integer()),
        sa.Column('attempts', sa.Integer()),
        sa.Column('error', sa.Text()),
        sa.Column('steps', sa.JSON(), nullable=False),
        sa.Column('result', sa.JSON()),
        sa.Column('created', sa.Float()),
    )
    op.create_index('ix_agent_runs_workspace_id', 'agent_runs', ['workspace_id'])
    op.create_index('ix_agent_runs_agent_id', 'agent_runs', ['agent_id'])
    op.create_index('ix_agent_runs_status', 'agent_runs', ['status'])


def downgrade():
    op.drop_index('ix_agent_runs_status', table_name='agent_runs')
    op.drop_index('ix_agent_runs_agent_id', table_name='agent_runs')
    op.drop_index('ix_agent_runs_workspace_id', table_name='agent_runs')
    op.drop_table('agent_runs')
    op.drop_index('ix_agent_definitions_workspace_id', table_name='agent_definitions')
    op.drop_table('agent_definitions')
