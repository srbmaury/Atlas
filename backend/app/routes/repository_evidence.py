"""Evidence-first GitHub inspection using only the connected account's permissions."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..api_dependencies import database, user
from ..external_sources import github_repository_file_search, http_json, read_connection
from ..rbac import revalidate_access, workspace_permission

router = APIRouter(prefix='/api')
REPOSITORY = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
class RepositoryInspection(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    repository: str | None = Field(default=None, max_length=150)


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
    results = github_repository_file_search(token, repository, body.question, limit=8)
    revalidate_access(workspaceId, actor, {'github'})
    return {
        'repository': repository,
        'question': body.question,
        'status': 'evidence_found' if results else 'no_matches',
        'count': len(results),
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
