"""Explicit email intent must not leak into unrelated connected providers."""

from types import SimpleNamespace

from app.connected_research import ambiguous_email_request, effective_research_scope
from app.research_queries import (
    email_request_scope,
    excluded_mail_sender,
    gmail_query_for_question,
)


def body(question):
    return SimpleNamespace(
        question=question,
        include_gmail=True,
        include_documents=True,
        providers=['drive', 'github'],
    )


def test_github_mail_exclusion_targets_gmail_sender_not_github_provider():
    question = 'List all important mails, exclude github mails'
    assert email_request_scope(question)
    assert excluded_mail_sender(question) == 'github'
    assert gmail_query_for_question('', question) == ' -from:github is:important'.strip()
    assert 'excluding' not in gmail_query_for_question('', question)
    assert 'github' not in gmail_query_for_question('', question).replace('-from:github', '')
    # The connected endpoint receives a Pydantic model; use the actual request
    # schema to ensure its model_copy preserves validation and source flags.
    from app.schemas import ConnectedQuestion

    request = ConnectedQuestion(
        question=question, include_gmail=True, include_documents=True,
        providers=['drive', 'github'],
    )
    scoped = effective_research_scope(request)
    assert scoped.include_gmail is True
    assert scoped.include_documents is False
    assert scoped.providers == []


def test_excluding_gmail_asks_for_clarification_not_drive_files():
    question = 'List all important emails excluding gmail ones'
    assert ambiguous_email_request(body(question))['mode'] == 'clarification_needed'


def test_other_cross_source_questions_keep_original_scope():
    from app.schemas import ConnectedQuestion

    request = ConnectedQuestion(
        question='Compare project documents and GitHub issues',
        include_documents=True, include_gmail=True, providers=['drive', 'github'],
    )
    assert effective_research_scope(request) is request
    assert ambiguous_email_request(request) is None
