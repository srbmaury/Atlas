"""Role boundaries, tenant isolation, revocation and private source enforcement."""

import os
import sqlite3
import subprocess
import sys
import time

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import external_sources, gmail
from app.db import ConnectedOAuthState, ExternalConnection, GmailConnection, Session
from app.main import app


@pytest.fixture
def accounts():
    clients = []
    with TestClient(app) as owner:
        for client in (owner, TestClient(app), TestClient(app)):
            clients.append(client)
            email = f'rbac-{time.time_ns()}@example.test'
            result = client.post(
                '/api/auth/register', json={'email': email, 'password': 'test-password-long'}
            )
            assert result.status_code == 200
            client.identity = result.json()
        workspace = owner.get('/api/workspaces').json()[0]['id']
        yield clients[0], clients[1], clients[2], workspace
    for client in clients[1:]:
        client.close()


def grant(owner, member, workspace, role):
    result = owner.put(
        f'/api/workspaces/{workspace}/members',
        json={'email': member.identity['email'], 'role': role},
    )
    assert result.status_code == 200, result.text


def test_viewer_reads_asks_and_saves_only_own_chats(accounts):
    owner, viewer, outsider, workspace = accounts
    grant(owner, viewer, workspace, 'viewer')
    assert viewer.get(f'/api/workspaces/{workspace}/documents').status_code == 200
    assert outsider.get(f'/api/workspaces/{workspace}/documents').status_code == 404
    assert (
        viewer.post(f'/api/workspaces/{workspace}/chat', json={'question': 'budget'}).status_code
        == 200
    )
    private = owner.post(
        f'/api/workspaces/{workspace}/conversations',
        json={'title': 'Private', 'messages': [{'role': 'assistant', 'content': 'secret'}]},
    ).json()
    assert viewer.get(f'/api/workspaces/{workspace}/conversations').json() == []
    for method in ('get', 'put', 'delete', 'patch'):
        kwargs = (
            {'json': {'title': 'Override', 'messages': []}} if method in ('put', 'patch') else {}
        )
        assert (
            getattr(viewer, method)(
                f'/api/workspaces/{workspace}/conversations/{private["id"]}', **kwargs
            ).status_code
            == 404
        )
    own = viewer.post(
        f'/api/workspaces/{workspace}/conversations', json={'title': 'My chat', 'messages': []}
    )
    assert own.status_code == 200
    assert (
        owner.get(f'/api/workspaces/{workspace}/conversations/{own.json()["id"]}').status_code
        == 404
    )


@pytest.mark.parametrize(
    'method,suffix,body',
    [
        ('post', '/uploads', {'name': 'a.txt', 'size': 10}),
        ('put', '/uploads/fake', None),
        ('delete', '/uploads/fake', None),
        ('post', '/uploads/fake/complete', None),
        ('post', '/documents', None),
        ('post', '/documents/fake/retry', None),
        ('delete', '/documents/fake', None),
        ('post', '/web-pages', {'url': 'https://example.com'}),
        ('put', '/members', {'email': 'x@example.com', 'role': 'manager'}),
        ('post', '/sources/github', {'token': 'secret'}),
        ('delete', '/sources/github', None),
        ('delete', '/gmail', None),
        ('delete', '/drive', None),
        ('post', '/sources/health/check', None),
        ('delete', '', {'name': 'My knowledge base'}),
    ],
)
def test_viewer_cannot_mutate_workspace(accounts, method, suffix, body):
    owner, viewer, _, workspace = accounts
    grant(owner, viewer, workspace, 'viewer')
    result = viewer.request(
        method.upper(), f'/api/workspaces/{workspace}{suffix}', **({'json': body} if body else {})
    )
    assert result.status_code == 403, result.text


def test_editor_can_upload_but_cannot_manage_members_or_oauth(accounts):
    owner, editor, _, workspace = accounts
    grant(owner, editor, workspace, 'editor')
    assert (
        editor.post(
            f'/api/workspaces/{workspace}/documents',
            files={'files': ('note.txt', b'Project budget is 20.')},
        ).status_code
        == 200
    )
    assert editor.get(f'/api/workspaces/{workspace}/members').status_code == 403
    for path in ('gmail/connect', 'drive/connect', 'connected-oauth/calendar/connect'):
        assert editor.get(f'/api/{path}?workspaceId={workspace}').status_code == 403
    # A viewer cannot request a privilege escalation by setting arbitrary role names.
    grant(owner, editor, workspace, 'viewer')
    assert (
        editor.put(
            f'/api/workspaces/{workspace}/members',
            json={'email': editor.identity['email'], 'role': 'manager'},
        ).status_code
        == 403
    )


def test_organisation_admin_has_no_implicit_workspace_access(accounts):
    owner, admin, member, _ = accounts
    org = owner.post('/api/organisations', json={'name': 'Research'}).json()['id']
    for account, role in ((admin, 'admin'), (member, 'member')):
        assert (
            owner.put(
                f'/api/organisations/{org}/members',
                json={'email': account.identity['email'], 'role': role},
            ).status_code
            == 200
        )
    workspace = owner.post(
        '/api/workspaces', json={'name': 'Restricted', 'organisation_id': org}
    ).json()['id']
    assert admin.get(f'/api/workspaces/{workspace}/documents').status_code == 404
    assert workspace not in [item['id'] for item in admin.get('/api/workspaces').json()]
    assert (
        admin.put(
            f'/api/workspaces/{workspace}/members',
            json={'email': admin.identity['email'], 'role': 'manager'},
        ).status_code
        == 404
    )
    assert (
        member.post(
            '/api/workspaces', json={'name': 'Escalation', 'organisation_id': org}
        ).status_code
        == 403
    )
    grant(owner, member, workspace, 'editor')
    assert member.get(f'/api/workspaces/{workspace}/documents').status_code == 200
    assert (
        admin.delete(f'/api/organisations/{org}/members/{member.identity["id"]}').status_code == 200
    )
    assert member.get(f'/api/workspaces/{workspace}/documents').status_code == 404
    # Rejoining the organisation must not resurrect old workspace grants.
    assert (
        owner.put(
            f'/api/organisations/{org}/members',
            json={'email': member.identity['email'], 'role': 'member'},
        ).status_code
        == 200
    )
    assert member.get(f'/api/workspaces/{workspace}/documents').status_code == 404
    assert (
        admin.delete(f'/api/organisations/{org}/members/{owner.identity["id"]}').status_code == 409
    )
    assert (
        owner.delete(f'/api/workspaces/{workspace}/members/{owner.identity["id"]}').status_code
        == 409
    )


def test_private_connectors_are_hidden_until_owner_shares(accounts, monkeypatch):
    owner, member, _, workspace = accounts
    grant(owner, member, workspace, 'manager')
    key = Fernet.generate_key()
    monkeypatch.setattr(gmail, 'KEY', key.decode())
    with Session() as db:
        db.add(
            ExternalConnection(
                workspace_id=workspace,
                provider='github',
                account='private-account',
                secret=Fernet(key).encrypt(b'token').decode(),
                connected_by=owner.identity['id'],
            )
        )
        db.add(
            GmailConnection(
                workspace_id=workspace,
                email='private@example.com',
                refresh_token='secret',
                connected_by=owner.identity['id'],
            )
        )
        db.commit()
    statuses = member.get(f'/api/workspaces/{workspace}/sources').json()
    assert not next(row for row in statuses if row['provider'] == 'github')['connected']
    assert member.get(f'/api/gmail/status?workspaceId={workspace}').json()['email'] is None
    monkeypatch.setattr(
        external_sources, 'source_search', lambda *args: pytest.fail('Private credential used')
    )
    assert (
        member.post(
            f'/api/workspaces/{workspace}/sources/github/search', json={'query': 'budget'}
        ).status_code
        == 403
    )
    assert member.delete(f'/api/workspaces/{workspace}/sources/github').status_code == 403
    assert (
        member.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github', json={'shared': True}
        ).status_code
        == 403
    )
    assert (
        owner.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github', json={'shared': True}
        ).status_code
        == 200
    )
    monkeypatch.setattr(external_sources, 'source_search', lambda *args: [])
    assert (
        member.post(
            f'/api/workspaces/{workspace}/sources/github/search', json={'query': 'budget'}
        ).status_code
        == 200
    )
    assert (
        owner.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github', json={'shared': False}
        ).status_code
        == 200
    )
    assert (
        member.post(
            f'/api/workspaces/{workspace}/sources/github/search', json={'query': 'budget'}
        ).status_code
        == 403
    )


def test_revocation_prevents_oauth_completion(accounts, monkeypatch):
    import hashlib

    from app import connected_oauth

    owner, manager, _, workspace = accounts
    grant(owner, manager, workspace, 'manager')
    with Session() as db:
        db.add(
            ConnectedOAuthState(
                value=hashlib.sha256(b'pending').hexdigest(),
                provider='calendar',
                user_id=manager.identity['id'],
                workspace_id=workspace,
                verifier='proof',
                expires=time.time() + 600,
            )
        )
        db.commit()
    assert (
        owner.delete(f'/api/workspaces/{workspace}/members/{manager.identity["id"]}').status_code
        == 200
    )
    monkeypatch.setattr(
        connected_oauth,
        '_settings',
        lambda _: ('id', 'secret', 'redirect', 'auth', 'token', 'scope'),
    )
    monkeypatch.setattr(
        connected_oauth,
        '_token_request',
        lambda *args: pytest.fail('Revoked grant exchanged OAuth code'),
    )
    assert (
        manager.get('/api/connected-oauth/calendar/callback?state=pending&code=code').status_code
        == 404
    )


def test_workspace_removal_unshares_former_member_credentials(accounts):
    owner, manager, _, workspace = accounts
    grant(owner, manager, workspace, 'manager')
    with Session() as db:
        db.add(
            ExternalConnection(
                workspace_id=workspace,
                provider='slack',
                account='former-member',
                secret='opaque',
                connected_by=manager.identity['id'],
                shared=True,
            )
        )
        db.commit()
    assert (
        owner.delete(f'/api/workspaces/{workspace}/members/{manager.identity["id"]}').status_code
        == 200
    )
    with Session() as db:
        assert not db.get(ExternalConnection, (workspace, 'slack')).shared
    assert manager.get(f'/api/workspaces/{workspace}/documents').status_code == 404


def test_upgrade_preserves_legacy_ownership_and_privacy(tmp_path):
    path = tmp_path / 'legacy.db'
    with sqlite3.connect(path) as db:
        db.executescript("""
            CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
            INSERT INTO alembic_version VALUES ('0006');
            CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password TEXT);
            INSERT INTO users VALUES ('u', 'legacy@example.com', 'hash');
            CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, created FLOAT);
            INSERT INTO workspaces VALUES ('w', 'u', 'Legacy', 1);
            CREATE TABLE conversations (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, messages JSON, created FLOAT, updated FLOAT);
            INSERT INTO conversations VALUES ('c', 'w', 'Chat', '[]', 1, 1);
            CREATE TABLE external_connections (workspace_id TEXT, provider TEXT, account TEXT, secret TEXT, PRIMARY KEY(workspace_id, provider));
            INSERT INTO external_connections VALUES ('w', 'github', 'legacy', 'encrypted');
            CREATE TABLE gmail_connections (workspace_id TEXT PRIMARY KEY, email TEXT, refresh_token TEXT);
            INSERT INTO gmail_connections VALUES ('w', 'legacy@example.com', 'encrypted');
        """)
    env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + str(path), 'DATA_DIR': str(tmp_path)}
    result = subprocess.run(
        [sys.executable, '-c', 'from app.db import init_db; init_db()'],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT organisation_id FROM workspaces').fetchone() == (None,)
        assert db.execute('SELECT author_id FROM conversations').fetchone() == ('u',)
        for table in ('gmail_connections', 'external_connections'):
            assert db.execute(f'SELECT connected_by, shared FROM {table}').fetchone() == ('u', 0)


def test_unsharing_during_stream_does_not_release_answer(accounts, monkeypatch):
    import json

    from app import connected_synthesis, main
    from app.source_contract import Evidence

    owner, member, _, workspace = accounts
    grant(owner, member, workspace, 'viewer')
    with Session() as db:
        db.add(
            ExternalConnection(
                workspace_id=workspace,
                provider='slack',
                account='team',
                secret='opaque',
                shared=True,
                connected_by=owner.identity['id'],
            )
        )
        db.commit()
    monkeypatch.setattr(
        main,
        'collect_connected_evidence',
        lambda *args: (
            [Evidence('slack', 'message', 'Budget', 'Secret budget is 20.', 'https://example.com')],
            {},
        ),
    )

    def delayed(*args, **kwargs):
        with Session() as db:
            db.get(ExternalConnection, (workspace, 'slack')).shared = False
            db.commit()
        yield {'type': 'delta', 'text': 'Secret budget is 20.'}

    monkeypatch.setattr(connected_synthesis, 'stream_connected', delayed)
    response = member.post(
        f'/api/workspaces/{workspace}/connected-chat/stream',
        json={
            'question': 'What is the budget?',
            'include_documents': False,
            'providers': ['slack'],
        },
    )
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[-1]['type'] == 'error'
    assert 'Secret budget' not in response.text


def test_revocation_during_document_generation_blocks_response(accounts, monkeypatch):
    from app import main
    from app.db import WorkspaceMember

    owner, member, _, workspace = accounts
    grant(owner, member, workspace, 'viewer')
    monkeypatch.setattr(
        main,
        'retrieve',
        lambda *args: [
            {
                'chunk_id': 'fake',
                'document_id': 'fake',
                'name': 'Budget',
                'page': 1,
                'text': 'Secret budget is 20.',
            }
        ],
    )

    def delayed(*args):
        with Session() as db:
            db.query(WorkspaceMember).filter_by(
                workspace_id=workspace, user_id=member.identity['id']
            ).delete()
            db.commit()
        return {'answer': 'Secret budget is 20.', 'sources': []}

    monkeypatch.setattr(main, 'generate', delayed)
    result = member.post(f'/api/workspaces/{workspace}/chat', json={'question': 'budget'})
    assert result.status_code == 404
    assert 'Secret budget' not in result.text
