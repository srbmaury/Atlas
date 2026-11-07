"""Persisted, bounded deep-research investigations.

The first release deliberately reuses the existing cited connected-chat pipeline
for each independent research question. It does not claim autonomous verification
or invent a global confidence score.
"""
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, Float, ForeignKey, JSON, String, Text

from .api_dependencies import database, user, workspace
from .db import Base, Session, User, engine, uid
from .rbac import revalidate_access, workspace_permission
from .schemas import ConnectedQuestion

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/workspaces/{workspaceId}/research-runs')
EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix='atlas-deep-research')
STAGES = ('planning', 'retrieving', 'cross_checking', 'synthesizing')
TERMINAL = ('completed', 'failed', 'cancelled')


class ResearchRun(Base):
    __tablename__ = 'research_runs'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True)
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
        for run in db.query(ResearchRun).filter(ResearchRun.status.in_(['queued', 'running'])).all():
            run.status = 'failed'
            run.error = 'Research was interrupted by a server restart. Start a new investigation.'
            run.updated = time.time()
        db.commit()


def public_run(run):
    return {
        'id': run.id, 'question': run.question, 'status': run.status,
        'stages': run.stages or [], 'findings': run.findings or [],
        'error': run.error, 'created': run.created, 'updated': run.updated,
    }


def _save(run_id, *, status=None, stage=None, findings=None, error=None):
    with Session() as db:
        run = db.get(ResearchRun, run_id)
        if not run or run.status == 'cancelled':
            return False
        if status:
            run.status = status
        if stage:
            stages = list(run.stages or [])
            for item in stages:
                if item['key'] == stage:
                    item['status'] = 'completed' if status == 'completed' else 'running'
                    break
            run.stages = stages
        if findings is not None:
            run.findings = findings
        if error is not None:
            run.error = error
        run.updated = time.time()
        db.commit()
        return True


def _investigate(run_id, actor_id):
    from .main import connected_chat
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
        questions = [
            ('Key findings', question),
            ('Supporting and missing evidence', 'What evidence supports or limits the following question? ' + question),
        ]
        if scope.get('depth') == 'deep':
            questions.append(('Alternative explanations', 'What alternative explanations or unresolved questions exist for: ' + question))
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
                revalidate_access(workspace_id, actor, set(scope.get('providers', [])) | ({'gmail'} if scope.get('include_gmail') else set()))
                body = ConnectedQuestion(**{**scope, 'question': subquestion})
                result = connected_chat(workspace_id, body, None, actor=actor, db=db)
                # Results remain scoped to this workspace and are re-authorized
                # whenever read. Each section preserves its own citation IDs.
                findings.append({'title': title, 'question': subquestion, 'result': result})
            if not _save(run_id, findings=findings):
                return
        if not _save(run_id, status='running', stage='cross_checking'):
            return
        # This stage checks presence of usable evidence; semantic conflict
        # detection is a separate roadmap item, not represented as completed.
        for finding in findings:
            result = finding['result']
            finding['verified'] = bool(result.get('sources')) and result.get('mode') != 'citation_check_failed'
        if not _save(run_id, status='running', stage='synthesizing', findings=findings):
            return
        _save(run_id, status='completed', stage='synthesizing', findings=findings)
        # Mark the preceding stages as completed as well.
        with Session() as db:
            run = db.get(ResearchRun, run_id)
            if run and run.status == 'completed':
                run.stages = [{**step, 'status': 'completed'} for step in run.stages]
                db.commit()
    except Exception as exc:
        log.exception('Deep research run %s failed', run_id)
        _save(run_id, status='failed', error=str(exc)[:250])


@router.post('', dependencies=[Depends(workspace_permission('viewer'))])
def start_research(workspaceId: str, body: ResearchRequest, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    revalidate_access(workspaceId, actor, set(body.providers) | ({'gmail'} if body.include_gmail else set()))
    if not body.include_documents and not body.include_gmail and not body.providers:
        raise HTTPException(422, 'Choose at least one research source.')
    if body.document_ids:
        from .db import Document
        count = db.query(Document).filter(Document.workspace_id == workspaceId, Document.id.in_(body.document_ids)).count()
        if count != len(set(body.document_ids)):
            raise HTTPException(404, 'Selected document not found.')
    active = db.query(ResearchRun).filter(ResearchRun.workspace_id == workspaceId, ResearchRun.status.in_(['queued', 'running'])).count()
    if active >= 2:
        raise HTTPException(429, 'Two investigations are already running in this workspace.')
    run = ResearchRun(
        workspace_id=workspaceId, owner_id=actor.id, question=body.question.strip(),
        scope=body.model_dump(exclude={'history'}), status='queued',
        stages=[{'key': key, 'label': key.replace('_', ' ').title(), 'status': 'queued'} for key in STAGES],
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
    revalidate_access(workspace_id, actor, set(scope.get('providers', [])) | ({'gmail'} if scope.get('include_gmail') else set()))
    return run


@router.get('', dependencies=[Depends(workspace_permission('viewer'))])
def list_research(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    runs = db.query(ResearchRun).filter_by(workspace_id=workspaceId, owner_id=actor.id).order_by(ResearchRun.created.desc()).limit(20).all()
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
        run.updated = time.time()
        db.commit()
    return public_run(run)
