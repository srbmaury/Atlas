"""Document upload, indexing status, and source inspection endpoints."""

import hashlib
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from .. import uploads
from ..api_dependencies import database, document, public_doc, user, workspace
from ..config import DATA, MAX_FILE_BYTES
from ..db import Chunk, Document, uid
from ..ingest import SUPPORTED
from ..schemas import UploadRequest

router = APIRouter()


@router.get('/api/workspaces/{workspaceId}/documents')
def documents(workspaceId: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return [
        public_doc(d)
        for d in db.query(Document)
        .filter_by(workspace_id=workspaceId)
        .order_by(Document.created.desc())
    ]


@router.post('/api/workspaces/{workspaceId}/uploads')
def start_upload(workspaceId: str, body: UploadRequest, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return uploads.start(workspaceId, actor.id, body.name, body.size, MAX_FILE_BYTES, SUPPORTED)


@router.get('/api/workspaces/{workspaceId}/uploads/{upload_id}')
def upload_status(workspaceId: str, upload_id: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return uploads.status(upload_id, workspaceId, actor.id)


@router.put('/api/workspaces/{workspaceId}/uploads/{upload_id}')
async def upload_part(
    workspaceId: str,
    upload_id: str,
    request: Request,
    offset: int = 0,
    actor=Depends(user),
    db=Depends(database),
):
    workspace(workspaceId, actor, db)
    data = bytearray()
    async for block in request.stream():
        data.extend(block)
        if len(data) > uploads.PART_BYTES:
            raise HTTPException(413, 'Upload part exceeds 8 MB.')
    return await run_in_threadpool(uploads.append, upload_id, workspaceId, actor.id, offset, data)


@router.post('/api/workspaces/{workspaceId}/uploads/{upload_id}/complete')
def complete_upload(workspaceId: str, upload_id: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    doc, duplicate = uploads.finish(upload_id, workspaceId, actor.id, db)
    return {**public_doc(doc), 'duplicate': duplicate}


@router.delete('/api/workspaces/{workspaceId}/uploads/{upload_id}')
def cancel_upload(workspaceId: str, upload_id: str, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    return uploads.cancel(upload_id, workspaceId, actor.id)


@router.post('/api/workspaces/{workspaceId}/documents')
async def upload(
    workspaceId: str, files: List[UploadFile] = File(...), actor=Depends(user), db=Depends(database)
):
    workspace(workspaceId, actor, db)
    if len(files) > 50:
        raise HTTPException(422, 'Upload at most 50 files per batch.')
    results = []
    for file in files:
        name = Path((file.filename or 'untitled').replace('\\', '/')).name[:200]
        if Path(name).suffix.lower() not in SUPPORTED:
            results.append(
                {'name': name, 'error': 'Supported formats: PDF, DOCX, TXT, MD, CSV, JSON, HTML.'}
            )
            continue
        did, count, digest = uid(), 0, hashlib.sha256()
        path = DATA / 'files' / did
        try:
            with path.open('wb') as out:
                while True:
                    block = await file.read(1024 * 1024)
                    if not block:
                        break
                    count += len(block)
                    if count > MAX_FILE_BYTES:
                        raise ValueError(f'File exceeds {MAX_FILE_BYTES // 1024 // 1024} MB limit.')
                    digest.update(block)
                    out.write(block)
            if not count:
                raise ValueError('File is empty.')
            existing = (
                db.query(Document)
                .filter_by(workspace_id=workspaceId, digest=digest.hexdigest())
                .first()
            )
            if existing:
                path.unlink(missing_ok=True)
                results.append({**public_doc(existing), 'duplicate': True})
                continue
            doc = Document(
                id=did, workspace_id=workspaceId, name=name, size=count, digest=digest.hexdigest()
            )
            db.add(doc)
            db.commit()
            results.append(public_doc(doc))
        except IntegrityError:
            db.rollback()
            path.unlink(missing_ok=True)
            existing = (
                db.query(Document)
                .filter_by(workspace_id=workspaceId, digest=digest.hexdigest())
                .first()
            )
            if not existing:
                raise
            results.append({**public_doc(existing), 'duplicate': True})
        except ValueError as exc:
            path.unlink(missing_ok=True)
            results.append({'name': name, 'error': str(exc)})
        except Exception:
            db.rollback()
            path.unlink(missing_ok=True)
            raise
        finally:
            await file.close()
    return {'documents': results}


@router.get('/api/workspaces/{workspaceId}/documents/{did}/chunks')
def chunks(
    workspaceId: str,
    did: str,
    offset: int = 0,
    page: int = 0,
    actor=Depends(user),
    db=Depends(database),
):
    doc = document(workspaceId, did, actor, db)
    if offset < 0 or page < 0:
        raise HTTPException(422, 'Offset and page must be non-negative.')
    if page > doc.pages:
        raise HTTPException(422, 'Requested page is outside this document.')
    query = db.query(Chunk).filter_by(document_id=did)
    if page:
        query = query.filter_by(page=page)
    return {
        'document': public_doc(doc),
        'chunks': [
            {'id': c.id, 'page': c.page, 'text': c.text, 'ocr': c.page in (doc.ocr_pages or [])}
            for c in query.order_by(Chunk.ordinal).offset(offset).limit(50)
        ],
    }


@router.get('/api/workspaces/{workspaceId}/documents/{did}/original')
def original(workspaceId: str, did: str, actor=Depends(user), db=Depends(database)):
    doc = document(workspaceId, did, actor, db)
    return FileResponse(
        DATA / 'files' / did, filename=doc.name, content_disposition_type='attachment'
    )


@router.post('/api/workspaces/{workspaceId}/documents/{did}/retry')
def retry(workspaceId: str, did: str, actor=Depends(user), db=Depends(database)):
    doc = document(workspaceId, did, actor, db)
    changed = (
        db.query(Document)
        .filter(
            Document.id == did,
            Document.generation == doc.generation,
            Document.status.in_(('failed', 'ready')),
        )
        .update(
            {
                'status': 'queued',
                'error': None,
                'chunk_count': 0,
                'generation': Document.generation + 1,
                'attempts': 0,
                'lease': 0,
                'ocr_pages': [],
            },
            synchronize_session=False,
        )
    )
    if not changed:
        raise HTTPException(409, 'Document is already queued or processing.')
    db.query(Chunk).filter_by(document_id=did).delete()
    db.refresh(doc)
    db.commit()
    return public_doc(doc)


@router.delete('/api/workspaces/{workspaceId}/documents/{did}')
def delete(workspaceId: str, did: str, actor=Depends(user), db=Depends(database)):
    doc = document(workspaceId, did, actor, db)
    db.delete(doc)
    # Reports can contain copied passages; invalidate them on source deletion.
    db.commit()
    (DATA / 'files' / did).unlink(missing_ok=True)
    return {'ok': True}
