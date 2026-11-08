"""Connected-chat Gmail retrieval uses the current question and bounded coverage."""

from types import SimpleNamespace

from app.connected_research import _search_gmail
from app.research_queries import gmail_query_for_question


def test_connected_search_does_not_reuse_previous_sender():
    seen = []

    def fake_get(token, url, params=None):
        if url.endswith('/messages'):
            seen.append(params)
            return {'messages': [{'id': 'a'}, {'id': 'b'}]}
        mid = url.rsplit('/', 1)[-1]
        return {'id': mid}

    def fake_parse(raw):
        return {
            'id': raw['id'],
            'subject': 'Notice',
            'body': 'Please review',
            'snippet': '',
            'url': 'https://mail.google.com/#all/' + raw['id'],
            'date': '2026-11-01',
        }

    body = SimpleNamespace(
        question='Any other email which needs my attention',
        history=[SimpleNamespace(role='user', content='Summarize all emails from CoinDCX')],
        gmail_query='',
    )
    hits = _search_gmail(
        'token', body, 'https://example.test', fake_get, fake_parse, gmail_query_for_question
    )
    assert seen == [{'q': '', 'maxResults': 30}]
    assert len(hits) == 2


def test_sender_search_uses_gmail_sender_operator():
    body = SimpleNamespace(
        question='Summarize all emails from CoinDCX',
        history=[],
        gmail_query='',
    )
    queries = []

    def fake_get(token, url, params=None):
        queries.append(params)
        return {'messages': []}

    assert (
        _search_gmail(
            'token', body, 'https://example.test', fake_get, lambda x: x, gmail_query_for_question
        )
        == []
    )
    assert queries == [{'q': 'from:coindcx', 'maxResults': 30}]


def test_cited_evidence_follow_up_fetches_exact_message_ids():
    seen = []

    def fake_get(token, url, params=None):
        seen.append((url, params))
        return {'id': url.rsplit('/', 1)[-1]}

    def fake_parse(raw):
        return {
            'id': raw['id'],
            'subject': 'Security notice',
            'sender': 'CoinDCX',
            'body': 'Enable two-factor authentication.',
            'snippet': '',
            'url': f'https://mail.google.com/mail/u/0/#all/{raw["id"]}',
            'date': 'Sun, 08 Nov 2026 09:00:00 +0530',
        }

    body = SimpleNamespace(
        question='Explain the cited evidence in more detail',
        history=[SimpleNamespace(role='user', content='List important emails')],
        gmail_query='newer_than:30d',
        gmail_source_ids=['abc1', 'def2'],
    )
    hits = _search_gmail(
        'token', body, 'https://example.test', fake_get, fake_parse, gmail_query_for_question
    )
    assert [hit.source_id for hit in hits] == ['abc1', 'def2']
    assert all('/messages/' in url for url, _ in seen)
    assert all(params == {'format': 'full'} for _, params in seen)
    assert [hit.owner for hit in hits] == ['CoinDCX', 'CoinDCX']


def test_cited_evidence_rejects_invalid_message_ids():
    import pytest
    from fastapi import HTTPException

    body = SimpleNamespace(
        question='Explain citation',
        gmail_query='',
        gmail_source_ids=['../threads/abc'],
    )
    with pytest.raises(HTTPException) as exc:
        _search_gmail(
            'token',
            body,
            'https://example.test',
            lambda *_: None,
            lambda x: x,
            gmail_query_for_question,
        )
    assert exc.value.status_code == 422


def test_gmail_listing_uses_every_distinct_message():
    from app.connected_research import connected_source_listing_result, retrieval_trace
    from app.evidence_quality import prepare_evidence
    from app.source_contract import Evidence

    rows = [
        Evidence(
            'gmail',
            f'm{i}',
            f'Important email {i}',
            f'Message {i}',
            f'https://mail.google.com/mail/u/0/#all/m{i}',
            'Sun, 08 Nov 2026 09:00:00 +0530',
            owner='Sender',
        )
        for i in range(25)
    ]
    kept = prepare_evidence('List all important emails', rows, per_provider=30)
    body = SimpleNamespace(include_documents=False, include_gmail=True, providers=[])
    result = connected_source_listing_result('List all important emails', body, kept, {})
    assert len(kept) == 25
    assert len(result['sources']) == 25
    assert 'Found 25 matching items' in result['answer']
    assert all(str(i) in result['answer'] for i in range(1, 26))
    assert [item['gmail_message_id'] for item in result['sources']] == [f'm{i}' for i in range(25)]
    trace = retrieval_trace(body, kept, {'found': {'gmail': 25}}, result['sources'])
    assert trace['sources'][0] == {
        'provider': 'gmail',
        'status': 'searched',
        'found': 25,
        'considered': 25,
        'used': 25,
    }
