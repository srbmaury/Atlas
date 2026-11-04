"""Conversation persistence endpoints."""

import time

from fastapi import APIRouter, Depends, HTTPException

from ..api_dependencies import database, user, workspace
from ..db import Conversation
from ..schemas import ConversationPayload, ConversationRename

router = APIRouter()


def owned_conversation(workspace_id, conversation_id, actor, db):
    workspace(workspace_id, actor, db)
    item = (
        db.query(Conversation)
        .filter_by(id=conversation_id, workspace_id=workspace_id, author_id=actor.id)
        .first()
    )
    if item is None:
        raise HTTPException(404, 'Conversation not found.')
    return item


def conversation_data(item):
    return {
        'id': item.id,
        'title': item.title,
        'messages': item.messages or [],
        'created': item.created,
        'updated': item.updated,
    }


@router.get('/api/workspaces/{workspaceId}/conversations')
def list_conversations(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    items = (
        db.query(Conversation)
        .filter_by(workspace_id=workspaceId, author_id=actor.id)
        .order_by(Conversation.updated.desc())
        .all()
    )
    return [{'id': item.id, 'title': item.title, 'updated': item.updated} for item in items]


@router.post('/api/workspaces/{workspaceId}/conversations')
def create_conversation(
    workspaceId: str, body: ConversationPayload, actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
    item = Conversation(
        workspace_id=workspaceId,
        author_id=actor.id,
        title=body.title.strip(),
        messages=body.messages,
    )
    db.add(item)
    db.commit()
    return conversation_data(item)


@router.get('/api/workspaces/{workspaceId}/conversations/{cid}')
def get_conversation(workspaceId: str, cid: str, actor=Depends(user), db=Depends(database)):
    return conversation_data(owned_conversation(workspaceId, cid, actor, db))


@router.put('/api/workspaces/{workspaceId}/conversations/{cid}')
def update_conversation(
    workspaceId: str, cid: str, body: ConversationPayload, actor=Depends(user), db=Depends(database)
):
    item = owned_conversation(workspaceId, cid, actor, db)
    item.title = body.title.strip()
    item.messages = body.messages
    item.updated = time.time()
    db.commit()
    return conversation_data(item)


@router.patch('/api/workspaces/{workspaceId}/conversations/{cid}')
def rename_conversation(
    workspaceId: str, cid: str, body: ConversationRename, actor=Depends(user), db=Depends(database)
):
    item = owned_conversation(workspaceId, cid, actor, db)
    item.title = body.title.strip()
    item.updated = time.time()
    db.commit()
    return conversation_data(item)


@router.delete('/api/workspaces/{workspaceId}/conversations/{cid}')
def delete_conversation(workspaceId: str, cid: str, actor=Depends(user), db=Depends(database)):
    db.delete(owned_conversation(workspaceId, cid, actor, db))
    db.commit()
    return {'ok': True}
