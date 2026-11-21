"""Source selection and evidence permissions for research agents."""

import hashlib

from fastapi import HTTPException

from ..db import Document, ExternalConnection, GmailConnection, Session
from ..rbac import RESOURCE_SCOPED_PROVIDERS, require_connection, require_workspace, source_scope


def authorized_source_config(db, workspace_id, actor, config):
    """Never expose or use connected providers beyond the requesting user's access."""
    allowed = dict(config)
    providers = []
    for provider in config.get('providers') or []:
        row = db.get(ExternalConnection, (workspace_id, provider))
        try:
            if row is None:
                continue
            require_connection(db, actor, row)
            providers.append(provider)
        except HTTPException:
            continue
    allowed['providers'] = providers
    allowed['include_gmail'] = False
    if config.get('include_gmail'):
        row = db.get(GmailConnection, workspace_id)
        if row is not None:
            try:
                require_connection(db, actor, row)
                allowed['include_gmail'] = True
            except HTTPException:
                pass
    return allowed


def validate_sources(db, workspace_id, body, actor=None):
    from ..external_sources import PROVIDERS

    providers = list(dict.fromkeys(body.providers))
    if any(p not in (*PROVIDERS, 'drive') for p in providers):
        raise HTTPException(422, 'Unknown connected provider.')
    if not body.include_documents and body.document_ids:
        raise HTTPException(422, 'Document selection requires documents to be enabled.')
    if not (body.include_documents or body.include_gmail or providers):
        raise HTTPException(422, 'Select at least one research source.')
    if actor is not None:
        for provider in providers:
            row = db.get(ExternalConnection, (workspace_id, provider))
            if row is None:
                raise HTTPException(404, 'Selected source is not connected.')
            require_connection(db, actor, row)
        if body.include_gmail:
            row = db.get(GmailConnection, workspace_id)
            if row is None:
                raise HTTPException(404, 'Gmail is not connected.')
            require_connection(db, actor, row)
    selected = list(dict.fromkeys(body.document_ids))
    if selected:
        found = (
            db.query(Document.id)
            .filter(Document.workspace_id == workspace_id, Document.id.in_(selected))
            .count()
        )
        if found != len(selected):
            raise HTTPException(404, 'Selected document not found.')
    return {
        'include_documents': body.include_documents,
        'document_ids': selected,
        'include_gmail': body.include_gmail,
        'providers': providers,
    }


def source_scope_fingerprints(scopes):
    """Serializable fingerprints for detecting later resource-grant changes."""
    return {
        provider: hashlib.sha256(repr(scope).encode('utf-8')).hexdigest()
        for provider, scope in (scopes or {}).items()
    }


def require_saved_evidence_access(workspace_id, actor, providers, fingerprints):
    """Revalidate the connection and saved resource scope in the same session."""
    providers = set(providers) - {'documents'}
    if not providers:
        return
    with Session() as db:
        require_workspace(db, actor, workspace_id)
        for provider in providers:
            row = (
                db.get(GmailConnection, workspace_id)
                if provider == 'gmail'
                else db.get(ExternalConnection, (workspace_id, provider))
            )
            if row is None:
                raise HTTPException(403, 'Source connection is no longer available.')
            require_connection(db, actor, row)
            if provider in RESOURCE_SCOPED_PROVIDERS:
                current = source_scope_fingerprints({provider: source_scope(db, actor, row)})
                if current[provider] != (fingerprints or {}).get(provider):
                    raise HTTPException(403, 'Source resource permissions changed.')
