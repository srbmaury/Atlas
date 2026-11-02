"""Authentication endpoints."""

import hashlib
import hmac
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError

from ..ai import enabled
from ..api_dependencies import database, user
from ..config import COOKIE_SECURE, MAX_FILE_BYTES
from ..db import Login, User, Workspace
from ..schemas import Credentials

router = APIRouter()


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
            expires=time.time() + 604800,
        )
    )
    db.commit()
    response.set_cookie(
        'atlas_session',
        token,
        max_age=604800,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='strict',
        path='/',
    )
    return {'id': actor.id, 'email': actor.email}


@router.post('/api/auth/register')
def register(body: Credentials, response: Response, db=Depends(database)):
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
        'mode': 'ai' if enabled() else 'local_excerpts',
        'max_file_bytes': MAX_FILE_BYTES,
    }
