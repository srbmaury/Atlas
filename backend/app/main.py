import logging
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import config, connected_research
from .ai import generate
from .api_dependencies import database, user, workspace
from .config import DATA
from .connected_oauth import router as connected_oauth_router
from .db import Chunk, Document, init_db
from .drive import router as drive_router
from .external_sources import router as external_router
from .gmail import router as gmail_router
from .health import router as health_router
from .query_context import retrieval_query
from .rbac import authorize_workspace_request, revalidate_access
from .retrieval import retrieve
from .routes.access import router as access_router
from .routes.auth import router as auth_router
from .routes.conversations import router as conversations_router
from .routes.documents import router as documents_router
from .routes.source_health import router as source_health_router
from .routes.workspaces import router as workspaces_router
from .schemas import ConnectedQuestion, Question
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
    dependencies=[Depends(authorize_workspace_request)],
)
app.include_router(access_router)
app.include_router(gmail_router)
app.include_router(external_router)
app.include_router(drive_router)
app.include_router(health_router)
app.include_router(web_router)
app.include_router(connected_oauth_router)
app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(documents_router)
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


@app.get('/api/health')
def health():
    return {'status': 'ok'}


def collect_connected_evidence(workspaceId, body, actor, db, retrieval_stats=None):
    return connected_research.collect_connected_evidence(
        workspaceId,
        body,
        actor,
        db,
        retrieval_stats,
        workspace_access=workspace,
        retrieve_chunks=retrieve,
    )


retrieval_trace = connected_research.retrieval_trace
attach_retrieval_trace = connected_research.attach_retrieval_trace
connected_sources_for_payload = connected_research.connected_sources_for_payload
connected_scope = connected_research.connected_scope
no_evidence_result = connected_research.no_evidence_result
connected_source_listing_result = connected_research.connected_source_listing_result
direct_connected_result = connected_research.direct_connected_result


@app.post('/api/workspaces/{workspaceId}/connected-chat')
def connected_chat(
    workspaceId: str,
    body: ConnectedQuestion,
    request: Request,
    actor=Depends(user),
    db=Depends(database),
):
    """Retrieve evidence across workspace documents and optionally live Gmail."""
    from .ai import client, ollama_chat

    retrieval_stats = {}
    evidence, document_evidence = collect_connected_evidence(
        workspaceId, body, actor, db, retrieval_stats
    )
    revalidate_access(workspaceId, actor, {item.provider for item in evidence})
    if not evidence:
        return no_evidence_result(body, retrieval_stats)
    # A local 8k-context model cannot accept all retrieved source bodies at once.
    # Keep source IDs stable across retries so citations always refer to real evidence.
    from .connected_synthesis import synthesize_connected

    direct_result = direct_connected_result(body.question, body, evidence, document_evidence)
    if direct_result:
        return attach_retrieval_trace(direct_result, body, evidence, retrieval_stats)
    try:
        answer, payload = synthesize_connected(
            body.question,
            evidence,
            config.AI_PROVIDER,
            config.API_KEY,
            config.CHAT_MODEL,
            client,
            ollama_chat,
            history=[turn.model_dump() for turn in body.history],
        )
    except HTTPException:
        raise
    except ValueError as exc:
        import logging

        logging.getLogger(__name__).warning(
            'Connected model reached generation/context limit: %s', exc
        )
        raise HTTPException(
            422,
            'The local model could not complete this cross-source answer. Try a narrower Gmail query or fewer source types.',
        ) from exc
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception('Connected synthesis failed')
        raise HTTPException(
            502, 'Connected answer generation failed. Check the AI provider logs.'
        ) from exc
    revalidate_access(workspaceId, actor, {item.provider for item in evidence})
    from .connected_synthesis import has_valid_citations

    if not has_valid_citations(answer or '', payload):
        return attach_retrieval_trace(
            {
                'answer': 'The model returned an answer without usable source citations. Please retry; no unverified answer is shown.',
                'sources': [],
                'mode': 'citation_check_failed',
                'scope': connected_scope(body),
            },
            body,
            evidence,
            retrieval_stats,
            [],
        )
    # Preserve positional [n] citations used by the standard chat renderer.
    # Non-document evidence carries a URL so the UI opens the original record.
    sources = connected_sources_for_payload(payload, document_evidence)
    from .citation_audit import audit_citations
    from .decision_links import decision_timeline, related_sources

    return attach_retrieval_trace(
        {
            'answer': answer,
            'sources': sources,
            'related_sources': related_sources(payload),
            'decision_timeline': decision_timeline(payload),
            'mode': 'connected',
            'citation_audit': audit_citations(answer, payload),
            'scope': connected_scope(body),
        },
        body,
        evidence,
        retrieval_stats,
        payload,
    )


@app.post('/api/workspaces/{workspaceId}/connected-chat/stream')
def connected_chat_stream(
    workspaceId: str,
    body: ConnectedQuestion,
    request: Request,
    actor=Depends(user),
    db=Depends(database),
):
    """Stream answer progress and text as newline-delimited JSON events."""
    import json

    def events():
        provider_labels = {
            'documents': 'Documents',
            'gmail': 'Gmail',
            'drive': 'Google Drive',
            'github': 'GitHub',
            'notion': 'Notion',
            'slack': 'Slack',
            'calendar': 'Calendar',
            'linear': 'Linear',
            'jira': 'Jira',
            'onedrive': 'OneDrive',
            'outlook': 'Outlook',
            'sharepoint': 'SharePoint',
        }
        selected_sources = connected_scope(body)
        source_names = [provider_labels.get(provider, provider) for provider in selected_sources]
        search_status = (
            f'Searching {" and ".join(source_names)}…'
            if source_names
            else 'Choose sources to search…'
        )
        yield (json.dumps({'type': 'status', 'text': search_status}, ensure_ascii=False) + '\n')
        try:
            retrieval_stats = {}
            evidence, document_evidence = collect_connected_evidence(
                workspaceId, body, actor, db, retrieval_stats
            )
            revalidate_access(workspaceId, actor, {item.provider for item in evidence})
            if not evidence:
                yield (
                    json.dumps(
                        {'type': 'done', 'result': no_evidence_result(body, retrieval_stats)},
                        ensure_ascii=False,
                    )
                    + '\n'
                )
                return
            direct_result = direct_connected_result(
                body.question, body, evidence, document_evidence
            )
            if direct_result:
                direct_result = attach_retrieval_trace(
                    direct_result, body, evidence, retrieval_stats
                )
                yield (
                    json.dumps({'type': 'done', 'result': direct_result}, ensure_ascii=False) + '\n'
                )
                return
            yield (
                json.dumps(
                    {
                        'type': 'status',
                        'text': f'Retrieval complete · {len(evidence)} passages retained. Writing an answer…',
                    },
                    ensure_ascii=False,
                )
                + '\n'
            )
            # Document-only questions use the dedicated citation-checked answer generator.
            # This avoids the cross-source streaming model's short timeout and keeps
            # ordinary document Q&A focused on the user's requested answer.
            if body.include_documents and not body.include_gmail and not body.providers:
                doc_sources = [
                    document_evidence[item.source_id]
                    for item in evidence
                    if item.provider == 'documents' and item.source_id in document_evidence
                ]
                result = generate(
                    body.question, doc_sources, [t.model_dump() for t in body.history]
                )
                revalidate_access(workspaceId, actor)
                result['scope'] = connected_scope(body)
                attach_retrieval_trace(result, body, evidence, retrieval_stats)
                if result.get('mode') in ('ai', 'connected') and result.get('sources'):
                    from .citation_audit import audit_citations

                    result['citation_audit'] = audit_citations(result['answer'], result['sources'])
                yield (
                    json.dumps({'type': 'delta', 'text': result['answer']}, ensure_ascii=False)
                    + '\n'
                )
                yield json.dumps({'type': 'done', 'result': result}, ensure_ascii=False) + '\n'
                return
            from .ai import client
            from .connected_synthesis import stream_connected, stream_with_heartbeats

            def answer_events(cancellation):
                return stream_connected(
                    body.question,
                    evidence,
                    config.AI_PROVIDER,
                    config.API_KEY,
                    config.CHAT_MODEL,
                    client,
                    config.OLLAMA_URL,
                    config.OLLAMA_CHAT_MODEL,
                    cancellation,
                    history=[turn.model_dump() for turn in body.history],
                )

            for event in stream_with_heartbeats(answer_events):
                if event['type'] in ('delta', 'complete'):
                    revalidate_access(workspaceId, actor, {item.provider for item in evidence})
                if event['type'] == 'complete':
                    public_sources = (
                        connected_sources_for_payload(event['sources'], document_evidence)
                        if event['sources']
                        else []
                    )
                    from .decision_links import decision_timeline, related_sources

                    result = {
                        'answer': event['answer'],
                        'sources': public_sources,
                        'related_sources': related_sources(event['sources']),
                        'decision_timeline': decision_timeline(event['sources']),
                        'mode': event['mode'],
                        'scope': connected_scope(body),
                        'citation_audit': event.get('citation_audit'),
                        'coverage_note': event.get('coverage_note'),
                    }
                    attach_retrieval_trace(
                        result, body, evidence, retrieval_stats, event['sources']
                    )
                    yield json.dumps({'type': 'done', 'result': result}, ensure_ascii=False) + '\n'
                elif event['type'] == 'heartbeat':
                    yield (
                        json.dumps(
                            {'type': 'status', 'text': 'Still preparing a cited answer…'},
                            ensure_ascii=False,
                        )
                        + '\n'
                    )
                else:
                    yield json.dumps(event, ensure_ascii=False) + '\n'
        except HTTPException as exc:
            yield json.dumps({'type': 'error', 'message': exc.detail}, ensure_ascii=False) + '\n'
        except Exception as exc:
            log.exception('Connected streaming answer failed')
            message = 'The answer could not be completed. Check the source connection and AI provider, then retry.'
            if isinstance(exc, ValueError):
                message = str(exc)
            yield json.dumps({'type': 'error', 'message': message}, ensure_ascii=False) + '\n'

    return StreamingResponse(
        events(),
        media_type='application/x-ndjson',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@app.post('/api/workspaces/{workspaceId}/chat')
def chat(workspaceId: str, body: Question, actor=Depends(user), db=Depends(database)):
    workspace(workspaceId, actor, db)
    if not body.question.strip():
        raise HTTPException(422, 'Enter a question.')
    if body.document_ids:
        found = (
            db.query(Document)
            .filter(Document.workspace_id == workspaceId, Document.id.in_(body.document_ids))
            .count()
        )
        if found != len(set(body.document_ids)):
            raise HTTPException(404, 'Selected document not found.')
    query = retrieval_query(body.question, body.history)
    try:
        sources = retrieve(workspaceId, query, body.document_ids)
        result = generate(body.question, sources, [t.model_dump() for t in body.history])
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception('Chat retrieval or generation failed')
        if isinstance(exc, (ConnectionError, TimeoutError)):
            detail = (
                'AI provider connection failed or timed out. Check the provider service and retry.'
            )
        else:
            detail = 'Answer generation failed. Check your AI provider configuration and server logs, then retry.'
        raise HTTPException(502, detail) from exc
    revalidate_access(workspaceId, actor)
    # Do not return passages for documents deleted or reindexed during the provider call.
    if sources:
        current = (
            db.query(Chunk.id)
            .filter(
                Chunk.workspace_id == workspaceId, Chunk.id.in_([s['chunk_id'] for s in sources])
            )
            .count()
        )
        if current != len(sources):
            raise HTTPException(409, 'Sources changed during the answer. Ask again.')
    return result
