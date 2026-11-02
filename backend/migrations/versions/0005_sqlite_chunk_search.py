"""Add an SQLite full-text index for document chunks.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name != 'sqlite':
        return
    try:
        connection.exec_driver_sql(
            'CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5('
            'chunk_id UNINDEXED, workspace_id UNINDEXED, document_id UNINDEXED, text, '
            "tokenize='unicode61 remove_diacritics 2')"
        )
    except Exception:
        # Some SQLite builds omit FTS5. Retrieval keeps a compatible fallback.
        return
    connection.exec_driver_sql(
        'CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN '
        'INSERT INTO chunks_fts(chunk_id, workspace_id, document_id, text) '
        'VALUES (new.id, new.workspace_id, new.document_id, new.text); END'
    )
    connection.exec_driver_sql(
        'CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN '
        'DELETE FROM chunks_fts WHERE chunk_id = old.id; END'
    )
    connection.exec_driver_sql(
        'CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE OF id, workspace_id, '
        'document_id, text ON chunks BEGIN '
        'DELETE FROM chunks_fts WHERE chunk_id = old.id; '
        'INSERT INTO chunks_fts(chunk_id, workspace_id, document_id, text) '
        'VALUES (new.id, new.workspace_id, new.document_id, new.text); END'
    )
    connection.exec_driver_sql(
        'INSERT INTO chunks_fts(chunk_id, workspace_id, document_id, text) '
        'SELECT id, workspace_id, document_id, text FROM chunks '
        'WHERE id NOT IN (SELECT chunk_id FROM chunks_fts)'
    )


def downgrade():
    connection = op.get_bind()
    if connection.dialect.name != 'sqlite':
        return
    connection.exec_driver_sql('DROP TRIGGER IF EXISTS chunks_fts_insert')
    connection.exec_driver_sql('DROP TRIGGER IF EXISTS chunks_fts_delete')
    connection.exec_driver_sql('DROP TRIGGER IF EXISTS chunks_fts_update')
    connection.exec_driver_sql('DROP TABLE IF EXISTS chunks_fts')
