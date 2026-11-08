"""Regression tests for evidence-first repository inspection."""

from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app.routes import repository_evidence as module


def test_inspection_returns_real_file_metadata(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'fake-token'))
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(
        module,
        'github_repository_file_search',
        lambda token, repo, query, limit: [
            {
                'title': 'owner/repo/README.md',
                'url': 'https://github.com/owner/repo/blob/main/README.md',
                'excerpt': 'Actual file contents',
                'metadata': {'path': 'README.md'},
            }
        ],
    )
    result = module.inspect_repository(
        'workspace', module.RepositoryInspection(repository='owner/repo', question='Explain architecture'),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert result['status'] == 'evidence_found'
    assert result['count'] == 1
    assert result['sources'][0]['path'] == 'README.md'
    assert result['sources'][0]['excerpt'] == 'Actual file contents'


def test_inspection_rejects_invalid_repository(monkeypatch):
    with pytest.raises(HTTPException) as error:
        module.inspect_repository(
            'workspace', module.RepositoryInspection(repository='not-a-repo', question='Explain architecture'),
            Mock(), actor=Mock(), db=Mock(),
        )
    assert error.value.status_code == 422


def test_inspection_does_not_invent_evidence(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'fake-token'))
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(module, 'github_repository_file_search', lambda *args, **kwargs: [])
    result = module.inspect_repository(
        'workspace', module.RepositoryInspection(repository='owner/empty', question='Explain architecture'),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert result['status'] == 'no_matches'
    assert result['sources'] == []
