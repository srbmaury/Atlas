"""Focused regression checks for transient provider failures."""

import httpx
import pytest
from fastapi import HTTPException

from app.connectors import batch_connectors


def test_connector_retries_rate_limit(monkeypatch):
    attempts = []

    class Client:
        def __init__(self, **kwargs):
            assert kwargs['follow_redirects'] is False
            assert kwargs['trust_env'] is False

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers, params):
            attempts.append(url)
            return httpx.Response(
                429 if len(attempts) < 3 else 200,
                request=httpx.Request('GET', url),
                json={} if len(attempts) == 3 else {'detail': 'slow'},
            )

    monkeypatch.setattr(batch_connectors.httpx, 'Client', Client)
    monkeypatch.setattr(batch_connectors.time, 'sleep', lambda _: None)
    assert batch_connectors._request('calendar', 'secret', 'https://example.com') == {}
    assert len(attempts) == 3


def test_connector_does_not_retry_unauthorized(monkeypatch):
    attempts = []

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers, params):
            attempts.append(1)
            return httpx.Response(401, request=httpx.Request('GET', url))

    monkeypatch.setattr(batch_connectors.httpx, 'Client', Client)
    with pytest.raises(HTTPException) as exc:
        batch_connectors._request('outlook', 'secret', 'https://example.com')
    assert exc.value.status_code == 422
    assert len(attempts) == 1
