"""Read-only, scoped, paginated security history."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..api_dependencies import database, user
from ..db import AccessEvent, User
from ..rbac import (
    organisation_permission,
    require_organisation,
    require_workspace,
    workspace_permission,
)

router = APIRouter()


def audit_page(db, query, limit, cursor):
    from sqlalchemy import and_, or_

    if cursor:
        previous = query.filter(AccessEvent.id == cursor).first()
        if previous is None:
            raise HTTPException(404, 'Audit cursor not found in this scope.')
        query = query.filter(
            or_(
                AccessEvent.created < previous.created,
                and_(AccessEvent.created == previous.created, AccessEvent.id < previous.id),
            )
        )
    rows = query.order_by(AccessEvent.created.desc(), AccessEvent.id.desc()).limit(limit + 1).all()
    identities = {
        row.id: row.email
        for row in db.query(User).filter(
            User.id.in_(
                {event.actor_id for event in rows}
                | {event.target_id for event in rows if event.target_id}
            )
        )
    }
    events = [
        {
            'id': row.id,
            'scope_type': row.scope_type,
            'scope_id': row.scope_id,
            'actor_id': row.actor_id,
            'actor_email': identities.get(row.actor_id),
            'target_email': identities.get(row.target_id),
            'action': row.action,
            'target_id': row.target_id,
            'details': row.details,
            'created': row.created,
        }
        for row in rows[:limit]
    ]
    return {'events': events, 'next_cursor': events[-1]['id'] if len(rows) > limit else None}


@router.get(
    '/workspaces/{workspaceId}/audit', dependencies=[Depends(workspace_permission('manager'))]
)
def workspace_audit(
    workspaceId: str,
    limit: int = Query(50, ge=1, le=100),
    cursor: Optional[str] = None,
    actor=Depends(user),
    db=Depends(database),
):
    require_workspace(db, actor, workspaceId, 'manager')
    return audit_page(
        db,
        db.query(AccessEvent).filter_by(scope_type='workspace', scope_id=workspaceId),
        limit,
        cursor,
    )


@router.get(
    '/organisations/{organisation_id}/audit',
    dependencies=[Depends(organisation_permission(manage=True))],
)
def organisation_audit(
    organisation_id: str,
    limit: int = Query(50, ge=1, le=100),
    cursor: Optional[str] = None,
    actor=Depends(user),
    db=Depends(database),
):
    require_organisation(db, actor, organisation_id, manage=True)
    # Includes access metadata for the organisation's workspaces, never their content.
    return audit_page(
        db, db.query(AccessEvent).filter_by(organisation_id=organisation_id), limit, cursor
    )
