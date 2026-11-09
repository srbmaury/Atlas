from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.db import Session, User
from app.main import app


@pytest.fixture
def auth_client(monkeypatch):
    monkeypatch.setenv('ATLAS_AUTH_URL', 'https://example.supabase.co')
    monkeypatch.setenv('ATLAS_AUTH_KEY', 'sb_publishable_test')
    monkeypatch.setenv('ATLAS_AUTH_ORIGIN', 'http://testserver')
    monkeypatch.setattr(
        supabase_auth,
        'settings',
        lambda: supabase_auth.AuthSettings(
            'https://example.supabase.co', 'sb_publishable_test', 'http://testserver'
        ),
    )
    with TestClient(app) as client:
        yield client


def test_signup_waits_for_confirmation_then_creates_workspace(auth_client, monkeypatch):
    identifier = str(uuid4())
    email = f'{identifier}@example.com'
    credentials = {'email': email, 'password': 'long-test-password'}
    pending = {'id': identifier, 'email': email, 'email_confirmed_at': None}

    def provider(config, path, **kwargs):
        if path == 'signup':
            assert kwargs['params']['redirect_to'].endswith('mode=confirm')
            return {'user': pending}
        if path == 'token?grant_type=password':
            return {'user': pending}
        assert path == 'verify'
        assert kwargs['payload'] == {'type': 'email', 'token_hash': 'test-confirm-token'}
        return {'user': {**pending, 'email_confirmed_at': '2026-11-09T00:00:00Z'}}

    monkeypatch.setattr(supabase_auth, 'request', provider)
    response = auth_client.post('/api/auth/register', json=credentials)
    assert response.json() == {'verification_required': True}
    assert 'atlas_session' not in response.cookies
    assert auth_client.post('/api/auth/login', json=credentials).status_code == 403
    with Session() as db:
        assert db.get(User, identifier) is None

    assert (
        auth_client.post('/api/auth/confirm', json={'token_hash': 'test-confirm-token'}).status_code
        == 200
    )
    assert auth_client.get('/api/me').json()['id'] == identifier
    assert len(auth_client.get('/api/workspaces').json()) == 1


def test_google_pkce_and_reset_invalidate_existing_atlas_session(auth_client, monkeypatch):
    identifier = str(uuid4())
    identity = {
        'id': identifier,
        'email': f'{identifier}@example.com',
        'email_confirmed_at': 'verified',
    }
    started = auth_client.get('/api/auth/google', follow_redirects=False)
    query = parse_qs(urlsplit(started.headers['location']).query)
    assert query['provider'] == ['google']
    assert query['code_challenge_method'] == ['s256']
    assert query['redirect_to'] == ['http://testserver/api/auth/google/callback']
    verifier = started.cookies['atlas_google_pkce']
    assert verifier != query['code_challenge'][0]

    def provider(config, path, **kwargs):
        if path == 'token?grant_type=pkce':
            assert kwargs['payload'] == {'auth_code': 'provider-code', 'code_verifier': verifier}
        elif path == 'recover':
            assert kwargs['params']['redirect_to'].endswith('mode=reset')
        elif path == 'verify':
            assert kwargs['payload']['type'] == 'recovery'
        else:
            assert path == 'user' and kwargs['method'] == 'PUT'
            assert kwargs['token'] == 'provider-access-token'
        return {'user': identity, 'access_token': 'provider-access-token'}

    monkeypatch.setattr(supabase_auth, 'request', provider)
    callback = auth_client.get(
        '/api/auth/google/callback?code=provider-code', follow_redirects=False
    )
    assert callback.status_code == 303 and callback.headers['location'] == 'http://testserver/'
    assert auth_client.get('/api/me').json()['id'] == identifier
    previous_session = auth_client.cookies.get('atlas_session')
    assert (
        auth_client.post('/api/auth/forgot', json={'email': identity['email']}).status_code == 200
    )
    response = auth_client.post(
        '/api/auth/reset',
        json={'token_hash': 'test-recovery-token', 'password': 'new-long-password'},
    )
    assert response.status_code == 200
    assert (
        auth_client.get(
            '/api/me', headers={'Cookie': f'atlas_session={previous_session}'}
        ).status_code
        == 401
    )
