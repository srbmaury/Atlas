"""Queued research dispatch and workspace access revocation regression tests."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app import agent_studio


def test_worker_does_not_execute_without_claim(monkeypatch):
    session = MagicMock()
    monkeypatch.setattr(agent_studio, 'Session', lambda: session)
    monkeypatch.setattr(agent_studio, 'claim', lambda model, **kwargs: None)
    assert agent_studio.execute_one_research_run() is False


def test_queued_run_revalidates_workspace_access(monkeypatch):
    run = SimpleNamespace(
        id='run-1',
        workspace_id='workspace-1',
        question='What changed?',
        actor_id='user-1',
        status='processing',
        result=None,
    )
    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = run
    db.get.return_value = SimpleNamespace(id='user-1')
    session = MagicMock()
    session.__enter__.return_value = db
    monkeypatch.setattr(agent_studio, 'Session', lambda: session)
    monkeypatch.setattr(agent_studio, 'claim', lambda model, **kwargs: ('run-1', 1))

    def deny(*args):
        raise HTTPException(403, 'revoked')

    monkeypatch.setattr(agent_studio, 'require_workspace', deny)
    assert agent_studio.execute_one_research_run() is True
    assert run.status == 'failed'
    assert run.result['error'] == 'Workspace access is no longer authorized.'
    assert db.commit.call_count == 2
