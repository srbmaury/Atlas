"""Organisation and workspace access management for registered Atlas accounts."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..api_dependencies import database, user
from ..db import (
    ExternalConnection,
    GmailConnection,
    Organisation,
    OrganisationMember,
    SourceHealthCheck,
    User,
    Workspace,
    WorkspaceMember,
)
from ..rbac import (
    connection_owner,
    connection_visible,
    organisation_role,
    require_connection,
    require_organisation,
    require_workspace,
)
from ..schemas import Named

router = APIRouter(prefix='/api')


class OrganisationGrant(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal['admin', 'member']


class WorkspaceGrant(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal['manager', 'editor', 'viewer']


class Sharing(BaseModel):
    shared: bool


def registered_account(db, email):
    target = db.query(User).filter_by(email=email.strip().lower()).first()
    if not target:
        raise HTTPException(
            404, 'No registered Atlas account matches this email. Ask them to register first.'
        )
    return target


def member_data(db, owner_id, members, owner_role):
    owner = db.get(User, owner_id)
    return [{'id': owner.id, 'email': owner.email, 'role': owner_role, 'owner': True}] + [
        {
            'id': member.user_id,
            'email': db.get(User, member.user_id).email,
            'role': member.role,
            'owner': False,
        }
        for member in members
        if member.user_id != owner_id
    ]


@router.get('/organisations')
def organisations(actor=Depends(user), db=Depends(database)):
    ids = db.query(OrganisationMember.organisation_id).filter_by(user_id=actor.id)
    return [
        {'id': org.id, 'name': org.name, 'role': organisation_role(db, actor, org.id)}
        for org in db.query(Organisation)
        .filter((Organisation.owner_id == actor.id) | Organisation.id.in_(ids))
        .order_by(Organisation.created)
    ]


@router.post('/organisations')
def create_organisation(body: Named, actor=Depends(user), db=Depends(database)):
    if not body.name.strip():
        raise HTTPException(422, 'Organisation name is required.')
    org = Organisation(owner_id=actor.id, name=body.name.strip())
    db.add(org)
    db.commit()
    return {'id': org.id, 'name': org.name, 'role': 'owner'}


@router.get('/organisations/{organisation_id}/members')
def organisation_members(organisation_id: str, actor=Depends(user), db=Depends(database)):
    org = require_organisation(db, actor, organisation_id)
    return member_data(
        db,
        org.owner_id,
        db.query(OrganisationMember).filter_by(organisation_id=org.id).all(),
        'owner',
    )


@router.put('/organisations/{organisation_id}/members')
def grant_organisation_member(
    organisation_id: str, body: OrganisationGrant, actor=Depends(user), db=Depends(database)
):
    org = require_organisation(db, actor, organisation_id, manage=True)
    target = registered_account(db, body.email)
    if target.id == org.owner_id:
        raise HTTPException(409, 'The organisation owner role cannot be changed.')
    row = db.get(OrganisationMember, (org.id, target.id))
    if row:
        row.role = body.role
    else:
        db.add(OrganisationMember(organisation_id=org.id, user_id=target.id, role=body.role))
    db.commit()
    return {'ok': True}


@router.delete('/organisations/{organisation_id}/members/{member_id}')
def remove_organisation_member(
    organisation_id: str, member_id: str, actor=Depends(user), db=Depends(database)
):
    org = require_organisation(db, actor, organisation_id, manage=True)
    if member_id == org.owner_id:
        raise HTTPException(409, 'The organisation owner cannot be removed.')
    if db.query(Workspace).filter_by(organisation_id=org.id, owner_id=member_id).first():
        raise HTTPException(
            409,
            'This member owns organisation workspaces. Delete those workspaces before removing the member.',
        )
    ids = [row.id for row in db.query(Workspace).filter_by(organisation_id=org.id)]
    for workspace_id in ids:
        revoke_workspace(db, workspace_id, member_id)
    db.query(OrganisationMember).filter_by(organisation_id=org.id, user_id=member_id).delete()
    db.commit()
    return {'ok': True}


def revoke_workspace(db, workspace_id, member_id):
    db.query(WorkspaceMember).filter_by(workspace_id=workspace_id, user_id=member_id).delete()
    # Revocation must also stop the workspace using that member's shared credentials.
    for model in (ExternalConnection, GmailConnection):
        db.query(model).filter_by(workspace_id=workspace_id, connected_by=member_id).update(
            {'shared': False}
        )
    db.query(SourceHealthCheck).filter_by(workspace_id=workspace_id).delete()


@router.get('/workspaces/{workspaceId}/members')
def workspace_members(workspaceId: str, actor=Depends(user), db=Depends(database)):
    item = require_workspace(db, actor, workspaceId, 'manager')
    return member_data(
        db,
        item.owner_id,
        db.query(WorkspaceMember).filter_by(workspace_id=item.id).all(),
        'manager',
    )


@router.put('/workspaces/{workspaceId}/members')
def grant_workspace_member(
    workspaceId: str, body: WorkspaceGrant, actor=Depends(user), db=Depends(database)
):
    item = require_workspace(db, actor, workspaceId, 'manager')
    target = registered_account(db, body.email)
    if target.id == item.owner_id:
        raise HTTPException(409, 'The workspace owner must remain a manager.')
    if item.organisation_id and not organisation_role(db, target, item.organisation_id):
        raise HTTPException(
            422, 'Add this account to the organisation before granting workspace access.'
        )
    row = db.get(WorkspaceMember, (item.id, target.id))
    if row:
        row.role = body.role
    else:
        db.add(WorkspaceMember(workspace_id=item.id, user_id=target.id, role=body.role))
    db.commit()
    return {'ok': True}


@router.delete('/workspaces/{workspaceId}/members/{member_id}')
def remove_workspace_member(
    workspaceId: str, member_id: str, actor=Depends(user), db=Depends(database)
):
    item = require_workspace(db, actor, workspaceId, 'manager')
    if member_id == item.owner_id:
        raise HTTPException(409, 'The workspace owner cannot be removed.')
    revoke_workspace(db, workspaceId, member_id)
    db.commit()
    return {'ok': True}


@router.get('/workspaces/{workspaceId}/connection-sharing')
def connection_sharing(workspaceId: str, actor=Depends(user), db=Depends(database)):
    require_workspace(db, actor, workspaceId, 'manager')
    rows = db.query(ExternalConnection).filter_by(workspace_id=workspaceId).all()
    gmail = db.get(GmailConnection, workspaceId)
    if gmail:
        rows.append(gmail)
    return [
        {
            'provider': getattr(row, 'provider', 'gmail'),
            'shared': row.shared,
            'owned': connection_owner(db, row) == actor.id,
        }
        for row in rows
        if connection_visible(db, actor, row)
    ]


@router.patch('/workspaces/{workspaceId}/connection-sharing/{provider}')
def share_connection(
    workspaceId: str, provider: str, body: Sharing, actor=Depends(user), db=Depends(database)
):
    require_workspace(db, actor, workspaceId, 'manager')
    row = (
        db.get(GmailConnection, workspaceId)
        if provider == 'gmail'
        else db.get(ExternalConnection, (workspaceId, provider))
    )
    if not row:
        raise HTTPException(404, 'Connection not found.')
    require_connection(db, actor, row, manage=True)
    row.shared = body.shared
    health = db.get(SourceHealthCheck, (workspaceId, provider))
    if health:
        db.delete(health)
    db.commit()
    return {'provider': provider, 'shared': row.shared}
