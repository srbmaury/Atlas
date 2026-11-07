"""Provider-aware deduplication and conservative cross-source evidence ranking.

Never infer a relationship just because two records share a keyword.
These utilities preserve original source IDs and URLs for citation integrity.
"""

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from .retrieval import tokens


def keywords(text):
    return {word for word in tokens(text) if len(word) >= 3}


def canonical_url(url):
    if not url:
        return ''
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ('https', 'http') or not parsed.hostname:
            return ''
        # Drop marketing fragments/parameters but keep query parameters necessary
        # to identify provider records.
        return urlunsplit(
            (
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                parsed.path.rstrip('/') or '/',
                parsed.query,
                '',
            )
        )
    except ValueError:
        return ''


def fingerprint(item):
    url = canonical_url(item.url)
    if url:
        return ('url', url)
    # Never deduplicate records from different providers solely on similar prose.
    return (item.provider, str(item.source_id))


def score(item, question):
    query = keywords(question)
    if not query:
        return 0
    title = keywords(item.title)
    body = keywords(item.excerpt)
    return 3 * len(query & title) + len(query & body)


def is_listing_question(question):
    """Recognize record-list requests across providers without provider-specific terms."""
    words = set(tokens(question)) | {
        word.removesuffix('s') for word in re.findall(r'\w+', question.lower())
    }
    asks_to_list = bool(
        re.search(
            r'\b(?:list|show|find|get|name|search)\b|\b(?:tell|give)\s+me\s+(?:\d+|my|our|the names of)\b',
            question,
            re.I,
        )
        or re.search(
            r'\b(?:what|which)\b.{0,50}\b(?:next|upcoming|active|recent|latest|newest)\b',
            question,
            re.I,
        )
        or re.search(r'\bwhat\s+are\b.{0,50}\bmy\b', question, re.I)
    )
    record_terms = {
        'file',
        'document',
        'email',
        'message',
        'conversation',
        'page',
        'ticket',
        'issue',
        'item',
        'result',
        'project',
        'repo',
        'repository',
        'event',
        'appointment',
        'meeting',
        'flight',
        'request',
        'pr',
    }
    return (asks_to_list and bool(words & record_terms)) or bool(
        re.fullmatch(r'(?:my|our) (?:pull requests?|prs?)\s*[?.]?', question.strip(), re.I)
    )


def is_recency_question(question):
    return bool(
        re.search(
            r'\b(?:active|activity|recent|latest|newest|pushed|push|updated|newly|next|upcoming|soon)\b',
            question,
            re.I,
        )
    )


def activity_timestamp(item):
    value = getattr(item, 'date', None)
    if not value:
        return float('-inf')
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except ValueError:
        return float('-inf')


def prepare_evidence(question, items, *, limit=60, per_provider=20):
    """Deduplicate and rank each provider's search results independently.

    Each adapter has already searched its own source using that provider's
    query semantics. Applying one lexical overlap threshold to the combined
    results can discard valid evidence when providers use different wording.
    Rank candidates within each provider, then interleave providers so one
    source cannot crowd all other selected sources out of the model context.
    """
    recent = is_recency_question(question)
    groups = {}
    seen = set()
    for item in items:
        key = fingerprint(item)
        if key in seen:
            continue
        seen.add(key)
        groups.setdefault(item.provider, []).append(item)

    for candidates in groups.values():
        if recent:
            candidates.sort(key=lambda item: (-activity_timestamp(item), -score(item, question)))
        else:
            candidates.sort(key=lambda item: -score(item, question))

    selected = []
    provider_order = sorted(
        groups, key=lambda provider: score(groups[provider][0], question), reverse=True
    )
    positions = {provider: 0 for provider in provider_order}
    while len(selected) < limit:
        added = False
        for provider in provider_order:
            candidates = groups[provider]
            index = positions[provider]
            if index >= min(len(candidates), per_provider):
                continue
            selected.append(candidates[index])
            positions[provider] += 1
            added = True
            if len(selected) >= limit:
                break
        if not added:
            break
    return selected
