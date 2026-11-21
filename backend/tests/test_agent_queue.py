"""Queued research dispatch and workspace access revocation regression tests."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.agents import execution


def test_worker_does_not_execute_without_claim(monkeypatch):
    session = MagicMock()
    monkeypatch.setattr(execution, 'Session', lambda: session)
    monkeypatch.setattr(execution, 'claim', lambda model, **kwargs: None)
    assert execution.execute_one_research_run() is False


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
    monkeypatch.setattr(execution, 'Session', lambda: session)
    monkeypatch.setattr(execution, 'claim', lambda model, **kwargs: ('run-1', 1))

    def deny(*args):
        raise HTTPException(403, 'revoked')

    monkeypatch.setattr(execution, 'require_workspace', deny)
    assert execution.execute_one_research_run() is True
    assert run.status == 'failed'
    assert run.result['error'] == 'Workspace access is no longer authorized.'
    assert db.commit.call_count == 2


def test_worker_rejects_evidence_from_different_permission_scopes(monkeypatch):
    run = SimpleNamespace(
        id='run-1',
        agent_id='agent-1',
        workspace_id='workspace-1',
        actor_id='user-1',
        question='What changed?',
        status='processing',
    )
    agent = SimpleNamespace(instructions='', output_format='detailed_notes', source_config={})
    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.side_effect = [run, agent]
    db.get.return_value = SimpleNamespace(id='user-1')
    session = MagicMock()
    session.__enter__.return_value = db

    monkeypatch.setattr(execution, 'Session', lambda: session)
    monkeypatch.setattr(execution, 'claim', lambda *args, **kwargs: (run.id, 1))
    monkeypatch.setattr(execution, 'heartbeat', lambda *args: True)
    monkeypatch.setattr(execution, 'require_workspace', MagicMock())
    monkeypatch.setattr(execution, 'revalidate_access', MagicMock())
    monkeypatch.setattr(
        execution, 'authorized_source_config', lambda *args: {'providers': ['slack']}
    )
    monkeypatch.setattr(execution, 'plan', lambda question: ['First lookup', 'Second lookup'])

    scopes = iter([frozenset({'a', 'b'}), frozenset({'b'})])

    def collect(workspace_id, body, actor, db, stats, **kwargs):
        stats['scopes'] = {'slack': (b'credential-fingerprint', next(scopes))}
        return [], {}

    monkeypatch.setattr(execution, 'collect_connected_evidence', collect)
    generate = MagicMock()
    monkeypatch.setattr(execution, 'generate_agent', generate)

    assert execution.execute_one_research_run() is True
    generate.assert_not_called()
    update = db.query.return_value.filter_by.return_value.update
    assert update.call_args.args[0]['status'] == 'failed'
