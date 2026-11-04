"""Append security metadata in the same transaction as the access change.

Never record credentials, OAuth codes, prompts, source excerpts, or request bodies.
There are intentionally no API routes for editing or deleting these events.
"""

from .db import AccessEvent, SourceGrant, Workspace


def record(db, actor_id, scope_type, scope_id, action, target_id=None, **details):
    item = db.get(Workspace, scope_id) if scope_type == 'workspace' else None
    db.add(
        AccessEvent(
            scope_type=scope_type,
            scope_id=scope_id,
            organisation_id=item.organisation_id
            if item
            else (scope_id if scope_type == 'organisation' else None),
            actor_id=actor_id,
            action=action,
            target_id=target_id,
            details=details,
        )
    )


def reset_grants(db, workspace_id, provider):
    db.query(SourceGrant).filter_by(workspace_id=workspace_id, provider=provider).delete(
        synchronize_session=False
    )
