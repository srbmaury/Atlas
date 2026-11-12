"""Failure-injection contract tests for read-only provider HTTP requests."""
import httpx
import pytest
from fastapi import HTTPException

from app.external_sources import http_json


@pytest.mark.parametrize('status,expected', [(401, 422), (403, 422), (429, 429), (500, 502)])
def test_provider_http_errors_are_normalized_without_secrets(monkeypatch, status, expected):
    token = 'super-secret-token'
    def responder(request):
        assert request.headers['Authorization'] == 'Bearer ' + token
        return httpx.Response(status, json={'message': 'super-secret-token'})
    transport = httpx.MockTransport(responder)
    real_client = httpx.Client
    monkeypatch.setattr(
        'app.external_sources.httpx.Client',
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )
    with pytest.raises(HTTPException) as error:
        http_json('https://api.notion.com/v1/search', token, 'notion')
    assert error.value.status_code == expected
    assert token not in str(error.value.detail)


def test_provider_does_not_follow_redirects(monkeypatch):
    def responder(request):
        return httpx.Response(302, headers={'Location': 'http://127.0.0.1/private'})
    transport = httpx.MockTransport(responder)
    real_client = httpx.Client
    monkeypatch.setattr(
        'app.external_sources.httpx.Client',
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )
    with pytest.raises(HTTPException) as error:
        http_json('https://api.github.com/user', 'safe-token', 'github')
    assert error.value.status_code == 502


def test_provider_network_failure_is_normalized(monkeypatch):
    def responder(request):
        raise httpx.ConnectError('network failure', request=request)
    transport = httpx.MockTransport(responder)
    real_client = httpx.Client
    monkeypatch.setattr(
        'app.external_sources.httpx.Client',
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )
    with pytest.raises(HTTPException) as error:
        http_json('https://api.github.com/user', 'safe-token', 'github')
    assert error.value.status_code == 502
