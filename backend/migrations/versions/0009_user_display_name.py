"""Add editable display names to Atlas accounts."""

import sqlalchemy as sa
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    columns = sa.inspect(op.get_bind()).get_columns('users')
    if not any(column['name'] == 'display_name' for column in columns):
        op.add_column('users', sa.Column('display_name', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('users', 'display_name')
