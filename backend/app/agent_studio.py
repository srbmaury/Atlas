"""Bounded, read-only research agents with workspace-scoped persistent traces."""

import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, Float, ForeignKey, Integer, String, Text

from .agent_claims import assess_claims
from .agent_evidence import evidence_graph, plan
from .ai import generate_agent
from .api_dependencies import database, user, workspace
from .connected_research import collect_connected_evidence, connected_sources_for_payload
from .db import Base, Document, Session, User, uid
from .rbac import require_workspace, revalidate_access, workspace_permission
from .retrieval import retrieve
from .schemas import ConnectedQuestion
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
    source_config = Column(JSON, nullable=False, default=dict)
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
    output_format: Literal['detailed_notes', 'concise', 'report'] = 'detailed_notes'
    include_documents: bool = True
    document_ids: list[str] = Field(default_factory=list, max_length=200)
    include_gmail: bool = False
    providers: list[str] = Field(default_factory=list, max_length=12)


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


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


def authorized_source_config(db, workspace_id, actor, config):
    """Never expose or use connected providers beyond the requesting user's access."""
    from .db import ExternalConnection, GmailConnection
    from .rbac import require_connection

    allowed = dict(config)
    providers = []
    for provider in config.get('providers') or []:
        row = db.get(ExternalConnection, (workspace_id, provider))
        try:
            if row is None:
                continue
            require_connection(db, actor, row)
            providers.append(provider)
        except HTTPException:
            continue
    allowed['providers'] = providers
    allowed['include_gmail'] = False
    if config.get('include_gmail'):
        row = db.get(GmailConnection, workspace_id)
        if row is not None:
            try:
                require_connection(db, actor, row)
                allowed['include_gmail'] = True
            except HTTPException:
                pass
    return allowed


def validate_sources(db, workspace_id, body, actor=None):
    from .external_sources import PROVIDERS

    providers = list(dict.fromkeys(body.providers))
    if any(p not in (*PROVIDERS, 'drive') for p in providers):
        raise HTTPException(422, 'Unknown connected provider.')
    if not body.include_documents and body.document_ids:
        raise HTTPException(422, 'Document selection requires documents to be enabled.')
    if not (body.include_documents or body.include_gmail or providers):
        raise HTTPException(422, 'Select at least one research source.')
    if actor is not None:
        from .db import ExternalConnection, GmailConnection
        from .rbac import require_connection

        for provider in providers:
            row = db.get(ExternalConnection, (workspace_id, provider))
            if row is None:
                raise HTTPException(404, 'Selected source is not connected.')
            require_connection(db, actor, row)
        if body.include_gmail:
            row = db.get(GmailConnection, workspace_id)
            if row is None:
                raise HTTPException(404, 'Gmail is not connected.')
            require_connection(db, actor, row)
    selected = list(dict.fromkeys(body.document_ids))
    if selected:
        found = (
            db.query(Document.id)
            .filter(Document.workspace_id == workspace_id, Document.id.in_(selected))
            .count()
        )
        if found != len(selected):
            raise HTTPException(404, 'Selected document not found.')
    return {
        'include_documents': body.include_documents,
        'document_ids': selected,
        'include_gmail': body.include_gmail,
        'providers': providers,
    }


def source_scope_fingerprints(scopes):
    """Serializable fingerprints for detecting later resource-grant changes."""
    import hashlib

    return {
        provider: hashlib.sha256(repr(scope).encode('utf-8')).hexdigest()
        for provider, scope in (scopes or {}).items()
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
    from .db import ExternalConnection, GmailConnection
    from .rbac import require_connection

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
    workspace(workspaceId, actor, db)
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
                revalidate_access(workspaceId, actor, providers)
                from .rbac import source_scope
                from .db import ExternalConnection

                saved = (run.result or {}).get('source_scope_fingerprints') or {}
                current = {
                    provider: source_scope(db, actor, db.get(ExternalConnection, (workspaceId, provider)))
                    for provider in saved if provider != 'gmail'
                }
                if any(source_scope_fingerprints(current).get(provider) != fingerprint for provider, fingerprint in saved.items() if provider != 'gmail'):
                    raise HTTPException(403, 'Source resource permissions changed.')
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
    (
        db.query(AgentRun)
        .filter_by(workspace_id=workspaceId, agent_id=agentId, id=runId, actor_id=actor.id)
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
        requesting_actor = requesting_user
        try:
            require_workspace(db, requesting_user, workspace_id, 'editor')
        except (HTTPException, AttributeError):
            run.status = 'failed'
            run.result = {'error': 'Workspace access is no longer authorized.'}
            db.commit()
            return True
        agent = (
            db.query(AgentDefinition).filter_by(id=run.agent_id, workspace_id=workspace_id).first()
        )
        if agent is None:
            run.status = 'failed'
            run.result = {'error': 'Agent no longer exists.'}
            db.commit()
            return True
        agent_instructions = agent.instructions
        output_format = agent.output_format
        source_config = authorized_source_config(
            db, workspace_id, requesting_actor, agent.source_config or {'include_documents': True}
        )
    steps = []
    try:
        questions = plan(question)
        steps.append({'tool': 'research_plan', 'queries': questions})
        sources = []
        seen = set()
        provider_scopes = []
        permission_scopes = {}
        if not (
            source_config.get('include_documents')
            or source_config.get('include_gmail')
            or source_config.get('providers')
        ):
            raise HTTPException(403, "You do not have access to this agent's configured sources.")
        for query in questions:
            if not heartbeat(AgentRun, run_id, generation):
                return True
            if source_config.get('include_gmail') or source_config.get('providers'):
                body = ConnectedQuestion(
                    question=query,
                    include_documents=source_config.get('include_documents', True),
                    document_ids=source_config.get('document_ids') or [],
                    include_gmail=source_config.get('include_gmail', False),
                    providers=source_config.get('providers') or [],
                )
                with Session() as source_db:
                    stats = {}
                    evidence, original = collect_connected_evidence(
                        workspace_id,
                        body,
                        requesting_actor,
                        source_db,
                        stats,
                        workspace_access=lambda wid, who, database: require_workspace(
                            database, who, wid
                        ),
                        retrieve_chunks=lambda wid, q, ids: retrieve(
                            wid, q, document_ids=ids or None
                        ),
                    )
                revalidate_access(
                    workspace_id,
                    requesting_actor,
                    {e.provider for e in evidence},
                    stats.get('scopes'),
                )
                permission_scopes.update(stats.get('scopes') or {})
                payload = [
                    e.as_prompt(i) | {'origin_id': e.source_id}
                    for i, e in enumerate(evidence[:8], 1)
                ]
                found = connected_sources_for_payload(payload, original)
                provider_scopes.extend(item.get('provider') for item in found)
            elif source_config.get('include_documents', True):
                found = retrieve(
                    workspace_id,
                    query,
                    document_ids=source_config.get('document_ids') or None,
                    limit=8,
                )
            else:
                found = []
            for source in found:
                key = (source.get('provider', 'documents'), source.get('chunk_id'))
                if key[1] and key not in seen and len(sources) < 8:
                    seen.add(key)
                    sources.append(source)
        steps.append(
            {
                'tool': 'workspace_retrieval',
                'source_count': len(sources),
                'providers': sorted(
                    set(provider_scopes)
                    | ({'documents'} if source_config.get('include_documents') else set())
                ),
            }
        )
        graph = evidence_graph(sources)
        steps.append({'tool': 'evidence_graph', 'nodes': len(graph['nodes'])})
        if not heartbeat(AgentRun, run_id, generation):
            return True
        result = generate_agent(question, sources, agent_instructions, output_format)
        result['evidence_graph'] = graph
        result['claim_verification'] = assess_claims(result.get('answer', ''), sources)
        result['scope'] = sorted({s.get('provider', 'documents') for s in sources})
        result['source_scope_fingerprints'] = source_scope_fingerprints(permission_scopes)
        steps.append({'tool': 'grounded_answer', 'mode': result.get('mode', 'unknown')})
        if provider_scopes:
            revalidate_access(
                workspace_id, requesting_actor, set(provider_scopes), permission_scopes
            )
        with Session() as check_db:
            require_workspace(
                check_db, check_db.get(User, requesting_actor.id), workspace_id, 'editor'
            )
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
