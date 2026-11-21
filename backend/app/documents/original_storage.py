"""Store document originals on local disk or in a private Supabase bucket."""

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote, urlsplit

import httpx

from ..config import DATA

log = logging.getLogger(__name__)


class StorageError(OSError):
    pass


def _configuration():
    url = os.getenv('ATLAS_STORAGE_URL', '').rstrip('/')
    key = os.getenv('ATLAS_STORAGE_KEY', '')
    bucket = os.getenv('ATLAS_STORAGE_BUCKET', '')
    if not (url or key or bucket):
        return None
    parts = urlsplit(url)
    if not (
        key
        and bucket
        and parts.scheme == 'https'
        and parts.hostname
        and not (parts.path or parts.query or parts.fragment or parts.username)
    ):
        raise StorageError('Configure an HTTPS Supabase project URL, bucket, and server key.')
    headers = {'apikey': key}
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = f'Bearer {key}'
    return f'{url}/storage/v1/object', quote(bucket, safe=''), headers


@contextmanager
def _client(headers):
    try:
        with httpx.Client(
            headers=headers, timeout=60, follow_redirects=False, trust_env=False
        ) as client:
            yield client
    except httpx.HTTPError:
        raise StorageError('Document storage request failed.') from None


def store_original(identifier, source):
    config = _configuration()
    if config is None:
        return
    base, bucket, headers = config
    with _client(headers) as client, source.open('rb') as content:
        response = client.post(
            f'{base}/{bucket}/{quote(identifier, safe="")}',
            content=iter(lambda: content.read(1024**2), b''),
            headers={
                'Content-Type': 'application/octet-stream',
                'Content-Length': str(source.stat().st_size),
                'x-upsert': 'false',
            },
        )
        response.raise_for_status()


def remove_staging(path):
    if _configuration() is not None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            log.warning('Could not remove staging file for document %s', path.name)


@contextmanager
def original_path(identifier, limit=None):
    config = _configuration()
    if config is None:
        yield DATA / 'files' / identifier
        return
    base, bucket, headers = config
    with TemporaryDirectory() as directory:
        path = Path(directory) / 'original'
        with _client(headers) as client:
            request_headers = {'Range': f'bytes=0-{limit - 1}'} if limit else None
            with client.stream(
                'GET',
                f'{base}/authenticated/{bucket}/{quote(identifier, safe="")}',
                headers=request_headers,
            ) as response:
                if response.status_code == 404:
                    raise FileNotFoundError('Document original was not found.')
                response.raise_for_status()
                with path.open('wb') as target:
                    for block in response.iter_bytes(chunk_size=limit or 1024**2):
                        target.write(block)
                        if limit:
                            break
        yield path


def delete_original(identifier):
    """Best-effort object cleanup after committing database changes."""
    (DATA / 'files' / identifier).unlink(missing_ok=True)
    try:
        config = _configuration()
        if config is not None:
            base, bucket, headers = config
            with _client(headers) as client:
                response = client.request(
                    'DELETE', f'{base}/{bucket}', json={'prefixes': [identifier]}
                )
                response.raise_for_status()
    except StorageError:
        log.warning('Could not remove original from storage for document %s', identifier)
