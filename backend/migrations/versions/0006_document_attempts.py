"""Track processing attempts separately from worker generations.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    columns = sa.inspect(op.get_bind()).get_columns('documents')
    if not any(column['name'] == 'attempts' for column in columns):
        op.add_column(
            'documents', sa.Column('attempts', sa.Integer(), nullable=False, server_default='0')
        )


def downgrade():
    op.drop_column('documents', 'attempts')
