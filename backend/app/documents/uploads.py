"""Authenticated staged uploads, keeping large files out of proxy request buffers."""

import fcntl
import hashlib
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from ..config import DATA
from ..db import Document, uid
from . import original_storage

PART_BYTES = 8 * 1024 * 1024
TTL = 24 * 60 * 60


def root():
    directory = DATA / 'uploads'
    directory.mkdir(exist_ok=True)
    return directory


def paths(upload_id):
    if not re.fullmatch(r'[0-9a-f-]{36}', upload_id):
        raise HTTPException(404, 'Upload not found.')
    base = root() / upload_id
    return Path(str(base) + '.json'), Path(str(base) + '.part'), Path(str(base) + '.lock')


@contextmanager
def locked(upload_id, workspaceId, owner):
    meta, part, lock = paths(upload_id)
    if not meta.exists():
        raise HTTPException(404, 'Upload not found or already completed.')
    with lock.open('a+b') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            if not meta.exists():
                raise HTTPException(404, 'Upload not found or already completed.')
            info = json.loads(meta.read_text())
            if info['workspace_id'] != workspaceId or info['owner_id'] != owner:
                raise HTTPException(404, 'Upload not found.')
            if time.time() - meta.stat().st_mtime > TTL:
                raise HTTPException(410, 'Upload expired. Select the file again.')
            yield info, meta, part
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def start(workspaceId, owner, name, size, max_bytes, supported):
    name = Path(name.replace('\\', '/')).name[:200]
    if Path(name).suffix.lower() not in supported:
        raise HTTPException(422, 'Supported formats: PDF, DOCX, TXT, MD.')
    if size <= 0:
        raise HTTPException(422, 'File is empty.')
    if size > max_bytes:
        raise HTTPException(413, f'File exceeds {max_bytes // 1024 // 1024} MB limit.')
    # Expired staging data is never an indexed source and can be reclaimed safely.
    for old in root().glob('*.json'):
        if time.time() - old.stat().st_mtime > TTL:
            _, old_part, _ = paths(old.stem)
            old_part.unlink(missing_ok=True)
            old.unlink(missing_ok=True)
    upload_id = uid()
    meta, part, _ = paths(upload_id)
    part.touch(exist_ok=False)
    meta.write_text(
        json.dumps({'workspace_id': workspaceId, 'owner_id': owner, 'name': name, 'size': size})
    )
    return {'id': upload_id, 'offset': 0, 'part_bytes': PART_BYTES}


def status(upload_id, workspaceId, owner):
    with locked(upload_id, workspaceId, owner) as (info, _, part):
        return {'id': upload_id, 'offset': part.stat().st_size, 'size': info['size']}


def append(upload_id, workspaceId, owner, offset, data):
    if not data or len(data) > PART_BYTES:
        raise HTTPException(413, 'Upload part must contain 1 byte to 8 MB.')
    with locked(upload_id, workspaceId, owner) as (info, meta, part):
        with part.open('r+b') as out:
            out.seek(0, 2)
            current = out.tell()
            if offset != current:
                raise HTTPException(409, f'Upload offset mismatch; expected {current}.')
            if current + len(data) > info['size']:
                raise HTTPException(413, 'Upload exceeds declared file size.')
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        meta.touch()
        return {'offset': current + len(data)}


def finish(upload_id, workspaceId, owner, db):
    with locked(upload_id, workspaceId, owner) as (info, meta, part):
        if part.stat().st_size != info['size']:
            raise HTTPException(409, 'Upload is incomplete. Send the remaining parts first.')
        digest = hashlib.sha256()
        with part.open('rb') as file:
            for block in iter(lambda: file.read(PART_BYTES), b''):
                digest.update(block)
        existing = (
            db.query(Document)
            .filter_by(workspace_id=workspaceId, digest=digest.hexdigest())
            .first()
        )
        if existing:
            part.unlink()
            meta.unlink()
            return existing, True
        did = uid()
        destination = DATA / 'files' / did
        doc = Document(
            id=did,
            workspace_id=workspaceId,
            name=info['name'],
            size=info['size'],
            digest=digest.hexdigest(),
        )
        os.replace(part, destination)
        try:
            original_storage.store_original(did, destination)
            db.add(doc)
            db.commit()
        except IntegrityError:
            db.rollback()
            original_storage.delete_original(did)
            existing = (
                db.query(Document)
                .filter_by(workspace_id=workspaceId, digest=digest.hexdigest())
                .first()
            )
            if not existing:
                raise
            meta.unlink()
            return existing, True
        except Exception:
            db.rollback()
            os.replace(destination, part)
            original_storage.delete_original(did)
            raise
        original_storage.remove_staging(destination)
        meta.unlink()
        return doc, False


def cancel(upload_id, workspaceId, owner):
    with locked(upload_id, workspaceId, owner) as (_, meta, part):
        part.unlink(missing_ok=True)
        meta.unlink()
    return {'ok': True}
