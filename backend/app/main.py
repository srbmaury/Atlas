import logging
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import DATA
from .connectors.connected_oauth import router as connected_oauth_router
from .connectors.drive import router as drive_router
from .connectors.external_sources import router as external_router
from .connectors.gmail import router as gmail_router
from .db import init_db
from .health import router as health_router
from .original_storage import StorageError
from .routes.access import router as access_router
from .routes.agents import router as agents_router
from .routes.auth import router as auth_router
from .routes.chat import router as chat_router
from .routes.conversations import router as conversations_router
from .routes.documents import router as documents_router
from .routes.repository_evidence import router as repository_evidence_router
from .routes.source_health import router as source_health_router
from .routes.workspaces import router as workspaces_router
from .web_sources import router as web_router
from .worker import loop


@asynccontextmanager
async def lifespan(app):
    init_db()
    (DATA / 'files').mkdir(exist_ok=True)
    stop = threading.Event()
    thread = None
    if os.getenv('INLINE_WORKER', 'true').lower() == 'true':
        thread = threading.Thread(target=loop, args=(stop,), daemon=True)
        thread.start()
    yield
    stop.set()
    if thread:
        thread.join(timeout=5)


app = FastAPI(
    title='Atlas Document Intelligence',
    lifespan=lifespan,
)
app.include_router(agents_router)
app.include_router(access_router)
app.include_router(gmail_router)
app.include_router(external_router)
app.include_router(drive_router)
app.include_router(health_router)
app.include_router(web_router)
app.include_router(connected_oauth_router)
app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(repository_evidence_router)
app.include_router(workspaces_router)
app.include_router(source_health_router)
log = logging.getLogger('atlas.requests')


@app.middleware('http')
async def request_diagnostics(request: Request, call_next):
    started = time.monotonic()
    request_id = secrets.token_hex(8)
    try:
        response = await call_next(request)
    except Exception:
        log.exception(
            'request_failed id=%s method=%s path=%s', request_id, request.method, request.url.path
        )
        raise
    elapsed_ms = round((time.monotonic() - started) * 1000)
    # The frontend and API remain on one origin via the Next.js proxy.
    # These headers protect browser-facing content without assuming a CDN/WAF.
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(self), geolocation=()'
    response.headers['X-Request-ID'] = request_id
    response.headers['Server-Timing'] = f'api;dur={elapsed_ms}'
    log.info(
        'request id=%s method=%s path=%s status=%s duration_ms=%s',
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.exception_handler(StorageError)
async def storage_unavailable(request: Request, error: StorageError):
    return JSONResponse({'detail': str(error)}, status_code=503)


@app.get('/api/health')
def health():
    return {'status': 'ok'}
