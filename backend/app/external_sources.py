"""Read-only source connections for GitHub, Notion and Slack.

Personal/provider-issued access tokens are supplied by the owner and encrypted
at rest. Never send them to AI providers or include them in responses.
"""

import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import batch_connectors, github_search
from .access_audit import record, reset_grants
from .db import ExternalConnection, Session, SourceHealthCheck
from .gmail import actor, allowed_workspace, crypt
from .rbac import (
    connection_for_change,
    connection_visible,
    require_connection,
    require_workspace,
    revalidate_access,
    source_scope,
    workspace_permission,
)
from .research_queries import (
    SLACK_QUERY_STOPWORDS,
    provider_query_terms,
)

router = APIRouter(prefix='/api')
log = logging.getLogger(__name__)
PROVIDERS = ('github', 'notion', 'slack', *batch_connectors.NEW_PROVIDERS)


class ConnectRequest(BaseModel):
    token: str = Field(min_length=8, max_length=4096)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=250)


def http_json(url, token, provider, params=None, method='GET', accept='application/json'):
    headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': accept,
        'User-Agent': 'Atlas-Connected-Research',
    }
    if provider == 'notion':
        headers['Notion-Version'] = '2022-06-28'
    try:
        with httpx.Client(
            timeout=httpx.Timeout(20, connect=5), follow_redirects=False, trust_env=False
        ) as client:
            if method == 'POST':
                response = client.post(url, headers=headers, json=params or {})
            else:
                response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        log.warning('%s connector upstream HTTP %s', provider, status)
        if status in (401, 403):
            raise HTTPException(
                422, f'{provider.title()} denied access. Verify token permissions.'
            ) from exc
        if provider == 'github' and status == 422:
            # The upstream search API returns 422 for invalid qualifiers and queries.
            # Never disclose request headers, credentials, or raw upstream responses.
            try:
                reason = exc.response.json().get('message', '')
            except (ValueError, AttributeError):
                reason = ''
            if reason == 'Validation Failed':
                reason = (
                    'GitHub rejected the search syntax. Try a simpler keyword or repository filter.'
                )
            raise HTTPException(422, reason[:220] or 'GitHub rejected the search query.') from exc
        if status == 429:
            raise HTTPException(429, f'{provider.title()} rate limit reached.') from exc
        raise HTTPException(502, f'{provider.title()} returned HTTP {status}.') from exc
    except httpx.RequestError as exc:
        log.warning('%s provider request failure %s', provider, type(exc).__name__)
        raise HTTPException(502, f'{provider.title()} could not be reached.') from exc


def profile(provider, token):
    if provider in batch_connectors.NEW_PROVIDERS:
        return batch_connectors.profile(provider, token)
    if provider == 'github':
        d = http_json('https://api.github.com/user', token, provider)
        return d.get('login') or str(d.get('id') or 'GitHub user')
    if provider == 'notion':
        d = http_json('https://api.notion.com/v1/users/me', token, provider)
        return (
            d.get('name')
            or d.get('bot', {}).get('owner', {}).get('workspace', True)
            and 'Notion integration'
        )
    d = http_json('https://slack.com/api/auth.test', token, provider)
    if not d.get('ok'):
        # Slack reports OAuth failures in a JSON ``error`` field with HTTP 200.
        # Keep the UI useful without forwarding arbitrary upstream content.
        error = d.get('error')
        safe_errors = {
            'invalid_auth': 'Slack rejected the access token. Copy the current User OAuth Token from the Slack app console.',
            'token_revoked': 'Slack has revoked this token. Reauthorize the app and copy the new User OAuth Token.',
            'account_inactive': 'The Slack account for this token is inactive.',
            'not_authed': 'Slack did not receive a valid authorization token.',
        }
        raise HTTPException(422, safe_errors.get(error, 'Slack rejected the access token.'))
    return d.get('team') or d.get('user') or 'Slack workspace'


def verify_source_access(provider, token):
    """Exercise each provider's search permission without returning content."""
    account = profile(provider, token)
    if provider in batch_connectors.NEW_PROVIDERS:
        return account, len(batch_connectors.search(provider, token, 'project'))
    if provider == 'github':
        data = http_json(
            'https://api.github.com/search/issues',
            token,
            provider,
            {'q': f'user:{account} is:issue', 'per_page': 1},
        )
        return account, len(data.get('items', []))
    if provider == 'notion':
        data = http_json(
            'https://api.notion.com/v1/search', token, provider, {'page_size': 1}, method='POST'
        )
        return account, len(data.get('results', []))
    data = http_json(
        'https://slack.com/api/search.all', token, provider, {'query': 'the', 'count': 1}
    )
    if not data.get('ok'):
        if data.get('error') == 'not_allowed_token_type':
            raise HTTPException(
                422, 'Slack message search requires a user-scoped token with search:read.'
            )
        if data.get('error') == 'missing_scope':
            raise HTTPException(422, 'Slack token is missing the search:read scope.')
        raise HTTPException(422, 'Slack search permission check failed.')
    return account, len(data.get('messages', {}).get('matches', []))


def read_connection(db, user, workspaceId, provider):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported source provider.')
    allowed_workspace(db, user, workspaceId)
    row = db.get(ExternalConnection, (workspaceId, provider))
    if not row:
        raise HTTPException(409, f'Connect {provider.title()} first.')
    require_connection(db, user, row)
    try:
        secret = crypt().decrypt(row.secret.encode()).decode()
    except Exception as exc:
        log.warning('Could not decrypt source token for %s', provider)
        raise HTTPException(503, 'Connection encryption key does not match stored token.') from exc
    if provider in ('calendar', 'onedrive', 'outlook'):
        from .connected_oauth import access_token

        return row, access_token(provider, secret, db, row)
    return row, secret


@router.get(
    '/workspaces/{workspaceId}/sources', dependencies=[Depends(workspace_permission('viewer'))]
)
def statuses(workspaceId: str, request: Request):
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        rows = db.query(ExternalConnection).filter_by(workspace_id=workspaceId).all()
        accounts = {r.provider: r.account for r in rows if connection_visible(db, user, r)}
        return [
            {'provider': p, 'connected': p in accounts, 'account': accounts.get(p)}
            for p in PROVIDERS
        ]


@router.post(
    '/workspaces/{workspaceId}/sources/{provider}',
    dependencies=[Depends(workspace_permission('manager', manage_connection=True))],
)
def connect(workspaceId: str, provider: str, body: ConnectRequest, request: Request):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported source provider.')
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        require_workspace(db, user, workspaceId, 'manager')
        require_connection(
            db, user, db.get(ExternalConnection, (workspaceId, provider)), manage=True
        )
        account = profile(provider, body.token)
        encrypted = crypt().encrypt(body.token.encode()).decode()
        row = connection_for_change(db, user, workspaceId, provider)
        if row:
            row.account, row.secret = account, encrypted
            row.connected_by, row.shared = user.id, False
            row.shared_resource_ids = None
        else:
            db.add(
                ExternalConnection(
                    workspace_id=workspaceId,
                    provider=provider,
                    account=account,
                    secret=encrypted,
                    connected_by=user.id,
                )
            )
        reset_grants(db, workspaceId, provider)
        record(db, user.id, 'workspace', workspaceId, 'source.connected', provider)
        health = db.get(SourceHealthCheck, (workspaceId, provider))
        if health:
            db.delete(health)
        db.commit()
        return {'provider': provider, 'connected': True, 'account': account}


@router.delete(
    '/workspaces/{workspaceId}/sources/{provider}',
    dependencies=[Depends(workspace_permission('manager', manage_connection=True))],
)
def disconnect(workspaceId: str, provider: str, request: Request):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported source provider.')
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        connection_for_change(db, user, workspaceId, provider)
        db.query(ExternalConnection).filter_by(workspace_id=workspaceId, provider=provider).delete()
        reset_grants(db, workspaceId, provider)
        record(db, user.id, 'workspace', workspaceId, 'source.disconnected', provider)
        health = db.get(SourceHealthCheck, (workspaceId, provider))
        if health:
            db.delete(health)
        db.commit()
        return {'ok': True}


def slack_search_query(query):
    """Reduce a natural-language request to Slack's supported search terms."""
    # Preserve Slack's structured filters (in:, from:, after:, before:, etc.)
    # verbatim; normalize only ordinary conversational questions.
    if re.search(r'\b(?:in|from|to|after|before|on|during|has|is):\S+', query, re.I):
        return query[:180]
    normalized_terms = set(provider_query_terms(query, extra_stopwords=SLACK_QUERY_STOPWORDS))
    words = re.findall(r'[A-Za-z0-9_.@#-]+', query)
    return ' '.join(dict.fromkeys(word for word in words if word.lower() in normalized_terms))


def source_search(provider, token, query, *, resource_ids=None):
    if provider in batch_connectors.NEW_PROVIDERS:
        return batch_connectors.search(provider, token, query)
    if provider == 'github':
        return github_search.search(token, query, http_json=http_json)
    if provider == 'notion':
        # Notion search is a title search. Keep useful nouns/identifiers rather
        # than sending the complete conversational question to its API.
        search_terms = provider_query_terms(query, limit=5)
        if not search_terms:
            return []
        notion_query = ' '.join(search_terms)
        d = http_json(
            'https://api.notion.com/v1/search',
            token,
            provider,
            {'query': notion_query, 'page_size': 8},
            method='POST',
        )
        title_result_ids = {x.get('id') for x in d.get('results', [])}
        pages = [x for x in d.get('results', []) if x.get('object') == 'page']
        # Notion's search API matches titles only. When that finds no page, list
        # pages already shared with this integration and search their readable
        # blocks locally. This still respects Notion's per-page sharing model.
        if not pages:
            d = http_json(
                'https://api.notion.com/v1/search',
                token,
                provider,
                {'page_size': 8},
                method='POST',
            )
            pages = [x for x in d.get('results', []) if x.get('object') == 'page']

        terms = set(search_terms)
        items = []
        for page in pages[:8]:
            props = page.get('properties') or {}
            title_parts = (
                page.get('title')
                or (props.get('title') or {}).get('title')
                or (props.get('Name') or {}).get('title')
                or []
            )
            label = ''.join(t.get('plain_text', '') for t in title_parts) or 'Notion page'
            text = notion_page_text(token, page.get('id'), max_blocks=120)
            haystack = (label + '\n' + text).lower()
            score = sum(haystack.count(term) for term in terms)
            # Title-only matches from Notion's API remain useful even when the
            # content doesn't repeat the title query.
            title_match = page.get('id') in title_result_ids
            if terms and score == 0 and not title_match:
                continue
            excerpt = notion_excerpt(text, terms) or label
            items.append(
                {
                    'provider': provider,
                    'id': page['id'],
                    'title': label,
                    'excerpt': excerpt[:1200],
                    'url': page.get('url'),
                    '_score': score + (2 if title_match else 0),
                }
            )
        items.sort(key=lambda item: item.pop('_score'), reverse=True)
        return items[:8]
    normalized_query = slack_search_query(query)
    if not normalized_query:
        return []
    matches = []
    for page in range(1, 2 if resource_ids is None else 4):
        params = {'query': normalized_query, 'count': 8}
        if resource_ids is not None:
            params.update(count=20, page=page)
        d = http_json('https://slack.com/api/search.all', token, provider, params)
        if not d.get('ok'):
            if d.get('error') == 'not_allowed_token_type':
                raise HTTPException(
                    422,
                    'Slack message search requires a user-scoped token with search:read. Bot tokens can authenticate but cannot use this search endpoint.',
                )
            if d.get('error') == 'missing_scope':
                raise HTTPException(
                    422,
                    'Slack token is missing the search:read scope. Reauthorize it with that scope and reconnect.',
                )
            raise HTTPException(
                422, 'Slack search denied. Confirm search:read scope and workspace permissions.'
            )
        messages = d.get('messages', {})
        for item in messages.get('matches', []):
            if resource_ids is not None:
                channel = item.get('channel') or {}
                channel_id = channel.get('id') or ''
                if (
                    channel_id not in resource_ids
                    or not re.fullmatch(r'[CG][A-Z0-9]{2,31}', channel_id)
                    or channel.get('is_im')
                    or channel.get('is_mpim')
                    # Legacy G IDs also identify group DMs. Require Slack to distinguish them.
                    or (channel_id.startswith('G') and channel.get('is_mpim') is not False)
                ):
                    continue
            matches.append(item)
        if (
            resource_ids is None
            or len(matches) >= 8
            or page >= (messages.get('paging') or {}).get('pages', 1)
        ):
            break
    results = []
    for item in matches[:8]:
        text = item.get('text') or ''
        channel = (item.get('channel') or {}).get('name') or ''
        if channel and not re.fullmatch(r'[A-Z0-9]{8,}', channel):
            title = '#' + channel
        else:
            # Some Slack search responses supply a channel ID where the human
            # name should be. Use the message's opening line instead of showing
            # an opaque identifier in Atlas.
            first_line = ' '.join(text.split()).split('. ', 1)[0].strip()
            title = first_line[:120] or 'Slack message'
        results.append(
            {
                'provider': provider,
                'id': item.get('ts', ''),
                'title': title,
                'excerpt': text[:8000],
                'url': item.get('permalink'),
            }
        )
    return results


def notion_rich_text(values):
    return ''.join(value.get('plain_text', '') for value in (values or []))


def notion_page_text(token, page_id, max_blocks=120):
    """Read plain text from a Notion page and its nested readable blocks."""
    if not page_id:
        return ''
    text_lines, parents, seen = [], [(page_id, 0)], 0
    while parents and seen < max_blocks:
        parent_id, depth = parents.pop(0)
        cursor = None
        while seen < max_blocks:
            params = {'page_size': min(100, max_blocks - seen)}
            if cursor:
                params['start_cursor'] = cursor
            data = http_json(
                f'https://api.notion.com/v1/blocks/{parent_id}/children', token, 'notion', params
            )
            for block in data.get('results', []):
                seen += 1
                kind = block.get('type', '')
                value = block.get(kind) or {}
                line = notion_rich_text(value.get('rich_text'))
                if kind in ('child_page', 'child_database'):
                    line = value.get('title', line)
                elif kind == 'table_row':
                    line = ' | '.join(notion_rich_text(cell) for cell in value.get('cells', []))
                if line:
                    text_lines.append(line)
                if block.get('has_children') and depth < 2 and block.get('id'):
                    parents.append((block['id'], depth + 1))
                if seen >= max_blocks:
                    break
            if not data.get('has_more') or not data.get('next_cursor'):
                break
            cursor = data['next_cursor']
    return '\n'.join(text_lines)


def notion_excerpt(text, terms):
    """Return a compact passage around the first matching query term."""
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return ''
    lowered = text.lower()
    positions = [lowered.find(term) for term in terms if lowered.find(term) >= 0]
    start = max(0, min(positions) - 250) if positions else 0
    excerpt = text[start : start + 1200]
    return ('…' if start else '') + excerpt + ('…' if start + len(excerpt) < len(text) else '')


@router.post(
    '/workspaces/{workspaceId}/sources/{provider}/search',
    dependencies=[Depends(workspace_permission('viewer'))],
)
def search(workspaceId: str, provider: str, body: SearchRequest, request: Request):
    with Session() as db:
        user = actor(request, db)
        row, token = read_connection(db, user, workspaceId, provider)
        scope = source_scope(db, user, row)
    if scope is None:
        return {'results': source_search(provider, token, body.query)}
    results = (
        source_search(provider, token, body.query, resource_ids=scope[1])
        if scope[1] is not None
        else source_search(provider, token, body.query)
    )
    revalidate_access(workspaceId, user, (provider,), {provider: scope})
    return {'results': results}
