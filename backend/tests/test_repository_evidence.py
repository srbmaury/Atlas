"""Regression tests for evidence-first repository inspection."""

from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app.routes import repository_evidence as module


def test_inspection_returns_real_file_metadata(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'fake-token'))
    monkeypatch.setattr(module, 'accessible_repositories', lambda *args: [{'full_name': 'owner/repo'}])
    monkeypatch.setattr(module, 'ai_enabled', lambda: True)
    monkeypatch.setattr(module, 'generate', lambda question, evidence: {'mode': 'ai', 'answer': 'Atlas is an application [1].'})
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
    assert result['answer'] == 'Atlas is an application [1].'


def test_inspection_rejects_invalid_repository(monkeypatch):
    with pytest.raises(HTTPException) as error:
        module.inspect_repository(
            'workspace', module.RepositoryInspection(repository='not-a-repo', question='Explain architecture'),
            Mock(), actor=Mock(), db=Mock(),
        )
    assert error.value.status_code == 422


def test_inspection_does_not_invent_evidence(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'fake-token'))
    monkeypatch.setattr(module, 'accessible_repositories', lambda *args: [{'full_name': 'owner/empty'}])
    monkeypatch.setattr(module, 'ai_enabled', lambda: True)
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(module, 'github_repository_file_search', lambda *args, **kwargs: [])
    result = module.inspect_repository(
        'workspace', module.RepositoryInspection(repository='owner/empty', question='Explain architecture'),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert result['status'] == 'no_matches'
    assert result['sources'] == []
    assert result['answer'] is None


def test_infer_connected_repository_from_question():
    repos = [{'full_name': 'srbmaury/Atlas'}, {'full_name': 'srbmaury/Other'}]
    assert module.resolve_repository('Explain my Atlas repository', None, repos) == 'srbmaury/Atlas'
    assert module.resolve_repository('Explain the architecture', None, repos) is None


def test_repository_must_belong_to_connected_account():
    with pytest.raises(HTTPException) as error:
        module.resolve_repository('Explain architecture', 'someone/private', [{'full_name': 'owner/repo'}])
    assert error.value.status_code == 404


def test_web_search_requires_server_configuration(monkeypatch):
    monkeypatch.delenv('BRAVE_SEARCH_API_KEY', raising=False)
    with pytest.raises(HTTPException) as error:
        module.search_public_web('latest documentation')
    assert error.value.status_code == 503


def test_failed_citation_still_exposes_original_readme(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'token'))
    monkeypatch.setattr(module, 'accessible_repositories', lambda *args: [{'full_name': 'owner/NEET'}])
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(module, 'ai_enabled', lambda: True)
    monkeypatch.setattr(module, 'generate', lambda *args: {'mode': 'citation_check_failed'})
    monkeypatch.setattr(module, 'github_repository_file_search', lambda *args, **kwargs: [
        {'title': 'owner/NEET/README.md', 'excerpt': 'This project documents its actual features.',
         'metadata': {'path': 'README.md'}, 'url': 'https://github.com/owner/NEET/blob/main/README.md'}
    ])
    result = module.inspect_repository(
        'workspace', module.RepositoryInspection(question='What does NEET do?'),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert result['answer'] is None
    assert result['answer_mode'] == 'citation_check_failed'
    assert result['fallback']['source_id'] == 1
    assert 'actual features' in result['fallback']['text']


def test_citation_failure_retries_with_explicit_source_instructions(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'token'))
    monkeypatch.setattr(module, 'accessible_repositories', lambda *args: [{'full_name': 'owner/NEET'}])
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(module, 'ai_enabled', lambda: True)
    monkeypatch.setattr(module, 'github_repository_file_search', lambda *args, **kwargs: [
        {'title': 'owner/NEET/README.md', 'excerpt': 'A study app for NEET students.',
         'metadata': {'path': 'README.md'}, 'url': 'https://github.com/owner/NEET/blob/main/README.md'}
    ])
    calls = []
    def generate_answer(question, evidence):
        calls.append(question)
        if len(calls) == 1:
            return {'mode': 'citation_check_failed'}
        return {'mode': 'ai', 'answer': 'NEET is a study app [1].'}
    monkeypatch.setattr(module, 'generate', generate_answer)
    result = module.inspect_repository(
        'workspace', module.RepositoryInspection(question='What does NEET do?'),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert len(calls) == 2
    assert 'Cite each factual' in calls[1]
    assert result['answer'] == 'NEET is a study app [1].'


def test_followup_passes_bounded_history_and_retrieves_fresh_evidence(monkeypatch):
    monkeypatch.setattr(module, 'read_connection', lambda *args: (None, 'token'))
    monkeypatch.setattr(module, 'accessible_repositories', lambda *args: [{'full_name': 'owner/repo'}])
    monkeypatch.setattr(module, 'revalidate_access', lambda *args: None)
    monkeypatch.setattr(module, 'ai_enabled', lambda: True)
    searches = []
    monkeypatch.setattr(module, 'github_repository_file_search', lambda token, repo, query, limit: (
        searches.append(query) or [{'title': 'owner/repo/src/main.py', 'excerpt': 'def main(): pass',
                                   'metadata': {'path': 'src/main.py'}}]
    ))
    captured = []
    def fake_generate(question, evidence, history=None):
        captured.append(history)
        return {'mode': 'ai', 'answer': 'The entry point is main [1].'}
    monkeypatch.setattr(module, 'generate', fake_generate)
    result = module.inspect_repository(
        'workspace',
        module.RepositoryInspection(
            repository='owner/repo', question='Where does it start?',
            history=[{'role': 'user', 'content': 'Explain the app'},
                     {'role': 'assistant', 'content': 'The app starts here [1].'}],
        ),
        Mock(), actor=Mock(), db=Mock(),
    )
    assert result['answer'] == 'The entry point is main [1].'
    assert len(searches) == 1
    assert 'Explain the app' in searches[0]
    assert captured[0][0]['role'] == 'user'


def test_repository_followup_reuses_selected_repository():
    repositories = [{'full_name': 'srbmaury/Ecommerce-Search'},
                    {'full_name': 'srbmaury/Atlas'}]
    assert module.resolve_repository(
        'also write file names with each box',
        'srbmaury/Ecommerce-Search',
        repositories,
    ) == 'srbmaury/Ecommerce-Search'


def test_explicit_repository_overrides_conversation_context():
    repositories = [{'full_name': 'srbmaury/Ecommerce-Search'},
                    {'full_name': 'srbmaury/Atlas'}]
    assert module.resolve_repository(
        'Explain repo:srbmaury/Atlas',
        'srbmaury/Ecommerce-Search',
        repositories,
    ) == 'srbmaury/Atlas'
