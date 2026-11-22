'use client';

import { useState, type ReactNode } from 'react';
import { Download, Ellipsis, FileSearch, FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { Box, Button, Chip, IconButton, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { Doc } from '../../lib/types';
import { fileExtension } from '../../utils/utils';
import { FileBadge } from '../ui/WorkspacePrimitives';

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

function statusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'error';
    if (status === 'queued' || status === 'processing') return 'warning';
    return 'default';
}

export function DocumentTable({ canEdit = true, items, filter, onClearFilter, uploadButton, onInspect, onRetry, onRemove, downloadUrl, formatSize }: DocumentTableProps) {
    const [actions, setActions] = useState<{ anchor: HTMLElement; document: Doc } | null>(null);
    const closeMenu = () => setActions(null);

    if (!items.length)
        return (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <Box sx={{ bgcolor: 'action.hover', color: 'primary.main', p: 2, borderRadius: 3 }}>
                    <FolderOpen size={27} />
                </Box>
                <Typography variant="h6" component="h3" sx={{ fontWeight: 800 }}>
                    {filter ? 'No matching documents' : 'Your knowledge starts here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
                    {filter ? 'Try a different term or clear your search.' : 'Add your first document to start researching across trusted material.'}
                </Typography>
                {filter ? (
                    <Button variant="outlined" onClick={onClearFilter}>
                        Clear search
                    </Button>
                ) : (
                    uploadButton
                )}
            </div>
        );

    return (
        <>
            <TableContainer role="region" aria-label="Documents and file actions" tabIndex={0} sx={{ width: '100%', borderTop: '1px solid', borderColor: 'divider' }}>
                <Table size="medium" aria-label="Document library">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell>Document</TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Type</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Passages</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((doc) => (
                            <TableRow key={doc.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                <TableCell sx={{ minWidth: 180, maxWidth: 450 }}>
                                    <Button
                                        color="inherit"
                                        onClick={() => onInspect(doc)}
                                        sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1.5, p: 0.5, textAlign: 'left', maxWidth: '100%', minWidth: 0 }}
                                    >
                                        <FileBadge name={doc.name} />
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold">{doc.name}</span>
                                            {doc.error && <span className="block break-words text-xs text-red-600">{doc.error}</span>}
                                        </span>
                                    </Button>
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{fileExtension(doc.name).toUpperCase() || '—'}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{formatSize(doc.size)}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{doc.chunk_count || '—'}</TableCell>
                                <TableCell>
                                    <Chip size="small" color={statusColor(doc.status)} label={doc.status === 'ready' ? 'Ready' : doc.status} variant="outlined" />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title={`Inspect ${doc.name}`}>
                                        <IconButton size="small" aria-label={`Inspect ${doc.name}`} onClick={() => onInspect(doc)}>
                                            <FileSearch size={18} />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="File actions">
                                        <IconButton
                                            size="small"
                                            aria-label={`Actions for ${doc.name}`}
                                            aria-haspopup="menu"
                                            onClick={(event) => setActions({ anchor: event.currentTarget, document: doc })}
                                        >
                                            <Ellipsis size={18} />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Menu anchorEl={actions?.anchor} open={!!actions} onClose={closeMenu} slotProps={{ list: { 'aria-label': 'Document actions' } }}>
                <MenuItem
                    onClick={() => {
                        if (actions) onInspect(actions.document);
                        closeMenu();
                    }}
                >
                    <FileSearch size={17} className="mr-3" />
                    Inspect document
                </MenuItem>
                <MenuItem component="a" href={actions ? downloadUrl(actions.document) : undefined} onClick={closeMenu}>
                    <Download size={17} className="mr-3" />
                    Download original
                </MenuItem>
                {canEdit && actions && ['ready', 'failed'].includes(actions.document.status) && (
                    <MenuItem
                        onClick={() => {
                            onRetry(actions.document);
                            closeMenu();
                        }}
                    >
                        <RotateCcw size={17} className="mr-3" />
                        Reindex document
                    </MenuItem>
                )}
                {canEdit && actions && (
                    <MenuItem
                        sx={{ color: 'error.main' }}
                        onClick={() => {
                            onRemove(actions.document);
                            closeMenu();
                        }}
                    >
                        <Trash2 size={17} className="mr-3" />
                        Delete document
                    </MenuItem>
                )}
            </Menu>
        </>
    );
}
