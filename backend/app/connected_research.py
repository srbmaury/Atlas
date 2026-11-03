"""Connected evidence collection and response preparation."""

import logging
import math
import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, wait

from fastapi import HTTPException

from .config import DATA
from .db import Document
from .query_context import retrieval_query
from .research_queries import drive_query_for_question, gmail_query_for_question
from .source_contract import Evidence, normalize_results

log = logging.getLogger(__name__)
CONNECTED_SOURCE_EXECUTOR = ThreadPoolExecutor(
    max_workers=16, thread_name_prefix='atlas-source-search'
)


def collect_connected_evidence(
    workspaceId, body, actor, db, retrieval_stats=None, *, workspace_access, retrieve_chunks
):
    workspace_access(workspaceId, actor, db)
    if not body.question.strip():
        raise HTTPException(422, 'Enter a question.')
    if body.document_ids:
        count = (
            db.query(Document)
            .filter(Document.workspace_id == workspaceId, Document.id.in_(body.document_ids))
            .count()
        )
        if count != len(set(body.document_ids)):
            raise HTTPException(404, 'Selected document not found.')
    from .drive import access_token as drive_access_token
    from .drive import drive_evidence, drive_search
    from .external_sources import PROVIDERS, read_connection, source_search
    from .gmail import GMAIL_API, access_token, connection, email_from_json, gmail_get

    if any(p not in (*PROVIDERS, 'drive') for p in body.providers):
        raise HTTPException(422, 'Unknown connected provider.')
    evidence, document_evidence = [], {}
    stats = retrieval_stats if retrieval_stats is not None else {}
    stats.update({'found': {provider: 0 for provider in connected_scope(body)}, 'failed': []})
    tasks = []
    try:
        if body.include_documents:
            retrieved_documents = retrieve_chunks(
                workspaceId, retrieval_query(body.question, body.history), body.document_ids
            )[:6]
            stats['found']['documents'] = len(retrieved_documents)
            for item in retrieved_documents:
                evidence.append(
                    Evidence('documents', item['chunk_id'], item['name'], item['text'][:1800], None)
                )
                document_evidence[item['chunk_id']] = item
        if body.include_gmail:
            entry = connection(db, actor, workspaceId)
            token = access_token(entry, db)
            tasks.append(
                (
                    'gmail',
                    lambda: _search_gmail(
                        token,
                        body,
                        GMAIL_API,
                        gmail_get,
                        email_from_json,
                        gmail_query_for_question,
                    ),
                )
            )
        if 'drive' in body.providers:
            drive_token = drive_access_token(db, actor, workspaceId)
            tasks.append(
                (
                    'drive',
                    lambda: drive_evidence(
                        drive_token,
                        drive_search(drive_token, drive_query_for_question(body.question)),
                    ),
                )
            )
        for provider in dict.fromkeys(p for p in body.providers if p != 'drive'):
            _, provider_token = read_connection(db, actor, workspaceId, provider)
            tasks.append(
                (
                    provider,
                    lambda p=provider, t=provider_token: source_search(p, t, body.question),
                )
            )
        # A single slow connector should not serialize all selected sources. Keep
        # a small bounded pool and retain successful results if another source fails.
        if tasks:
            try:
                timeout = float(os.getenv('ATLAS_SOURCE_SEARCH_TIMEOUT_SECONDS', '30'))
            except ValueError:
                timeout = 30
            if not math.isfinite(timeout):
                timeout = 30
            timeout = min(max(timeout, 1), 60)
            futures = {
                CONNECTED_SOURCE_EXECUTOR.submit(search): provider for provider, search in tasks
            }
            _, pending = wait(futures, timeout=timeout)
            failures = []
            for future, provider in futures.items():
                if future in pending:
                    future.cancel()
                    failures.append((provider, TimeoutError('Source search deadline exceeded')))
                    stats['failed'].append(provider)
                    log.warning('Connected retrieval timed out for %s', provider)
                    continue
                try:
                    hits = future.result()
                    stats['found'][provider] = len(hits)
                    if provider == 'gmail':
                        evidence.extend(normalize_results(provider, hits))
                    else:
                        excerpt_limit = 8000 if provider == 'slack' else 3000
                        evidence.extend(
                            normalize_results(
                                provider,
                                [
                                    {
                                        **hit,
                                        'excerpt': hit.get('excerpt', '')[:excerpt_limit],
                                    }
                                    for hit in hits
                                ],
                            )
                        )
                except Exception as exc:
                    failures.append((provider, exc))
                    stats['failed'].append(provider)
                    log.warning(
                        'Connected retrieval failed for %s: %s', provider, type(exc).__name__
                    )
            # Do not hold the request open for a connector that missed the shared
            # deadline. Running calls remain bounded by their adapter HTTP timeouts.
            if failures and len(failures) == len(tasks) and not evidence:
                raise failures[0][1]
    except HTTPException:
        raise
    except Exception as exc:
        log.exception('Connected retrieval failed')
        raise HTTPException(502, 'Could not retrieve connected sources.') from exc
    from .evidence_quality import prepare_evidence

    return prepare_evidence(body.question, evidence), document_evidence


def retrieval_trace(body, evidence, stats, used_sources, scope=None):
    """Describe source retrieval and which passages reached the rendered result."""
    providers = connected_scope(body) if scope is None else scope
    considered = Counter(item.provider for item in evidence if item.provider in providers)
    used = Counter((item.get('provider') or 'documents') for item in used_sources)
    found = stats.get('found', {}) if stats else {}
    failed = set(stats.get('failed', [])) if stats else set()
    rows = [
        {
            'provider': provider,
            'status': 'failed' if provider in failed else 'searched',
            'found': found.get(provider, 0),
            'considered': considered[provider],
            'used': used[provider],
        }
        for provider in providers
    ]
    passages_considered = sum(considered.values())
    passages_used = sum(used[provider] for provider in providers)
    return {
        'passages_considered': passages_considered,
        'passages_used': passages_used,
        'sources': rows,
    }


def attach_retrieval_trace(result, body, evidence, stats, used_sources=None):
    result['retrieval'] = retrieval_trace(
        body,
        evidence,
        stats,
        result.get('sources', []) if used_sources is None else used_sources,
        result.get('scope'),
    )
    return result


def _search_gmail(token, body, gmail_api, gmail_get, email_from_json, gmail_query_for_question):
    matches = gmail_get(
        token,
        gmail_api + '/messages',
        {'q': gmail_query_for_question(body.gmail_query, body.question), 'maxResults': 8},
    ).get('messages', [])
    from .sources import Evidence

    def read_message(item):
        message = email_from_json(
            gmail_get(token, gmail_api + '/messages/' + item['id'], {'format': 'full'})
        )
        return Evidence(
            'gmail',
            message['id'],
            message['subject'],
            (message['body'] or message['snippet'])[:8000],
            message['url'],
            message['date'],
        )

    with ThreadPoolExecutor(max_workers=min(len(matches), 4) or 1) as executor:
        return list(executor.map(read_message, matches))


def connected_sources_for_payload(payload, document_evidence):
    sources = []
    for entry in payload:
        original = (
            document_evidence.get(entry.get('origin_id'))
            if entry.get('provider') == 'documents'
            else None
        )
        origin_url = None
        if original and original['name'].lower().endswith('.md'):
            try:
                original_text = (DATA / 'files' / original['document_id']).read_text(
                    encoding='utf-8'
                )[:4096]
            except (OSError, UnicodeError):
                original_text = ''
            match = re.search(r'(?m)^Source URL: (https?://\S+)', original_text)
            if match:
                origin_url = match.group(1)
        sources.append(
            {
                'chunk_id': original['chunk_id'] if original else str(entry['source_id']),
                'document_id': original['document_id'] if original else '',
                'name': entry['title'],
                'page': original['page'] if original else 0,
                'text': entry['text'],
                'ocr': bool(original and original.get('ocr')),
                'location_type': original['location_type']
                if original
                else entry.get('provider', 'source'),
                'provider': entry.get('provider'),
                'url': origin_url or entry.get('url'),
                'date': entry.get('date'),
            }
        )
    return sources


def connected_scope(body):
    scope = ['documents'] if body.include_documents else []
    if body.include_gmail:
        scope.append('gmail')
    scope.extend(provider for provider in body.providers if provider not in scope)
    return scope


def no_evidence_result(body, retrieval_stats=None):
    labels = {
        'documents': 'uploaded documents',
        'gmail': 'Gmail',
        'drive': 'Google Drive',
        'github': 'GitHub',
        'notion': 'Notion',
        'slack': 'Slack',
        'calendar': 'Google Calendar',
        'linear': 'Linear',
        'jira': 'Jira',
        'onedrive': 'OneDrive',
        'outlook': 'Outlook',
        'sharepoint': 'SharePoint',
    }
    scope = connected_scope(body)
    if not scope:
        answer = 'Choose at least one source, then ask again.'
    else:
        names = ', '.join(labels.get(item, item) for item in scope)
        answer = f'No matching results were found in {names} for this question. Try different keywords or check the source connection.'
    result = {'answer': answer, 'sources': [], 'mode': 'insufficient_evidence', 'scope': scope}
    result['retrieval'] = retrieval_trace(body, [], retrieval_stats or {}, [])
    return result


def connected_source_listing_result(question, body, evidence, document_evidence):
    """Format explicit record listings uniformly from provider-owned metadata."""
    from .evidence_quality import is_listing_question

    if not is_listing_question(question):
        return None
    scope = [provider for provider in connected_scope(body) if provider != 'documents']
    searchable_scopes = {
        'drive',
        'gmail',
        'calendar',
        'onedrive',
        'outlook',
        'sharepoint',
        'notion',
        'slack',
        'github',
        'linear',
        'jira',
    }
    if not set(scope) & searchable_scopes:
        return None
    matches = [item for item in evidence if item.provider in scope]
    if not matches:
        return None

    upcoming = bool(re.search(r'\b(?:next|upcoming|soon)\b', question, re.I))
    if upcoming:
        from datetime import datetime, timezone

        from .evidence_quality import activity_timestamp

        now = datetime.now(timezone.utc).timestamp()
        matches = [item for item in matches if activity_timestamp(item) >= now]
        matches.sort(key=activity_timestamp)
        if not matches:
            return {
                'answer': 'No upcoming records were present in the retrieved results.',
                'sources': [],
                'mode': 'source_results',
                'scope': scope,
            }
    elif re.search(
        r'\b(?:active|activity|recent|latest|newest|pushed|push|updated)\b', question, re.I
    ):
        from .evidence_quality import activity_timestamp

        matches.sort(key=activity_timestamp, reverse=True)

    from .external_sources import requested_result_limit

    default_limit = (
        1
        if re.search(
            r'\b(?:what|which)\b.{0,50}\b(?:next|upcoming|active|recent|latest|newest)\b',
            question,
            re.I,
        )
        else 12
    )
    limit = requested_result_limit(question, default=default_limit, max_limit=30)
    shown = matches[:limit]
    payload = [
        item.as_prompt(index) | {'origin_id': item.source_id} for index, item in enumerate(shown, 1)
    ]
    labels = {
        'drive': 'Google Drive',
        'gmail': 'Gmail',
        'github': 'GitHub',
        'notion': 'Notion',
        'slack': 'Slack',
        'calendar': 'Google Calendar',
        'linear': 'Linear',
        'jira': 'Jira',
        'onedrive': 'OneDrive',
        'outlook': 'Outlook',
        'sharepoint': 'SharePoint',
    }
    result_providers = list(dict.fromkeys(item.provider for item in matches))
    result_labels = [labels.get(provider, provider) for provider in result_providers]
    item_label = 'item' if len(matches) == 1 else 'items'
    lines = [f'Found {len(matches)} matching {item_label} in {", ".join(result_labels)}:']
    empty_providers = [provider for provider in scope if provider not in result_providers]
    if empty_providers:
        empty_labels = ', '.join(labels.get(provider, provider) for provider in empty_providers)
        lines.append(f'No matching items from {empty_labels}.')
    for index, item in enumerate(shown, 1):
        line = f'- **{item.title}** · {labels.get(item.provider, item.provider)} [{index}]'
        if item.provider == 'github' and item.url and '/pull/' in item.url and item.excerpt:
            line += f' — {item.excerpt[:300]}'
        lines.append(line)
    if len(matches) > len(shown):
        lines.append(f'Showing the first {len(shown)} of {len(matches)} matches.')
    return {
        'answer': '\n'.join(lines),
        'sources': connected_sources_for_payload(payload, document_evidence),
        'mode': 'source_results',
        'scope': scope,
    }


def direct_connected_result(question, body, evidence, document_evidence):
    """Return a source-native structured result when the provider exposes one."""
    return connected_source_listing_result(question, body, evidence, document_evidence)
