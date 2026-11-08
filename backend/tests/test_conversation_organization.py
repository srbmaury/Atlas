"""Regression tests for conversation organization and evidence-safe message payloads."""
from types import SimpleNamespace

from app.routes.conversations import ConversationOrganization, conversation_data, visible_messages


def test_organization_metadata_not_returned_as_messages():
    item = SimpleNamespace(
        id='chat', title='Example', created=1.0, updated=2.0,
        messages=[
            {'_atlas_metadata': True, '_atlas_pinned': True, '_atlas_archived': False},
            {'role': 'user', 'content': 'Question'},
            {'role': 'assistant', 'content': 'Answer'},
        ],
    )
    data = conversation_data(item)
    assert data['pinned'] is True
    assert data['archived'] is False
    assert data['messages'] == [
        {'role': 'user', 'content': 'Question'},
        {'role': 'assistant', 'content': 'Answer'},
    ]


def test_empty_conversation_has_no_organization_flags():
    item = SimpleNamespace(
        id='empty', title='Empty', created=1.0, updated=2.0, messages=[],
    )
    assert conversation_data(item)['pinned'] is False
    assert conversation_data(item)['archived'] is False
    assert visible_messages(item) == []


def test_partial_organization_patch_distinguishes_false_from_missing():
    assert ConversationOrganization(pinned=False).pinned is False
    assert ConversationOrganization(pinned=False).archived is None
    assert ConversationOrganization(archived=True).archived is True
