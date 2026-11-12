import logging
import threading
import time

from sqlalchemy import and_, or_

from .db import Document, Session
from .ingest import ingest

log = logging.getLogger(__name__)


def claim(model, max_attempts=None):
    now = time.time()
    with Session() as db:
        eligible = or_(
            and_(model.status == 'queued', model.lease <= now),
            and_(model.status == 'processing', model.lease < now),
        )
        query = db.query(model).filter(eligible)
        if max_attempts is not None:
            query = query.filter(model.attempts < max_attempts)
        job = query.order_by(model.created).first()
        if not job:
            return None
        generation = job.generation + 1
        claim_query = db.query(model).filter(
            model.id == job.id, model.generation == job.generation, eligible
        )
        if max_attempts is not None:
            claim_query = claim_query.filter(model.attempts < max_attempts)
        changed = claim_query.update(
            {
                'status': 'processing',
                'lease': now + 600,
                'generation': generation,
                'attempts': model.attempts + 1,
            },
            synchronize_session=False,
        )
        db.commit()
        return (job.id, generation) if changed else None


def heartbeat(model, job_id, generation):
    with Session() as db:
        changed = (
            db.query(model)
            .filter_by(id=job_id, generation=generation, status='processing')
            .update({'lease': time.time() + 600})
        )
        db.commit()
        return bool(changed)


def queue_snapshot(model=Document, *, now=None):
    """Return aggregate queue health without exposing document or tenant data."""
    now = time.time() if now is None else now
    with Session() as db:
        rows = db.query(model.status, model.lease, model.attempts).all()
    return {
        'queued': sum(row.status == 'queued' for row in rows),
        'processing': sum(row.status == 'processing' for row in rows),
        'failed': sum(row.status == 'failed' for row in rows),
        'ready': sum(row.status == 'ready' for row in rows),
        'expired_leases': sum(row.status == 'processing' and row.lease < now for row in rows),
        'retry_pending': sum(row.status == 'queued' and row.attempts > 0 for row in rows),
        'terminal_failures': sum(row.status == 'failed' and row.attempts >= 3 for row in rows),
    }


def run_one():
    for model, handler in [(Document, ingest)]:
        claimed = claim(model)
        if not claimed:
            continue
        job_id, generation = claimed
        try:
            handler(job_id, generation, lambda: heartbeat(model, job_id, generation))
        except Exception as exc:
            log.exception('Background job failed: %s', job_id)
            # Persist a useful error without exposing provider secrets or response bodies.
            message = (
                str(exc)[:400]
                if isinstance(exc, (ValueError, UnicodeError))
                else 'Processing failed. Check server logs, then retry.'
            )
            with Session() as db:
                # Validation failures require user action. Retry transient provider/network
                # failures up to three total attempts, with bounded exponential backoff.
                permanent = isinstance(exc, (ValueError, UnicodeError))
                current = db.query(model).filter_by(
                    id=job_id, generation=generation, status='processing'
                )
                state = current.first()
                if state is None:
                    return True
                retry = not permanent and state.attempts < 3
                next_lease = time.time() + 2**state.attempts * 5 if retry else 0
                current.update(
                    {
                        'status': 'queued' if retry else 'failed',
                        'lease': next_lease,
                        'error': None if retry else message,
                    }
                )
                db.commit()
        return True
    return False


def loop(stop):
    while not stop.is_set():
        try:
            busy = run_one()
            from .agent_studio import execute_one_research_run

            busy = execute_one_research_run() or busy
        except Exception:
            log.exception('Worker polling failed')
            busy = False
        if not busy:
            stop.wait(1)


if __name__ == '__main__':
    from .db import init_db

    init_db()
    loop(threading.Event())
