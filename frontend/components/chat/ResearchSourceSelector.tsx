'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { GmailStatus } from '../../lib/types';
import type { ConnectedSourceStatus, ResearchProvider } from '../../lib/types';
import { PROVIDER_LABELS, RESEARCH_PROVIDERS } from '../../lib/providers';

interface ResearchSourceSelectorProps {
    compact?: boolean;
    includeDocuments: boolean;
    onIncludeDocuments: (value: boolean) => void;
    gmailStatus: GmailStatus | null;
    connectedGmail: boolean;
    onIncludeGmail: (value: boolean) => void;
    driveStatus: { connected: boolean } | null;
    sourceStatuses: ConnectedSourceStatus[];
    connectedProviders: ResearchProvider[];
    onToggleProvider: (provider: ResearchProvider, enabled: boolean) => void;
    onSelectAll: (select: boolean) => void;
    onManage: () => void;
    onBrowseDocuments: () => void;
    selectedCount: number;
    sourceLoadFailed?: boolean;
    onRetrySources: () => void;
}

export function ResearchSourceSelector({
    compact = false,
    includeDocuments,
    onIncludeDocuments,
    gmailStatus,
    connectedGmail,
    onIncludeGmail,
    driveStatus,
    sourceStatuses,
    connectedProviders,
    onToggleProvider,
    onSelectAll,
    onManage,
    onBrowseDocuments,
    selectedCount,
    sourceLoadFailed,
    onRetrySources,
}: ResearchSourceSelectorProps) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        function dismiss(event: PointerEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
        }
        function escape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);
    const availableProviders: ResearchProvider[] = [...(driveStatus?.connected ? (['drive'] as const) : []), ...sourceStatuses.filter((source) => source.connected).map((source) => source.provider)];
    const allSelected = includeDocuments && (!gmailStatus?.connected || connectedGmail) && availableProviders.every((provider) => connectedProviders.includes(provider));
    const count = Number(includeDocuments) + Number(connectedGmail && !!gmailStatus?.connected) + availableProviders.filter((provider) => connectedProviders.includes(provider)).length;
    const summary = count === 0 ? 'No sources selected' : count === 1 && includeDocuments ? 'Documents' : `${count} sources active`;
    return (
        <div className="research-source-picker" ref={menuRef}>
            <button type="button" className={`research-source-trigger ${compact ? 'atlas-ref-source-trigger' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
                <SlidersHorizontal size={15} />
                <span>{compact ? 'Connected Sources' : `Sources: ${summary}`}</span>
                <ChevronDown size={14} />
            </button>
            {open && (
                <div className="research-source-popover" role="dialog" aria-label="Choose search sources">
                    <div className="unified-sources">
                        <span className="unified-sources-label">Search sources</span>
                        <button
                            type="button"
                            className="unified-source-select-all"
                            onClick={() => onSelectAll(!allSelected)}
                            aria-label={allSelected ? 'Unselect all connected sources and documents' : 'Select all connected sources and documents'}
                        >
                            {allSelected ? 'Unselect all' : 'Select all'}
                        </button>
                        {sourceLoadFailed && (
                            <div className="source-load-notice" role="status">
                                Some connections couldn’t be loaded.{' '}
                                <button type="button" onClick={onRetrySources}>
                                    Retry
                                </button>
                            </div>
                        )}
                        <label>
                            <input type="checkbox" checked={includeDocuments} onChange={(e) => onIncludeDocuments(e.target.checked)} /> Documents
                        </label>
                        {includeDocuments && (
                            <button
                                type="button"
                                className="unified-source-manage"
                                onClick={() => {
                                    setOpen(false);
                                    onBrowseDocuments();
                                }}
                            >
                                {selectedCount ? selectedCount + ' documents selected' : 'All documents'} · Change
                            </button>
                        )}
                        <label>
                            <input type="checkbox" disabled={!gmailStatus?.connected} checked={connectedGmail} onChange={(e) => onIncludeGmail(e.target.checked)} /> Gmail
                        </label>
                        {RESEARCH_PROVIDERS.map((p) => (
                            <label
                                key={p}
                                title={
                                    p === 'drive'
                                        ? driveStatus?.connected
                                            ? ''
                                            : 'Connect Drive in Sources first'
                                        : sourceStatuses.find((x) => x.provider === p)?.connected
                                          ? ''
                                          : 'Connect this source in Sources first'
                                }
                            >
                                <input
                                    type="checkbox"
                                    disabled={p === 'drive' ? !driveStatus?.connected : !sourceStatuses.some((x) => x.provider === p && x.connected)}
                                    checked={connectedProviders.includes(p)}
                                    onChange={(e) => onToggleProvider(p, e.target.checked)}
                                />
                                {PROVIDER_LABELS[p]}
                            </label>
                        ))}
                        <button
                            type="button"
                            className="unified-source-manage"
                            onClick={() => {
                                setOpen(false);
                                onManage();
                            }}
                        >
                            Manage connections <ArrowUpRight size={13} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
