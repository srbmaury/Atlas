"""Security regression tests for browser headers and outbound fetch policy."""

import json

import pytest
from fastapi.testclient import TestClient

from app import web_sources
from app.main import app


def test_web_fetch_connects_only_to_the_validated_public_address(monkeypatch):
    monkeypatch.setattr(web_sources, 'resolve_public_addresses', lambda hostname, port: ['93.184.216.34'])

    class FakeConnection:
        def __init__(self, hostname, address, port, timeout):
            assert hostname == 'example.com'
            assert address == '93.184.216.34'
            assert port == 443

        def request(self, method, target, headers):
            assert method == 'GET'
            assert target == '/article?q=1'
            assert headers['Host'] == 'example.com'

        def getresponse(self):
            class Response:
                status = 200

                def getheader(self, name, default=''):
                    return {'content-type': 'text/html; charset=utf-8'}.get(name, default)

                def read(self, size):
                    return b'<html><title>Example</title><p>This is enough readable page content for a test.</p></html>'

                def close(self):
                    pass

            return Response()

    monkeypatch.setattr(web_sources, 'PinnedHTTPSConnection', FakeConnection)
    assert web_sources.fetch_page('https://example.com/article?q=1') == (
        'Example',
        'This is enough readable page content for a test.',
    )


def test_web_fetch_rejects_mixed_public_and_private_dns_answers(monkeypatch):
    monkeypatch.setattr(
        web_sources.socket,
        'getaddrinfo',
        lambda *args, **kwargs: [
            (2, 1, 6, '', ('93.184.216.34', 443)),
            (2, 1, 6, '', ('127.0.0.1', 443)),
        ],
    )
    with pytest.raises(ValueError, match='only to public IP'):
        web_sources.validate_public_url('https://example.com')


def test_extract_chatgpt_share_reads_user_and_assistant_turns():
    values = [
        {'_1': 2},
        'loaderData',
        {'_3': 4},
        'shared-route',
        {'_5': 6},
        'serverResponse',
        {'_7': 8},
        'data',
        {'_9': 10, '_11': 12},
        'title',
        'Shared essay',
        'mapping',
        {
            'client-created-root': {'children': ['user']},
            'user': {
                'message': {
                    'author': {'role': 'user'},
                    'content': {'parts': ['Write a long essay about this topic.']},
                },
                'children': ['assistant'],
            },
            'assistant': {
                'message': {
                    'author': {'role': 'assistant'},
                    'content': {'parts': ['Here is the full shared response text.']},
                },
                'children': [],
            },
        },
    ]
    serialized = json.dumps(json.dumps(values))
    html = f'<script>window.__reactRouterContext.streamController.enqueue({serialized})</script>'

    assert web_sources.extract_chatgpt_share(html) == (
        'Shared essay',
        'User: Write a long essay about this topic.\n\nAssistant: Here is the full shared response text.',
    )


def test_security_headers_present():
    with TestClient(app) as client:
        response = client.get('/api/health/live')
        assert response.status_code == 200
        assert response.headers['x-content-type-options'] == 'nosniff'
        assert response.headers['x-frame-options'] == 'DENY'
        assert response.headers['referrer-policy'] == 'strict-origin-when-cross-origin'
        assert response.headers['x-request-id']
