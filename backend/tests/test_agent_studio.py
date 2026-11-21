from app.agents.execution import MAX_STEPS
from app.agents.models import CreateAgent, ResearchRequest


def test_agent_runtime_has_bounded_steps():
    assert 0 < MAX_STEPS <= 5


def test_research_question_has_length_limit():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ResearchRequest(question='x' * 2001)


def test_agent_configuration_has_length_limit():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateAgent(name='x' * 101)


def test_agent_mutations_recheck_editor_role_under_lock(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    import pytest
    from fastapi import HTTPException

    from app import rbac
    from app.routes import agents

    workspace = SimpleNamespace(id='workspace', organisation_id=None)
    actor = SimpleNamespace(id='member')
    db = MagicMock()
    db.get.return_value = workspace
    role = 'editor'

    def lock(*args):
        nonlocal role
        role = 'viewer'
        return workspace

    monkeypatch.setattr(rbac, 'lock_resource', lock)
    monkeypatch.setattr(rbac, 'workspace_role', lambda *args: role)

    for action in (
        lambda: agents.run_research(
            workspace.id, 'agent', ResearchRequest(question='What changed?'), actor, db
        ),
        lambda: agents.delete_agent(workspace.id, 'agent', actor, db),
    ):
        role = 'editor'
        with pytest.raises(HTTPException) as error:
            action()
        assert error.value.status_code == 403

    db.query.assert_not_called()
    db.commit.assert_not_called()
