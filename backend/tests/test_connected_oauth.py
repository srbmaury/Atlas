"""OAuth state, client config and refresh token regression checks."""

import base64
import hashlib
import json

import pytest
from fastapi import HTTPException

from app import connected_oauth


def test_pkce_challenge_matches_verifier():
    verifier, challenge = connected_oauth._pkce()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    )
    assert challenge == expected


def test_oauth_rejects_unknown_provider():
    with pytest.raises(HTTPException) as exc:
        connected_oauth._settings('unknown')
    assert exc.value.status_code == 404


def test_oauth_requires_https_in_production(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'client-id')
    monkeypatch.setenv(
        'ATLAS_CONNECTED_OAUTH_REDIRECT_BASE', 'http://example.com/api/connected-oauth'
    )
    with pytest.raises(HTTPException) as exc:
        connected_oauth._settings('calendar')
    assert exc.value.status_code == 503


def test_manual_access_tokens_remain_usable():
    assert (
        connected_oauth.access_token('calendar', 'legacy-manual-token', None, None)
        == 'legacy-manual-token'
    )


def test_refresh_token_rotation_updates_encrypted_record(monkeypatch):
    from cryptography.fernet import Fernet

    key = Fernet.generate_key()
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'client-id')
    monkeypatch.setenv(
        'ATLAS_CONNECTED_OAUTH_REDIRECT_BASE', 'http://localhost:3000/api/connected-oauth'
    )
    monkeypatch.setattr(connected_oauth, 'crypt', lambda: Fernet(key))
    monkeypatch.setattr(
        connected_oauth,
        '_token_request',
        lambda provider, payload: {'access_token': 'new-access', 'refresh_token': 'new-refresh'},
    )

    class Row:
        secret = ''

    class Db:
        commits = 0

        def commit(self):
            self.commits += 1

    db, row = Db(), Row()
    assert (
        connected_oauth.access_token(
            'calendar', json.dumps({'auth': 'oauth', 'refresh': 'old-refresh'}), db, row
        )
        == 'new-access'
    )
    assert db.commits == 1
    assert json.loads(Fernet(key).decrypt(row.secret.encode()))['refresh'] == 'new-refresh'

 
@pytest.mark.parametrize(
    'redirect',
    [
        'http://localhost.attacker.invalid/api/connected-oauth',
        'http://127.0.0.2/api/connected-oauth',
        'https://user:pass@example.com/api/connected-oauth',
        'https://example.com/api/connected-oauth?next=https://attacker.invalid',
        'https://example.com/api/connected-oauth#fragment',
    ],
)
def test_oauth_rejects_ambiguous_or_untrusted_redirect_bases(monkeypatch, redirect):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'client-id')
    monkeypatch.setenv('ATLAS_CONNECTED_OAUTH_REDIRECT_BASE', redirect)
    with pytest.raises(HTTPException) as exc:
        connected_oauth._settings('calendar')
    assert exc.value.status_code == 503


def test_microsoft_provider_uses_read_only_scopes(monkeypatch):
    monkeypatch.setenv('MICROSOFT_CLIENT_ID', 'client-id')
    monkeypatch.setenv(
        'ATLAS_CONNECTED_OAUTH_REDIRECT_BASE', 'https://atlas.example.com/api/connected-oauth'
    )
    _, _, _, auth_base, _, scope = connected_oauth._settings('onedrive')
    assert auth_base.startswith('https://login.microsoftonline.com/')
    assert 'Files.Read' in scope
    assert 'Files.ReadWrite' not in scope
    assert 'offline_access' in scope
