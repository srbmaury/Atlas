"""Regression coverage for chat organization persistence and search isolation."""
from types import SimpleNamespace

from app.routes import conversations as routes
from app.schemas import ConversationPayload


class Query:
    def __init__(self, items):
        self.items = items

    def filter_by(self, **filters):
        self.items = [item for item in self.items if all(getattr(item, key) == value for key, value in filters.items())]
        return self

    def order_by(self, *_):
        return self

    def limit(self, count):
        self.items = self.items[:count]
        return self

    def first(self):
        return next(iter(self.items), None)

    def all(self):
        return self.items


class DB:
    def __init__(self, items):
        self.items = items

    def query(self, _):
        return Query(self.items[:])

    def commit(self):
        pass


def chat(id='chat', author_id='user', messages=None):
    return SimpleNamespace(id=id, workspace_id='ws', author_id=author_id, title='Chat',
                           created=1.0, updated=2.0, messages=messages or [])


def test_organization_survives_message_updates(monkeypatch):
    monkeypatch.setattr(routes, 'workspace', lambda *_: None)
    item = chat(messages=[{'role': 'user', 'content': 'Question'}])
    db = DB([item])
    actor = SimpleNamespace(id='user')
    pinned = routes.organize_conversation('ws', 'chat', routes.ConversationOrganization(pinned=True), actor, db)
    assert pinned['pinned'] and len(pinned['messages']) == 1
    archived = routes.organize_conversation('ws', 'chat', routes.ConversationOrganization(archived=True), actor, db)
    assert archived['archived'] and not archived['pinned']
    restored = routes.organize_conversation('ws', 'chat', routes.ConversationOrganization(archived=False), actor, db)
    assert not restored['archived']
    routes.organize_conversation('ws', 'chat', routes.ConversationOrganization(pinned=True), actor, db)
    updated = routes.update_conversation('ws', 'chat', ConversationPayload(title='New', messages=[{'role': 'user', 'content': 'New'}]), actor, db)
    assert updated['pinned'] and updated['messages'] == [{'role': 'user', 'content': 'New'}]


def test_search_excludes_other_users(monkeypatch):
    monkeypatch.setattr(routes, 'workspace', lambda *_: None)
    own = chat(id='mine', messages=[{'role': 'user', 'content': 'Needle'}])
    other = chat(id='theirs', author_id='other', messages=[{'role': 'user', 'content': 'Needle'}])
    result = routes.search_conversation_messages('ws', 'needle', SimpleNamespace(id='user'), DB([own, other]))
    assert [row['chat_id'] for row in result['results']] == ['mine']
