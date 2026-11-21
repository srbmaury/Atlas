"""Gmail natural-language query translation regressions."""

from app.research.research_queries import gmail_query_for_question


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


def test_sender_question_uses_sender_filter():
    assert gmail_query_for_question('', 'Summarize all emails from CoinDCX') == 'from:coindcx'


def test_other_mail_follow_up_does_not_inherit_sender_keywords():
    assert gmail_query_for_question('', 'Any other email which needs my attention') == ''


def test_important_attention_request_is_not_narrowed_by_modal_words():
    assert gmail_query_for_question(
        'newer_than:30d', 'List all important emails which may need my attention'
    ) == ('newer_than:30d is:important')


def test_funds_related_email_request_keeps_only_topic():
    assert gmail_query_for_question('newer_than:30d', 'Any funds related emails') == (
        'newer_than:30d funds'
    )


def test_important_email_list_keeps_scope():
    assert gmail_query_for_question('newer_than:30d', 'List all important emails') == (
        'newer_than:30d is:important'
    )
