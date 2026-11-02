'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { citedSentence, extractionWarning, sourceDisplayName, sourceLocation } from '../../lib/evidence';
import { SOURCE_LABELS } from '../../lib/providers';
import type { DocumentPreview, Source } from '../../lib/types';
import { DocumentPassage } from '../DocumentPassage';
import { Dialog, FileBadge } from '../ui/WorkspacePrimitives';

export type { DocumentPreview } from '../../lib/types';

function pageText(chunks: DocumentPreview['chunks']) {
    return chunks.map((chunk) => chunk.text.trim()).filter(Boolean).join('\n\n');
}

function surroundingLines(text: string, target: string | null) {
    const lines = text.match(/[^.!?\n]+[.!?]?/g)?.map((line) => line.trim()).filter(Boolean) ?? [];
    if (!target || !lines.length) return text;
    const targetIndex = lines.findIndex((line) => line.includes(target));
    if (targetIndex < 0) return text;
    return lines.slice(Math.max(0, targetIndex - 2), Math.min(lines.length, targetIndex + 3)).join('\n\n');
}

export function EvidenceInspector({
    wid,
    source,
    preview,
    onClose,
    onPreviewChange,
    onError,
}: {
    wid: string;
    source: Source | null;
    preview: DocumentPreview | null;
    onClose: () => void;
    onPreviewChange: (preview: DocumentPreview) => void;
    onError: (message: string) => void;
}) {
    const sourcePdf = Boolean(
        source?.provider === 'documents' && source.document_id && /\.pdf$/i.test(source.name),
    );
    const previewPdf = Boolean(preview?.document.name && /\.pdf$/i.test(preview.document.name));
    const pdfDocumentId = sourcePdf ? source?.document_id : previewPdf ? preview?.document.id : undefined;
    const [pageData, setPageData] = useState<DocumentPreview | null>(null);
    const [activePage, setActivePage] = useState(1);
    const [pageBusy, setPageBusy] = useState(false);
    const pageRequest = useRef(0);

    async function fetchPdfPage(page: number) {
        if (!pdfDocumentId) return;
        const requestId = ++pageRequest.current;
        setPageBusy(true);
        try {
            const result = await api<DocumentPreview>(
                `/workspaces/${wid}/documents/${pdfDocumentId}/chunks?page=${page}`,
            );
            const loaded = { ...result, current_page: page };
            if (requestId !== pageRequest.current) return;
            setPageData(loaded);
            setActivePage(page);
            if (!source && preview) onPreviewChange({ ...preview, ...loaded });
        } catch (error) {
            if (requestId === pageRequest.current) onError((error as Error).message);
        } finally {
            if (requestId === pageRequest.current) setPageBusy(false);
        }
    }

    useEffect(() => {
        setPageData(null);
        setActivePage(source?.page || preview?.current_page || preview?.chunks[0]?.page || 1);
        if (sourcePdf && source?.page) void fetchPdfPage(source.page);
        else pageRequest.current += 1;
        return () => {
            pageRequest.current += 1;
        };
        // A new cited passage or document starts at its own page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wid, source?.chunk_id, source?.page, preview?.document.id]);

    if (!source && !preview) return null;

    const pageCount = pageData?.document.pages || preview?.document.pages || 0;
    const activeChunks = pageData?.current_page === activePage
        ? pageData.chunks
        : (preview?.chunks ?? []).filter((chunk) => chunk.page === activePage);
    const activeText = pageText(activeChunks);
    const exactSentence = source ? citedSentence(source.text, source.highlight_context) : null;
    const citedContextText = sourcePdf && activePage === source?.page && activeText ? activeText : source?.text || '';
    const currentPageOcr = Boolean(
        (source?.ocr && activePage === source.page) ||
            pageData?.document.ocr_pages?.includes(activePage) ||
            preview?.document.ocr_pages?.includes(activePage) ||
            activeChunks.some((chunk) => chunk.ocr),
    );
    const passageWarning = source
        ? extractionWarning(
              source.text,
              Boolean(source.ocr || pageData?.document.ocr_pages?.includes(source.page)),
          )
        : null;
    const pageWarning = activeText ? extractionWarning(activeText, currentPageOcr) : null;
    const pageNavigation = pdfDocumentId && pageCount > 0;
    const openLabel = source?.provider === 'documents' && source.url
        ? 'Open webpage'
        : source?.provider === 'drive'
        ? 'Open in Drive'
        : source?.provider === 'slack'
          ? 'Open in Slack'
          : source?.provider
            ? `Open in ${SOURCE_LABELS[source.provider as keyof typeof SOURCE_LABELS] || source.provider}`
            : source?.url
              ? 'Open webpage'
              : null;
    const originalUrl = source?.document_id
        ? `/api/workspaces/${wid}/documents/${source.document_id}/original`
        : preview?.document.id
          ? `/api/workspaces/${wid}/documents/${preview.document.id}/original`
          : null;

    return (
        <Dialog
            title={source ? 'Source passage' : 'Document preview'}
            closeLabel="Close preview"
            className="evidence-inspector"
            onClose={onClose}
        >
            <div className="drawer-header">
                {source && <FileBadge name={sourceDisplayName(source)} />}
                <div className="evidence-inspector-heading">
                    <div className="caption">{source ? 'Evidence excerpt' : 'Document preview'}</div>
                    <h2>{source ? sourceDisplayName(source) : preview?.document.name}</h2>
                    <div className="evidence-source-meta">
                        <span>
                            {sourcePdf && pageCount
                                ? `Page ${source?.page} of ${pageCount}`
                                : source
                                  ? sourceLocation(source)
                                  : `${preview?.document.chunk_count} passages · ${preview?.document.status}`}
                        </span>
                        {source?.date && <time dateTime={source.date}>{new Date(source.date).toLocaleString()}</time>}
                    </div>
                    {pageNavigation && (
                        <nav className="evidence-page-navigation" aria-label="PDF page navigation">
                            <button
                                className="btn"
                                type="button"
                                aria-label="Previous PDF page"
                                disabled={pageBusy || activePage <= 1}
                                onClick={() => void fetchPdfPage(activePage - 1)}
                            >
                                <ArrowLeft />
                                Previous page
                            </button>
                            <span aria-live="polite">Page {activePage} of {pageCount}</span>
                            <button
                                className="btn"
                                type="button"
                                aria-label="Next PDF page"
                                disabled={pageBusy || activePage >= pageCount}
                                onClick={() => void fetchPdfPage(activePage + 1)}
                            >
                                Next page
                                <ArrowRight />
                            </button>
                        </nav>
                    )}
                </div>
            </div>
            <div className="drawer-body">
                {source ? (
                    <div className="evidence-inspector-passage">
                        <p className="caption evidence-disclaimer">Retrieved passage · Check the original source for surrounding context.</p>
                        {passageWarning && <p className="extraction-warning" role="status">{passageWarning}</p>}
                        <section className="cited-sentence" aria-label="Cited sentence">
                            <span className="caption">Matching source text</span>
                            <DocumentPassage
                                name={sourceDisplayName(source)}
                                text={exactSentence || source.text}
                                highlight={exactSentence || undefined}
                            />
                        </section>
                        <details className="nearby-passage">
                            <summary>Show nearby lines</summary>
                            <DocumentPassage
                                name={sourceDisplayName(source)}
                                text={surroundingLines(citedContextText, exactSentence)}
                                highlight={exactSentence || undefined}
                            />
                        </details>
                        {sourcePdf && activePage !== source.page && (
                            <section className="pdf-page-context">
                                <h3>Page {activePage}</h3>
                                {pageWarning && <p className="extraction-warning" role="status">{pageWarning}</p>}
                                {activeText ? (
                                    <DocumentPassage name={sourceDisplayName(source)} text={activeText} />
                                ) : (
                                    <p className="caption">No extracted text is available on this page.</p>
                                )}
                            </section>
                        )}
                    </div>
                ) : (
                    preview && (
                        <>
                            {preview.document.error && <p className="feedback error">{preview.document.error}</p>}
                            {previewPdf && pageWarning && <p className="extraction-warning" role="status">{pageWarning}</p>}
                            {preview.chunks
                                .filter((chunk) => !previewPdf || chunk.page === activePage)
                                .map((chunk) => (
                                    <section className="preview-chunk" key={chunk.id}>
                                        {!previewPdf && <span className="caption">Section {chunk.page}</span>}
                                        {extractionWarning(chunk.text, chunk.ocr) && (
                                            <p className="extraction-warning" role="status">{extractionWarning(chunk.text, chunk.ocr)}</p>
                                        )}
                                        <DocumentPassage name={preview.document.name} text={chunk.text} />
                                    </section>
                                ))}
                            {!activeChunks.length && previewPdf && !pageBusy && (
                                <p className="evidence-empty">No indexed passages on this page.</p>
                            )}
                            {!preview.chunks.length && <p className="evidence-empty">No indexed passages yet.</p>}
                            {!previewPdf && preview.document.chunk_count > preview.chunks.length && (
                                <button
                                    className="btn"
                                    onClick={async () => {
                                        try {
                                            const next = await api<typeof preview>(`/workspaces/${wid}/documents/${preview.document.id}/chunks?offset=${preview.chunks.length}`);
                                            if (next)
                                                onPreviewChange({
                                                    ...preview,
                                                    chunks: [...preview.chunks, ...next.chunks],
                                                });
                                        } catch (e) {
                                            onError((e as Error).message);
                                        }
                                    }}
                                >
                                    Load more passages
                                </button>
                            )}
                        </>
                    )
                )}
            </div>
            <div className="drawer-footer">
                {source?.url && openLabel ? (
                    <a className="btn" href={source.url} target="_blank" rel="noopener noreferrer">
                        <ArrowUpRight />
                        {openLabel}
                    </a>
                ) : originalUrl ? (
                    <a className="btn" href={originalUrl}>
                        <Download />
                        Download uploaded original
                    </a>
                ) : null}
                <button className="btn" onClick={onClose}>Close</button>
            </div>
        </Dialog>
    );
}
