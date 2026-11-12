"""Persist per-agent source scopes.

Revision ID: 0013_agent_source_config
Revises: 0012_agent_output_format
"""

import sqlalchemy as sa
from alembic import op

revision = '0013_agent_source_config'
down_revision = '0012_agent_output_format'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('agent_definitions', sa.Column('source_config', sa.JSON(), nullable=False, server_default='{}'))


def downgrade():
    op.drop_column('agent_definitions', 'source_config')
