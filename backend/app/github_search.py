"""Read-only search and evidence retrieval for the connected GitHub account."""

import base64
import re
from urllib.parse import quote

from fastapi import HTTPException

from .research_queries import GITHUB_QUERY_STOPWORDS, provider_query_terms, requested_result_limit


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


def github_repository_from_query(query):
    """Extract an explicit repository from a GitHub URL or repo: qualifier."""
    match = re.search(
        r'(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)',
        query,
        re.I,
    )
    if match:
        return f'{match.group(1)}/{match.group(2).removesuffix(".git")}'
    match = re.search(r'\brepo:([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)', query, re.I)
    return match.group(1).removesuffix('.git') if match else None


def github_query_without_repository(query):
    """Remove URL/qualifier syntax before extracting natural-language search terms."""
    query = re.sub(
        r'https?://(?:www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[^\s]*)?',
        ' ',
        query,
        flags=re.I,
    )
    return re.sub(r'\brepo:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', ' ', query, flags=re.I)


def github_wants_code(query):
    """Recognize code requests, including analysis of an explicitly linked repository."""
    code_request = re.search(
        r'\b(?:code|source\s+code|function|class|method|implementation|implemented|definition|symbol)\b',
        query,
        re.I,
    )
    repository_analysis = github_repository_from_query(query) and re.search(
        r'\b(?:analy[sz]e|review|audit|understand|explain|map)\b', query, re.I
    )
    return bool(code_request or repository_analysis)


def github_code_search_query(query, login):
    """Build a bounded GitHub code-search query scoped to the connected account."""
    repository = github_repository_from_query(query)
    clean_query = github_query_without_repository(query)
    qualifiers = re.findall(
        r'\b(?:org|user|language|extension|path|filename|in):[^\s]+',
        clean_query,
        re.I,
    )
    terms = [
        word
        for word in provider_query_terms(clean_query)
        if word.lower() not in GITHUB_QUERY_STOPWORDS
        and word.lower()
        not in {
            'code',
            'source',
            'search',
            'find',
            'show',
            'where',
            'implemented',
            'trace',
            'tracing',
            'flow',
            'chain',
            'end',
        }
    ]
    if not terms and not repository:
        raise HTTPException(422, 'Add a function, class, identifier, or topic to search in code.')
    scope = [f'repo:{repository}'] if repository else qualifiers
    scope = scope or ([f'user:{login}'] if login else [])
    if not scope:
        raise HTTPException(
            422, 'Could not identify the connected GitHub account. Reconnect GitHub and try again.'
        )
    # A repository-only analysis still needs a search term for GitHub's code API.
    if not terms:
        terms = ['import']
    return ' '.join([*terms[:9], *scope, 'in:file'])[:240]


def github_wants_flow(query):
    """Recognize flow tracing and explicit whole-repository analysis requests."""
    flow_request = re.search(
        r'\b(?:trace|tracing|call\s+chain|code\s+flow|request\s+flow|end[- ]to[- ]end\s+flow)\b',
        query,
        re.I,
    )
    repository_analysis = github_repository_from_query(query) and re.search(
        r'\b(?:analy[sz]e|review|audit|map)\b', query, re.I
    )
    return bool(flow_request or repository_analysis)


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


def github_repository_file_search(token, repository, query, limit=12, *, http_json):
    """Retrieve useful source files through Git Trees + Contents when code search is empty."""
    owner, name = repository.split('/', 1)
    metadata = http_json(f'https://api.github.com/repos/{owner}/{name}', token, 'github')
    branch = metadata.get('default_branch') or 'main'
    tree = http_json(
        f'https://api.github.com/repos/{owner}/{name}/git/trees/{quote(branch, safe="")}',
        token,
        'github',
        {'recursive': '1'},
    )
    candidates = []
    excluded_dirs = {
        '.git',
        '.next',
        '.venv',
        'venv',
        'node_modules',
        'dist',
        'build',
        'coverage',
        '__pycache__',
        'vendor',
        'target',
        'site-packages',
    }
    allowed_suffixes = {
        '.py',
        '.pyi',
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.mjs',
        '.cjs',
        '.java',
        '.go',
        '.rs',
        '.rb',
        '.php',
        '.cs',
        '.cpp',
        '.h',
        '.hpp',
        '.sql',
        '.kt',
        '.kts',
        '.xml',
        '.gradle',
        '.md',
        '.mdx',
        '.json',
        '.toml',
        '.yaml',
        '.yml',
        '.ini',
        '.cfg',
        '.sh',
    }
    query_terms = [
        term.lower()
        for term in re.findall(r'[A-Za-z_][A-Za-z0-9_]{2,}', github_query_without_repository(query))
        if term.lower() not in GITHUB_QUERY_STOPWORDS
    ]
    priority_names = {
        'readme.md': 12,
        'pyproject.toml': 10,
        'package.json': 10,
        'requirements.txt': 8,
        'main.py': 9,
        'app.py': 8,
        'index.tsx': 8,
        'index.ts': 7,
        'page.tsx': 8,
        'page.ts': 7,
        'server.ts': 8,
        'docker-compose.yml': 6,
        'compose.yml': 6,
        'schema.sql': 7,
    }
    for entry in tree.get('tree', []):
        if entry.get('type') != 'blob':
            continue
        path = entry.get('path') or ''
        parts = path.lower().split('/')
        if any(part in excluded_dirs for part in parts):
            continue
        basename = parts[-1]
        suffix = '.' + basename.rsplit('.', 1)[-1] if '.' in basename else ''
        if suffix not in allowed_suffixes and basename not in {'dockerfile', 'makefile'}:
            continue
        if any(basename.endswith(ext) for ext in ('.lock', '.min.js', '.map')):
            continue
        size = entry.get('size')
        if size is not None and size > 250_000:
            continue
        score = priority_names.get(basename, 0)
        path_lower = path.lower()
        score += sum(2 for term in query_terms if term in path_lower)
        if '/routes/' in path_lower or '/api/' in path_lower:
            score += 2
        if '/services/' in path_lower or '/components/' in path_lower:
            score += 1
        candidates.append((score, path))
    # Rank repository files consistently regardless of how the question is phrased.
    # Always include representative implementation files and documentation.
    entry_names = {
        'main.py',
        'app.py',
        'application.py',
        'server.py',
        'index.ts',
        'index.tsx',
        'main.ts',
        'main.tsx',
        'app.tsx',
        'app.ts',
        'page.tsx',
        'routes.py',
        'urls.py',
        'manage.py',
        'mainactivity.kt',
        'application.kt',
        'androidmanifest.xml',
    }
    code_suffixes = {'.py', '.ts', '.tsx', '.js', '.jsx', '.java', '.go', '.kt', '.kts'}
    ranked = []
    for score, path in candidates:
        lower = path.lower()
        base = lower.rsplit('/', 1)[-1]
        suffix = '.' + base.rsplit('.', 1)[-1] if '.' in base else ''
        if base in entry_names:
            score += 15
        elif suffix in code_suffixes:
            score += 6
        if any(part in lower for part in ('/src/', '/app/', '/backend/', '/frontend/')):
            score += 3
        ranked.append((score, path))
    ranked.sort(key=lambda item: (-item[0], item[1].count('/'), item[1].lower()))
    selected = []
    seen_dirs = set()
    readme = next((candidate for candidate in ranked if candidate[1].lower() == 'readme.md'), None)
    if readme:
        selected.append(readme)
    for candidate in ranked:
        directory = candidate[1].rsplit('/', 1)[0] if '/' in candidate[1] else ''
        if candidate in selected or directory in seen_dirs:
            continue
        selected.append(candidate)
        seen_dirs.add(directory)
        if len(selected) >= limit:
            break
    candidates = selected + [candidate for candidate in ranked if candidate not in selected]
    results = []
    total_chars = 0
    for _, path in candidates[: limit * 3]:
        if len(results) >= limit or total_chars >= 32_000:
            break
        content_data = http_json(
            f'https://api.github.com/repos/{owner}/{name}/contents/{quote(path, safe="/")}',
            token,
            'github',
            {'ref': branch},
        )
        encoded = content_data.get('content') or ''
        if content_data.get('encoding') == 'base64':
            try:
                content = base64.b64decode(encoded).decode('utf-8', errors='replace')
            except (ValueError, TypeError):
                continue
        else:
            content = encoded
        if not content.strip():
            continue
        excerpt = content[: min(3500, 32_000 - total_chars)]
        total_chars += len(excerpt)
        html_url = content_data.get('html_url') or (
            f'https://github.com/{repository}/blob/{quote(branch, safe="")}/{quote(path, safe="/")}'
        )
        results.append(
            {
                'provider': 'github',
                'id': str(content_data.get('sha') or f'{repository}:{path}'),
                'title': f'{repository}/{path}',
                'excerpt': f'Repository file retrieved via GitHub Contents API\n{excerpt}',
                'url': html_url,
                'owner': owner,
                'scope': repository,
                'metadata': {'repository': repository, 'path': path, 'branch': branch},
            }
        )
    return results


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
            'rate',
            'rating',
            'review',
            'assess',
            'analyze',
            'analyse',
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
