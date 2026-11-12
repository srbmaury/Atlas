"""Store agent output preferences.

Revision ID: 0012_agent_output_format
Revises: 0011_agent_studio
"""

import sqlalchemy as sa
from alembic import op

revision = '0012_agent_output_format'
down_revision = '0011_agent_studio'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'agent_definitions',
        sa.Column(
            'output_format', sa.String(length=32), nullable=False, server_default='detailed_notes'
        ),
    )


def downgrade():
    op.drop_column('agent_definitions', 'output_format')
