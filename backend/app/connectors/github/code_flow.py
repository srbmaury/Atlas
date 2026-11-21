"""Trace code references with bounded GitHub searches."""

import re

from fastapi import HTTPException

from .queries import github_query_without_repository, github_repository_from_query
from .repository_files import github_repository_file_search


def github_flow_layer(path):
    """Assign a cautious architectural layer label from a source-file path."""
    normalized = (path or '').lower()
    if normalized.startswith(('frontend/', 'web/', 'client/')):
        return 'Frontend / UI'
    if '/routes/' in normalized or normalized.endswith(('/main.py', '/router.py', '/routes.py')):
        return 'API / routing'
    if any(
        part in normalized
        for part in ('/models/', '/migrations/', '/repositories/', '/db.py', '/database')
    ):
        return 'Database / persistence'
    if normalized.startswith(('backend/', 'server/')):
        return 'Backend / service'
    return 'Source reference'


def github_flow_search(token, query, login, *, http_json):
    """Build a bounded, two-hop code-reference trace from GitHub code search."""
    repository = github_repository_from_query(query)
    clean_query = github_query_without_repository(query)
    qualifiers = re.findall(
        r'\b(?:org|user|language|extension|path|filename):[^\s]+',
        clean_query,
        re.I,
    )
    flow_stopwords = {
        'trace',
        'tracing',
        'flow',
        'code',
        'request',
        'call',
        'chain',
        'end',
        'to',
        'the',
        'for',
        'how',
        'does',
        'work',
        'show',
        'me',
        'please',
        'from',
        'frontend',
        'backend',
        'database',
        'db',
        'ui',
        'api',
        'through',
        'across',
        'follow',
        'feature',
        'analyze',
        'analyse',
        'review',
        'audit',
        'map',
        'repository',
        'repo',
        'my',
    }
    terms = [
        word
        for word in re.findall(r'[A-Za-z0-9_.$-]{2,}', clean_query)
        if word.lower() not in flow_stopwords and ':' not in word
    ]
    if not terms:
        # Whole-repository analysis has no named feature; seed code discovery with imports.
        terms = ['import']
    scope = [f'repo:{repository}'] if repository else qualifiers
    scope = scope or ([f'user:{login}'] if login else [])
    if not scope:
        raise HTTPException(
            422, 'Could not identify the connected GitHub account. Reconnect GitHub and try again.'
        )
    base_query = ' '.join([*terms[:8], *scope, 'in:file'])[:240]
    scope = re.findall(r'\b(?:repo|org|user):[^\s]+', base_query, re.I)
    scope_clause = ' '.join(scope) if scope else f'user:{login}'
    seen = set()
    results = []

    def collect(search_query, relation):
        data = http_json(
            'https://api.github.com/search/code',
            token,
            'github',
            {'q': search_query, 'per_page': 8},
            accept='application/vnd.github.text-match+json',
        )
        matched_items = []
        for item in data.get('items', []):
            repository_name = (item.get('repository') or {}).get('full_name', '')
            if repository and repository_name.casefold() != repository.casefold():
                continue
            path = item.get('path') or item.get('name') or 'source file'
            key = (repository_name.lower(), path.lower())
            if key in seen:
                continue
            seen.add(key)
            matched_items.append(item)
            fragments = [
                match.get('fragment', '').strip()
                for match in (item.get('text_matches') or [])
                if match.get('fragment')
            ]
            excerpt = '\n…\n'.join(fragments)[:5000] or f'Matching source file: {path}'
            layer = github_flow_layer(path)
            results.append(
                {
                    'provider': 'github',
                    'id': str(item.get('sha') or item.get('url') or path),
                    'title': f'[{layer}] {repository}/{path}'
                    if repository
                    else f'[{layer}] {path}',
                    'excerpt': f'{relation}\n{excerpt}'[:5200],
                    'url': item.get('html_url'),
                    'owner': repository_name.split('/', 1)[0] if '/' in repository_name else None,
                    'scope': repository_name or None,
                    'metadata': {'repository': repository_name, 'path': path},
                }
            )
            if len(results) >= 16:
                break
        return matched_items

    initial = collect(base_query, 'Initial feature match')
    if not initial and repository:
        return github_repository_file_search(token, repository, query, http_json=http_json)
    # Follow only a few concrete function/class symbols found in returned
    # snippets. This is a bounded reference lookup, not a complete call graph.
    symbols = []
    symbol_pattern = re.compile(
        r'\b(?:async\s+def|def|class|function|const|let|var)\s+([A-Za-z_$][\w$]*)'
    )
    for item in initial:
        for match in item.get('text_matches') or []:
            fragment = match.get('fragment') or ''
            for symbol in symbol_pattern.findall(fragment):
                if symbol.lower() not in {value.lower() for value in symbols}:
                    symbols.append(symbol)
                if len(symbols) >= 3:
                    break
            if len(symbols) >= 3:
                break
        if len(symbols) >= 3:
            break
    for symbol in symbols:
        if len(results) >= 16:
            break
        collect(f'{symbol} {scope_clause} in:file', f'Reference lookup for `{symbol}`')
    return results
