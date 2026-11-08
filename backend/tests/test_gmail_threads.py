"""Regression tests for Gmail thread-aware search grouping."""

from app.gmail import email_from_json, group_email_threads


def test_threads_group_by_id_and_order_by_internal_date():
    messages = [
        {'id': 'late', 'thread_id': 't1', 'subject': 'Release', 'internal_date': '200'},
        {'id': 'other', 'thread_id': 't2', 'subject': 'Release', 'internal_date': '150'},
        {'id': 'early', 'thread_id': 't1', 'subject': 'Release', 'internal_date': '100'},
    ]
    threads = group_email_threads(messages)
    assert [thread['thread_id'] for thread in threads] == ['t1', 't2']
    assert [m['id'] for m in threads[0]['messages']] == ['early', 'late']
    assert threads[0]['message_count'] == 2
    assert threads[1]['message_count'] == 1


def test_missing_thread_and_timestamp_remain_safe():
    threads = group_email_threads([
        {'id': 'a', 'subject': 'Hello'},
        {'id': 'b', 'thread_id': 't', 'internal_date': 'not-a-date'},
        {'id': 'c', 'thread_id': 't', 'internal_date': '10'},
    ])
    assert threads[0]['thread_id'] == 'a'
    assert [m['id'] for m in threads[1]['messages']] == ['c', 'b']


def test_gmail_json_retains_internal_date_and_source_link():
    message = email_from_json({
        'id': 'abc123',
        'threadId': 'thread123',
        'internalDate': '1700000000000',
        'payload': {'headers': [{'name': 'Subject', 'value': 'Decision'}]},
    })
    assert message['internal_date'] == '1700000000000'
    assert message['thread_id'] == 'thread123'
    assert message['url'].endswith('/abc123')
