"""Evidence-first GitHub inspection using only the connected account's permissions."""

import os
import re

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..ai import enabled as ai_enabled, generate
from ..api_dependencies import database, user
from ..external_sources import github_repository_file_search, http_json, read_connection
from ..rbac import revalidate_access, workspace_permission

router = APIRouter(prefix='/api')
REPOSITORY = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
def search_public_web(query: str) -> list[dict]:
    """Optional public web search; requires an explicitly configured server API key."""
    key = os.getenv('BRAVE_SEARCH_API_KEY', '').strip()
    if not key:
        raise HTTPException(503, 'Web search is not configured. Set BRAVE_SEARCH_API_KEY on the server.')
    try:
        with httpx.Client(timeout=12, follow_redirects=False, trust_env=False) as client:
            response = client.get(
                'https://api.search.brave.com/res/v1/web/search',
                params={'q': query, 'count': 5},
                headers={'X-Subscription-Token': key, 'Accept': 'application/json'},
            )
            response.raise_for_status()
            items = response.json().get('web', {}).get('results', [])
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(502, 'Public web search failed. Check the configured search provider.') from exc
    return [
        {'title': str(item.get('title', ''))[:240],
         'url': str(item.get('url', ''))[:2048],
         'excerpt': str(item.get('description', ''))[:1000]}
        for item in items[:5] if str(item.get('url', '')).startswith('https://')
    ]


class RepositoryInspection(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    repository: str | None = Field(default=None, max_length=150)
    include_web: bool = False
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


def accessible_repositories(token):
    """GitHub /user/repos includes owned, collaborator and organization repositories."""
    repositories = []
    for page in range(1, 4):
        response = http_json(
            'https://api.github.com/user/repos', token, 'github',
            {'affiliation': 'owner,collaborator,organization_member', 'per_page': 100,
             'page': page, 'sort': 'updated'},
        )
        if not isinstance(response, list):
            raise HTTPException(502, 'GitHub returned an unexpected repository listing.')
        repositories.extend(
            {'full_name': item['full_name'], 'private': bool(item.get('private'))}
            for item in response if item.get('full_name')
        )
        if len(response) < 100:
            break
    return repositories


def resolve_repository(question, selected, repositories):
    available = {item['full_name'].lower(): item['full_name'] for item in repositories}
    if selected:
        if not REPOSITORY.fullmatch(selected):
            raise HTTPException(422, 'Repository must be owner/name.')
        match = available.get(selected.lower())
        if not match:
            raise HTTPException(404, 'Repository not found in the connected GitHub account.')
        return match
    explicit = re.search(r'\\brepo:([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)', question, re.I)
    if explicit:
        return resolve_repository(question, explicit.group(1), repositories)
    words = {word.lower() for word in re.findall(r'[A-Za-z0-9_.-]+', question)}
    candidates = [item['full_name'] for item in repositories
                  if item['full_name'].split('/')[-1].lower() in words
                  or item['full_name'].lower() in question.lower()]
    if len(candidates) == 1:
        return candidates[0]
    if len(repositories) == 1:
        return repositories[0]['full_name']
    return None


@router.get(
    '/workspaces/{workspaceId}/repository-evidence/repositories',
    dependencies=[Depends(workspace_permission(provider='github'))],
)
def list_repositories(workspaceId: str, request: Request, actor=Depends(user), db=Depends(database)):
    _, token = read_connection(db, actor, workspaceId, 'github')
    repositories = accessible_repositories(token)
    revalidate_access(workspaceId, actor, {'github'})
    return {'repositories': repositories, 'truncated': len(repositories) >= 300}


@router.post(
    '/workspaces/{workspaceId}/repository-evidence',
    dependencies=[Depends(workspace_permission(provider='github'))],
)
def inspect_repository(
    workspaceId: str,
    body: RepositoryInspection,
    request: Request,
    actor=Depends(user),
    db=Depends(database),
):
    _, token = read_connection(db, actor, workspaceId, 'github')
    repositories = accessible_repositories(token)
    repository = resolve_repository(body.question, body.repository, repositories)
    if not repository:
        revalidate_access(workspaceId, actor, {'github'})
        return {
            'status': 'select_repository', 'repository': None, 'question': body.question,
            'count': 0, 'sources': [], 'repositories': repositories,
            'message': 'Select a repository from your connected GitHub account.',
        }
    # History supplies conversational context, but fresh evidence is retrieved for every turn.
    recent = [item for item in body.history[-6:]
              if item.get('role') in {'user', 'assistant'}
              and isinstance(item.get('content'), str)][:6]
    recent = [{'role': item['role'], 'content': item['content'][:1200]} for item in recent]
    retrieval_query = ' '.join([body.question] + [item['content'][:160] for item in recent if item['role'] == 'user'][-2:])[:600]
    results = github_repository_file_search(token, repository, retrieval_query, limit=8)
    web_results = search_public_web(body.question) if body.include_web else []
    evidence = [
        {'name': item.get('metadata', {}).get('path', item['title']),
         'page': 1, 'text': item.get('excerpt', '')[:3500]}
        for item in results if item.get('excerpt')
    ]
    evidence.extend(
        {'name': item['title'], 'page': 1, 'text': item['excerpt']}
        for item in web_results if item.get('excerpt')
    )
    answer = None
    answer_mode = 'no_evidence'
    fallback = None
    if evidence:
        preferred = next((item for item in evidence if item['name'].lower().endswith('readme.md')), evidence[0])
        source_index = evidence.index(preferred) + 1
        text = preferred['text'].replace('Repository file retrieved via GitHub Contents API', '').strip()
        fallback = {'text': text[:1800], 'source_id': source_index, 'path': preferred['name']}

    if evidence and ai_enabled():
        try:
            generated = generate(body.question, evidence, history=recent) if recent else generate(body.question, evidence)
            answer_mode = generated.get('mode', 'unknown')
            if answer_mode == 'citation_check_failed':
                # Retry once with explicit source IDs and a bounded factual scope.
                # Never promote an answer that fails the existing citation validator.
                retry_question = (
                    body.question
                    + '\\nAnswer only from the supplied passages. Cite each factual '
                    'statement with a source marker like [1] or [2]. '
                    'If a detailed flow cannot be established, say what is unknown.'
                )
                generated = generate(retry_question, evidence[:6], history=recent) if recent else generate(retry_question, evidence[:6])
                answer_mode = generated.get('mode', 'unknown')
            if answer_mode == 'ai':
                answer = generated.get('answer')
        except Exception:
            # Evidence remains available if model synthesis is unavailable.
            answer_mode = 'generation_failed'
    elif evidence:
        answer_mode = 'ai_not_configured'
    revalidate_access(workspaceId, actor, {'github'})
    return {
        'repository': repository,
        'question': body.question,
        'status': 'evidence_found' if results else 'no_matches',
        'count': len(results),
        'answer': answer,
        'answer_mode': answer_mode,
        'fallback': fallback if not answer else None,
        'web_sources': web_results,
        'sources': [
            {
                'title': item['title'],
                'path': item.get('metadata', {}).get('path', ''),
                'url': item.get('url'),
                'excerpt': item.get('excerpt', '')[:1800],
            }
            for item in results
        ],
    }
