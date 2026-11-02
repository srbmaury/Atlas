from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app import batch_connectors


def test_jira_host_restricted(monkeypatch):
    monkeypatch.setenv('ATLAS_JIRA_BASE_URL', 'http://127.0.0.1:8000')
    with pytest.raises(HTTPException) as error:
        batch_connectors._jira_base()
    assert error.value.status_code == 503


def test_jira_query_uses_fixed_host_and_safe_terms(monkeypatch):
    monkeypatch.setenv('ATLAS_JIRA_BASE_URL', 'https://atlas-team.atlassian.net')
    calls = []

    def fake_request(provider, token, url, **kw):
        calls.append((provider, url, kw))
        return {
            'issues': [
                {
                    'id': '22',
                    'key': 'DEV-4',
                    'fields': {
                        'summary': 'Cache',
                        'description': {'content': [{'content': [{'text': 'Avoid stale cache'}]}]},
                    },
                }
            ]
        }

    monkeypatch.setattr(batch_connectors, '_request', fake_request)
    rows = batch_connectors.search('jira', 'token', 'cache" OR project=ADMIN')
    assert rows[0]['url'] == 'https://atlas-team.atlassian.net/browse/DEV-4'
    assert calls[0][1].startswith('https://atlas-team.atlassian.net/')
    assert 'project=ADMIN' not in calls[0][2]['params']['jql']


def test_calendar_search_normalizes_event(monkeypatch):
    monkeypatch.setattr(
        batch_connectors,
        '_request',
        lambda *a, **kw: {
            'items': [
                {
                    'id': 'abc',
                    'summary': 'Design review',
                    'start': {'dateTime': '2026-11-02T09:00:00Z'},
                    'description': 'Atlas changes',
                    'htmlLink': 'https://calendar.google.com/event',
                }
            ]
        },
    )
    rows = batch_connectors.search('calendar', 'token', 'Atlas')
    assert rows[0]['provider'] == 'calendar'
    assert '2026-11-02' in rows[0]['excerpt']


def test_calendar_upcoming_count_searches_all_calendars_without_text_filter(monkeypatch):
    calls = []
    events_by_calendar = {
        'primary': [
            {
                'id': 'later',
                'summary': 'Later event',
                'start': {'dateTime': '2026-11-05T09:00:00+05:30'},
                'end': {'dateTime': '2026-11-05T10:00:00+05:30'},
            }
        ],
        'work@example.com': [
            {
                'id': 'earlier',
                'summary': 'Earlier event',
                'start': {'dateTime': '2026-11-04T09:00:00+05:30'},
            }
        ],
    }

    def fake_request(provider, token, url, *, params=None, graphql=None):
        calls.append((url, params or {}))
        if url.endswith('/calendarList'):
            return {'items': [{'id': 'primary'}, {'id': 'work@example.com'}]}
        calendar_id = 'work@example.com' if 'work%40example.com' in url else 'primary'
        return {'items': events_by_calendar[calendar_id]}

    monkeypatch.setattr(batch_connectors, '_request', fake_request)
    question = 'list next 10 events from my calendar'
    rows = batch_connectors.search('calendar', 'token', question)

    assert [row['id'] for row in rows] == ['earlier', 'later']
    assert rows[0]['date'] == '2026-11-04T09:00:00+05:30'
    event_requests = [(url, params) for url, params in calls if '/events' in url]
    assert len(event_requests) == 2
    assert all('q' not in params for _, params in event_requests)
    assert all(params['maxResults'] == 50 for _, params in event_requests)
    assert all(params['timeMin'] != '2000-01-01T00:00:00Z' for _, params in event_requests)


def test_calendar_tomorrow_bounds_cover_one_kolkata_day():
    bounds = batch_connectors._calendar_date_bounds('show events tomorrow')
    start = datetime.fromisoformat(bounds['timeMin'])
    end = datetime.fromisoformat(bounds['timeMax'])
    assert end - start == timedelta(days=1)


def test_calendar_list_result_respects_requested_count_and_orders_citations():
    from types import SimpleNamespace

    from app.main import connected_source_listing_result
    from app.sources import Evidence

    question = 'list next 10 events from my calendar'
    body = SimpleNamespace(include_documents=False, include_gmail=False, providers=['calendar'])
    evidence = [
        Evidence(
            'calendar',
            'past-event',
            'Old event',
            'Details',
            'https://calendar.google.com/past',
            '2025-07-29T20:00:00+05:30',
        ),
        *[
            Evidence(
                'calendar',
                f'event-{index}',
                f'Event {index}',
                'Details',
                'https://calendar.google.com/event',
                f'2026-11-{index + 3:02d}T10:00:00+05:30',
            )
            for index in reversed(range(12))
        ],
    ]

    result = connected_source_listing_result(question, body, evidence, {})

    assert result['mode'] == 'source_results'
    assert len(result['sources']) == 10
    assert [source['name'] for source in result['sources']] == [f'Event {i}' for i in range(10)]
    assert len([line for line in result['answer'].splitlines() if line.startswith('- **')]) == 10
    assert 'Old event' not in result['answer']


def test_calendar_matching_event_search_does_not_claim_every_event_is_upcoming():
    from types import SimpleNamespace

    from app.main import connected_source_listing_result
    from app.sources import Evidence

    body = SimpleNamespace(include_documents=False, include_gmail=False, providers=['calendar'])
    evidence = [
        Evidence(
            'calendar', 'past', 'Earlier flight', 'Details', None, '2025-07-29T20:00:00+05:30'
        ),
        Evidence(
            'calendar', 'future', 'Later flight', 'Details', None, '2026-11-02T15:50:00+05:30'
        ),
    ]

    result = connected_source_listing_result(
        'Find flight 6E 501 on my calendar', body, evidence, {}
    )

    assert 'matching items' in result['answer']
    assert len(result['sources']) == 2


def test_calendar_singular_next_event_returns_one_future_event():
    from types import SimpleNamespace

    from app.main import connected_source_listing_result
    from app.sources import Evidence

    body = SimpleNamespace(providers=['calendar'])
    evidence = [
        Evidence('calendar', 'past', 'Earlier event', 'Details', None, '2025-07-29T20:00:00+05:30'),
        Evidence(
            'calendar',
            'first',
            'First future event',
            'Details',
            None,
            '2026-11-03T09:00:00+05:30',
        ),
        Evidence(
            'calendar',
            'second',
            'Second future event',
            'Details',
            None,
            '2026-11-04T09:00:00+05:30',
        ),
    ]

    result = connected_source_listing_result(
        'What is the next event in my calendar?', body, evidence, {}
    )

    assert len(result['sources']) == 1
    assert result['sources'][0]['name'] == 'First future event'
    assert result['answer'].startswith('Found 1 matching item in Google Calendar:')


def test_connected_source_listing_cites_drive_and_gmail_titles():
    from types import SimpleNamespace

    from app.main import connected_source_listing_result
    from app.sources import Evidence

    body = SimpleNamespace(include_documents=False, include_gmail=True, providers=['drive'])
    evidence = [
        Evidence(
            'drive',
            'drive-1',
            'Saurabh_Maurya_Resume_AI_Engineer.pdf',
            'Resume content',
            'https://drive.google.com/file/d/drive-1',
        ),
        Evidence('gmail', 'mail-1', 'Resume discussion', 'Resume attached'),
    ]

    result = connected_source_listing_result(
        'Find resume files and emails mentioning resumes', body, evidence, {}
    )

    assert result['mode'] == 'source_results'
    assert 'Found 2 matching items in Google Drive, Gmail:' in result['answer']
    assert [source['name'] for source in result['sources']] == [
        'Saurabh_Maurya_Resume_AI_Engineer.pdf',
        'Resume discussion',
    ]
    assert result['sources'][0]['url'] == 'https://drive.google.com/file/d/drive-1'
    assert '[1]' in result['answer'] and '[2]' in result['answer']


def test_retrieval_trace_uses_narrowed_result_scope_for_source_listings():
    from types import SimpleNamespace

    from app.main import attach_retrieval_trace
    from app.sources import Evidence

    body = SimpleNamespace(include_documents=True, include_gmail=False, providers=['slack'])
    evidence = [
        Evidence('documents', 'doc-1', 'Notes', 'Document match'),
        Evidence('slack', 'slack-1', '#research', 'Slack match'),
    ]
    result = {
        'answer': 'Found a matching Slack item [1].',
        'sources': [{'provider': 'slack', 'name': '#research'}],
        'mode': 'source_results',
        'scope': ['slack'],
    }

    attach_retrieval_trace(
        result,
        body,
        evidence,
        {'found': {'documents': 1, 'slack': 1}, 'failed': []},
    )

    assert result['retrieval']['passages_considered'] == 1
    assert result['retrieval']['passages_used'] == 1
    assert result['retrieval']['sources'] == [
        {'provider': 'slack', 'status': 'searched', 'found': 1, 'considered': 1, 'used': 1}
    ]


def test_deforestation_questions_are_not_reduced_to_source_title_listings():
    from types import SimpleNamespace

    from app.main import connected_source_listing_result
    from app.sources import Evidence

    body = SimpleNamespace(include_documents=False, include_gmail=False, providers=['slack'])
    evidence = [
        Evidence('slack', 'slack-1', '#research', 'Agriculture and logging cause forest loss.')
    ]

    for question in ('causes of deforestation', 'List 3 to 5 causes of deforestation'):
        assert connected_source_listing_result(question, body, evidence, {}) is None


def test_outlook_search_normalizes_mail(monkeypatch):
    monkeypatch.setattr(
        batch_connectors,
        '_request',
        lambda *a, **kw: {
            'value': [
                {
                    'id': 'm1',
                    'subject': 'Review',
                    'bodyPreview': 'Agenda',
                    'receivedDateTime': '2026-11-01',
                    'webLink': 'https://outlook.office.com/mail/id',
                }
            ]
        },
    )
    rows = batch_connectors.search('outlook', 'token', 'Review')
    assert rows[0]['id'] == 'm1'
    assert 'Agenda' in rows[0]['excerpt']


def test_linear_search_normalizes_issues(monkeypatch):
    monkeypatch.setattr(
        batch_connectors,
        '_request',
        lambda *a, **kw: {
            'data': {
                'searchIssues': {
                    'nodes': [
                        {
                            'id': 'q1',
                            'identifier': 'ENG-2',
                            'title': 'Bug',
                            'description': 'Fix it',
                            'url': 'https://linear.app/issue',
                        }
                    ]
                }
            }
        },
    )
    rows = batch_connectors.search('linear', 'token', 'Bug')
    assert rows[0]['title'] == 'ENG-2 Bug'


def test_onedrive_query_escapes_quotes(monkeypatch):
    calls = []

    def fake(*args, **kwargs):
        calls.append(args[2])
        return {'value': []}

    monkeypatch.setattr(batch_connectors, '_request', fake)
    assert batch_connectors.search('onedrive', 'token', "O'Brien") == []
    assert 'O%27%27Brien' in calls[0]


def test_sharepoint_search_returns_only_site_items(monkeypatch):
    monkeypatch.setattr(
        batch_connectors,
        '_request',
        lambda *a, **kw: {
            'value': [
                {
                    'hitsContainers': [
                        {
                            'hits': [
                                {
                                    'resource': {
                                        'id': 'sp1',
                                        'name': 'Design.docx',
                                        'webUrl': 'https://example.sharepoint.com/design',
                                        'parentReference': {'siteId': 'site-1'},
                                    },
                                    'summary': 'Cache architecture',
                                },
                                {
                                    'resource': {
                                        'id': 'personal',
                                        'name': 'Private.docx',
                                        'parentReference': {'driveId': 'personal'},
                                    }
                                },
                            ]
                        }
                    ]
                }
            ]
        },
    )
    rows = batch_connectors.search('sharepoint', 'token', 'cache')
    assert len(rows) == 1
    assert rows[0]['provider'] == 'sharepoint'
    assert rows[0]['id'] == 'sp1'
    assert rows[0]['url'] == 'https://example.sharepoint.com/design'
