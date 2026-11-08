"""Source routing must honor structured request fields, not question keywords."""

from app.connected_research import connected_scope
from app.schemas import ConnectedQuestion


def test_selected_sources_are_not_overridden_by_email_words():
    request = ConnectedQuestion(
        question='List all important emails except GitHub ones',
        include_documents=False,
        include_gmail=True,
        providers=[],
    )
    assert connected_scope(request) == ['gmail']


def test_cross_source_request_keeps_explicit_sources():
    request = ConnectedQuestion(
        question='Compare project documents and GitHub issues',
        include_documents=True,
        include_gmail=True,
        providers=['drive', 'github'],
    )
    assert set(connected_scope(request)) == {'documents', 'gmail', 'drive', 'github'}
