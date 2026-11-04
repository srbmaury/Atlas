"""Organisation and workspace access management for registered Atlas accounts."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..access_audit import record, reset_grants
from ..api_dependencies import database, user
from ..db import (
    ExternalConnection,
    GmailConnection,
    Organisation,
    OrganisationMember,
    SourceGrant,
    SourceHealthCheck,
    User,
    Workspace,
    WorkspaceMember,
)
from ..rbac import (
    connection_owner,
    connection_visible,
    organisation_permission,
    organisation_role,
    require_connection,
    require_organisation,
    require_workspace,
    workspace_permission,
    workspace_role,
)
from ..schemas import Named
from .access_ownership import router as ownership_router
from .security_audit import router as audit_router

router = APIRouter(prefix='/api')
router.include_router(ownership_router)
router.include_router(audit_router)


class OrganisationGrant(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal['admin', 'member']


class WorkspaceGrant(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal['manager', 'editor', 'viewer']


class Sharing(BaseModel):
    shared: bool
    member_ids: list[str] = Field(default_factory=list, max_length=2000)


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
    db.flush()
    record(db, actor.id, 'organisation', org.id, 'organisation.created')
    db.commit()
    return {'id': org.id, 'name': org.name, 'role': 'owner'}


@router.get(
    '/organisations/{organisation_id}/members', dependencies=[Depends(organisation_permission())]
)
def organisation_members(organisation_id: str, actor=Depends(user), db=Depends(database)):
    org = require_organisation(db, actor, organisation_id)
    return member_data(
        db,
        org.owner_id,
        db.query(OrganisationMember).filter_by(organisation_id=org.id).all(),
        'owner',
    )


@router.put(
    '/organisations/{organisation_id}/members',
    dependencies=[Depends(organisation_permission(manage=True))],
)
def grant_organisation_member(
    organisation_id: str, body: OrganisationGrant, actor=Depends(user), db=Depends(database)
):
    org = require_organisation(db, actor, organisation_id, manage=True)
    target = registered_account(db, body.email)
    if target.id == org.owner_id:
        raise HTTPException(409, 'The organisation owner role cannot be changed.')
    row = db.get(OrganisationMember, (org.id, target.id))
    previous = row.role if row else None
    if row:
        row.role = body.role
    else:
        db.add(OrganisationMember(organisation_id=org.id, user_id=target.id, role=body.role))
    record(
        db,
        actor.id,
        'organisation',
        org.id,
        'member.granted',
        target.id,
        previous_role=previous,
        role=body.role,
    )
    db.commit()
    return {'ok': True}


@router.delete(
    '/organisations/{organisation_id}/members/{member_id}',
    dependencies=[Depends(organisation_permission(manage=True))],
)
def remove_organisation_member(
    organisation_id: str, member_id: str, actor=Depends(user), db=Depends(database)
):
    org = require_organisation(db, actor, organisation_id, manage=True)
    if member_id == org.owner_id:
        raise HTTPException(409, 'The organisation owner cannot be removed.')
    if db.query(Workspace).filter_by(organisation_id=org.id, owner_id=member_id).first():
        raise HTTPException(
            409,
            'Transfer ownership of this member’s organisation workspaces before removing the member.',
        )
    ids = [row.id for row in db.query(Workspace).filter_by(organisation_id=org.id)]
    for workspace_id in ids:
        revoke_workspace(db, workspace_id, member_id, actor.id)
    db.query(OrganisationMember).filter_by(organisation_id=org.id, user_id=member_id).delete()
    record(db, actor.id, 'organisation', org.id, 'member.removed', member_id)
    db.commit()
    return {'ok': True}


def revoke_workspace(db, workspace_id, member_id, actor_id):
    db.query(WorkspaceMember).filter_by(workspace_id=workspace_id, user_id=member_id).delete()
    # Revocation must also stop the workspace using that member's shared credentials.
    db.query(SourceGrant).filter_by(workspace_id=workspace_id, user_id=member_id).delete()
    for model in (ExternalConnection, GmailConnection):
        for row in db.query(model).filter_by(workspace_id=workspace_id, connected_by=member_id):
            provider = getattr(row, 'provider', 'gmail')
            reset_grants(db, workspace_id, provider)
            row.shared = False
            record(
                db,
                actor_id,
                'workspace',
                workspace_id,
                'source.access_revoked',
                member_id,
                provider=provider,
            )
    db.query(SourceHealthCheck).filter_by(workspace_id=workspace_id).delete()
    record(db, actor_id, 'workspace', workspace_id, 'member.removed', member_id)


@router.get(
    '/workspaces/{workspaceId}/members', dependencies=[Depends(workspace_permission('manager'))]
)
def workspace_members(workspaceId: str, actor=Depends(user), db=Depends(database)):
    item = require_workspace(db, actor, workspaceId, 'manager')
    return member_data(
        db,
        item.owner_id,
        db.query(WorkspaceMember).filter_by(workspace_id=item.id).all(),
        'manager',
    )


@router.put(
    '/workspaces/{workspaceId}/members', dependencies=[Depends(workspace_permission('manager'))]
)
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
    previous = row.role if row else None
    if row:
        row.role = body.role
    else:
        db.add(WorkspaceMember(workspace_id=item.id, user_id=target.id, role=body.role))
    record(
        db,
        actor.id,
        'workspace',
        item.id,
        'member.granted',
        target.id,
        previous_role=previous,
        role=body.role,
    )
    db.commit()
    return {'ok': True}


@router.delete(
    '/workspaces/{workspaceId}/members/{member_id}',
    dependencies=[Depends(workspace_permission('manager'))],
)
def remove_workspace_member(
    workspaceId: str, member_id: str, actor=Depends(user), db=Depends(database)
):
    item = require_workspace(db, actor, workspaceId, 'manager')
    if member_id == item.owner_id:
        raise HTTPException(409, 'The workspace owner cannot be removed.')
    revoke_workspace(db, workspaceId, member_id, actor.id)
    db.commit()
    return {'ok': True}


@router.get(
    '/workspaces/{workspaceId}/connection-sharing',
    dependencies=[Depends(workspace_permission('manager'))],
)
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
            'member_ids': [
                g.user_id
                for g in db.query(SourceGrant).filter_by(
                    workspace_id=workspaceId, provider=getattr(row, 'provider', 'gmail')
                )
            ]
            if connection_owner(db, row) == actor.id
            else [],
        }
        for row in rows
        if connection_visible(db, actor, row)
    ]


@router.patch(
    '/workspaces/{workspaceId}/connection-sharing/{provider}',
    dependencies=[Depends(workspace_permission('manager'))],
)
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
    ids = set(body.member_ids)
    if body.shared and ids:
        raise HTTPException(422, 'Choose all workspace members or selected members, not both.')
    item = db.get(Workspace, workspaceId)
    for member_id in ids:
        target = db.get(User, member_id)
        if target is None or not workspace_role(db, target, item):
            raise HTTPException(422, 'Every source grantee must be an active workspace member.')
    previous = {
        'shared': row.shared,
        'member_ids': sorted(
            g.user_id
            for g in db.query(SourceGrant).filter_by(workspace_id=workspaceId, provider=provider)
        ),
    }
    reset_grants(db, workspaceId, provider)
    for member_id in ids:
        db.add(SourceGrant(workspace_id=workspaceId, provider=provider, user_id=member_id))
    row.shared = body.shared
    record(
        db,
        actor.id,
        'workspace',
        workspaceId,
        'source.sharing_changed',
        provider,
        previous=previous,
        shared=body.shared,
        member_ids=sorted(ids),
    )
    health = db.get(SourceHealthCheck, (workspaceId, provider))
    if health:
        db.delete(health)
    db.commit()
    return {'provider': provider, 'shared': row.shared, 'member_ids': sorted(ids)}
