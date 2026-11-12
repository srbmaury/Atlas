"""Initial Atlas database schema.

Revision ID: 0001
Revises:
"""

from alembic import op
from sqlalchemy import text

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    from app.db import Base

    connection = op.get_bind()
    if connection.dialect.name == 'postgresql':
        connection.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
    legacy_tables = [
        table
        for table in Base.metadata.sorted_tables
        if table.name not in {'agent_definitions', 'agent_runs'}
    ]
    Base.metadata.create_all(connection, tables=legacy_tables, checkfirst=True)
    if connection.dialect.name == 'postgresql':
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS chunks_text_idx ON chunks USING gin(to_tsvector('english', text))"
            )
        )
        connection.execute(
            text(
                'CREATE INDEX IF NOT EXISTS chunks_vector_idx ON chunks USING hnsw (embedding vector_cosine_ops)'
            )
        )


def downgrade():
    from app.db import Base

    Base.metadata.drop_all(op.get_bind())
