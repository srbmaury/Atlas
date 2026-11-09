"""Authentication endpoints."""

import base64
import hashlib
import hmac
import secrets
import time
from typing import Optional
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import IntegrityError

from .. import supabase_auth
from ..ai import enabled
from ..api_dependencies import database, user
from ..config import COOKIE_SECURE, MAX_FILE_BYTES
from ..db import (
    Conversation,
    Document,
    ExternalConnection,
    GmailConnection,
    Login,
    Organisation,
    User,
    Workspace,
    WorkspaceMember,
)
from ..original_storage import delete_original
from ..rbac import lock_resource
from ..schemas import Credentials

router = APIRouter()
SESSION_SECONDS = 604800
DELETE_AUTH_WINDOW = 600
SUPABASE_PASSWORD_MARKER = 'supabase-auth'


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 310000).hex()
    return f'{salt}:{digest}'


def issue_login(actor, response, db):
    token = secrets.token_urlsafe(48)
    db.add(
        Login(
            token=hashlib.sha256(token.encode()).hexdigest(),
            user_id=actor.id,
            expires=time.time() + SESSION_SECONDS,
        )
    )
    db.commit()
    response.set_cookie(
        'atlas_session',
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='strict',
        path='/',
    )
    return {'id': actor.id, 'email': actor.email}


@router.post('/api/auth/register')
def register(body: Credentials, response: Response, db=Depends(database)):
    config = supabase_auth.settings()
    if config:
        pkce = email_pkce(response, 'confirm')
        supabase_auth.request(
            config,
            'signup',
            payload={**body.model_dump(), **pkce},
            params={'redirect_to': f'{config.origin}/auth/complete?mode=confirm'},
        )
        return {'verification_required': True}
    email = body.email.strip().lower()
    if '@' not in email:
        raise HTTPException(422, 'Enter a valid email address.')
    actor = User(email=email, password=password_hash(body.password))
    db.add(actor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Email already registered.')
    db.add(Workspace(owner_id=actor.id, name='My knowledge base'))
    db.commit()
    return issue_login(actor, response, db)


@router.post('/api/auth/login')
def login(body: Credentials, response: Response, db=Depends(database)):
    config = supabase_auth.settings()
    if config:
        result = supabase_auth.request(
            config, 'token?grant_type=password', payload=body.model_dump()
        )
        return issue_login(verified_account(result, db), response, db)
    actor = db.query(User).filter_by(email=body.email.strip().lower()).first()
    stored = actor.password if actor else '0' * 32 + ':' + '0' * 64
    valid = hmac.compare_digest(password_hash(body.password, stored.split(':')[0]), stored)
    if not actor or not valid:
        raise HTTPException(401, 'Invalid email or password.')
    return issue_login(actor, response, db)


@router.post('/api/auth/logout')
def logout(request: Request, response: Response, db=Depends(database)):
    token = request.cookies.get('atlas_session', '')
    db.query(Login).filter_by(token=hashlib.sha256(token.encode()).hexdigest()).delete()
    db.commit()
    response.delete_cookie('atlas_session', path='/')
    return {'ok': True}


@router.get('/api/me')
def me(actor=Depends(user)):
    return {
        'id': actor.id,
        'email': actor.email,
        'display_name': actor.display_name,
        'mode': 'ai' if enabled() else 'local_excerpts',
        'max_file_bytes': MAX_FILE_BYTES,
    }


class ProfileUpdate(BaseModel):
    display_name: str = Field(max_length=100)


@router.patch('/api/me')
def update_profile(body: ProfileUpdate, actor=Depends(user), db=Depends(database)):
    name = body.display_name.strip()
    if any(ord(character) < 32 or ord(character) == 127 for character in name):
        raise HTTPException(422, 'Enter a display name on one line.')
    actor.display_name = name or None
    db.commit()
    return me(actor)


def require_supabase():
    config = supabase_auth.settings()
    if not config:
        raise HTTPException(503, 'Verified sign-in is not configured.')
    return config


def verified_identity(result):
    identity = result.get('user') or {}
    email = identity.get('email')
    if not email or not identity.get('email_confirmed_at'):
        raise HTTPException(403, 'Verify your email before signing in.')
    try:
        identifier = str(UUID(identity.get('id', '')))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(403, 'Could not verify the account identity.') from None
    return identifier, email.strip().lower()


def verified_account(result, db):
    identifier, email = verified_identity(result)
    actor = db.get(User, identifier)
    if actor and actor.email == email:
        return actor
    if actor or db.query(User.id).filter_by(email=email).first():
        raise HTTPException(409, 'This email is associated with a different Atlas account.')
    actor = User(id=identifier, email=email, password=SUPABASE_PASSWORD_MARKER)
    db.add(actor)
    try:
        db.flush()
        db.add(Workspace(owner_id=identifier, name='My knowledge base'))
        db.flush()
    except IntegrityError:
        db.rollback()
        actor = db.get(User, identifier)
        if actor is None or actor.email != email:
            raise HTTPException(
                409, 'This email is associated with a different Atlas account.'
            ) from None
    return actor


class EmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class EmailToken(BaseModel):
    token_hash: Optional[str] = Field(default=None, min_length=8, max_length=512)
    code: Optional[str] = Field(default=None, min_length=8, max_length=512)

    @model_validator(mode='after')
    def exactly_one_token(self):
        if bool(self.token_hash) == bool(self.code):
            raise ValueError('Provide exactly one email verification token.')
        return self


class PasswordReset(EmailToken):
    password: str = Field(min_length=10, max_length=200)


@router.get('/api/auth/options')
def auth_options():
    configured = bool(supabase_auth.settings())
    return {'verified_auth': configured}


def pkce_pair():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge.decode().rstrip('=')


def email_pkce(response, mode):
    verifier, challenge = pkce_pair()
    response.set_cookie(
        f'atlas_email_{mode}_pkce',
        verifier,
        max_age=3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='strict',
        path=f'/api/auth/{mode}',
    )
    return {'code_challenge': challenge, 'code_challenge_method': 's256'}


def complete_email(config, request, response, body, mode):
    cookie = f'atlas_email_{mode}_pkce'
    if body.code:
        verifier = request.cookies.get(cookie)
        if not verifier:
            raise HTTPException(
                400, 'Open the link in the browser where you requested it, or request a new email.'
            )
        result = supabase_auth.request(
            config,
            'token?grant_type=pkce',
            payload={'auth_code': body.code, 'code_verifier': verifier},
        )
    else:
        kind = 'recovery' if mode == 'reset' else 'email'
        result = supabase_auth.request(
            config, 'verify', payload={'type': kind, 'token_hash': body.token_hash}
        )
    response.delete_cookie(cookie, path=f'/api/auth/{mode}')
    return result


@router.post('/api/auth/forgot')
def forgot(body: EmailRequest, response: Response):
    config = require_supabase()
    pkce = email_pkce(response, 'reset')
    try:
        supabase_auth.request(
            config,
            'recover',
            payload={**body.model_dump(), **pkce},
            params={'redirect_to': f'{config.origin}/auth/complete?mode=reset'},
        )
    except HTTPException as error:
        if error.status_code != 400:
            raise
    return {'ok': True}


@router.post('/api/auth/confirm')
def confirm(body: EmailToken, request: Request, response: Response, db=Depends(database)):
    result = complete_email(require_supabase(), request, response, body, 'confirm')
    return issue_login(verified_account(result, db), response, db)


@router.post('/api/auth/reset')
def reset(body: PasswordReset, request: Request, response: Response, db=Depends(database)):
    config = require_supabase()
    result = complete_email(config, request, response, body, 'reset')
    identifier, _ = verified_identity(result)
    access_token = result.get('access_token')
    if not access_token:
        raise HTTPException(400, 'The password reset link could not be verified.')
    supabase_auth.request(
        config, 'user', method='PUT', token=access_token, payload={'password': body.password}
    )
    db.query(Login).filter_by(user_id=identifier).delete()
    db.commit()
    response.delete_cookie('atlas_session', path='/')
    return {'ok': True}


@router.get('/api/auth/google')
def google():
    config = require_supabase()
    verifier, challenge = pkce_pair()
    params = urlencode(
        {
            'provider': 'google',
            'redirect_to': f'{config.origin}/api/auth/google/callback',
            'code_challenge': challenge,
            'code_challenge_method': 's256',
        }
    )
    response = RedirectResponse(f'{config.url}/auth/v1/authorize?{params}')
    response.set_cookie(
        'atlas_google_pkce',
        verifier,
        max_age=600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='lax',
        path='/api/auth/google/callback',
    )
    return response


@router.get('/api/auth/google/callback')
def google_callback(request: Request, code: str = '', db=Depends(database)):
    config = require_supabase()
    response = RedirectResponse(f'{config.origin}/', status_code=303)
    response.delete_cookie('atlas_google_pkce', path='/api/auth/google/callback')
    verifier = request.cookies.get('atlas_google_pkce')
    try:
        if not (code and verifier):
            raise HTTPException(400, 'The Google sign-in attempt expired.')
        result = supabase_auth.request(
            config, 'token?grant_type=pkce', payload={'auth_code': code, 'code_verifier': verifier}
        )
        issue_login(verified_account(result, db), response, db)
    except HTTPException:
        response.headers['Location'] = f'{config.origin}/?auth_error=google'
    return response


class DeleteAccountRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


@router.delete('/api/me')
def delete_account(
    body: DeleteAccountRequest,
    request: Request,
    response: Response,
    actor=Depends(user),
    db=Depends(database),
):
    if body.email != actor.email:
        raise HTTPException(422, 'Type your exact account email to confirm deletion.')
    token = request.cookies.get('atlas_session', '')
    login = db.get(Login, hashlib.sha256(token.encode()).hexdigest())
    if not login or login.expires < time.time() + SESSION_SECONDS - DELETE_AUTH_WINDOW:
        raise HTTPException(403, 'Sign out and sign in again before deleting your account.')

    actor_id = actor.id
    actor = lock_resource(db, User, actor_id)
    if not actor:
        raise HTTPException(401, 'Sign in to continue.')
    if db.query(Organisation.id).filter_by(owner_id=actor_id).first():
        raise HTTPException(409, 'Transfer or delete the organisations you own first.')
    owned = db.query(Workspace).filter_by(owner_id=actor_id).with_for_update().all()
    ids = [item.id for item in owned]
    if (
        any(item.organisation_id for item in owned)
        or db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id.in_(ids), WorkspaceMember.user_id != actor_id)
        .first()
    ):
        raise HTTPException(409, 'Transfer or delete the shared workspaces you own first.')
    documents = db.query(Document).filter(Document.workspace_id.in_(ids)).all()
    if any(item.status in ('queued', 'processing') for item in documents):
        raise HTTPException(
            409, 'Wait for document processing to finish before deleting your account.'
        )
    originals = [item.id for item in documents]
    for model, field in (
        (Conversation, Conversation.author_id),
        (GmailConnection, GmailConnection.connected_by),
        (ExternalConnection, ExternalConnection.connected_by),
    ):
        db.query(model).filter(field == actor_id).delete(synchronize_session=False)
    for item in owned:
        db.delete(item)
    db.flush()
    db.delete(actor)
    db.flush()
    if actor.password == SUPABASE_PASSWORD_MARKER:
        supabase_auth.delete_identity(require_supabase(), str(UUID(actor_id)))
    db.commit()
    for identifier in originals:
        delete_original(identifier)
    response.delete_cookie('atlas_session', path='/')
    return {'ok': True}
