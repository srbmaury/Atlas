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


def test_expand_threads_bounds_requests_and_preserves_message_order(monkeypatch):
    from app import gmail

    calls = []

    def fake_get(token, url, params=None):
        calls.append(url)
        thread_id = url.rsplit('/', 1)[-1]
        return {
            'messages': [
                {
                    'id': f'{thread_id}-{n}',
                    'threadId': thread_id,
                    'internalDate': str(n),
                    'payload': {'headers': []},
                }
                for n in range(25, 0, -1)
            ]
        }

    monkeypatch.setattr(gmail, 'gmail_get', fake_get)
    matches = [
        {'id': str(i), 'thread_id': f't{i}', 'subject': 'Test'}
        for i in range(8)
    ]
    matches.insert(1, {'id': 'duplicate', 'thread_id': 't0'})
    expanded = gmail.expand_gmail_threads('token', matches)
    assert len(calls) == 5
    assert set(expanded) == {'t0', 't1', 't2', 't3', 't4'}
    assert expanded['t0']['message_count'] == 25
    assert expanded['t0']['truncated'] is True
    assert len(expanded['t0']['messages']) == 20
    assert expanded['t0']['messages'][0]['id'] == 't0-6'
    assert expanded['t0']['messages'][-1]['id'] == 't0-25'


def test_expand_threads_skips_missing_thread_ids(monkeypatch):
    from app import gmail

    calls = []
    monkeypatch.setattr(gmail, 'gmail_get', lambda *args, **kwargs: calls.append(args))
    assert gmail.expand_gmail_threads('token', [{'id': 'only'}]) == {}
    assert calls == []


def test_citation_audit_resolves_references_and_rejects_invalid_numbers():
    from app.gmail import audit_gmail_citations

    result = audit_gmail_citations('Decision approved [2]. Deadline [1].', 2)
    assert result['status'] == 'references_present'
    assert result['cited_numbers'] == [1, 2]
    assert result['semantic_support_verified'] is False

    invalid = audit_gmail_citations('Approved [3], discussed [1].', 2)
    assert invalid['status'] == 'invalid_references'
    assert invalid['invalid_numbers'] == [3]
    assert audit_gmail_citations('No citations.', 2)['status'] == 'no_references'


def test_follow_up_request_validation():
    import pytest
    from pydantic import ValidationError
    from app.gmail import SummaryRequest

    request = SummaryRequest(message_ids=['abc'], intelligence=True, follow_up='Who owns this?')
    assert request.follow_up == 'Who owns this?'
    with pytest.raises(ValidationError):
        SummaryRequest(message_ids=['abc'], follow_up='x' * 501)
