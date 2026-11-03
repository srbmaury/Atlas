"""Workspace-scoped OAuth for read-only Google Calendar and Microsoft Graph.

State is hashed, single-use and tied to the initiating workspace/user.
Refresh credentials are encrypted using the existing source encryption key.
"""

import base64
import hashlib
import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from .db import ConnectedOAuthState, ExternalConnection, Session, SourceHealthCheck, User, Workspace
from .gmail import actor, allowed_workspace, crypt

router = APIRouter(prefix='/api/connected-oauth')
PROVIDERS = {'calendar', 'onedrive', 'outlook', 'sharepoint'}
GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
MS_SCOPES = {
    'onedrive': 'openid profile offline_access User.Read Files.Read',
    'outlook': 'openid profile offline_access User.Read Mail.Read',
    'sharepoint': 'openid profile offline_access User.Read Sites.Read.All Files.Read.All',
}


def _settings(provider):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported OAuth provider.')
    google = provider == 'calendar'
    client_id = os.getenv('GOOGLE_CLIENT_ID' if google else 'MICROSOFT_CLIENT_ID', '')
    secret = os.getenv('GOOGLE_CLIENT_SECRET' if google else 'MICROSOFT_CLIENT_SECRET', '')
    base = os.getenv(
        'ATLAS_CONNECTED_OAUTH_REDIRECT_BASE', 'http://localhost:3000/api/connected-oauth'
    ).rstrip('/')
    redirect = f'{base}/{provider}/callback'
    if not client_id or not redirect:
        raise HTTPException(503, 'Configure OAuth client credentials and redirect URL.')
    if not redirect.startswith('https://') and not redirect.startswith(
        ('http://localhost:', 'http://127.0.0.1:')
    ):
        raise HTTPException(503, 'OAuth redirect must use HTTPS outside local development.')
    crypt()
    auth_base = (
        'https://accounts.google.com/o/oauth2/v2/auth'
        if google
        else 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize'
    )
    token_url = (
        'https://oauth2.googleapis.com/token'
        if google
        else 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token'
    )
    scope = GOOGLE_SCOPES if google else MS_SCOPES[provider]
    return client_id, secret, redirect, auth_base, token_url, scope


def _pkce():
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip('=')
    return verifier, challenge


def _token_request(provider, payload):
    _, _, _, _, token_url, _ = _settings(provider)
    try:
        response = httpx.post(
            token_url, data=payload, timeout=15, follow_redirects=False, trust_env=False
        )
        response.raise_for_status()
        value = response.json()
        if not value.get('access_token'):
            raise ValueError('No access token')
        return value
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            422, 'Authorization expired or was denied. Reconnect the source.'
        ) from exc


@router.get('/{provider}/connect')
def connect(provider: str, workspaceId: str, request: Request):
    client_id, _, redirect, auth_base, _, scope = _settings(provider)
    with Session() as db:
        who = actor(request, db)
        allowed_workspace(db, who, workspaceId)
        state = secrets.token_urlsafe(32)
        verifier, challenge = _pkce()
        db.add(
            ConnectedOAuthState(
                value=hashlib.sha256(state.encode()).hexdigest(),
                provider=provider,
                workspace_id=workspaceId,
                user_id=who.id,
                verifier=verifier,
                expires=time.time() + 600,
            )
        )
        db.commit()
    params = {
        'client_id': client_id,
        'redirect_uri': redirect,
        'response_type': 'code',
        'scope': scope,
        'state': state,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    }
    if provider == 'calendar':
        params.update({'access_type': 'offline', 'prompt': 'consent'})
    return {'authorization_url': auth_base + '?' + urlencode(params)}


@router.get('/{provider}/callback')
def callback(provider: str, state: str = '', code: str = ''):
    client_id, client_secret, redirect, _, _, _ = _settings(provider)
    if not state or not code:
        raise HTTPException(400, 'Authorization was cancelled.')
    with Session() as db:
        item = db.get(ConnectedOAuthState, hashlib.sha256(state.encode()).hexdigest())
        if not item or item.provider != provider or item.expires < time.time():
            raise HTTPException(400, 'Authorization state is invalid or expired.')
        workspaceId = item.workspace_id
        verifier = item.verifier
        owner = db.get(User, item.user_id)
        if (
            not owner
            or not db.query(Workspace).filter_by(id=workspaceId, owner_id=owner.id).first()
        ):
            raise HTTPException(400, 'Workspace no longer exists.')
        db.delete(item)
        db.commit()
        payload = {
            'client_id': client_id,
            'code': code,
            'redirect_uri': redirect,
            'grant_type': 'authorization_code',
            'code_verifier': verifier,
        }
        if client_secret:
            payload['client_secret'] = client_secret
        tokens = _token_request(provider, payload)
        refresh = tokens.get('refresh_token')
        if not refresh:
            raise HTTPException(
                422, 'Provider did not grant offline access. Reauthorize with refresh permissions.'
            )
        from .batch_connectors import profile

        account = profile(provider, tokens['access_token'])
        encrypted = (
            crypt().encrypt(json.dumps({'auth': 'oauth', 'refresh': refresh}).encode()).decode()
        )
        row = db.get(ExternalConnection, (workspaceId, provider))
        if row:
            row.account, row.secret = account, encrypted
        else:
            db.add(
                ExternalConnection(
                    workspace_id=workspaceId, provider=provider, account=account, secret=encrypted
                )
            )
        health = db.get(SourceHealthCheck, (workspaceId, provider))
        if health:
            db.delete(health)
        db.commit()
    return RedirectResponse('/?source=connected', status_code=303)


def access_token(provider, encrypted_payload, db, row):
    """Refresh each request; never return refresh tokens to API callers."""
    try:
        item = json.loads(encrypted_payload)
    except (TypeError, ValueError):
        return encrypted_payload  # Existing manual access token.
    if not isinstance(item, dict) or item.get('auth') != 'oauth':
        return encrypted_payload
    refresh = item.get('refresh')
    if not isinstance(refresh, str) or not refresh:
        raise HTTPException(503, 'OAuth credential is damaged. Reconnect the source.')
    client_id, client_secret, _, _, _, _ = _settings(provider)
    payload = {'client_id': client_id, 'refresh_token': refresh, 'grant_type': 'refresh_token'}
    if client_secret:
        payload['client_secret'] = client_secret
    tokens = _token_request(provider, payload)
    if tokens.get('refresh_token') and tokens['refresh_token'] != refresh:
        row.secret = (
            crypt()
            .encrypt(json.dumps({'auth': 'oauth', 'refresh': tokens['refresh_token']}).encode())
            .decode()
        )
        db.commit()
    return tokens['access_token']
