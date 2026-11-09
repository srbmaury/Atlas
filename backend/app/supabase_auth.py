"""Server-side Supabase Auth requests. Atlas still issues its own session cookie."""

import os
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

from .config import COOKIE_SECURE


@dataclass(frozen=True)
class AuthSettings:
    url: str
    key: str
    origin: str


def settings():
    url = os.getenv('ATLAS_AUTH_URL', '').rstrip('/')
    key = os.getenv('ATLAS_AUTH_KEY', '')
    origin = os.getenv('ATLAS_AUTH_ORIGIN', '').rstrip('/')
    if not COOKIE_SECURE and not (url or key or origin):
        return None
    for address in (url, origin):
        parts = urlsplit(address)
        local = parts.scheme == 'http' and parts.hostname in {'localhost', '127.0.0.1'}
        if (
            not parts.hostname
            or (parts.scheme != 'https' and not (local and not COOKIE_SECURE))
            or parts.path
            or parts.query
            or parts.fragment
            or parts.username
        ):
            raise HTTPException(503, 'Verified sign-in is not configured.')
    if not key.startswith('sb_publishable_'):
        raise HTTPException(503, 'Verified sign-in is not configured.')
    return AuthSettings(url, key, origin)


def request(config, path, *, method='POST', payload=None, token=None, params=None):
    headers = {'apikey': config.key}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
            response = client.request(
                method, f'{config.url}/auth/v1/{path}', headers=headers, json=payload, params=params
            )
    except httpx.RequestError:
        raise HTTPException(503, 'Sign-in service is temporarily unavailable.') from None
    if response.status_code == 429:
        raise HTTPException(429, 'Too many attempts. Try again later.')
    if response.status_code >= 500:
        raise HTTPException(503, 'Sign-in service is temporarily unavailable.')
    try:
        result = response.json() if response.content else {}
    except ValueError:
        raise HTTPException(503, 'Sign-in service returned an invalid response.') from None
    if not isinstance(result, dict):
        raise HTTPException(503, 'Sign-in service returned an invalid response.')
    if not response.is_success:
        detail = (
            'Check your email for a verification link before signing in.'
            if path == 'token?grant_type=password'
            and result.get('error_code') == 'email_not_confirmed'
            else 'The credentials or link could not be verified.'
        )
        raise HTTPException(400, detail)
    return result
