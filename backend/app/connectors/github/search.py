"""Dispatch read-only searches for a connected GitHub account."""

import re

from fastapi import HTTPException

from ...research.research_queries import requested_result_limit
from .code_flow import github_flow_search
from .queries import (
    github_code_search_query,
    github_pull_request_ownership_qualifier,
    github_pull_request_query,
    github_repository_from_query,
    github_repository_query,
    github_search_query,
    github_wants_code,
    github_wants_flow,
    github_wants_repositories,
)
from .repository_files import github_repository_file_search


def github_search_all_pages(token, query, per_page=100, max_pages=10, *, http_json):
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


def search(token, query, *, http_json):
    provider = 'github'
    pull_query = github_pull_request_query(query)
    if pull_query:
        if not any(term in pull_query.lower() for term in ('repo:', 'org:', 'user:', 'author:')):
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
    if github_wants_flow(query):
        identity = http_json('https://api.github.com/user', token, provider)
        login = identity.get('login')
        if not login:
            raise HTTPException(
                422,
                'Could not identify the connected GitHub account. Reconnect GitHub and try again.',
            )
        return github_flow_search(token, query, login, http_json=http_json)
    if github_wants_code(query):
        identity = http_json('https://api.github.com/user', token, provider)
        login = identity.get('login')
        if not login:
            raise HTTPException(
                422,
                'Could not identify the connected GitHub account. Reconnect GitHub and try again.',
            )
        code_query = github_code_search_query(query, login)
        data = http_json(
            'https://api.github.com/search/code',
            token,
            provider,
            {
                'q': code_query,
                'per_page': requested_result_limit(query, default=8, max_limit=20),
            },
            accept='application/vnd.github.text-match+json',
        )
        results = []
        requested_repository = github_repository_from_query(query)
        for item in data.get('items', []):
            repository = (item.get('repository') or {}).get('full_name', '')
            if requested_repository and repository.casefold() != requested_repository.casefold():
                continue
            matches = item.get('text_matches') or []
            fragments = [
                match.get('fragment', '').strip() for match in matches if match.get('fragment')
            ]
            path = item.get('path') or item.get('name') or 'source file'
            results.append(
                {
                    'provider': provider,
                    'id': str(item.get('sha') or item.get('url') or path),
                    'title': f'{repository}/{path}' if repository else path,
                    'excerpt': '\n…\n'.join(fragments)[:8000] or f'Matching source file: {path}',
                    'url': item.get('html_url'),
                    'owner': repository.split('/', 1)[0] if '/' in repository else None,
                    'scope': repository or None,
                    'metadata': {'repository': repository, 'path': path},
                }
            )
        if not results and requested_repository:
            return github_repository_file_search(
                token, requested_repository, query, http_json=http_json
            )
        return results
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
                token,
                github_repository_query(query, login),
                per_page=limit,
                max_pages=1,
                http_json=http_json,
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
