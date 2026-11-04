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


def test_workspace_removal_disconnects_former_member_credentials(accounts):
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
        assert db.get(ExternalConnection, (workspace, 'slack')) is None
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


def test_workspace_transfer_preserves_data_and_private_credential_owner(accounts):
    owner, successor, outsider, workspace = accounts
    grant(owner, successor, workspace, 'viewer')
    name = next(
        row['name'] for row in owner.get('/api/workspaces').json() if row['id'] == workspace
    )
    chat = owner.post(
        f'/api/workspaces/{workspace}/conversations',
        json={'title': 'Private research', 'messages': []},
    ).json()
    with Session() as db:
        # Also exercise legacy owner fallback: transfer must pin it to the old owner.
        db.add(
            ExternalConnection(
                workspace_id=workspace, provider='github', account='private', secret='opaque'
            )
        )
        db.commit()
    body = {'member_id': successor.identity['id'], 'confirmation': name}
    assert successor.post(f'/api/workspaces/{workspace}/ownership', json=body).status_code == 403
    assert (
        owner.post(
            f'/api/workspaces/{workspace}/ownership', json={**body, 'confirmation': 'wrong'}
        ).status_code
        == 422
    )
    assert (
        owner.post(
            f'/api/workspaces/{workspace}/ownership',
            json={**body, 'member_id': outsider.identity['id']},
        ).status_code
        == 422
    )
    assert owner.post(f'/api/workspaces/{workspace}/ownership', json=body).status_code == 200
    members = successor.get(f'/api/workspaces/{workspace}/members').json()
    assert next(row for row in members if row['owner'])['id'] == successor.identity['id']
    assert next(row for row in members if row['id'] == owner.identity['id'])['role'] == 'manager'
    assert owner.get(f'/api/workspaces/{workspace}/conversations/{chat["id"]}').status_code == 200
    assert (
        successor.get(f'/api/workspaces/{workspace}/conversations/{chat["id"]}').status_code == 404
    )
    statuses = successor.get(f'/api/workspaces/{workspace}/sources').json()
    assert not next(row for row in statuses if row['provider'] == 'github')['connected']
    with Session() as db:
        assert (
            db.get(ExternalConnection, (workspace, 'github')).connected_by == owner.identity['id']
        )
    # The previous owner cannot transfer again and may now be offboarded normally.
    assert owner.post(f'/api/workspaces/{workspace}/ownership', json=body).status_code == 403
    assert (
        successor.delete(f'/api/workspaces/{workspace}/members/{owner.identity["id"]}').status_code
        == 200
    )
    assert owner.get(f'/api/workspaces/{workspace}/documents').status_code == 404


def test_organisation_transfer_allows_offboarding_without_deleting_workspaces(accounts):
    owner, successor, _, _ = accounts
    org = owner.post('/api/organisations', json={'name': 'Transfer team'}).json()['id']
    assert (
        owner.put(
            f'/api/organisations/{org}/members',
            json={'email': successor.identity['email'], 'role': 'admin'},
        ).status_code
        == 200
    )
    workspace = owner.post(
        '/api/workspaces', json={'name': 'Keep this', 'organisation_id': org}
    ).json()['id']
    grant(owner, successor, workspace, 'manager')
    assert (
        successor.post(
            f'/api/organisations/{org}/ownership',
            json={'member_id': owner.identity['id'], 'confirmation': 'Transfer team'},
        ).status_code
        == 403
    )
    assert (
        owner.post(
            f'/api/workspaces/{workspace}/ownership',
            json={'member_id': successor.identity['id'], 'confirmation': 'Keep this'},
        ).status_code
        == 200
    )
    assert (
        owner.post(
            f'/api/organisations/{org}/ownership',
            json={'member_id': successor.identity['id'], 'confirmation': 'Transfer team'},
        ).status_code
        == 200
    )
    assert (
        successor.delete(f'/api/organisations/{org}/members/{owner.identity["id"]}').status_code
        == 200
    )
    assert successor.get(f'/api/workspaces/{workspace}/documents').status_code == 200
    assert owner.get(f'/api/workspaces/{workspace}/documents').status_code == 404


def test_source_member_grants_restrict_status_search_and_chat(accounts, monkeypatch):
    from fastapi import HTTPException

    from app import main
    from app.db import SourceGrant, User
    from app.rbac import revalidate_access
    from app.schemas import ConnectedQuestion

    owner, allowed, denied, workspace = accounts
    grant(owner, allowed, workspace, 'viewer')
    grant(owner, denied, workspace, 'manager')  # Manager is not a source-access bypass.
    key = Fernet.generate_key()
    monkeypatch.setattr(gmail, 'KEY', key.decode())
    with Session() as db:
        db.add(
            ExternalConnection(
                workspace_id=workspace,
                provider='github',
                account='restricted',
                secret=Fernet(key).encrypt(b'secret-token').decode(),
                connected_by=owner.identity['id'],
            )
        )
        db.commit()
    assert (
        owner.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github',
            json={'shared': False, 'member_ids': [allowed.identity['id']]},
        ).status_code
        == 200
    )
    monkeypatch.setattr(
        external_sources,
        'source_search',
        lambda *args: [
            {
                'id': 'record',
                'title': 'Budget',
                'excerpt': 'Approved budget is 20.',
                'url': 'https://example.com',
            }
        ],
    )
    assert (
        allowed.post(
            f'/api/workspaces/{workspace}/sources/github/search', json={'query': 'budget'}
        ).status_code
        == 200
    )
    assert (
        denied.post(
            f'/api/workspaces/{workspace}/sources/github/search', json={'query': 'budget'}
        ).status_code
        == 403
    )
    assert next(
        row
        for row in allowed.get(f'/api/workspaces/{workspace}/sources').json()
        if row['provider'] == 'github'
    )['connected']
    assert not next(
        row
        for row in denied.get(f'/api/workspaces/{workspace}/sources').json()
        if row['provider'] == 'github'
    )['connected']
    body = ConnectedQuestion(question='budget', include_documents=False, providers=['github'])
    with Session() as db:
        evidence, _ = main.collect_connected_evidence(
            workspace, body, db.get(User, allowed.identity['id']), db
        )
        assert evidence
        with pytest.raises(HTTPException) as exc:
            main.collect_connected_evidence(
                workspace, body, db.get(User, denied.identity['id']), db
            )
        assert exc.value.status_code == 403
    # Revocation blocks in-flight results as well as future searches.
    assert (
        owner.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github',
            json={'shared': False, 'member_ids': []},
        ).status_code
        == 200
    )
    with Session() as db:
        with pytest.raises(HTTPException):
            revalidate_access(workspace, db.get(User, allowed.identity['id']), ['github'])
        assert db.query(SourceGrant).filter_by(workspace_id=workspace).count() == 0


def test_source_grants_cannot_target_outsiders_and_revoke_on_offboarding(accounts):
    owner, member, outsider, workspace = accounts
    grant(owner, member, workspace, 'viewer')
    with Session() as db:
        db.add(
            ExternalConnection(
                workspace_id=workspace,
                provider='slack',
                account='team',
                secret='opaque',
                connected_by=owner.identity['id'],
            )
        )
        db.commit()
    endpoint = f'/api/workspaces/{workspace}/connection-sharing/slack'
    assert (
        owner.patch(
            endpoint, json={'shared': False, 'member_ids': [outsider.identity['id']]}
        ).status_code
        == 422
    )
    assert (
        owner.patch(
            endpoint, json={'shared': True, 'member_ids': [member.identity['id']]}
        ).status_code
        == 422
    )
    assert (
        owner.patch(
            endpoint, json={'shared': False, 'member_ids': [member.identity['id']]}
        ).status_code
        == 200
    )
    assert (
        owner.delete(f'/api/workspaces/{workspace}/members/{member.identity["id"]}').status_code
        == 200
    )
    grant(owner, member, workspace, 'viewer')
    statuses = member.get(f'/api/workspaces/{workspace}/sources').json()
    assert not next(row for row in statuses if row['provider'] == 'slack')['connected']


def test_audit_is_scoped_paginated_and_cannot_be_edited(accounts):
    owner, member, outsider, workspace = accounts
    grant(owner, member, workspace, 'viewer')
    grant(owner, member, workspace, 'editor')
    page = owner.get(f'/api/workspaces/{workspace}/audit?limit=1').json()
    assert len(page['events']) == 1 and page['next_cursor']
    assert page['events'][0]['details']['previous_role'] == 'viewer'
    older = owner.get(
        f'/api/workspaces/{workspace}/audit?limit=1&cursor={page["next_cursor"]}'
    ).json()
    assert older['events'][0]['id'] != page['events'][0]['id']
    assert member.get(f'/api/workspaces/{workspace}/audit').status_code == 403
    assert outsider.get(f'/api/workspaces/{workspace}/audit').status_code == 404
    assert (
        outsider.get(f'/api/workspaces/{workspace}/audit?cursor={page["next_cursor"]}').status_code
        == 404
    )
    assert owner.get(f'/api/workspaces/{workspace}/audit?limit=1000').status_code == 422
    assert owner.delete(f'/api/workspaces/{workspace}/audit').status_code == 405
    assert owner.patch(f'/api/workspaces/{workspace}/audit', json={'events': []}).status_code == 405


def test_connect_disconnect_clear_grants_and_audit_without_secrets(accounts, monkeypatch):
    from app.db import SourceGrant

    owner, member, _, workspace = accounts
    grant(owner, member, workspace, 'viewer')
    key = Fernet.generate_key()
    monkeypatch.setattr(gmail, 'KEY', key.decode())
    monkeypatch.setattr(external_sources, 'profile', lambda *args: 'test-account')
    endpoint = f'/api/workspaces/{workspace}/sources/github'
    assert owner.post(endpoint, json={'token': 'never-log-this-token'}).status_code == 200
    assert (
        owner.patch(
            f'/api/workspaces/{workspace}/connection-sharing/github',
            json={'shared': False, 'member_ids': [member.identity['id']]},
        ).status_code
        == 200
    )
    # Replacing a credential must not carry old account permissions forward.
    assert owner.post(endpoint, json={'token': 'replacement-secret'}).status_code == 200
    with Session() as db:
        assert db.query(SourceGrant).filter_by(workspace_id=workspace).count() == 0
    assert owner.delete(endpoint).status_code == 200
    history = owner.get(f'/api/workspaces/{workspace}/audit')
    assert 'never-log-this-token' not in history.text and 'replacement-secret' not in history.text
    assert {'source.connected', 'source.disconnected', 'source.sharing_changed'} <= {
        row['action'] for row in history.json()['events']
    }


def test_every_workspace_route_declares_an_explicit_permission():
    from fastapi.routing import APIRoute

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        scoped = '{workspaceId}' in route.path or route.path in (
            '/api/gmail/status',
            '/api/gmail/connect',
            '/api/drive/connect',
            '/api/connected-oauth/{provider}/connect',
        )
        if scoped:
            assert any(
                getattr(dependency.call, 'workspace_role', None)
                for dependency in route.dependant.dependencies
            ), route.path


def test_organisation_audit_retains_deleted_workspace_events_without_content_access(accounts):
    owner, admin, _, _ = accounts
    org = owner.post('/api/organisations', json={'name': 'Audited team'}).json()['id']
    assert (
        owner.put(
            f'/api/organisations/{org}/members',
            json={'email': admin.identity['email'], 'role': 'admin'},
        ).status_code
        == 200
    )
    workspace = owner.post(
        '/api/workspaces', json={'name': 'Audit lifecycle', 'organisation_id': org}
    ).json()['id']
    assert admin.get(f'/api/workspaces/{workspace}/documents').status_code == 404
    assert (
        owner.request(
            'DELETE', f'/api/workspaces/{workspace}', json={'name': 'Audit lifecycle'}
        ).status_code
        == 200
    )
    events = admin.get(f'/api/organisations/{org}/audit').json()['events']
    assert any(
        row['action'] == 'workspace.deleted' and row['scope_id'] == workspace for row in events
    )
    assert all(row['actor_email'] == owner.identity['email'] for row in events)
    assert admin.get(f'/api/workspaces/{workspace}/documents').status_code == 404


def test_revocation_during_credential_validation_blocks_connection_save(accounts, monkeypatch):
    from app.db import WorkspaceMember

    owner, manager, _, workspace = accounts
    grant(owner, manager, workspace, 'manager')
    monkeypatch.setattr(gmail, 'KEY', Fernet.generate_key().decode())

    def validate(*args):
        with Session() as db:
            db.query(WorkspaceMember).filter_by(
                workspace_id=workspace, user_id=manager.identity['id']
            ).delete()
            db.commit()
        return 'validated-account'

    monkeypatch.setattr(external_sources, 'profile', validate)
    response = manager.post(
        f'/api/workspaces/{workspace}/sources/github', json={'token': 'never-save-this'}
    )
    assert response.status_code == 404
    with Session() as db:
        assert db.get(ExternalConnection, (workspace, 'github')) is None


def test_concurrent_ownership_transfers_have_one_winner(accounts):
    from concurrent.futures import ThreadPoolExecutor

    owner, first, second, workspace = accounts
    grant(owner, first, workspace, 'viewer')
    grant(owner, second, workspace, 'viewer')
    name = next(
        row['name'] for row in owner.get('/api/workspaces').json() if row['id'] == workspace
    )

    def transfer(member):
        return owner.post(
            f'/api/workspaces/{workspace}/ownership',
            json={'member_id': member.identity['id'], 'confirmation': name},
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(transfer, (first, second)))
    assert results.count(200) == 1
    assert all(code in (200, 403, 409) for code in results)
    events = owner.get(f'/api/workspaces/{workspace}/audit').json()['events']
    assert sum(event['action'] == 'ownership.transferred' for event in events) == 1
