"""Workspace agent definitions and run endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ..agents.models import AgentDefinition, AgentRun, CreateAgent, ResearchRequest
from ..agents.sources import (
    authorized_source_config,
    require_saved_evidence_access,
    validate_sources,
)
from ..api_dependencies import database, user, workspace
from ..db import Document
from ..security.rbac import require_workspace, workspace_permission

router = APIRouter(prefix='/api/workspaces/{workspaceId}/agents', tags=['agents'])
MAX_ACTIVE_RUNS_PER_WORKSPACE = 5
MAX_ACTIVE_RUNS_PER_USER = 2


def public_agent(agent, actor=None, db=None):
    original = agent.source_config or {'include_documents': True}
    config = original
    if actor is not None and db is not None:
        config = authorized_source_config(db, agent.workspace_id, actor, original)
    restricted = bool(
        set(original.get('providers') or []) - set(config.get('providers') or [])
        or (original.get('include_gmail') and not config.get('include_gmail'))
    )
    return {
        'id': agent.id,
        'name': agent.name,
        'instructions': 'Some agent instructions are hidden because source access is restricted.'
        if restricted
        else agent.instructions,
        'output_format': agent.output_format,
        'source_config': config,
        'created': agent.created,
    }


def public_run(run):
    return {
        'id': run.id,
        'agent_id': run.agent_id,
        'question': run.question,
        'status': run.status,
        'steps': run.steps,
        'result': run.result,
        'created': run.created,
    }


@router.get('', dependencies=[Depends(workspace_permission('viewer'))])
def list_agents(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return [
        public_agent(a, actor, db)
        for a in db.query(AgentDefinition)
        .filter_by(workspace_id=workspaceId)
        .order_by(AgentDefinition.created.desc())
    ]


@router.get('/sources', dependencies=[Depends(workspace_permission('viewer'))])
def list_agent_sources(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    from ..db import ExternalConnection, GmailConnection
    from ..security.rbac import require_connection

    connected = []
    for row in db.query(ExternalConnection).filter_by(workspace_id=workspaceId):
        try:
            require_connection(db, actor, row)
            connected.append(row.provider)
        except HTTPException:
            pass
    gmail = db.get(GmailConnection, workspaceId)
    if gmail:
        try:
            require_connection(db, actor, gmail)
            connected.append('gmail')
        except HTTPException:
            pass
    return {
        'documents': [
            {'id': d.id, 'name': d.name}
            for d in db.query(Document)
            .filter_by(workspace_id=workspaceId, status='ready')
            .order_by(Document.name)
        ],
        'providers': sorted(set(connected)),
    }


@router.post('', dependencies=[Depends(workspace_permission('editor'))])
def create_agent(workspaceId: str, body: CreateAgent, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    agent = AgentDefinition(
        workspace_id=workspaceId,
        owner_id=actor.id,
        name=body.name.strip(),
        instructions=body.instructions,
        output_format=body.output_format,
        source_config=validate_sources(db, workspaceId, body, actor),
    )
    db.add(agent)
    db.commit()
    return public_agent(agent)


@router.patch('/{agentId}', dependencies=[Depends(workspace_permission('editor'))])
def update_agent(
    workspaceId: str, agentId: str, body: CreateAgent, actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
    agent = db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first()
    if agent is None:
        raise HTTPException(404, 'Agent not found.')
    agent.name = body.name.strip()
    agent.instructions = body.instructions
    agent.output_format = body.output_format
    agent.source_config = validate_sources(db, workspaceId, body, actor)
    db.commit()
    return public_agent(agent)


@router.delete('/{agentId}', dependencies=[Depends(workspace_permission('editor'))])
def delete_agent(workspaceId: str, agentId: str, actor=Depends(user), db=Depends(database)):
    require_workspace(db, actor, workspaceId, 'editor', lock=True)
    agent = db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first()
    if agent is None:
        raise HTTPException(404, 'Agent not found.')
    if (
        db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId)
        .filter(AgentRun.status.in_(('queued', 'processing')))
        .first()
    ):
        raise HTTPException(409, 'Cancel active runs before deleting this agent.')
    db.query(AgentRun).filter_by(workspace_id=workspaceId, agent_id=agentId).delete()
    db.delete(agent)
    db.commit()
    return {'deleted': True}


@router.get('/{agentId}/runs', dependencies=[Depends(workspace_permission('viewer'))])
def list_runs(workspaceId: str, agentId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    if not db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first():
        raise HTTPException(404, 'Agent not found.')
    visible = []
    for run in (
        db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId, actor_id=actor.id)
        .order_by(AgentRun.created.desc())
        .limit(30)
    ):
        item = public_run(run)
        providers = set((run.result or {}).get('scope') or []) - {'documents'}
        if providers:
            try:
                require_saved_evidence_access(
                    workspaceId, actor, providers, run.result.get('source_scope_fingerprints')
                )
            except HTTPException:
                item['result'] = {
                    'error': 'Connected source access has changed. Previous evidence is hidden.'
                }
                item['steps'] = []
        visible.append(item)
    return visible


@router.post(
    '/{agentId}/runs/{runId}/cancel',
    dependencies=[Depends(workspace_permission('editor'))],
)
def cancel_research(
    workspaceId: str,
    agentId: str,
    runId: str,
    actor=Depends(user),
    db=Depends(database),
):
    workspace(workspaceId, actor, db)
    owned_run = db.query(AgentRun).filter_by(
        workspace_id=workspaceId, agent_id=agentId, id=runId, actor_id=actor.id
    )
    (
        owned_run.filter(AgentRun.status.in_(('queued', 'processing'))).update(
            {
                'status': 'cancelled',
                'lease': 0,
                'generation': AgentRun.generation + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    run = owned_run.first()
    if run is None:
        raise HTTPException(404, 'Research run not found.')
    return {'id': run.id, 'status': run.status}


@router.post('/{agentId}/runs', dependencies=[Depends(workspace_permission('editor'))])
def run_research(
    workspaceId: str, agentId: str, body: ResearchRequest, actor=Depends(user), db=Depends(database)
):
    require_workspace(db, actor, workspaceId, 'editor', lock=True)
    agent = db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first()
    if not agent:
        raise HTTPException(404, 'Agent not found.')
    active = db.query(AgentRun).filter(
        AgentRun.workspace_id == workspaceId,
        AgentRun.status.in_(('queued', 'processing')),
    )
    if active.count() >= MAX_ACTIVE_RUNS_PER_WORKSPACE:
        raise HTTPException(429, 'Workspace research queue is full.')
    if active.filter(AgentRun.actor_id == actor.id).count() >= MAX_ACTIVE_RUNS_PER_USER:
        raise HTTPException(429, 'You already have too many active research runs.')
    run = AgentRun(
        workspace_id=workspaceId,
        agent_id=agentId,
        actor_id=actor.id,
        question=body.question,
        steps=[],
    )
    db.add(run)
    db.commit()
    return public_run(run)
