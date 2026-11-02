"""Track which pages used OCR during document extraction.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    columns = {column['name'] for column in inspect(op.get_bind()).get_columns('documents')}
    if 'ocr_pages' not in columns:
        op.add_column('documents', sa.Column('ocr_pages', sa.JSON(), nullable=True))


def downgrade():
    columns = {column['name'] for column in inspect(op.get_bind()).get_columns('documents')}
    if 'ocr_pages' in columns:
        op.drop_column('documents', 'ocr_pages')
