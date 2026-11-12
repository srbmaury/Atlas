from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.agent_claims import verify_claims
from app.agent_studio import CreateAgent, validate_sources


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
    with patch('app.agent_studio.Document') as document:
        db = __import__('unittest.mock', fromlist=['MagicMock']).MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 0
        with pytest.raises(HTTPException) as exc:
            validate_sources(db, 'workspace', body)
        assert exc.value.status_code == 404
        assert document.id is not None
