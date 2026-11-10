"""Read-only query adapters for Calendar, Linear, Jira, OneDrive and Outlook.

Initial connector batch uses provider-issued access tokens. Calendar and Microsoft
Graph access tokens expire; production OAuth refresh is future work. No write
endpoints or arbitrary caller-supplied API hosts are supported.
"""

import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from datetime import time as datetime_time
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from .research_queries import CALENDAR_QUERY_STOPWORDS, provider_query_terms

NEW_PROVIDERS = ('calendar', 'linear', 'jira', 'onedrive', 'outlook', 'sharepoint')


def _request(provider, token, url, *, params=None, graphql=None):
    """Read-only requests with bounded retries for transient upstream errors."""
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
    for attempt in range(3):
        try:
            with httpx.Client(
                timeout=httpx.Timeout(18, connect=5), follow_redirects=False, trust_env=False
            ) as client:
                if graphql is not None:
                    response = client.post(url, headers=headers, json=graphql)
                else:
                    response = client.get(url, headers=headers, params=params)
                if response.status_code in (429, 502, 503, 504) and attempt < 2:
                    retry_after = response.headers.get('Retry-After', '')
                    delay = (
                        min(1.0, float(retry_after))
                        if retry_after.isdigit()
                        else 0.15 * (2**attempt)
                    )
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                data = response.json()
            if isinstance(data, dict) and data.get('errors'):
                raise HTTPException(422, f'{provider.title()} rejected the query or permissions.')
            return data
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (401, 403):
                raise HTTPException(
                    422, f'{provider.title()} access expired or is insufficient.'
                ) from exc
            if status == 429:
                raise HTTPException(429, f'{provider.title()} rate limit reached.') from exc
            raise HTTPException(502, f'{provider.title()} returned HTTP {status}.') from exc
        except (httpx.RequestError, ValueError) as exc:
            if isinstance(exc, httpx.RequestError) and attempt < 2:
                time.sleep(0.15 * (2**attempt))
                continue
            raise HTTPException(502, f'{provider.title()} could not be read.') from exc
    raise HTTPException(502, f'{provider.title()} could not be read.')


def _jira_base():
    # Admin-configured host only: never accept URLs from user queries or tokens.
    base = os.getenv('ATLAS_JIRA_BASE_URL', '').strip().rstrip('/')
    match = re.fullmatch(r'https://([a-zA-Z0-9-]+)\.atlassian\.net', base)
    if not match:
        raise HTTPException(
            503, 'Set ATLAS_JIRA_BASE_URL to a trusted https://tenant.atlassian.net host.'
        )
    return base


def _text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        if isinstance(value.get('text'), str):
            return value['text']
        separator = '' if value.get('type') in ('paragraph', 'heading') else ' '
        return separator.join(_text(child) for child in value.get('content', []))
    if isinstance(value, list):
        return ' '.join(_text(x) for x in value)
    return ''


def _result(provider, identifier, title, excerpt, url):
    if not identifier:
        return None
    return {
        'provider': provider,
        'id': str(identifier),
        'title': str(title or 'Untitled')[:250],
        'excerpt': str(excerpt or '')[:3000],
        'url': url,
    }


def _calendar_query_terms(query):
    """Remove conversational filler and event-count phrases from Calendar search."""
    kept = provider_query_terms(query, extra_stopwords=CALENDAR_QUERY_STOPWORDS)
    return ' '.join(kept)


def _calendar_date_bounds(query):
    """Return Asia/Kolkata day bounds for explicit relative or ISO dates."""
    now = datetime.now(ZoneInfo('Asia/Kolkata'))
    if re.search(r'\btomorrow\b', query, re.I):
        target = now.date() + timedelta(days=1)
    elif re.search(r'\btoday\b|\btonight\b', query, re.I):
        target = now.date()
    else:
        explicit = re.search(r'\b(20\d{2})-(\d{1,2})-(\d{1,2})\b', query)
        if not explicit:
            return {}
        try:
            target = date(*(int(part) for part in explicit.groups()))
        except ValueError:
            return {}
    start = datetime.combine(target, datetime_time.min, tzinfo=now.tzinfo)
    end = start + timedelta(days=1)
    return {
        'timeMin': start.astimezone(timezone.utc).isoformat(),
        'timeMax': end.astimezone(timezone.utc).isoformat(),
    }


def _calendar_pages(token, url, params):
    """Keep completed pages if a later request fails, with a bounded page budget."""
    rows = []
    for _ in range(3):
        try:
            page = _request('calendar', token, url, params=params)
        except HTTPException as exc:
            return rows, True, exc
        rows.extend(page.get('items', []))
        next_token = page.get('nextPageToken')
        if not next_token:
            return rows, False, None
        params = {**params, 'pageToken': next_token}
    return rows, True, None


def profile(provider, token):
    if provider == 'calendar':
        d = _request(
            provider,
            token,
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            params={'maxResults': 1},
        )
        return 'Google Calendar' if 'items' in d else 'Calendar account'
    if provider == 'linear':
        d = _request(
            provider,
            token,
            'https://api.linear.app/graphql',
            graphql={'query': 'query { viewer { name email } }'},
        )
        viewer = d.get('data', {}).get('viewer') or {}
        return viewer.get('email') or viewer.get('name') or 'Linear user'
    if provider == 'jira':
        d = _request(provider, token, _jira_base() + '/rest/api/3/myself')
        return d.get('displayName') or d.get('accountId') or 'Jira user'
    d = _request(
        provider,
        token,
        'https://graph.microsoft.com/v1.0/me',
        params={'$select': 'displayName,userPrincipalName'},
    )
    return d.get('userPrincipalName') or d.get('displayName') or 'Microsoft account'


def search(provider, token, query):
    query = query.strip()[:180]
    if provider == 'calendar':
        terms = _calendar_query_terms(query)
        upcoming_request = bool(re.search(r'\b(next|upcoming|soon)\b', query, re.I))
        broad_calendar_query = bool(
            re.search(r'\b(next|upcoming|soon|events?|calendar|schedule)\b', query, re.I)
        )
        if not terms and not broad_calendar_query:
            return []
        date_bounds = _calendar_date_bounds(query)
        params = {
            'maxResults': 50,
            'singleEvents': 'true',
            'orderBy': 'startTime',
            'timeMin': '2000-01-01T00:00:00Z',
            **date_bounds,
        }
        if terms:
            params['q'] = terms
        if upcoming_request and not date_bounds:
            params['timeMin'] = datetime.now(ZoneInfo('Asia/Kolkata')).isoformat()
        elif not terms and broad_calendar_query and not date_bounds:
            params['timeMin'] = datetime.now(ZoneInfo('Asia/Kolkata')).isoformat()
        calendars, partial, first_error = _calendar_pages(
            token,
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            {'maxResults': 250},
        )
        calendar_ids = list(
            dict.fromkeys(['primary'] + [item['id'] for item in calendars if item.get('id')])
        )
        events = []
        for calendar_id in calendar_ids:
            url = (
                'https://www.googleapis.com/calendar/v3/calendars/'
                f'{quote(calendar_id, safe="")}/events'
            )
            page_events, limited, error = _calendar_pages(token, url, params)
            events.extend(page_events)
            partial = partial or limited
            first_error = first_error or error
        if not events and partial:
            if first_error:
                raise first_error
            raise HTTPException(502, 'Calendar search was incomplete. Try a narrower date range.')
        rows = []
        seen = set()
        for e in sorted(
            events,
            key=lambda item: (
                (item.get('start') or {}).get('dateTime')
                or (item.get('start') or {}).get('date', '')
            ),
        ):
            if e.get('id') in seen:
                continue
            seen.add(e.get('id'))
            start = (e.get('start') or {}).get('dateTime') or (e.get('start') or {}).get('date', '')
            end = (e.get('end') or {}).get('dateTime') or (e.get('end') or {}).get('date', '')
            row = _result(
                provider,
                e.get('id'),
                e.get('summary'),
                f'{start}{" – " + end if end else ""} {e.get("description", "")} {e.get("location", "")}',
                e.get('htmlLink'),
            )
            if row:
                row['date'] = start
                if partial:
                    row['metadata'] = {'search_partial': True}
                rows.append(row)
        return [x for x in rows if x]
    if provider == 'linear':
        search_terms = provider_query_terms(query, limit=6)
        search_query = ' '.join(search_terms) or query
        d = _request(
            provider,
            token,
            'https://api.linear.app/graphql',
            graphql={
                'query': 'query SearchIssues($query: String!) { searchIssues(term: $query, first: 15) { nodes { id identifier title description url } } }',
                'variables': {'query': search_query},
            },
        )
        nodes = ((d.get('data') or {}).get('searchIssues') or {}).get('nodes', [])
        return [
            v
            for e in nodes
            if (
                v := _result(
                    provider,
                    e.get('id'),
                    e.get('identifier', '') + ' ' + e.get('title', ''),
                    e.get('description', ''),
                    e.get('url'),
                )
            )
        ]
    if provider == 'jira':
        # Atlassian search/JQL API: escape user-supplied terms, never accept raw JQL.
        terms = provider_query_terms(query, limit=6)
        terms = [term for term in terms if re.fullmatch(r'[a-zA-Z0-9_-]{2,}', term)]
        if not terms:
            return []
        jql = ' OR '.join(f'text ~ "{t}"' for t in terms)
        d = _request(
            provider,
            token,
            _jira_base() + '/rest/api/3/search/jql',
            params={'jql': jql, 'maxResults': 15, 'fields': 'summary,description,status'},
        )
        result = []
        for e in d.get('issues', []):
            fields = e.get('fields') or {}
            result.append(
                _result(
                    provider,
                    e.get('id'),
                    f'{e.get("key", "")} {fields.get("summary", "")}',
                    _text(fields.get('description')),
                    _jira_base() + '/browse/' + quote(e.get('key', '')),
                )
            )
        return [x for x in result if x]
    if provider == 'onedrive':
        # Graph drive search searches the authorized user's drive, not all SharePoint sites.
        search_terms = provider_query_terms(query, limit=6)
        search_query = query[:100] if "'" in query else (' '.join(search_terms) or query[:100])
        d = _request(
            provider,
            token,
            "https://graph.microsoft.com/v1.0/me/drive/root/search(q='"
            + quote(search_query.replace("'", "''"), safe='')
            + "')",
            params={'$top': 15, '$select': 'id,name,webUrl,description,file'},
        )
        return [
            v
            for e in d.get('value', [])
            if (
                v := _result(
                    provider,
                    e.get('id'),
                    e.get('name'),
                    e.get('description') or e.get('name'),
                    e.get('webUrl'),
                )
            )
        ]
    if provider == 'sharepoint':
        # Search delegated SharePoint content accessible to the signed-in user.
        # The search endpoint returns metadata/snippets, not complete file bodies.
        search_terms = provider_query_terms(query, limit=6)
        search_query = ' '.join(search_terms) or query[:100]
        d = _request(
            provider,
            token,
            'https://graph.microsoft.com/v1.0/search/query',
            graphql={
                'requests': [
                    {
                        'entityTypes': ['driveItem'],
                        'query': {'queryString': search_query},
                        'from': 0,
                        'size': 20,
                    }
                ]
            },
        )
        rows = []
        for container in d.get('value', []):
            for hit in container.get('hitsContainers', []):
                for entry in hit.get('hits', []):
                    item = entry.get('resource') or {}
                    parent = item.get('parentReference') or {}
                    if not parent.get('siteId'):
                        continue
                    rows.append(
                        _result(
                            provider,
                            item.get('id'),
                            item.get('name'),
                            entry.get('summary') or item.get('description') or item.get('name'),
                            item.get('webUrl'),
                        )
                    )
        return [x for x in rows if x]
    if provider == 'outlook':
        search_terms = provider_query_terms(query, limit=6)
        search_query = ' '.join(search_terms) or query[:100]
        d = _request(
            provider,
            token,
            'https://graph.microsoft.com/v1.0/me/messages',
            params={
                '$search': '"' + search_query.replace('"', '') + '"',
                '$top': 15,
                '$select': 'id,subject,bodyPreview,webLink,receivedDateTime',
            },
        )
        rows = []
        for message in d.get('value', []):
            row = _result(
                provider,
                message.get('id'),
                message.get('subject'),
                message.get('bodyPreview'),
                message.get('webLink'),
            )
            if row:
                row['date'] = message.get('receivedDateTime')
                rows.append(row)
        return rows
    raise HTTPException(404, 'Unknown source provider.')
