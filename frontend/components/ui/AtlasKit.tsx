'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight, CloudUpload } from 'lucide-react';
import { Box, Button, Card, CardContent, Paper, Typography } from '@mui/material';

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow && (
                    <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: '.14em' }}>
                        {eyebrow}
                    </Typography>
                )}
                <Typography component="h1" variant="h4" sx={{ fontSize: { xs: 27, sm: 34 }, lineHeight: 1.2 }}>
                    {title}
                </Typography>
                <Typography color="text.secondary" variant="body2" className="mt-2">
                    {description}
                </Typography>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}

export function MetricCard({ icon, label, value, caption, onClick }: { icon: ReactNode; label: string; value: ReactNode; caption?: string; onClick?: () => void }) {
    return (
        <Card variant="outlined" sx={{ height: '100%', borderColor: 'divider', boxShadow: '0 8px 25px rgba(19,30,63,.035)' }}>
            <CardContent className="flex items-start gap-3" sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 42, height: 42, bgcolor: 'action.hover', borderRadius: 2.5, color: 'primary.main' }}>{icon}</Box>
                <div className="min-w-0 flex-1">
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        {label}
                    </Typography>
                    <Typography component="p" variant="h5" sx={{ fontWeight: 800, mt: 0.3, fontVariantNumeric: 'tabular-nums' }}>
                        {value}
                    </Typography>
                    {caption && (
                        <Typography variant="caption" color="text.secondary">
                            {caption}
                        </Typography>
                    )}
                </div>
                {onClick && (
                    <Button size="small" aria-label={`Open ${label.toLowerCase()}`} onClick={onClick} sx={{ minWidth: 35, width: 35, p: 0.5 }}>
                        <ArrowUpRight size={17} />
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

export function UploadDropTarget({
    title,
    description,
    dragging,
    onDragging,
    onDrop,
    onBrowse,
    uploading,
}: {
    title: string;
    description: string;
    dragging: boolean;
    onDragging: (dragging: boolean) => void;
    onDrop: (files: FileList) => void;
    onBrowse: () => void;
    uploading: boolean;
}) {
    return (
        <Paper
            variant="outlined"
            className="flex flex-col items-start gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:p-6"
            sx={{ borderStyle: 'dashed', borderWidth: 2, borderColor: dragging ? 'primary.main' : 'divider', bgcolor: dragging ? 'action.hover' : 'background.paper' }}
            onDragOver={(event) => {
                event.preventDefault();
                if (!uploading) onDragging(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                onDragging(false);
                if (!uploading && event.dataTransfer.files.length > 0) onDrop(event.dataTransfer.files);
            }}
        >
            <Box sx={{ bgcolor: 'action.hover', color: 'primary.main', borderRadius: 3, p: 1.5 }}>
                <CloudUpload size={24} />
            </Box>
            <div className="min-w-0 flex-1">
                <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {title}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                    {description}
                </Typography>
            </div>
            <Button variant="outlined" disabled={uploading} onClick={onBrowse}>
                {uploading ? 'Uploading…' : 'Browse files'}
            </Button>
        </Paper>
    );
}
