'use client';
import { Download, Ellipsis, FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Doc } from '../../lib/types';
import { fileExtension } from '../../utils/utils';
import { EmptyState, FileBadge, Status } from '../ui/WorkspacePrimitives';

interface DocumentTableProps {
    canEdit?: boolean;
    items: Doc[];
    filter: string;
    onClearFilter: () => void;
    uploadButton: ReactNode;
    onInspect: (document: Doc) => void;
    onRetry: (document: Doc) => void;
    onRemove: (document: Doc) => void;
    downloadUrl: (document: Doc) => string;
    formatSize: (bytes: number) => string;
}

export function DocumentTable({ canEdit = true, items, filter, onClearFilter, uploadButton, onInspect, onRetry, onRemove, downloadUrl, formatSize }: DocumentTableProps) {
    const [openActionsId, setOpenActionsId] = useState<string | null>(null);
    if (!items.length)
        return (
            <EmptyState
                icon={<FolderOpen />}
                title={filter ? 'No matching documents' : 'Your knowledge starts here'}
                text={filter ? 'Try another name or clear the search.' : 'Add documents to find answers, compare ideas, and explore the evidence.'}
                action={
                    filter ? (
                        <button className="btn" onClick={onClearFilter}>
                            Clear search
                        </button>
                    ) : (
                        uploadButton
                    )
                }
            />
        );
    return (
        <div className="table-wrap" role="region" aria-label="Documents and file actions" tabIndex={0}>
            <table className="document-table">
                <thead>
                    <tr>
                        <th>Document</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Passages</th>
                        <th>Status</th>
                        <th>
                            <span className="sr-only">Actions</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((d) => (
                        <tr key={d.id}>
                            <td>
                                <button className="document-name" onClick={() => onInspect(d)}>
                                    <FileBadge name={d.name} />
                                    <span>
                                        <strong>{d.name}</strong>
                                        <small className="document-mobile-meta">
                                            {formatSize(d.size)} · <Status status={d.status} />
                                        </small>
                                        {d.error && <small className="document-error">{d.error}</small>}
                                    </span>
                                </button>
                            </td>
                            <td>{fileExtension(d.name).toUpperCase() || '—'}</td>
                            <td>{formatSize(d.size)}</td>
                            <td>{d.chunk_count || '—'}</td>
                            <td>
                                <Status status={d.status} />
                            </td>
                            <td>
                                <button
                                    type="button"
                                    className="icon-button document-mobile-actions"
                                    aria-label={`Actions for ${d.name}`}
                                    aria-expanded={openActionsId === d.id}
                                    aria-controls={`document-actions-${d.id}`}
                                    onClick={() => setOpenActionsId((current) => (current === d.id ? null : d.id))}
                                >
                                    <Ellipsis size={17} />
                                </button>
                                <div className="row-actions" id={`document-actions-${d.id}`} data-mobile-open={openActionsId === d.id}>
                                    {canEdit && ['ready', 'failed'].includes(d.status) && (
                                        <button className="icon-button" aria-label={`Reindex ${d.name}`} title="Reindex document" onClick={() => onRetry(d)}>
                                            <RotateCcw />
                                        </button>
                                    )}
                                    <a className="icon-button" aria-label={`Download ${d.name}`} href={downloadUrl(d)}>
                                        <Download />
                                    </a>
                                    {canEdit && (
                                        <button className="icon-button destructive" aria-label={`Delete ${d.name}`} title="Delete document" onClick={() => onRemove(d)}>
                                            <Trash2 />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
