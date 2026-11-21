'use client';
import { useState, type ReactNode } from 'react';
import { Search, Upload, Plus } from 'lucide-react';

interface DocumentsViewProps {
    canEdit?: boolean;
    webImport: ReactNode;
    totalDocuments: number;
    readyDocuments: number;
    failedDocuments: number;
    indexingDocuments: number;
    storageLabel: string;
    filter: string;
    onFilter: (value: string) => void;
    documentTable: ReactNode;
    dragging: boolean;
    onDragging: (value: boolean) => void;
    onDrop: (files: FileList) => void;
    maxSizeMB: number;
    uploading: boolean;
    onBrowse: () => void;
}

export function DocumentsView({
    canEdit = true,
    webImport,
    totalDocuments,
    readyDocuments,
    failedDocuments,
    indexingDocuments,
    storageLabel,
    filter,
    onFilter,
    documentTable,
    dragging,
    onDragging,
    onDrop,
    maxSizeMB,
    uploading,
    onBrowse,
}: DocumentsViewProps) {
    const [addOpen, setAddOpen] = useState(false);
    return (
        <section className="document-library-v3">
            <div className="library-intro">
                <div>
                    <h1>Documents</h1>
                    <p className="library-summary">
                        {totalDocuments} {totalDocuments === 1 ? 'file' : 'files'} · {readyDocuments} ready to search · {storageLabel}
                        {indexingDocuments > 0 && ' · ' + indexingDocuments + ' indexing'}
                        {failedDocuments > 0 && ' · ' + failedDocuments + ' failed'}
                    </p>
                </div>
                {canEdit && (
                    <button type="button" className="btn primary" aria-expanded={addOpen} aria-controls="library-import-actions" onClick={() => setAddOpen((open) => !open)}>
                        <Plus size={16} /> Add
                    </button>
                )}
            </div>
            <div id="library-import-actions" className="library-import-actions" hidden={canEdit && !addOpen}>
                {canEdit && (
                    <button type="button" className="btn" disabled={uploading} onClick={onBrowse}>
                        Upload files
                    </button>
                )}
                {webImport}
            </div>
            <div className="library-workspace">
                <div className="library-search-row">
                    <label>
                        <Search size={17} />
                        <input type="search" aria-label="Search documents" placeholder="Search your documents…" value={filter} onChange={(e) => onFilter(e.target.value)} />
                    </label>
                </div>
                {documentTable}
            </div>
            {canEdit && (
                <div
                    className={`home-dropzone ${dragging ? 'dragging' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        onDragging(true);
                    }}
                    onDragLeave={() => onDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        onDragging(false);
                        onDrop(e.dataTransfer.files);
                    }}
                >
                    <span className="home-drop-icon">
                        <Upload size={20} />
                    </span>
                    <div>
                        <strong>Add documents to your library</strong>
                        <p>Drag in PDFs, Word, text, Markdown, CSV, JSON or HTML · max {maxSizeMB} MB each.</p>
                    </div>
                    <button className="btn" disabled={uploading} onClick={onBrowse}>
                        Browse files
                    </button>
                </div>
            )}
        </section>
    );
}
