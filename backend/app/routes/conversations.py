"""Conversation persistence endpoints."""

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..agents.sources import require_saved_evidence_access
from ..api_dependencies import database, user, workspace
from ..db import Conversation
from ..schemas import ConversationPayload, ConversationRename
from ..security.rbac import workspace_permission

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


def visible_messages(item, actor=None):
    visible = []
    for message in item.messages or []:
        if not isinstance(message, dict) or message.get('_atlas_metadata'):
            continue
        entry = dict(message)
        agent = entry.get('agent')
        if actor is not None and isinstance(agent, dict):
            # Legacy agent messages lack the provenance needed to safely recheck grants.
            # Fail closed rather than returning evidence after a source is revoked.
            has_provenance = 'providers' in agent and 'scope_fingerprints' in agent
            if not has_provenance:
                visible.append(
                    {
                        'role': entry.get('role', 'assistant'),
                        'content': 'This older agent response is hidden because its source permissions cannot be verified.',
                        'agent': {'id': agent.get('id'), 'name': agent.get('name')},
                    }
                )
                continue
            providers = set(agent.get('providers') or [])
            if not providers:
                providers = set((entry.get('result') or {}).get('scope') or [])
            providers.discard('documents')
            if providers:
                try:
                    require_saved_evidence_access(
                        item.workspace_id, actor, providers, agent.get('scope_fingerprints')
                    )
                except HTTPException:
                    entry = {
                        'role': entry.get('role', 'assistant'),
                        'content': 'This agent response is hidden because connected-source access has changed.',
                        'agent': {'id': agent.get('id'), 'name': agent.get('name')},
                    }
        visible.append(entry)
    return visible


def conversation_data(item, actor=None):
    return {
        'id': item.id,
        'title': item.title,
        'messages': visible_messages(item, actor),
        'created': item.created,
        'updated': item.updated,
        'pinned': bool((item.messages or [{}])[0].get('_atlas_pinned')) if item.messages else False,
        'archived': bool((item.messages or [{}])[0].get('_atlas_archived'))
        if item.messages
        else False,
    }


@router.get(
    '/api/workspaces/{workspaceId}/conversations',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def list_conversations(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    items = (
        db.query(Conversation)
        .filter_by(workspace_id=workspaceId, author_id=actor.id)
        .order_by(Conversation.updated.desc())
        .all()
    )
    return [
        {
            'id': item.id,
            'title': item.title,
            'updated': item.updated,
            'pinned': bool(item.messages and item.messages[0].get('_atlas_pinned')),
            'archived': bool(item.messages and item.messages[0].get('_atlas_archived')),
        }
        for item in items
    ]


class ConversationOrganization(BaseModel):
    pinned: bool | None = None
    archived: bool | None = None


@router.patch(
    '/api/workspaces/{workspaceId}/conversations/{cid}/organization',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def organize_conversation(
    workspaceId: str,
    cid: str,
    body: ConversationOrganization,
    actor=Depends(user),
    db=Depends(database),
):
    item = owned_conversation(workspaceId, cid, actor, db)
    messages = [dict(message) for message in (item.messages or [])]
    # Preserve organization in the existing JSON column without a destructive
    # schema migration. Metadata is not exposed to the language model.
    if not messages:
        messages = [{'_atlas_metadata': True}]
    if not messages[0].get('_atlas_metadata'):
        messages.insert(0, {'_atlas_metadata': True})
    first = messages[0]
    if body.pinned is not None:
        first['_atlas_pinned'] = body.pinned
        if body.pinned:
            first['_atlas_archived'] = False
    if body.archived is not None:
        first['_atlas_archived'] = body.archived
        if body.archived:
            first['_atlas_pinned'] = False
    item.messages = messages
    db.commit()
    return conversation_data(item, actor)


@router.get(
    '/api/workspaces/{workspaceId}/conversations/search',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def search_conversation_messages(
    workspaceId: str, q: str = '', actor=Depends(user), db=Depends(database)
):
    """Search only the requesting user's conversations; return bounded excerpts."""
    workspace(workspaceId, actor, db)
    needle = q.strip().casefold()
    if len(needle) < 2:
        return {'results': []}
    if len(needle) > 200:
        raise HTTPException(422, 'Search query must be at most 200 characters.')
    items = (
        db.query(Conversation)
        .filter_by(workspace_id=workspaceId, author_id=actor.id)
        .order_by(Conversation.updated.desc())
        .limit(500)
        .all()
    )
    results = []
    for item in items:
        for index, message in enumerate(visible_messages(item, actor)):
            if not isinstance(message, dict):
                continue
            content = message.get('content')
            if not isinstance(content, str):
                continue
            offset = content.casefold().find(needle)
            if offset < 0:
                continue
            start = max(0, offset - 75)
            results.append(
                {
                    'chat_id': item.id,
                    'title': item.title,
                    'message_index': index,
                    'role': message.get('role', ''),
                    'excerpt': content[start : start + 220],
                }
            )
            if len(results) >= 50:
                return {'results': results}
    return {'results': results}


@router.post(
    '/api/workspaces/{workspaceId}/conversations',
    dependencies=[Depends(workspace_permission('viewer'))],
)
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


@router.get(
    '/api/workspaces/{workspaceId}/conversations/{cid}',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def get_conversation(workspaceId: str, cid: str, actor=Depends(user), db=Depends(database)):
    return conversation_data(owned_conversation(workspaceId, cid, actor, db))


@router.put(
    '/api/workspaces/{workspaceId}/conversations/{cid}',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def update_conversation(
    workspaceId: str, cid: str, body: ConversationPayload, actor=Depends(user), db=Depends(database)
):
    item = owned_conversation(workspaceId, cid, actor, db)
    item.title = body.title.strip()
    metadata = (item.messages or [{}])[0]
    prefix = (
        [
            {key: metadata[key] for key in ('_atlas_pinned', '_atlas_archived') if key in metadata}
            | {'_atlas_metadata': True}
        ]
        if any(key in metadata for key in ('_atlas_pinned', '_atlas_archived'))
        else []
    )
    item.messages = prefix + body.messages
    item.updated = time.time()
    db.commit()
    return conversation_data(item)


@router.patch(
    '/api/workspaces/{workspaceId}/conversations/{cid}',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def rename_conversation(
    workspaceId: str, cid: str, body: ConversationRename, actor=Depends(user), db=Depends(database)
):
    item = owned_conversation(workspaceId, cid, actor, db)
    item.title = body.title.strip()
    item.updated = time.time()
    db.commit()
    return conversation_data(item)


@router.delete(
    '/api/workspaces/{workspaceId}/conversations/{cid}',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def delete_conversation(workspaceId: str, cid: str, actor=Depends(user), db=Depends(database)):
    db.delete(owned_conversation(workspaceId, cid, actor, db))
    db.commit()
    return {'ok': True}
