"""Cancellation guards for workspace-scoped research runs."""
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException
import pytest

from app.agent_studio import cancel_research


def test_cancel_scopes_run_to_workspace_and_agent(monkeypatch):
    db = MagicMock()
    query = db.query.return_value
    filtered = query.filter_by.return_value
    filtered.filter.return_value.update.return_value = 1
    run = SimpleNamespace(
        id='r', agent_id='a', question='Research?', status='cancelled',
        steps=[], result=None, created=0,
    )
    filtered.first.return_value = run
    monkeypatch.setattr('app.agent_studio.workspace', lambda *args: None)
    response = cancel_research('w', 'a', 'r', actor=SimpleNamespace(id='u'), db=db)
    assert response['status'] == 'cancelled'
    assert query.filter_by.call_args.kwargs == {
        'workspace_id': 'w', 'agent_id': 'a', 'id': 'r'
    }
    db.commit.assert_called_once()


def test_cancel_nonexistent_run_returns_404(monkeypatch):
    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = None
    monkeypatch.setattr('app.agent_studio.workspace', lambda *args: None)
    with pytest.raises(HTTPException) as error:
        cancel_research('w', 'a', 'missing', actor=SimpleNamespace(id='u'), db=db)
    assert error.value.status_code == 404
