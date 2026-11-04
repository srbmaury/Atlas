"""Ownership transfer preserves resources and keeps personal credentials separate."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..access_audit import record
from ..api_dependencies import database, user
from ..db import (
    Conversation,
    ExternalConnection,
    GmailConnection,
    Organisation,
    OrganisationMember,
    User,
    Workspace,
    WorkspaceMember,
)
from ..rbac import (
    organisation_permission,
    organisation_role,
    require_organisation,
    require_workspace,
    workspace_permission,
    workspace_role,
)

router = APIRouter()


class OwnershipTransfer(BaseModel):
    member_id: str = Field(min_length=1, max_length=100)
    confirmation: str = Field(min_length=1, max_length=100)


@router.post(
    '/workspaces/{workspaceId}/ownership', dependencies=[Depends(workspace_permission('manager'))]
)
def transfer_workspace(
    workspaceId: str, body: OwnershipTransfer, actor=Depends(user), db=Depends(database)
):
    item = require_workspace(db, actor, workspaceId, 'manager', lock=True)
    if item.owner_id != actor.id:
        raise HTTPException(403, 'Only the current workspace owner can transfer ownership.')
    if body.confirmation != item.name:
        raise HTTPException(422, 'Type the exact workspace name to confirm ownership transfer.')
    target = db.get(User, body.member_id)
    if target is None or target.id == actor.id or not workspace_role(db, target, item):
        raise HTTPException(422, 'Choose another active workspace member.')
    # Compare and swap prevents two concurrent transfers from both succeeding.
    changed = (
        db.query(Workspace)
        .filter_by(id=item.id, owner_id=actor.id)
        .update({'owner_id': target.id}, synchronize_session=False)
    )
    if not changed:
        raise HTTPException(409, 'Ownership changed. Refresh and retry.')
    for model in (ExternalConnection, GmailConnection):
        db.query(model).filter_by(workspace_id=item.id, connected_by=None).update(
            {'connected_by': actor.id}
        )
    db.query(Conversation).filter_by(workspace_id=item.id, author_id=None).update(
        {'author_id': actor.id}
    )
    previous = db.get(WorkspaceMember, (item.id, actor.id))
    if previous:
        previous.role = 'manager'
    else:
        db.add(WorkspaceMember(workspace_id=item.id, user_id=actor.id, role='manager'))
    db.query(WorkspaceMember).filter_by(workspace_id=item.id, user_id=target.id).delete()
    record(
        db,
        actor.id,
        'workspace',
        item.id,
        'ownership.transferred',
        target.id,
        previous_owner=actor.id,
    )
    db.commit()
    return {'owner_id': target.id}


@router.post(
    '/organisations/{organisation_id}/ownership',
    dependencies=[Depends(organisation_permission(manage=True))],
)
def transfer_organisation(
    organisation_id: str, body: OwnershipTransfer, actor=Depends(user), db=Depends(database)
):
    org = require_organisation(db, actor, organisation_id, manage=True, lock=True)
    if org.owner_id != actor.id:
        raise HTTPException(403, 'Only the current organisation owner can transfer ownership.')
    if body.confirmation != org.name:
        raise HTTPException(422, 'Type the exact organisation name to confirm ownership transfer.')
    target = db.get(User, body.member_id)
    if target is None or target.id == actor.id or not organisation_role(db, target, org.id):
        raise HTTPException(422, 'Choose another active organisation member.')
    changed = (
        db.query(Organisation)
        .filter_by(id=org.id, owner_id=actor.id)
        .update({'owner_id': target.id}, synchronize_session=False)
    )
    if not changed:
        raise HTTPException(409, 'Ownership changed. Refresh and retry.')
    previous = db.get(OrganisationMember, (org.id, actor.id))
    if previous:
        previous.role = 'admin'
    else:
        db.add(OrganisationMember(organisation_id=org.id, user_id=actor.id, role='admin'))
    db.query(OrganisationMember).filter_by(organisation_id=org.id, user_id=target.id).delete()
    record(
        db,
        actor.id,
        'organisation',
        org.id,
        'ownership.transferred',
        target.id,
        previous_owner=actor.id,
    )
    db.commit()
    return {'owner_id': target.id}
