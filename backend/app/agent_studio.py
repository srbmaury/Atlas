"""Bounded, read-only research agents with workspace-scoped persistent traces."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, Float, ForeignKey, Integer, String, Text

from .agent_evidence import evidence_graph, plan
from .ai import generate
from .api_dependencies import database, user, workspace
from .db import Base, Session, User, uid
from .rbac import require_workspace, workspace_permission
from .retrieval import retrieve
from .worker import claim, heartbeat

router = APIRouter(prefix='/api/workspaces/{workspaceId}/agents', tags=['agents'])
MAX_STEPS = 5
MAX_ACTIVE_RUNS_PER_WORKSPACE = 5
MAX_ACTIVE_RUNS_PER_USER = 2
log = logging.getLogger(__name__)


class AgentDefinition(Base):
    __tablename__ = 'agent_definitions'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(
        String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True
    )
    owner_id = Column(String, nullable=False)
    name = Column(String(100), nullable=False)
    instructions = Column(Text, nullable=False)
    output_format = Column(String(32), nullable=False, default='detailed_notes')
    created = Column(Float, default=time.time)


class AgentRun(Base):
    __tablename__ = 'agent_runs'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(
        String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True
    )
    agent_id = Column(String, nullable=False, index=True)
    actor_id = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    status = Column(String, nullable=False, default='queued', index=True)
    lease = Column(Float, default=0)
    generation = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    error = Column(Text)
    steps = Column(JSON, nullable=False, default=list)
    result = Column(JSON)
    created = Column(Float, default=time.time)


class CreateAgent(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    instructions: str = Field(default='Find relevant evidence and cite sources.', max_length=2000)
    output_format: str = Field(default='detailed_notes', pattern='^(detailed_notes|concise|report)


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


def public_agent(agent):
    return {
        'id': agent.id,
        'name': agent.name,
        'instructions': agent.instructions,
        'output_format': agent.output_format,
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
        public_agent(a)
        for a in db.query(AgentDefinition)
        .filter_by(workspace_id=workspaceId)
        .order_by(AgentDefinition.created.desc())
    ]


@router.post('', dependencies=[Depends(workspace_permission('editor'))])
def create_agent(workspaceId: str, body: CreateAgent, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    agent = AgentDefinition(
        workspace_id=workspaceId,
        owner_id=actor.id,
        name=body.name.strip(),
        instructions=body.instructions,
        output_format=body.output_format,
    )
    db.add(agent)
    db.commit()
    return public_agent(agent)


@router.patch('/{agentId}', dependencies=[Depends(workspace_permission('editor'))])
def update_agent(workspaceId: str, agentId: str, body: CreateAgent, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    agent = db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first()
    if agent is None:
        raise HTTPException(404, 'Agent not found.')
    agent.name = body.name.strip()
    agent.instructions = body.instructions
    agent.output_format = body.output_format
    db.commit()
    return public_agent(agent)


@router.delete('/{agentId}', dependencies=[Depends(workspace_permission('editor'))])
def delete_agent(workspaceId: str, agentId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    agent = db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first()
    if agent is None:
        raise HTTPException(404, 'Agent not found.')
    if db.query(AgentRun).filter_by(workspace_id=workspaceId, agent_id=agentId).filter(AgentRun.status.in_(('queued', 'processing'))).first():
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
    return [
        public_run(r)
        for r in db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId)
        .order_by(AgentRun.created.desc())
        .limit(30)
    ]


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
    (
        db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId, id=runId)
        .filter(AgentRun.status.in_(('queued', 'processing')))
        .update(
            {
                'status': 'cancelled',
                'lease': 0,
                'generation': AgentRun.generation + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    run = db.query(AgentRun).filter_by(workspace_id=workspaceId, agent_id=agentId, id=runId).first()
    if run is None:
        raise HTTPException(404, 'Research run not found.')
    return public_run(run)


@router.post('/{agentId}/runs', dependencies=[Depends(workspace_permission('editor'))])
def run_research(
    workspaceId: str, agentId: str, body: ResearchRequest, actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
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


def execute_one_research_run():
    """Claim one persisted run, recover expired leases, and persist a safe trace."""
    with Session() as db:
        db.query(AgentRun).filter(
            AgentRun.status == 'processing',
            AgentRun.attempts >= 3,
            AgentRun.lease < time.time(),
        ).update(
            {'status': 'failed', 'error': 'Research exceeded retry limit.'},
            synchronize_session=False,
        )
        db.commit()
    claimed = claim(AgentRun, max_attempts=3)
    if not claimed:
        return False
    run_id, generation = claimed
    with Session() as db:
        run = db.query(AgentRun).filter_by(id=run_id, generation=generation).first()
        if run is None or run.status != 'processing':
            return True
        workspace_id, question = run.workspace_id, run.question
        agent = db.query(AgentDefinition).filter_by(id=run.agent_id, workspace_id=workspace_id).first()
        if agent is None:
            run.status = 'failed'
            run.result = {'error': 'Agent no longer exists.'}
            db.commit()
            return True
        agent_instructions = agent.instructions
        output_format = agent.output_format
        requesting_user = db.get(User, run.actor_id)
        try:
            require_workspace(db, requesting_user, workspace_id, 'editor')
        except (HTTPException, AttributeError):
            run.status = 'failed'
            run.result = {'error': 'Workspace access is no longer authorized.'}
            db.commit()
            return True
    steps = []
    try:
        questions = plan(question)
        steps.append({'tool': 'research_plan', 'queries': questions})
        sources = []
        seen = set()
        for query in questions:
            if not heartbeat(AgentRun, run_id, generation):
                return True
            for source in retrieve(workspace_id, query, limit=8):
                key = source.get('chunk_id')
                if key and key not in seen and len(sources) < 8:
                    seen.add(key)
                    sources.append(source)
        steps.append({'tool': 'workspace_retrieval', 'source_count': len(sources)})
        graph = evidence_graph(sources)
        steps.append({'tool': 'evidence_graph', 'nodes': len(graph['nodes'])})
        if not heartbeat(AgentRun, run_id, generation):
            return True
        from .ai import generate_agent

        result = generate_agent(question, sources, agent_instructions, output_format)
        result['evidence_graph'] = graph
        steps.append({'tool': 'grounded_answer', 'mode': result.get('mode', 'unknown')})
        status = 'failed' if result.get('mode') == 'citation_check_failed' else 'completed'
    except Exception:
        log.exception('Agent research execution failed for run %s', run_id)
        status = 'failed'
        result = {'error': 'Research failed. Check server logs.'}
    with Session() as db:
        active = db.query(AgentRun).filter_by(id=run_id, generation=generation, status='processing')
        active.update({'status': status, 'result': result, 'steps': steps[:MAX_STEPS]})
        db.commit()
    return True
)


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


def public_agent(agent):
    return {
        'id': agent.id,
        'name': agent.name,
        'instructions': agent.instructions,
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
        public_agent(a)
        for a in db.query(AgentDefinition)
        .filter_by(workspace_id=workspaceId)
        .order_by(AgentDefinition.created.desc())
    ]


@router.post('', dependencies=[Depends(workspace_permission('editor'))])
def create_agent(workspaceId: str, body: CreateAgent, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    agent = AgentDefinition(
        workspace_id=workspaceId,
        owner_id=actor.id,
        name=body.name.strip(),
        instructions=body.instructions,
    )
    db.add(agent)
    db.commit()
    return public_agent(agent)


@router.get('/{agentId}/runs', dependencies=[Depends(workspace_permission('viewer'))])
def list_runs(workspaceId: str, agentId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    if not db.query(AgentDefinition).filter_by(id=agentId, workspace_id=workspaceId).first():
        raise HTTPException(404, 'Agent not found.')
    return [
        public_run(r)
        for r in db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId)
        .order_by(AgentRun.created.desc())
        .limit(30)
    ]


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
    (
        db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId, id=runId)
        .filter(AgentRun.status.in_(('queued', 'processing')))
        .update(
            {
                'status': 'cancelled',
                'lease': 0,
                'generation': AgentRun.generation + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    run = db.query(AgentRun).filter_by(workspace_id=workspaceId, agent_id=agentId, id=runId).first()
    if run is None:
        raise HTTPException(404, 'Research run not found.')
    return public_run(run)


@router.post('/{agentId}/runs', dependencies=[Depends(workspace_permission('editor'))])
def run_research(
    workspaceId: str, agentId: str, body: ResearchRequest, actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
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


def execute_one_research_run():
    """Claim one persisted run, recover expired leases, and persist a safe trace."""
    with Session() as db:
        db.query(AgentRun).filter(
            AgentRun.status == 'processing',
            AgentRun.attempts >= 3,
            AgentRun.lease < time.time(),
        ).update(
            {'status': 'failed', 'error': 'Research exceeded retry limit.'},
            synchronize_session=False,
        )
        db.commit()
    claimed = claim(AgentRun, max_attempts=3)
    if not claimed:
        return False
    run_id, generation = claimed
    with Session() as db:
        run = db.query(AgentRun).filter_by(id=run_id, generation=generation).first()
        if run is None or run.status != 'processing':
            return True
        workspace_id, question = run.workspace_id, run.question
        requesting_user = db.get(User, run.actor_id)
        try:
            require_workspace(db, requesting_user, workspace_id, 'editor')
        except (HTTPException, AttributeError):
            run.status = 'failed'
            run.result = {'error': 'Workspace access is no longer authorized.'}
            db.commit()
            return True
    steps = []
    try:
        questions = plan(question)
        steps.append({'tool': 'research_plan', 'queries': questions})
        sources = []
        seen = set()
        for query in questions:
            if not heartbeat(AgentRun, run_id, generation):
                return True
            for source in retrieve(workspace_id, query, limit=8):
                key = source.get('chunk_id')
                if key and key not in seen and len(sources) < 8:
                    seen.add(key)
                    sources.append(source)
        steps.append({'tool': 'workspace_retrieval', 'source_count': len(sources)})
        graph = evidence_graph(sources)
        steps.append({'tool': 'evidence_graph', 'nodes': len(graph['nodes'])})
        if not heartbeat(AgentRun, run_id, generation):
            return True
        result = generate(question, sources)
        result['evidence_graph'] = graph
        steps.append({'tool': 'grounded_answer', 'mode': result.get('mode', 'unknown')})
        status = 'completed'
    except Exception:
        log.exception('Agent research execution failed for run %s', run_id)
        status = 'failed'
        result = {'error': 'Research failed. Check server logs.'}
    with Session() as db:
        active = db.query(AgentRun).filter_by(id=run_id, generation=generation, status='processing')
        active.update({'status': status, 'result': result, 'steps': steps[:MAX_STEPS]})
        db.commit()
    return True
