"""Persisted, bounded deep-research investigations.

The first release deliberately reuses the existing cited connected-chat pipeline
for each independent research question. It does not claim autonomous verification
or invent a global confidence score.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import JSON, Column, Float, ForeignKey, String, Text, update
from sqlalchemy.orm.attributes import flag_modified

from ..api_dependencies import database, user, workspace
from ..db import Base, Session, User, engine, uid
from ..rbac import revalidate_access, workspace_permission
from ..schemas import ConnectedQuestion

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/workspaces/{workspaceId}/research-runs')
EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix='atlas-deep-research')
STAGES = ('planning', 'retrieving', 'citation_audit', 'synthesizing')
TERMINAL = ('completed', 'failed', 'cancelled', 'insufficient_evidence')


class ResearchRun(Base):
    __tablename__ = 'research_runs'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(
        String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True
    )
    owner_id = Column(String, ForeignKey('users.id'), nullable=False)
    question = Column(Text, nullable=False)
    scope = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default='queued')
    stages = Column(JSON, nullable=False, default=list)
    findings = Column(JSON, nullable=False, default=list)
    error = Column(Text)
    created = Column(Float, nullable=False, default=time.time)
    updated = Column(Float, nullable=False, default=time.time)


class ResearchRequest(ConnectedQuestion):
    depth: str = Field(default='standard', pattern='^(standard|deep)$')


def initialize_research_runs():
    # Isolated additive table for this MVP. Move to a versioned Alembic
    # revision before enabling production deployments with multiple replicas.
    Base.metadata.create_all(bind=engine, tables=[ResearchRun.__table__])
    # Threads cannot survive process restarts; report interrupted work honestly.
    with Session() as db:
        for run in (
            db.query(ResearchRun).filter(ResearchRun.status.in_(['queued', 'running'])).all()
        ):
            run.status = 'failed'
            run.error = 'Research was interrupted by a server restart. Start a new investigation.'
            run.updated = time.time()
        db.commit()


def public_run(run):
    return {
        'id': run.id,
        'question': run.question,
        'status': run.status,
        'stages': run.stages or [],
        'findings': run.findings or [],
        'error': run.error,
        'created': run.created,
        'updated': run.updated,
    }


def _save(run_id, *, status=None, stage=None, findings=None, error=None):
    with Session() as db:
        run = db.get(ResearchRun, run_id)
        if not run or run.status in TERMINAL:
            return False
        if status:
            run.status = status
        if stage:
            stages = [{**item} for item in (run.stages or [])]
            reached = False
            for item in stages:
                if item['key'] == stage:
                    item['status'] = (
                        'completed'
                        if status in ('completed', 'insufficient_evidence')
                        else 'running'
                    )
                    reached = True
                elif not reached:
                    item['status'] = 'completed'
            run.stages = stages
            flag_modified(run, 'stages')
        if findings is not None:
            run.findings = findings
        if status == 'failed':
            run.stages = [
                {**item, 'status': 'failed' if item['status'] == 'running' else item['status']}
                for item in run.stages
            ]
            flag_modified(run, 'stages')
        if error is not None:
            run.error = error
        run.updated = time.time()
        # Compare-and-swap: cancellation or another terminal transition wins over
        # stale worker state, even when it occurs after this session read the row.
        changes = {
            'status': run.status,
            'stages': run.stages,
            'findings': run.findings,
            'error': run.error,
            'updated': run.updated,
        }
        db.expunge(run)  # prevent ORM autoflush from bypassing the status guard
        updated = db.execute(
            update(ResearchRun)
            .where(ResearchRun.id == run_id, ResearchRun.status.notin_(TERMINAL))
            .values(**changes)
            .execution_options(synchronize_session=False)
        )
        db.commit()
        return updated.rowcount == 1


def _investigate(run_id, actor_id):
    from ..main import connected_chat

    try:
        with Session() as db:
            run = db.get(ResearchRun, run_id)
            if not run or run.status == 'cancelled':
                return
            actor = db.get(User, actor_id)
            if not actor:
                raise ValueError('Research owner is no longer available.')
            workspace(run.workspace_id, actor, db)
            scope = dict(run.scope)
            question = run.question
            workspace_id = run.workspace_id
        if not _save(run_id, status='running', stage='planning'):
            return
        # Bounded deterministic decomposition; every step independently searches
        # the selected sources and uses the existing citation validation.
        repository = scope.get('repository')
        if repository and 'github' in scope.get('providers', []):
            question = f'Analyze source code for: {question}'
        questions = [
            ('Key findings', question),
            (
                'Supporting and missing evidence',
                'What evidence supports or limits the following question? ' + question,
            ),
        ]
        if scope.get('depth') == 'deep':
            questions.append(
                (
                    'Alternative explanations',
                    'What alternative explanations or unresolved questions exist for: ' + question,
                )
            )
        if not _save(run_id, status='running', stage='retrieving'):
            return
        findings = []
        for title, subquestion in questions:
            with Session() as db:
                run = db.get(ResearchRun, run_id)
                if not run or run.status == 'cancelled':
                    return
                actor = db.get(User, actor_id)
                if not actor:
                    raise ValueError('Research owner is no longer available.')
                workspace(workspace_id, actor, db)
                revalidate_access(
                    workspace_id,
                    actor,
                    set(scope.get('providers', []))
                    | ({'gmail'} if scope.get('include_gmail') else set()),
                )
                body = ConnectedQuestion(**{**scope, 'question': subquestion})
                if body.include_documents and not body.include_gmail and not body.providers:
                    # Match the working document-only chat path instead of routing
                    # through the stricter cross-provider synthesis model.
                    from ..ai import generate
                    from ..main import (
                        attach_retrieval_trace,
                        collect_connected_evidence,
                        connected_scope,
                        no_evidence_result,
                    )

                    stats = {}
                    evidence, document_evidence = collect_connected_evidence(
                        workspace_id, body, actor, db, stats
                    )
                    revalidate_access(workspace_id, actor, {item.provider for item in evidence})
                    if not evidence:
                        result = no_evidence_result(body, stats)
                    else:
                        document_sources = [
                            document_evidence[item.source_id]
                            for item in evidence
                            if item.provider == 'documents' and item.source_id in document_evidence
                        ]
                        result = generate(subquestion, document_sources, [])
                        result['scope'] = connected_scope(body)
                        attach_retrieval_trace(result, body, evidence, stats)
                else:
                    result = connected_chat(workspace_id, body, None, actor=actor, db=db)
                # Results remain scoped to this workspace and are re-authorized
                # whenever read. Each section preserves its own citation IDs.
                findings.append({'title': title, 'question': subquestion, 'result': result})
            if not _save(run_id, findings=findings):
                return
        if not _save(run_id, status='running', stage='citation_audit'):
            return
        # Audit actual citation references and lexical evidence rather than
        # treating the mere presence of sources as verification.
        from ..citation_audit import audit_citations
        for finding in findings:
            result = finding['result']
            sources = result.get('sources') or []
            audit = audit_citations(result.get('answer') or '', sources)
            result['citation_audit'] = audit
            claims = audit.get('claims') or []
            finding['verified'] = bool(sources) and bool(claims) and all(
                claim['status'] == 'lexically_supported' for claim in claims
            ) and result.get('mode') not in ('citation_check_failed', 'no_evidence')
            trace = result.get('retrieval') or {}
            searched = trace.get('sources') or []
            finding['diagnostics'] = {
                'providers': searched,
                'passages_considered': trace.get('passages_considered', 0),
                'passages_used': trace.get('passages_used', 0),
                'outcome': (
                    'verified'
                    if finding['verified']
                    else 'citation_rejected'
                    if result.get('mode') == 'citation_check_failed'
                    else 'provider_failure'
                    if any(item.get('status') == 'failed' for item in searched)
                    else 'no_matches'
                    if not any(item.get('found', 0) for item in searched)
                    else 'unverified'
                ),
            }
        if not _save(run_id, status='running', stage='synthesizing', findings=findings):
            return
        # Provide a unified, traceable summary without fabricating conclusions.
        # The original independently cited sections remain available below it.
        supported = [item for item in findings if item['verified']]
        report = {
            'title': 'Research summary',
            'question': question,
            'verified': bool(supported),
            'result': {
                'answer': '\\n\\n'.join(
                    f"{item['title']}: {item['result'].get('answer', '')}"
                    for item in supported
                ) if supported else 'Insufficient cited evidence to form a supported summary.',
                'sources': [],
                'mode': 'research_summary',
            },
            'diagnostics': {'outcome': 'summary', 'providers': [],
                            'passages_considered': 0, 'passages_used': 0},
        }
        findings = [report, *findings]
        if not supported:
            _save(
                run_id,
                status='insufficient_evidence',
                stage='synthesizing',
                findings=findings,
                error='No usable citations were found. Check the selected sources and try a more specific research question.',
            )
        else:
            _save(run_id, status='completed', stage='synthesizing', findings=findings)
    except Exception as exc:
        log.exception('Deep research run %s failed', run_id)
        _save(run_id, status='failed', error=str(exc)[:250])


@router.post('', dependencies=[Depends(workspace_permission('viewer'))])
def start_research(
    workspaceId: str, body: ResearchRequest, actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
    revalidate_access(
        workspaceId, actor, set(body.providers) | ({'gmail'} if body.include_gmail else set())
    )
    if body.repository and 'github' not in body.providers:
        raise HTTPException(422, 'Enable GitHub to research a selected repository.')
    if not body.include_documents and not body.include_gmail and not body.providers:
        raise HTTPException(422, 'Choose at least one research source.')
    if body.document_ids:
        from ..db import Document

        count = (
            db.query(Document)
            .filter(Document.workspace_id == workspaceId, Document.id.in_(body.document_ids))
            .count()
        )
        if count != len(set(body.document_ids)):
            raise HTTPException(404, 'Selected document not found.')
    active = (
        db.query(ResearchRun)
        .filter(
            ResearchRun.workspace_id == workspaceId, ResearchRun.status.in_(['queued', 'running'])
        )
        .count()
    )
    if active >= 2:
        raise HTTPException(429, 'Two investigations are already running in this workspace.')
    run = ResearchRun(
        workspace_id=workspaceId,
        owner_id=actor.id,
        question=body.question.strip(),
        scope=body.model_dump(exclude={'history'}),
        status='queued',
        stages=[
            {'key': key, 'label': key.replace('_', ' ').title(), 'status': 'queued'}
            for key in STAGES
        ],
        findings=[],
    )
    db.add(run)
    db.commit()
    EXECUTOR.submit(_investigate, run.id, actor.id)
    return public_run(run)


def _authorized_run(workspace_id, run_id, actor, db):
    workspace(workspace_id, actor, db)
    run = db.query(ResearchRun).filter_by(id=run_id, workspace_id=workspace_id).first()
    if not run:
        raise HTTPException(404, 'Research run not found.')
    if run.owner_id != actor.id:
        raise HTTPException(403, 'Only the research owner can access this investigation.')
    scope = run.scope or {}
    revalidate_access(
        workspace_id,
        actor,
        set(scope.get('providers', [])) | ({'gmail'} if scope.get('include_gmail') else set()),
    )
    return run


@router.get('', dependencies=[Depends(workspace_permission('viewer'))])
def list_research(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    runs = (
        db.query(ResearchRun)
        .filter_by(workspace_id=workspaceId, owner_id=actor.id)
        .order_by(ResearchRun.created.desc())
        .limit(20)
        .all()
    )
    result = []
    for run in runs:
        try:
            _authorized_run(workspaceId, run.id, actor, db)
            result.append(public_run(run))
        except HTTPException:
            continue
    return result


@router.get('/{runId}', dependencies=[Depends(workspace_permission('viewer'))])
def get_research(workspaceId: str, runId: str, actor=Depends(user), db=Depends(database)):
    return public_run(_authorized_run(workspaceId, runId, actor, db))


@router.post('/{runId}/cancel', dependencies=[Depends(workspace_permission('viewer'))])
def cancel_research(workspaceId: str, runId: str, actor=Depends(user), db=Depends(database)):
    run = _authorized_run(workspaceId, runId, actor, db)
    if run.status not in TERMINAL:
        run.status = 'cancelled'
        run.stages = [
            {**item, 'status': 'cancelled' if item['status'] == 'running' else item['status']}
            for item in run.stages
        ]
        flag_modified(run, 'stages')
        run.updated = time.time()
        db.commit()
    return public_run(run)
