"""Gmail natural-language query translation regressions."""

from app.research_queries import gmail_query_for_question


def test_important_recent_mail_uses_gmail_operators():
    assert gmail_query_for_question('', 'List all important mails in last 30 days') == (
        'is:important newer_than:30d'
    )


def test_scope_is_preserved():
    assert gmail_query_for_question('in:inbox', 'Show important emails from past 7 days') == (
        'in:inbox is:important newer_than:7d'
    )


def test_unread_last_month():
    assert gmail_query_for_question('', 'Find unread messages from last month') == (
        'is:unread newer_than:30d'
    )


def test_topic_terms_remain_searchable():
    assert gmail_query_for_question('', 'Important invoices in the last 14 days') == (
        'is:important newer_than:14d invoices'
    )
