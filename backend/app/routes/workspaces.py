"""Workspace management and processing status endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func

from ..api_dependencies import database, user, workspace
from ..config import DATA
from ..db import (
    Chunk,
    ConnectedOAuthState,
    Conversation,
    Document,
    DriveOAuthState,
    ExternalConnection,
    GmailConnection,
    GmailOAuthState,
    Workspace,
)
from ..schemas import DeleteWorkspaceRequest, Named

router = APIRouter()


@router.get('/api/workspaces/{workspaceId}/processing-stats')
def processing_stats(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    rows = (
        db.query(Document.status, func.count(Document.id))
        .filter(Document.workspace_id == workspaceId)
        .group_by(Document.status)
        .all()
    )
    counts = {name: count for name, count in rows}
    return {
        'queued': counts.get('queued', 0),
        'processing': counts.get('processing', 0),
        'ready': counts.get('ready', 0),
        'failed': counts.get('failed', 0),
    }


@router.get('/api/workspaces')
def workspaces(actor=Depends(user), db=Depends(database)):
    return [
        {'id': w.id, 'name': w.name}
        for w in db.query(Workspace).filter_by(owner_id=actor.id).order_by(Workspace.created)
    ]


@router.post('/api/workspaces')
def create_workspace(body: Named, actor=Depends(user), db=Depends(database)):
    if not body.name.strip():
        raise HTTPException(422, 'Workspace name is required.')
    item = Workspace(owner_id=actor.id, name=body.name.strip())
    db.add(item)
    db.commit()
    return {'id': item.id, 'name': item.name}


@router.delete('/api/workspaces/{workspaceId}')
def delete_workspace(
    workspaceId: str, body: DeleteWorkspaceRequest, actor=Depends(user), db=Depends(database)
):
    item = workspace(workspaceId, actor, db)
    if body.name != item.name:
        raise HTTPException(422, 'Type the exact workspace name to confirm deletion.')
    documents = db.query(Document).filter_by(workspace_id=workspaceId).all()
    if any(d.status in ('queued', 'processing') for d in documents):
        raise HTTPException(
            409,
            'Wait for document uploads and processing to finish before deleting this workspace.',
        )
    ids = [d.id for d in documents]
    # Use explicit deletes for SQLite and PostgreSQL; no reliance on ORM cascades.
    db.query(GmailOAuthState).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.query(DriveOAuthState).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.query(ConnectedOAuthState).filter_by(workspace_id=workspaceId).delete(
        synchronize_session=False
    )
    db.query(GmailConnection).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.query(ExternalConnection).filter_by(workspace_id=workspaceId).delete(
        synchronize_session=False
    )
    db.query(Conversation).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.query(Chunk).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.query(Document).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    for did in ids:
        (DATA / 'files' / did).unlink(missing_ok=True)
    return {'ok': True}
