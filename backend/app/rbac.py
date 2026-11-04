"""Explicit workspace membership; organisation administration never grants content access."""

from fastapi import HTTPException, Request

from .db import (
    ExternalConnection,
    GmailConnection,
    Organisation,
    OrganisationMember,
    Session,
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


def require_organisation(db, actor, organisation_id, manage=False):
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


def require_workspace(db, actor, workspace_id, minimum='viewer'):
    item = db.get(Workspace, workspace_id)
    role = workspace_role(db, actor, item) if item else None
    if role is None:
        raise HTTPException(404, 'Workspace not found.')
    if WORKSPACE_LEVELS[role] < WORKSPACE_LEVELS[minimum]:
        raise HTTPException(403, f'Workspace {minimum} access is required.')
    return item


def connection_owner(db, row):
    return row.connected_by or db.get(Workspace, row.workspace_id).owner_id


def connection_visible(db, actor, row):
    return bool(row and (row.shared or connection_owner(db, row) == actor.id))


def require_connection(db, actor, row, manage=False):
    if row is None:
        return
    # Only the credential owner can opt in to sharing, replace, or disconnect it.
    if manage and connection_owner(db, row) != actor.id:
        raise HTTPException(403, 'Only the connection owner can manage this credential.')
    if not connection_visible(db, actor, row):
        raise HTTPException(403, 'This connection is private to its owner.')


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


def authorize_workspace_request(request: Request):
    """One fail-closed boundary for modern and legacy workspace API routes.

    Explicit read operations using POST remain available to viewers. Unknown
    mutations require manager access instead of accidentally permitting writes.
    """
    workspace_id = request.path_params.get('workspaceId')
    if not workspace_id and request.url.path in (
        '/api/gmail/status',
        '/api/gmail/connect',
        '/api/drive/connect',
    ):
        workspace_id = request.query_params.get('workspaceId')
    if (
        not workspace_id
        and request.url.path.startswith('/api/connected-oauth/')
        and request.url.path.endswith('/connect')
    ):
        workspace_id = request.query_params.get('workspaceId')
    if not workspace_id:
        return
    path = request.url.path
    suffix = path.split(f'/workspaces/{workspace_id}', 1)[-1]
    minimum = 'viewer'
    if path.endswith('/connect') or '/connected-oauth/' in path:
        minimum = 'manager'
    elif request.method not in ('GET', 'HEAD', 'OPTIONS'):
        read_posts = (
            '/chat',
            '/connected-chat',
            '/connected-chat/stream',
            '/gmail/search',
            '/gmail/summarize',
            '/gmail/summarize-query',
            '/drive/search',
        )
        if suffix in read_posts or (suffix.startswith('/sources/') and suffix.endswith('/search')):
            minimum = 'viewer'
        elif suffix == '/conversations' or suffix.startswith('/conversations/'):
            minimum = 'viewer'  # Routes additionally restrict conversations to their author.
        elif (
            suffix.startswith('/documents')
            or suffix.startswith('/uploads')
            or suffix == '/web-pages'
        ):
            minimum = 'editor'
        else:
            minimum = 'manager'
    from .gmail import actor

    with Session() as db:
        who = actor(request, db)
        require_workspace(db, who, workspace_id, minimum)
        # Protect replacement/disconnect of another person's private credential.
        if minimum == 'manager':
            provider = request.path_params.get('provider')
            if '/gmail' in path:
                provider = 'gmail'
            elif '/drive' in path:
                provider = 'drive'
            if provider:
                row = (
                    db.get(GmailConnection, workspace_id)
                    if provider == 'gmail'
                    else db.get(ExternalConnection, (workspace_id, provider))
                )
                require_connection(db, who, row, manage=True)
