"""Regression coverage for Deep Research request scope and persisted stages."""

import pytest
from pydantic import ValidationError

from app.db import Session, User, Workspace, init_db
from app.routes.deep_research import (ResearchRequest, ResearchRun, _save,
                                      initialize_research_runs, claim_research,
                                      cleanup_research_runs, RESEARCH_RETENTION_SECONDS)


def test_repository_scope_requires_owner_and_repo():
    request = ResearchRequest(
        question='Analyze architecture',
        providers=['github'],
        repository='srbmaury/Atlas',
        depth='deep',
    )
    assert request.repository == 'srbmaury/Atlas'
    with pytest.raises(ValidationError):
        ResearchRequest(question='Analyze architecture', repository='Atlas')
    with pytest.raises(ValidationError):
        ResearchRequest(question='Analyze architecture', depth='extreme')


def test_stage_transitions_persist_across_sessions():
    init_db()
    initialize_research_runs()
    with Session() as db:
        owner = User(email='deep-research-stage-test@example.com', password='test')
        db.add(owner)
        db.flush()
        space = Workspace(owner_id=owner.id, name='Deep Research stage test')
        db.add(space)
        db.flush()
        run = ResearchRun(
            workspace_id=space.id,
            owner_id=owner.id,
            question='Investigate source coverage',
            scope={'providers': []},
            stages=[
                {'key': key, 'label': key, 'status': 'queued'}
                for key in ('planning', 'retrieving', 'citation_audit', 'synthesizing')
            ],
            findings=[],
        )
        db.add(run)
        db.commit()
        run_id = run.id

    assert _save(run_id, status='running', stage='retrieving')
    with Session() as db:
        run = db.get(ResearchRun, run_id)
        assert [step['status'] for step in run.stages] == [
            'completed',
            'running',
            'queued',
            'queued',
        ]

    assert _save(run_id, status='insufficient_evidence', stage='synthesizing')
    with Session() as db:
        run = db.get(ResearchRun, run_id)
        assert run.status == 'insufficient_evidence'
        assert all(step['status'] == 'completed' for step in run.stages)


def test_terminal_runs_cannot_be_restarted_by_stale_worker():
    init_db()
    initialize_research_runs()
    with Session() as db:
        owner = User(email='deep-research-terminal-test@example.com', password='test')
        db.add(owner)
        db.flush()
        space = Workspace(owner_id=owner.id, name='Deep Research terminal test')
        db.add(space)
        db.flush()
        run = ResearchRun(
            workspace_id=space.id,
            owner_id=owner.id,
            question='Cancellation consistency',
            scope={'providers': []},
            status='cancelled',
            stages=[{'key': 'planning', 'label': 'Planning', 'status': 'cancelled'}],
            findings=[],
        )
        db.add(run)
        db.commit()
        run_id = run.id
    assert _save(run_id, status='running', stage='planning') is False
    with Session() as db:
        run = db.get(ResearchRun, run_id)
        assert run.status == 'cancelled'


def test_durable_queue_claim_and_generation_fencing():
    init_db()
    initialize_research_runs()
    with Session() as db:
        owner = User(email='research-lease-test@example.com', password='test')
        db.add(owner)
        db.flush()
        space = Workspace(owner_id=owner.id, name='Lease test')
        db.add(space)
        db.flush()
        run = ResearchRun(workspace_id=space.id, owner_id=owner.id,
                          question='Investigate queue', scope={}, status='queued',
                          stages=[], findings=[])
        db.add(run)
        db.commit()
        run_id = run.id
    claimed = claim_research()
    assert claimed is not None
    assert claimed[0] == run_id
    assert claimed[2] == 1
    assert _save(run_id, status='completed', generation=0) is False
    assert _save(run_id, status='completed', generation=1) is True
    with Session() as db:
        assert db.get(ResearchRun, run_id).status == 'completed'


def test_retention_deletes_only_expired_terminal_runs():
    import time
    init_db()
    initialize_research_runs()
    with Session() as db:
        owner = User(email='research-retention-test@example.com', password='test')
        db.add(owner)
        db.flush()
        space = Workspace(owner_id=owner.id, name='Retention test')
        db.add(space)
        db.flush()
        old = time.time() - RESEARCH_RETENTION_SECONDS - 100
        expired = ResearchRun(workspace_id=space.id, owner_id=owner.id,
                              question='Old completed', scope={}, status='completed',
                              stages=[], findings=[], updated=old)
        pending = ResearchRun(workspace_id=space.id, owner_id=owner.id,
                              question='Old queued', scope={}, status='queued',
                              stages=[], findings=[], updated=old)
        db.add_all([expired, pending])
        db.commit()
        expired_id, pending_id = expired.id, pending.id
    cleanup_research_runs()
    with Session() as db:
        assert db.get(ResearchRun, expired_id) is None
        assert db.get(ResearchRun, pending_id) is not None
