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
            'id': raw['id'], 'subject': 'Notice', 'body': 'Please review',
            'snippet': '', 'url': 'https://mail.google.com/#all/' + raw['id'],
            'date': '2026-11-01',
        }

    body = SimpleNamespace(
        question='Any other email which needs my attention',
        history=[SimpleNamespace(role='user', content='Summarize all emails from CoinDCX')],
        gmail_query='',
    )
    hits = _search_gmail('token', body, 'https://example.test', fake_get, fake_parse, gmail_query_for_question)
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

    assert _search_gmail('token', body, 'https://example.test', fake_get, lambda x: x, gmail_query_for_question) == []
    assert queries == [{'q': 'from:coindcx', 'maxResults': 30}]
