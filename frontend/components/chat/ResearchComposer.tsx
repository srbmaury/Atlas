'use client';

import { useRef, useState, type ReactNode } from 'react';
import { FileText, FolderOpen, Globe2, Mic, MicOff, Paperclip, Sparkles } from 'lucide-react';
import { Alert, Chip, CircularProgress, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { ResearchQuestionBox } from './ResearchQuestionBox';
import { AgentMentionSuggestions } from '../agents/AgentMentionSuggestions';
import type { AgentMention } from '../../lib/types';

interface ResearchComposerProps {
    query: string;
    sourceSelector: ReactNode;
    mentionAgents?: AgentMention[];
    onChange: (q: string) => void;
    onSubmit: () => void;
    onUpload: () => void;
    onBrowseLibrary: () => void;
    canUpload: boolean;
    uploading: boolean;
    busy: boolean;
    hasAskSources: boolean;
    hasMessages: boolean;
    includeDocuments: boolean;
    onIncludeDocumentsChange: (enabled: boolean) => void;
    readyCount: number;
    sourceLabels: string[];
    selectedDocuments: { id: string; name: string }[];
    pendingDocuments: { id: string; name: string; status: string }[];
    onRemoveDocument: (id: string) => void;
    uploadProgress: string;
    uploadResult: string;
    onDismissUploadResult: () => void;
}

export function ResearchComposer({
    query,
    sourceSelector,
    mentionAgents = [],
    onChange,
    onSubmit,
    onUpload,
    onBrowseLibrary,
    canUpload,
    uploading,
    busy,
    hasAskSources,
    hasMessages,
    includeDocuments,
    onIncludeDocumentsChange,
    readyCount,
    sourceLabels,
    selectedDocuments,
    pendingDocuments,
    onRemoveDocument,
    uploadProgress,
    uploadResult,
    onDismissUploadResult,
}: ResearchComposerProps) {
    const voice = useVoiceInput();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const canSubmit = !busy && !!query.trim() && hasAskSources;
    const mention = /(?:^|\s)@([a-z0-9-]*)$/i.exec(query);
    const matchingAgents = mention ? mentionAgents.filter((agent) => agent.handle.slice(1).includes(mention[1].toLowerCase())).slice(0, 6) : [];

    function addTranscript(transcript: string) {
        onChange(query.trim() ? `${query.trim()} ${transcript}` : transcript);
    }

    return (
        <ResearchQuestionBox
            className="composer atlas-ref-composer research-composer-v2"
            query={query}
            onQueryChange={onChange}
            onRequestSubmit={onSubmit}
            canSubmit={canSubmit}
            busy={busy}
            inputRef={textareaRef}
            inputLabel="Your question"
            placeholder={hasMessages ? 'Ask a follow-up question…' : 'Ask across your sources…'}
            maxRows={7}
            sourceSelector={sourceSelector}
            context={
                <>
                    {(selectedDocuments.length > 0 || pendingDocuments.length > 0) && (
                        <div className="flex flex-wrap gap-1.5" aria-label="Question context">
                            {selectedDocuments.map((doc) => (
                                <Chip key={doc.id} size="small" icon={<FileText size={14} />} label={doc.name} title={doc.name} onDelete={() => onRemoveDocument(doc.id)} sx={{ maxWidth: 230 }} />
                            ))}
                            {pendingDocuments.map((doc) => (
                                <Chip
                                    key={doc.id}
                                    size="small"
                                    variant="outlined"
                                    color={doc.status === 'failed' ? 'error' : 'warning'}
                                    icon={<FileText size={14} />}
                                    label={`${doc.name} · ${doc.status === 'failed' ? 'Indexing failed' : doc.status === 'processing' ? 'Indexing…' : 'Queued'}`}
                                    title={doc.name}
                                    sx={{ maxWidth: 250 }}
                                />
                            ))}
                        </div>
                    )}
                    {uploadProgress && (
                        <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ py: 0 }}>
                            {uploadProgress}
                        </Alert>
                    )}
                    {!uploadProgress && uploadResult && (
                        <Alert severity="success" onClose={onDismissUploadResult} sx={{ py: 0 }}>
                            {uploadResult}
                        </Alert>
                    )}
                    <AgentMentionSuggestions
                        agents={matchingAgents}
                        onSelect={(agent) => {
                            onChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' '));
                            textareaRef.current?.focus();
                        }}
                    />
                </>
            }
            leadingActions={
                <>
                    <Tooltip title="Add documents">
                        <IconButton
                            className="atlas-ref-pill"
                            aria-label="Add context"
                            aria-haspopup="menu"
                            aria-expanded={!!menuAnchor}
                            onClick={(event) => setMenuAnchor(event.currentTarget)}
                            size="small"
                        >
                            <Paperclip size={16} />
                        </IconButton>
                    </Tooltip>
                    <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} slotProps={{ list: { 'aria-label': 'Add context' } }}>
                        <MenuItem
                            disabled={!canUpload || uploading}
                            onClick={() => {
                                setMenuAnchor(null);
                                onUpload();
                            }}
                        >
                            <FileText size={17} className="mr-3" />
                            Upload a document
                        </MenuItem>
                        <MenuItem
                            onClick={() => {
                                setMenuAnchor(null);
                                onBrowseLibrary();
                            }}
                        >
                            <FolderOpen size={17} className="mr-3" />
                            Choose from library
                        </MenuItem>
                    </Menu>
                    <span className="atlas-ref-pill atlas-ref-pill-disabled" aria-disabled="true" title="Live web search is not yet available in Atlas">
                        <Globe2 size={16} /> Web
                    </span>
                    <button
                        type="button"
                        className="atlas-ref-pill"
                        aria-pressed={includeDocuments}
                        title={`${readyCount} searchable documents`}
                        onClick={() => onIncludeDocumentsChange(!includeDocuments)}
                    >
                        <FileText size={16} /> Your Docs <span className="opacity-60">{readyCount}</span>
                    </button>
                </>
            }
            trailingActions={
                <>
                    <Tooltip title={voice.supported ? 'Voice input' : 'Voice input is unavailable'}>
                        <span>
                            <IconButton
                                aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                                aria-pressed={voice.listening}
                                disabled={busy || (!voice.supported && !voice.listening)}
                                onClick={() => (voice.listening ? voice.stopListening() : voice.startListening(addTranscript))}
                                size="small"
                            >
                                {voice.listening ? <MicOff size={17} /> : <Mic size={17} />}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <button type="submit" aria-label="Send question" disabled={!canSubmit} className="atlas-ref-primary-button">
                        <span className="flex items-center gap-2">
                            {busy ? <CircularProgress size={18} color="inherit" /> : <Sparkles size={16} />}
                            Research
                        </span>
                    </button>
                </>
            }
            footer={
                <>
                    {(voice.listening || voice.error) && (
                        <Typography variant="caption" role={voice.error ? 'alert' : 'status'} color={voice.error ? 'error' : 'text.secondary'}>
                            {voice.error || 'Listening…'}
                        </Typography>
                    )}
                    {!hasAskSources && (
                        <Typography variant="caption" color="text.secondary">
                            Select a source or add a document to enable research.
                        </Typography>
                    )}
                    {!!sourceLabels.length && (
                        <div className="mt-2 text-[11px] text-[var(--sub)]" aria-label="Active sources">
                            {sourceLabels.join(' · ')}
                        </div>
                    )}
                </>
            }
        />
    );
}
