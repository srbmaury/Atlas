"""Translate Atlas questions into GitHub search queries."""

import re

from fastapi import HTTPException

from ...research_queries import GITHUB_QUERY_STOPWORDS, provider_query_terms


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
