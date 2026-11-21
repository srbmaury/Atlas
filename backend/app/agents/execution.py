"""Claim and execute persisted agent research jobs."""

import logging
import time

from fastapi import HTTPException

from ..db import Session, User
from ..research.ai import generate_agent
from ..research.connected_research import collect_connected_evidence, connected_sources_for_payload
from ..research.retrieval import retrieve
from ..schemas import ConnectedQuestion
from ..security.rbac import require_workspace, revalidate_access
from ..worker import claim, heartbeat
from .claims import assess_claims
from .evidence import evidence_graph, plan
from .models import AgentDefinition, AgentRun
from .sources import authorized_source_config, source_scope_fingerprints

MAX_STEPS = 5
log = logging.getLogger(__name__)


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
                for provider, scope in (stats.get('scopes') or {}).items():
                    if permission_scopes.setdefault(provider, scope) != scope:
                        raise HTTPException(409, 'Source permissions changed during research.')
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
