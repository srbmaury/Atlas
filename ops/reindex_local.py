"""Re-embed every ready document using the configured local Ollama model."""

import os
import sys

os.environ['AI_PROVIDER'] = 'ollama'
sys.path.insert(0, 'backend')

from app.db import Document, Session
from app.ingest import ingest


def main():
    with Session() as db:
        documents = db.query(Document).filter_by(status='ready').order_by(Document.created).all()
        jobs = []
        for doc in documents:
            doc.generation += 1
            doc.status, doc.error, doc.lease = 'processing', None, 0
            jobs.append((doc.id, doc.generation, doc.name))
        db.commit()

    for index, (document_id, generation, name) in enumerate(jobs, 1):

        def heartbeat():
            with Session() as db:
                doc = db.get(Document, document_id)
                db.commit()
                return bool(doc and doc.generation == generation and doc.status == 'processing')

        try:
            ingest(document_id, generation, heartbeat)
            with Session() as db:
                doc = db.get(Document, document_id)
                if doc and doc.generation == generation and doc.status == 'ready':
                    print(
                        f'{index}/{len(jobs)} ready: {name} ({doc.chunk_count} chunks)', flush=True
                    )
                else:
                    raise RuntimeError(f'Ingestion did not finish for {name}')
        except Exception as exc:
            with Session() as db:
                doc = db.get(Document, document_id)
                if doc and doc.generation == generation:
                    doc.status, doc.error = 'failed', str(exc)[:400]
                    db.commit()
            raise


if __name__ == '__main__':
    main()
