'use client';

import { useState, type ReactNode } from 'react';
import { FileCheck2, FileClock, FileWarning, Plus, Search } from 'lucide-react';
import { Button, Collapse, InputAdornment, Paper, TextField, Typography } from '@mui/material';
import { MetricCard, PageHeading, UploadDropTarget } from '../ui/AtlasKit';

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
        <section className="mx-auto flex w-full max-w-[1380px] flex-col gap-6 pb-12">
            <PageHeading
                eyebrow="KNOWLEDGE LIBRARY"
                title="Your documents"
                description="Upload, organize and inspect the material behind your research."
                actions={
                    canEdit ? (
                        <Button variant="contained" startIcon={<Plus size={17} />} aria-expanded={addOpen} aria-controls="library-import-actions" onClick={() => setAddOpen((open) => !open)}>
                            Add knowledge
                        </Button>
                    ) : undefined
                }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard icon={<FileCheck2 size={20} />} label="Ready to search" value={readyDocuments} caption={`${totalDocuments} total · ${storageLabel}`} />
                <MetricCard icon={<FileClock size={20} />} label="Indexing" value={indexingDocuments} caption="Processing your files" />
                <MetricCard icon={<FileWarning size={20} />} label="Needs attention" value={failedDocuments} caption="Files with an indexing error" />
            </div>
            {!canEdit && (
                <Typography role="status" variant="body2" color="text.secondary">
                    You have viewer access. Ask an editor or manager to add documents.
                </Typography>
            )}
            {canEdit && (
                <Collapse in={addOpen} id="library-import-actions">
                    <Paper variant="outlined" className="flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
                        <div>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                Add to your library
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                                Upload a local document or import a webpage.
                            </Typography>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant="contained" disabled={uploading} onClick={onBrowse}>
                                Upload files
                            </Button>
                            {webImport}
                        </div>
                    </Paper>
                </Collapse>
            )}
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: 'divider' }}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                        <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                            All documents
                        </Typography>
                        <Typography color="text.secondary" variant="caption">
                            {totalDocuments} items in this workspace
                        </Typography>
                    </div>
                    <TextField
                        size="small"
                        type="search"
                        label="Search documents"
                        value={filter}
                        onChange={(e) => onFilter(e.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={17} />
                                    </InputAdornment>
                                ),
                            },
                        }}
                        sx={{ width: { xs: '100%', sm: 300 } }}
                    />
                </div>
                {documentTable}
            </Paper>
            {canEdit && (
                <UploadDropTarget
                    title="Drop files to upload"
                    description={`PDF, Word, plain text and more · ${maxSizeMB} MB maximum per file.`}
                    dragging={dragging}
                    onDragging={onDragging}
                    onDrop={onDrop}
                    onBrowse={onBrowse}
                    uploading={uploading}
                />
            )}
        </section>
    );
}
