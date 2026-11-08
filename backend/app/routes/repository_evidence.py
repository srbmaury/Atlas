"""Evidence-first repository inspection. No model call or synthetic citations."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..api_dependencies import database, user
from ..external_sources import connection, github_repository_file_search
from ..rbac import revalidate_access, workspace_permission

router = APIRouter(prefix='/api')
REPOSITORY = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')


class RepositoryInspection(BaseModel):
    repository: str = Field(min_length=3, max_length=150)
    question: str = Field(min_length=3, max_length=400)


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
    """Fetch bounded, real GitHub files; show evidence before attempting synthesis."""
    repository = body.repository.strip()
    if not REPOSITORY.fullmatch(repository):
        raise HTTPException(422, 'Repository must be owner/name.')
    _, token = connection(db, actor, workspaceId, 'github')
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
