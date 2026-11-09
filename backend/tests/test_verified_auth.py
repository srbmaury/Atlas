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


def test_account_deletion_removes_verified_identity_and_rolls_back_on_provider_error(
    auth_client, monkeypatch
):
    from fastapi import HTTPException

    identifier = str(uuid4())
    email = f'{identifier}@example.com'
    deleted = []

    def provider(config, path, **kwargs):
        if path == 'verify':
            return {'user': {'id': identifier, 'email': email, 'email_confirmed_at': 'verified'}}
        assert path == f'admin/users/{identifier}'
        assert kwargs['method'] == 'DELETE' and kwargs['allow_missing']
        assert config.key == 'sb_secret_test'
        if not deleted:
            deleted.append('first attempt')
            raise HTTPException(503, 'Simulated provider failure')
        deleted.append(identifier)
        return {}

    monkeypatch.setattr(supabase_auth, 'request', provider)
    monkeypatch.delenv('ATLAS_AUTH_ADMIN_KEY', raising=False)
    monkeypatch.setenv('ATLAS_STORAGE_URL', 'https://example.supabase.co')
    monkeypatch.setenv('ATLAS_STORAGE_KEY', 'sb_secret_test')
    assert (
        auth_client.post('/api/auth/confirm', json={'token_hash': 'test-confirm-token'}).status_code
        == 200
    )
    assert (
        auth_client.request('DELETE', '/api/me', json={'email': 'wrong@example.com'}).status_code
        == 422
    )
    assert auth_client.request('DELETE', '/api/me', json={'email': email}).status_code == 503
    assert auth_client.get('/api/me').json()['id'] == identifier
    assert len(auth_client.get('/api/workspaces').json()) == 1
    assert auth_client.request('DELETE', '/api/me', json={'email': email}).status_code == 200
    assert deleted == ['first attempt', identifier]
    assert auth_client.get('/api/me').status_code == 401
    with Session() as db:
        assert db.get(User, identifier) is None


@pytest.mark.parametrize('mode,start_path', [('confirm', 'register'), ('reset', 'forgot')])
def test_default_email_link_uses_browser_bound_pkce(auth_client, monkeypatch, mode, start_path):
    import base64
    import hashlib

    identifier = str(uuid4())
    email = f'{identifier}@example.com'
    challenge = None
    provider_calls = []

    def provider(config, path, **kwargs):
        nonlocal challenge
        provider_calls.append(path)
        payload = kwargs['payload']
        if path in ('signup', 'recover'):
            assert kwargs['params']['redirect_to'].endswith(f'mode={mode}')
            assert payload['code_challenge_method'] == 's256'
            challenge = payload['code_challenge']
        elif path == 'token?grant_type=pkce':
            assert payload['auth_code'] == 'email-provider-code'
            digest = hashlib.sha256(payload['code_verifier'].encode()).digest()
            assert base64.urlsafe_b64encode(digest).decode().rstrip('=') == challenge
        else:
            assert path == 'user'
            assert mode == 'reset'
            assert kwargs['token'] == 'recovery-access-token'
        return {
            'user': {'id': identifier, 'email': email, 'email_confirmed_at': 'verified'},
            'access_token': 'recovery-access-token',
        }

    monkeypatch.setattr(supabase_auth, 'request', provider)
    completion = {'code': 'email-provider-code'}
    if mode == 'reset':
        completion['password'] = 'new-long-password'

    assert auth_client.post(f'/api/auth/{mode}', json=completion).status_code == 400
    assert not provider_calls
    data = {'email': email}
    if mode == 'confirm':
        data['password'] = 'long-test-password'
    start = auth_client.post(f'/api/auth/{start_path}', json=data)
    assert start.status_code == 200
    assert 'HttpOnly' in start.headers['set-cookie']
    assert f'Path=/api/auth/{mode}' in start.headers['set-cookie']
    assert auth_client.post(f'/api/auth/{mode}', json=completion).status_code == 200
    assert auth_client.post(f'/api/auth/{mode}', json=completion).status_code == 400
    assert provider_calls.count('token?grant_type=pkce') == 1
