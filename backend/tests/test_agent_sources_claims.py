from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.agents.claims import assess_claims, verify_claims
from app.agents.models import CreateAgent
from app.agents.sources import validate_sources


def test_claims_without_citations_are_not_verified():
    result = verify_claims('LangChain is a framework.', [{'text': 'LangChain is a framework.'}])
    assert result['verified'] == 0
    assert result['unsupported'] == 1


def test_cited_claim_is_only_candidate_not_verified():
    result = verify_claims('LangChain is a framework [1].', [{'text': 'LangChain is a framework.'}])
    assert result['verified'] == 0
    assert result['claims'][0]['source_ids'] == [1]


def test_source_selection_rejects_empty_scope():
    body = CreateAgent(name='A', include_documents=False)
    with pytest.raises(HTTPException) as exc:
        validate_sources(None, 'workspace', body)
    assert exc.value.status_code == 422


def test_source_selection_rejects_unknown_provider():
    body = CreateAgent(name='A', providers=['not-a-real-provider'])
    with pytest.raises(HTTPException) as exc:
        validate_sources(None, 'workspace', body)
    assert exc.value.status_code == 422


def test_document_selection_is_workspace_scoped():
    body = CreateAgent(name='A', document_ids=['other-workspace-doc'])
    with patch('app.agents.sources.Document') as document:
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 0
        with pytest.raises(HTTPException) as exc:
            validate_sources(db, 'workspace', body)
        assert exc.value.status_code == 404
        assert document.id is not None


def test_model_assesses_cited_claim_without_claiming_independent_verification():
    with (
        patch('app.ai.enabled', return_value=True),
        patch('app.ai.config.AI_PROVIDER', 'openai'),
        patch('app.ai.client') as client,
    ):
        client.return_value.responses.create.return_value.output_text = (
            '{"assessments":[{"id":1,"status":"supported","reason":"The passage states this."}]}'
        )
        result = assess_claims(
            'LangChain is a framework [1].', [{'text': 'LangChain is a framework.'}]
        )
    assert result['method'] == 'llm_entailment_assessment'
    assert result['claims'][0]['status'] == 'supported'
    assert result['verified'] == 0


def test_agent_source_config_excludes_unavailable_provider():
    from app.agents.sources import authorized_source_config

    actor = MagicMock()
    db = MagicMock()
    with patch(
        'app.agents.sources.require_connection', side_effect=HTTPException(403, 'Forbidden')
    ):
        result = authorized_source_config(
            db,
            'workspace',
            actor,
            {
                'include_documents': True,
                'include_gmail': True,
                'providers': ['github'],
                'scope_fingerprints': {},
            },
        )
    assert result['include_documents'] is True
    assert result['providers'] == []
    assert result['include_gmail'] is False


def test_revoked_agent_evidence_hidden_from_saved_conversation():
    from app.routes.conversations import visible_messages

    conversation = MagicMock()
    conversation.workspace_id = 'workspace'
    conversation.messages = [
        {'role': 'user', 'content': 'Question'},
        {
            'role': 'assistant',
            'content': 'Secret source excerpt',
            'agent': {
                'id': 'a',
                'name': 'Researcher',
                'providers': ['github'],
                'scope_fingerprints': {},
            },
            'result': {'sources': [{'text': 'Secret source excerpt'}]},
        },
    ]
    with patch(
        'app.routes.conversations.require_saved_evidence_access',
        side_effect=HTTPException(403, 'Forbidden'),
    ):
        result = visible_messages(conversation, MagicMock())
    assert result[0]['content'] == 'Question'
    assert 'Secret source excerpt' not in str(result[1])
    assert 'hidden' in result[1]['content']


def test_legacy_agent_answer_without_provenance_is_hidden():
    from app.routes.conversations import visible_messages

    conversation = MagicMock()
    conversation.workspace_id = 'workspace'
    conversation.messages = [
        {
            'role': 'assistant',
            'content': 'Historical connected-source secret',
            'agent': {'id': 'agent-1', 'name': 'Researcher'},
            'result': {'sources': [{'text': 'Historical connected-source secret'}]},
        }
    ]
    visible = visible_messages(conversation, MagicMock())
    assert len(visible) == 1
    assert 'Historical connected-source secret' not in str(visible)
    assert 'cannot be verified' in visible[0]['content']
