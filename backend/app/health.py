"""Operational probes: liveness does not depend on database; readiness does."""

import logging
from pathlib import Path

from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text

from .db import Document, ExternalConnection, GmailConnection, Session, SourceHealthCheck, engine
from .gmail import actor, allowed_workspace
from .rbac import connection_visible, workspace_permission

router = APIRouter(prefix='/api')
log = logging.getLogger(__name__)
SCHEMA_HEAD = ScriptDirectory(
    str(Path(__file__).resolve().parents[1] / 'migrations')
).get_current_head()


@router.get('/health/live')
def live():
    return {'status': 'ok'}


@router.get('/health/ready')
def ready():
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
            revision = connection.execute(
                text('SELECT version_num FROM alembic_version')
            ).scalar_one_or_none()
            if revision != SCHEMA_HEAD:
                raise RuntimeError('Atlas database schema must be at the current migration head.')
    except Exception as exc:
        log.warning('Readiness check failed: %s', type(exc).__name__)
        raise HTTPException(status_code=503, detail='Database unavailable')
    return {'status': 'ready'}


@router.get(
    '/workspaces/{workspaceId}/operations', dependencies=[Depends(workspace_permission('viewer'))]
)
def workspace_operations(workspaceId: str, request: Request):
    """Authenticated summary for monitoring ingestion and connector health."""
    with Session() as db:
        who = actor(request, db)
        allowed_workspace(db, who, workspaceId)
        documents = db.query(Document.status).filter_by(workspace_id=workspaceId).all()
        counts = {}
        for (status,) in documents:
            counts[status] = counts.get(status, 0) + 1
        checks = [
            item
            for item in db.query(SourceHealthCheck).filter_by(workspace_id=workspaceId).all()
            if connection_visible(
                db,
                who,
                db.get(GmailConnection, workspaceId)
                if item.provider == 'gmail'
                else db.get(ExternalConnection, (workspaceId, item.provider)),
            )
        ]
        return {
            'documents': {'total': len(documents), 'by_status': counts},
            'sources': {
                'last_checked': max((item.checked_at for item in checks), default=None),
                'healthy': sum(item.healthy for item in checks),
                'unhealthy': sum(not item.healthy for item in checks),
            },
        }
