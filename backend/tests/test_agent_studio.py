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
