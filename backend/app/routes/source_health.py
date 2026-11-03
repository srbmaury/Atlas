"""Connected source status and permission-check endpoints."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from ..api_dependencies import database, user, workspace
from ..db import ExternalConnection, GmailConnection, SourceHealthCheck

router = APIRouter()
log = logging.getLogger(__name__)


@router.get('/api/workspaces/{workspaceId}/sources/health')
def source_health(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return {
        'checks': [
            {
                'provider': row.provider,
                'healthy': row.healthy,
                'matches': row.matches,
                'error': row.error,
                'checked_at': row.checked_at,
            }
            for row in db.query(SourceHealthCheck).filter_by(workspace_id=workspaceId).all()
        ]
    }


@router.post('/api/workspaces/{workspaceId}/sources/health/check')
def verify_sources(workspaceId: str, request: Request, actor=Depends(user), db=Depends(database)):
    """Check real provider access; return only status, account, and match counts."""
    workspace(workspaceId, actor, db)
    from ..drive import access_token as drive_access
    from ..drive import drive_search
    from ..external_sources import PROVIDERS, read_connection, verify_source_access
    from ..gmail import GMAIL_API, gmail_get
    from ..gmail import access_token as gmail_access
    from ..gmail import connection as gmail_connection

    checks = []

    def record(provider, connected, callback, account=None):
        check = {
            'provider': provider,
            'connected': connected,
            'healthy': False,
            'account': account,
            'checked_at': time.time(),
            'matches': None,
            'error': None,
        }
        if not connected:
            check['error'] = 'Not connected.'
        else:
            try:
                check['account'], check['matches'] = callback()
                check['healthy'] = True
            except HTTPException as exc:
                check['error'] = exc.detail
            except Exception as exc:
                log.warning('Source verification failed for %s: %s', provider, type(exc).__name__)
                check['error'] = 'Could not verify access. Check the provider connection and retry.'
        saved = db.get(SourceHealthCheck, (workspaceId, provider))
        if saved is None:
            saved = SourceHealthCheck(
                workspace_id=workspaceId,
                provider=provider,
                checked_at=check['checked_at'],
                healthy=check['healthy'],
            )
            db.add(saved)
        saved.checked_at = check['checked_at']
        saved.healthy = check['healthy']
        saved.matches = check['matches']
        saved.error = (check['error'] or '')[:500] or None
        checks.append(check)

    for provider in PROVIDERS:
        row = db.get(ExternalConnection, (workspaceId, provider))
        if row:

            def check_external(p=provider):
                _, token = read_connection(db, actor, workspaceId, p)
                return verify_source_access(p, token)

            record(provider, True, check_external, row.account)
        else:
            record(provider, False, lambda: None)

    gmail_row = db.query(GmailConnection).filter_by(workspace_id=workspaceId).first()
    if gmail_row:

        def check_gmail():
            entry = gmail_connection(db, actor, workspaceId)
            token = gmail_access(entry, db)
            items = gmail_get(
                token, GMAIL_API + '/messages', {'q': 'newer_than:30d', 'maxResults': 1}
            ).get('messages', [])
            return entry.email, len(items)

        record('gmail', True, check_gmail, gmail_row.email)
    else:
        record('gmail', False, lambda: None)

    drive_row = db.get(ExternalConnection, (workspaceId, 'drive'))
    if drive_row:

        def check_drive():
            token = drive_access(db, actor, workspaceId)
            return drive_row.account, len(drive_search(token, ''))

        record('drive', True, check_drive, drive_row.account)
    else:
        record('drive', False, lambda: None)
    db.commit()
    return {'checks': checks}
