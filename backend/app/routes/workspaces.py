"""Workspace management and processing status endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func

from ..access_audit import record
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
    SourceGrant,
    Workspace,
    WorkspaceMember,
)
from ..rbac import require_organisation, require_workspace, workspace_permission, workspace_role
from ..schemas import DeleteWorkspaceRequest, Named


class WorkspaceCreate(Named):
    organisation_id: Optional[str] = None


router = APIRouter()


@router.get(
    '/api/workspaces/{workspaceId}/processing-stats',
    dependencies=[Depends(workspace_permission('viewer'))],
)
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
    memberships = db.query(WorkspaceMember.workspace_id).filter_by(user_id=actor.id)
    candidates = (
        db.query(Workspace)
        .filter((Workspace.owner_id == actor.id) | Workspace.id.in_(memberships))
        .order_by(Workspace.created)
    )
    return [workspace_data(w, role) for w in candidates if (role := workspace_role(db, actor, w))]


def workspace_data(item, role):
    return {
        'id': item.id,
        'name': item.name,
        'role': role,
        'organisation_id': item.organisation_id,
        'owner_id': item.owner_id,
    }


@router.post('/api/workspaces')
def create_workspace(body: WorkspaceCreate, actor=Depends(user), db=Depends(database)):
    if not body.name.strip():
        raise HTTPException(422, 'Workspace name is required.')
    if body.organisation_id:
        require_organisation(db, actor, body.organisation_id, manage=True, lock=True)
    item = Workspace(
        owner_id=actor.id, name=body.name.strip(), organisation_id=body.organisation_id
    )
    db.add(item)
    db.flush()
    record(db, actor.id, 'workspace', item.id, 'workspace.created')
    db.commit()
    return workspace_data(item, 'manager')


@router.delete(
    '/api/workspaces/{workspaceId}', dependencies=[Depends(workspace_permission('manager'))]
)
def delete_workspace(
    workspaceId: str, body: DeleteWorkspaceRequest, actor=Depends(user), db=Depends(database)
):
    item = require_workspace(db, actor, workspaceId, 'manager', lock=True)
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
    db.query(WorkspaceMember).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    record(db, actor.id, 'workspace', item.id, 'workspace.deleted')
    db.query(SourceGrant).filter_by(workspace_id=workspaceId).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    for did in ids:
        (DATA / 'files' / did).unlink(missing_ok=True)
    return {'ok': True}
