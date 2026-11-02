"""Read-only source connections for GitHub, Notion and Slack.

Personal/provider-issued access tokens are supplied by the owner and encrypted
at rest. Never send them to AI providers or include them in responses.
"""

import logging
import re

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import batch_connectors
from .db import ExternalConnection, Session, SourceHealthCheck
from .gmail import actor, allowed_workspace, crypt
from .research_queries import (
    GITHUB_QUERY_STOPWORDS,
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


def http_json(url, token, provider, params=None, method='GET'):
    headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
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
    try:
        secret = crypt().decrypt(row.secret.encode()).decode()
    except Exception as exc:
        log.warning('Could not decrypt source token for %s', provider)
        raise HTTPException(503, 'Connection encryption key does not match stored token.') from exc
    if provider in ('calendar', 'onedrive', 'outlook'):
        from .connected_oauth import access_token

        return row, access_token(provider, secret, db, row)
    return row, secret


@router.get('/workspaces/{workspaceId}/sources')
def statuses(workspaceId: str, request: Request):
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        rows = db.query(ExternalConnection).filter_by(workspace_id=workspaceId).all()
        accounts = {r.provider: r.account for r in rows}
        return [
            {'provider': p, 'connected': p in accounts, 'account': accounts.get(p)}
            for p in PROVIDERS
        ]


@router.post('/workspaces/{workspaceId}/sources/{provider}')
def connect(workspaceId: str, provider: str, body: ConnectRequest, request: Request):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported source provider.')
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        account = profile(provider, body.token)
        encrypted = crypt().encrypt(body.token.encode()).decode()
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
        return {'provider': provider, 'connected': True, 'account': account}


@router.delete('/workspaces/{workspaceId}/sources/{provider}')
def disconnect(workspaceId: str, provider: str, request: Request):
    if provider not in PROVIDERS:
        raise HTTPException(404, 'Unsupported source provider.')
    with Session() as db:
        user = actor(request, db)
        allowed_workspace(db, user, workspaceId)
        db.query(ExternalConnection).filter_by(workspace_id=workspaceId, provider=provider).delete()
        health = db.get(SourceHealthCheck, (workspaceId, provider))
        if health:
            db.delete(health)
        db.commit()
        return {'ok': True}


def github_search_query(query):
    """Keep explicit GitHub search syntax, simplify natural-language questions."""
    query = query.strip()
    if not query:
        raise HTTPException(422, 'Enter a GitHub search term.')
    qualifiers = (
        'repo:',
        'org:',
        'user:',
        'is:',
        'type:',
        'in:',
        'label:',
        'state:',
        'author:',
        'assignee:',
        'mentions:',
        'created:',
        'updated:',
    )
    if any(term in query.lower() for term in qualifiers):
        # The issues endpoint now requires an explicit issue or PR type even
        # when other useful qualifiers (such as repo: or label:) are supplied.
        if not re.search(r'\b(?:is:issue|is:pr|is:pull-request|type:issue|type:pr)\b', query, re.I):
            query += ' is:issue'
        return query[:240]
    terms = [
        word for word in provider_query_terms(query) if word.lower() not in GITHUB_QUERY_STOPWORDS
    ]
    simplified = ' '.join(terms[:9])[:180]
    return f'{simplified} is:issue'.strip()[:240]


def github_repository_query(query, login):
    """Build a repository search query scoped to the authenticated account."""
    query = query.strip()
    if any(term in query.lower() for term in ('repo:', 'org:', 'user:')):
        return query[:240]
    shared_terms = provider_query_terms(query)
    explicit_account_scope = bool(re.search(r'\b(my|mine)\b', query, re.I))
    terms = [word for word in shared_terms if word.lower() not in GITHUB_QUERY_STOPWORDS]
    owner = f'user:{login}' if login else ''
    if explicit_account_scope and terms:
        return owner
    return ' '.join([owner, *terms[:8]]).strip()[:180]


def github_wants_repositories(query):
    terms = set(re.findall(r'[a-zA-Z]+', query.lower()))
    return bool(
        terms
        & {
            'project',
            'projects',
            'repository',
            'repositories',
            'repo',
            'repos',
            'kind',
            'kinds',
            'type',
            'types',
            'overview',
            'portfolio',
        }
    )


def github_pull_request_query(query):
    """Recognize natural-language pull-request requests and keep valid qualifiers."""
    lowered = query.lower()
    explicit = any(term in lowered for term in ('is:pr', 'is:pull-request', 'type:pr'))
    asks_for_prs = explicit or bool(re.search(r'\b(pull\s*requests?|prs?)\b', lowered))
    if not asks_for_prs:
        return None
    query = query.strip()
    qualifiers = (
        'repo:',
        'org:',
        'user:',
        'is:',
        'type:',
        'state:',
        'author:',
        'assignee:',
        'mentions:',
        'created:',
        'updated:',
    )
    if any(term in lowered for term in qualifiers):
        # GitHub's issues endpoint calls pull requests `is:pr`.
        query = re.sub(r'\bis:pull-request\b', 'is:pr', query, flags=re.I)
        query = re.sub(r'\btype:pr\b', 'is:pr', query, flags=re.I)
        return query[:240]
    state = 'open' if re.search(r'\b(open|active|unmerged)\b', lowered) else None
    terms = [
        token
        for token in provider_query_terms(query)
        if token.lower() not in GITHUB_QUERY_STOPWORDS
    ]
    # The caller adds the authenticated GitHub user's login when the user asks
    # for "my" PRs. Keep this helper focused on the type/state/topic filters.
    return ' '.join(
        part for part in ('is:pr', f'state:{state}' if state else '', *terms[:8]) if part
    )


def github_wants_own_pull_requests(query):
    return bool(re.search(r'\b(?:my|mine)\b', query, re.I))


def github_pull_request_ownership_qualifier(query, login):
    """Scope natural-language personal PR searches to the user's own GitHub data."""
    if not github_wants_own_pull_requests(query):
        return f'user:{login}'
    if re.search(r'\bmy\s+(?:github\s+)?repositories\b', query, re.I):
        return f'user:{login}'
    return f'author:{login}'


def requested_result_limit(query, default=30, max_limit=None):
    """Honor a small explicit result count in a natural language request."""
    numbers = {
        'one': 1,
        'two': 2,
        'three': 3,
        'four': 4,
        'five': 5,
        'six': 6,
        'seven': 7,
        'eight': 8,
        'nine': 9,
        'ten': 10,
    }
    match = re.search(
        r'\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b'
        r'.{0,70}\b(?:pull\s*requests?|prs?|events?|appointments?|meetings?|'
        r'files?|documents?|emails?|messages?|projects?|repositories?|repos?|results?|items?)\b',
        query,
        re.I,
    )
    if not match:
        return default
    value = match.group(1).lower()
    return min(int(value) if value.isdigit() else numbers[value], max_limit or default)


def slack_search_query(query):
    """Reduce a natural-language request to Slack's supported search terms."""
    # Preserve Slack's structured filters (in:, from:, after:, before:, etc.)
    # verbatim; normalize only ordinary conversational questions.
    if re.search(r'\b(?:in|from|to|after|before|on|during|has|is):\S+', query, re.I):
        return query[:180]
    normalized_terms = set(provider_query_terms(query, extra_stopwords=SLACK_QUERY_STOPWORDS))
    words = re.findall(r'[A-Za-z0-9_.@#-]+', query)
    return ' '.join(dict.fromkeys(word for word in words if word.lower() in normalized_terms))


def github_search_all_pages(token, query, per_page=100, max_pages=10):
    """Read all matching GitHub search results, respecting the API's 1000 cap."""
    results = []
    for page in range(1, max_pages + 1):
        data = http_json(
            'https://api.github.com/search/repositories',
            token,
            'github',
            {'q': query, 'per_page': per_page, 'page': page, 'sort': 'updated'},
        )
        batch = data.get('items', [])
        results.extend(batch)
        if len(batch) < per_page or len(results) >= min(data.get('total_count', 0), 1000):
            break
    return results


def source_search(provider, token, query):
    if provider in batch_connectors.NEW_PROVIDERS:
        return batch_connectors.search(provider, token, query)
    if provider == 'github':
        pull_query = github_pull_request_query(query)
        if pull_query:
            if not any(
                term in pull_query.lower() for term in ('repo:', 'org:', 'user:', 'author:')
            ):
                identity = http_json('https://api.github.com/user', token, provider)
                login = identity.get('login')
                if not login:
                    raise HTTPException(
                        422,
                        'Could not identify the connected GitHub account. Reconnect GitHub and try again.',
                    )
                pull_query = f'{pull_query} {github_pull_request_ownership_qualifier(query, login)}'
            d = http_json(
                'https://api.github.com/search/issues',
                token,
                provider,
                {'q': pull_query, 'per_page': requested_result_limit(query), 'sort': 'updated'},
            )
            return [
                {
                    'provider': provider,
                    'id': str(x.get('id')),
                    'title': x.get('title', ''),
                    'excerpt': (x.get('body') or '')[:1200],
                    'url': x.get('html_url'),
                }
                for x in d.get('items', [])
            ]
        if github_wants_repositories(query):
            user = http_json('https://api.github.com/user', token, provider)
            login = user.get('login', '')
            limit = requested_result_limit(query, default=30, max_limit=100)
            if re.search(r'\b(?:my|mine)\b', query, re.I):
                data = http_json(
                    'https://api.github.com/user/repos',
                    token,
                    provider,
                    {
                        'type': 'owner',
                        'sort': 'pushed',
                        'direction': 'desc',
                        'per_page': limit,
                    },
                )
                items = data if isinstance(data, list) else []
            else:
                items = github_search_all_pages(
                    token, github_repository_query(query, login), per_page=limit, max_pages=1
                )
            return [
                {
                    'provider': provider,
                    'id': str(x.get('id')),
                    'title': x.get('full_name') or x.get('name', ''),
                    'excerpt': ' · '.join(
                        part
                        for part in (
                            x.get('description') or '',
                            'Language: ' + x['language'] if x.get('language') else '',
                            'Topics: ' + ', '.join(x.get('topics', [])) if x.get('topics') else '',
                            'Last push: ' + x['pushed_at'] if x.get('pushed_at') else '',
                            'Last updated: ' + x['updated_at'] if x.get('updated_at') else '',
                            'Stars: ' + str(x.get('stargazers_count', 0)),
                            'Forks: ' + str(x.get('forks_count', 0)),
                        )
                        if part
                    ),
                    'url': x.get('html_url'),
                    'date': x.get('pushed_at') or x.get('updated_at'),
                }
                for x in items
            ]
        scoped_query = github_search_query(query)
        if not any(term in scoped_query.lower() for term in ('repo:', 'org:', 'user:', 'author:')):
            identity = http_json('https://api.github.com/user', token, provider)
            login = identity.get('login')
            if not login:
                raise HTTPException(
                    422,
                    'Could not identify the connected GitHub account. Reconnect GitHub and try again.',
                )
            scoped_query = f'{scoped_query} user:{login}'
        d = http_json(
            'https://api.github.com/search/issues',
            token,
            provider,
            {'q': scoped_query, 'per_page': 8},
        )
        return [
            {
                'provider': provider,
                'id': str(x.get('id')),
                'title': x.get('title', ''),
                'excerpt': (x.get('body') or '')[:1200],
                'url': x.get('html_url'),
            }
            for x in d.get('items', [])
        ]
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
    d = http_json(
        'https://slack.com/api/search.all',
        token,
        provider,
        {'query': normalized_query, 'count': 8},
    )
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
    results = []
    for item in d.get('messages', {}).get('matches', []):
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


@router.post('/workspaces/{workspaceId}/sources/{provider}/search')
def search(workspaceId: str, provider: str, body: SearchRequest, request: Request):
    with Session() as db:
        user = actor(request, db)
        _, token = read_connection(db, user, workspaceId, provider)
    return {'results': source_search(provider, token, body.query)}
