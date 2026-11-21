"""Retrieve repository excerpts through Git Trees and Contents."""

import base64
import re
from urllib.parse import quote

from ...research.research_queries import GITHUB_QUERY_STOPWORDS
from .queries import github_query_without_repository


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
