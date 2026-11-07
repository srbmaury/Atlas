'use client';
import { type ReactNode } from 'react';
import { Search, Upload, FileText, CheckCircle2, HardDrive } from 'lucide-react';

interface DocumentsViewProps {
    canEdit?: boolean;
    uploadButton: ReactNode;
    webImport: ReactNode;
    totalDocuments: number;
    readyDocuments: number;
    storageLabel: string;
    filteredCount: number;
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
    uploadButton,
    webImport,
    totalDocuments,
    readyDocuments,
    storageLabel,
    filteredCount,
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
    return (
        <section className="document-library-v3">
            <div className="crumb">
                Workspace<span>›</span>Library
            </div>
            <div className="library-intro">
                <div>
                    <span className="section-kicker">WORKSPACE / DOCUMENTS</span>
                    <h1>Documents</h1>
                    <p>Search, inspect, and manage the files behind your research.</p>
                </div>
                {uploadButton}
            </div>
            {webImport}
            <div className="library-stat-strip library-metrics">
                <span>
                    <FileText size={17}/><strong>{totalDocuments}</strong> Documents
                </span>
                <span>
                    <CheckCircle2 size={17}/><strong>{readyDocuments}</strong> Ready to search
                </span>
                <span>
                    <HardDrive size={17}/><strong>{storageLabel}</strong> Storage used
                </span>
            </div>
            <div className="library-workspace">
                <div className="library-workspace-heading">
                    <div>
                        <h2>All documents</h2>
                        <p>Search and manage files in this workspace</p>
                    </div>
                    <span>{filteredCount} files</span>
                </div>
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
