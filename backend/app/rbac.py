"""Explicit workspace membership; organisation administration never grants content access."""

from fastapi import HTTPException, Request

from .db import (
    ExternalConnection,
    GmailConnection,
    Organisation,
    OrganisationMember,
    Session,
    SourceGrant,
    Workspace,
    WorkspaceMember,
)

WORKSPACE_LEVELS = {'viewer': 1, 'editor': 2, 'manager': 3}


def organisation_role(db, actor, organisation_id):
    org = db.get(Organisation, organisation_id)
    if not org:
        return None
    if org.owner_id == actor.id:
        return 'owner'
    member = db.get(OrganisationMember, (organisation_id, actor.id))
    return member.role if member else None


def lock_resource(db, model, resource_id):
    """Serialize transfers, grants and revocations on their shared parent resource."""
    if db.get_bind().dialect.name == 'sqlite':
        connection = db.connection()
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql('BEGIN IMMEDIATE')
    return db.query(model).filter_by(id=resource_id).populate_existing().with_for_update().first()


def require_organisation(db, actor, organisation_id, manage=False, lock=False):
    if lock:
        lock_resource(db, Organisation, organisation_id)
    role = organisation_role(db, actor, organisation_id)
    if role is None:
        raise HTTPException(404, 'Organisation not found.')
    if manage and role not in ('owner', 'admin'):
        raise HTTPException(403, 'Organisation administrator access is required.')
    return db.get(Organisation, organisation_id)


def workspace_role(db, actor, item):
    # Removing organisation membership immediately revokes workspace access too.
    if item.organisation_id and not organisation_role(db, actor, item.organisation_id):
        return None
    if item.owner_id == actor.id:
        return 'manager'
    member = db.get(WorkspaceMember, (item.id, actor.id))
    return member.role if member else None


def require_workspace(db, actor, workspace_id, minimum='viewer', lock=False):
    item = db.get(Workspace, workspace_id)
    if lock and item:
        if item.organisation_id:
            lock_resource(db, Organisation, item.organisation_id)
        item = lock_resource(db, Workspace, workspace_id)
    role = workspace_role(db, actor, item) if item else None
    if role is None:
        raise HTTPException(404, 'Workspace not found.')
    if WORKSPACE_LEVELS[role] < WORKSPACE_LEVELS[minimum]:
        raise HTTPException(403, f'Workspace {minimum} access is required.')
    return item


def connection_owner(db, row):
    return row.connected_by or db.get(Workspace, row.workspace_id).owner_id


def connection_visible(db, actor, row):
    if row is None:
        return False
    item = db.get(Workspace, row.workspace_id)
    if not item or not workspace_role(db, actor, item):
        return False
    return bool(
        row.shared
        or connection_owner(db, row) == actor.id
        or db.get(SourceGrant, (row.workspace_id, getattr(row, 'provider', 'gmail'), actor.id))
    )


def require_connection(db, actor, row, manage=False):
    if row is None:
        return
    # Only the credential owner can opt in to sharing, replace, or disconnect it.
    if manage and connection_owner(db, row) != actor.id:
        raise HTTPException(403, 'Only the connection owner can manage this credential.')
    if not connection_visible(db, actor, row):
        raise HTTPException(403, 'This connection is private to its owner.')


def connection_for_change(db, actor, workspace_id, provider):
    require_workspace(db, actor, workspace_id, 'manager', lock=True)
    model = GmailConnection if provider == 'gmail' else ExternalConnection
    query = db.query(model).filter_by(workspace_id=workspace_id)
    if provider != 'gmail':
        query = query.filter_by(provider=provider)
    row = query.populate_existing().first()
    require_connection(db, actor, row, manage=True)
    return row


def revalidate_access(workspace_id, actor, providers=()):
    """Check a fresh session before releasing results after slow provider calls."""
    with Session() as db:
        require_workspace(db, actor, workspace_id)
        for provider in providers:
            if provider == 'documents':
                continue
            row = (
                db.get(GmailConnection, workspace_id)
                if provider == 'gmail'
                else db.get(ExternalConnection, (workspace_id, provider))
            )
            if row is None:
                raise HTTPException(409, 'A source was disconnected during this answer. Ask again.')
            require_connection(db, actor, row)


def workspace_permission(minimum='viewer', *, provider=None, manage_connection=False):
    """Declare the required role on each route; URL spelling never selects a role."""
    if minimum not in WORKSPACE_LEVELS:
        raise ValueError('Unknown workspace role')

    def authorize(request: Request):
        from .gmail import actor

        workspace_id = request.path_params.get('workspaceId') or request.query_params.get(
            'workspaceId'
        )
        if not workspace_id:
            raise HTTPException(422, 'Workspace ID is required.')
        with Session() as db:
            who = actor(request, db)
            require_workspace(db, who, workspace_id, minimum)
            if manage_connection:
                name = provider or request.path_params.get('provider')
                if not name:
                    raise HTTPException(422, 'Source provider is required.')
                row = (
                    db.get(GmailConnection, workspace_id)
                    if name == 'gmail'
                    else db.get(ExternalConnection, (workspace_id, name))
                )
                require_connection(db, who, row, manage=True)

    authorize.workspace_role = minimum
    return authorize


def organisation_permission(manage=False):
    def authorize(request: Request):
        from .gmail import actor

        with Session() as db:
            require_organisation(
                db, actor(request, db), request.path_params['organisation_id'], manage
            )

    return authorize
