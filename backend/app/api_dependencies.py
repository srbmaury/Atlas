"""Shared authentication and workspace authorization dependencies."""

import hashlib
import time

from fastapi import Depends, HTTPException, Request

from .db import Document, Login, Session, User, Workspace


def database():
    with Session() as db:
        yield db


def user(request: Request, db=Depends(database)):
    token = request.cookies.get('atlas_session', '')
    login = db.get(Login, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if not login or login.expires < time.time():
        raise HTTPException(401, 'Sign in to continue.')
    return db.get(User, login.user_id)


def workspace(workspace_id: str, actor: User, db: Session) -> Workspace:
    from .rbac import require_workspace

    return require_workspace(db, actor, workspace_id)


def document(workspace_id: str, document_id: str, actor: User, db: Session) -> Document:
    workspace(workspace_id, actor, db)
    item = db.query(Document).filter_by(id=document_id, workspace_id=workspace_id).first()
    if not item:
        raise HTTPException(404, 'Document not found.')
    return item


def public_doc(item: Document) -> dict:
    result = {
        key: getattr(item, key)
        for key in (
            'id',
            'name',
            'size',
            'status',
            'error',
            'pages',
            'ocr_pages',
            'chunk_count',
            'created',
        )
    }
    result['ocr_pages'] = item.ocr_pages or []
    return result
