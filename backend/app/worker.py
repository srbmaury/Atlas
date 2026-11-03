import logging
import threading
import time

from sqlalchemy import and_, or_

from .db import Document, Session
from .ingest import ingest

log = logging.getLogger(__name__)


def claim(model):
    now = time.time()
    with Session() as db:
        eligible = or_(
            and_(model.status == 'queued', model.lease <= now),
            and_(model.status == 'processing', model.lease < now),
        )
        job = db.query(model).filter(eligible).order_by(model.created).first()
        if not job:
            return None
        generation = job.generation + 1
        changed = (
            db.query(model)
            .filter(model.id == job.id, model.generation == job.generation, eligible)
            .update(
                {
                    'status': 'processing',
                    'lease': now + 600,
                    'generation': generation,
                    'attempts': model.attempts + 1,
                },
                synchronize_session=False,
            )
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
        except Exception:
            log.exception('Worker polling failed')
            busy = False
        if not busy:
            stop.wait(1)


if __name__ == '__main__':
    from .db import init_db

    init_db()
    loop(threading.Event())
