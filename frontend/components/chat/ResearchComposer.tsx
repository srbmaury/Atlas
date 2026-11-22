'use client';

import { useRef, useState } from 'react';
import { ArrowUp, FileText, FolderOpen, Mic, MicOff, Plus } from 'lucide-react';
import { Alert, Button, Chip, CircularProgress, IconButton, InputBase, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material';
import { useVoiceInput } from '../../hooks/useVoiceInput';

interface ResearchComposerProps {
    query: string;
    mentionAgents?: { id: string; name: string; handle: string }[];
    onChange: (q: string) => void;
    onSubmit: () => void;
    onUpload: () => void;
    onBrowseLibrary: () => void;
    canUpload: boolean;
    uploading: boolean;
    busy: boolean;
    hasAskSources: boolean;
    hasMessages: boolean;
    selectedDocuments: { id: string; name: string }[];
    pendingDocuments: { id: string; name: string; status: string }[];
    onRemoveDocument: (id: string) => void;
    uploadProgress: string;
    uploadResult: string;
    onDismissUploadResult: () => void;
}

export function ResearchComposer({
    query,
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
        <form
            className="composer research-composer-v2"
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) onSubmit();
            }}
        >
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
            {matchingAgents.length > 0 && (
                <Paper variant="outlined" role="listbox" aria-label="Mention an agent" sx={{ p: 1, borderRadius: 2 }}>
                    {matchingAgents.map((agent) => (
                        <Button
                            key={agent.id}
                            size="small"
                            fullWidth
                            role="option"
                            aria-selected={false}
                            onClick={() => {
                                onChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' '));
                                textareaRef.current?.focus();
                            }}
                            sx={{ display: 'flex', justifyContent: 'flex-start' }}
                        >
                            {agent.name} · {agent.handle}
                        </Button>
                    ))}
                </Paper>
            )}
            <div className="research-composer-input-row">
                <Tooltip title="Add documents">
                    <IconButton
                        aria-label="Add context"
                        aria-haspopup="menu"
                        aria-expanded={!!menuAnchor}
                        onClick={(event) => setMenuAnchor(event.currentTarget)}
                        sx={{ flexShrink: 0 }}
                    >
                        <Plus size={19} />
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
                <InputBase
                    multiline
                    minRows={1}
                    maxRows={8}
                    inputRef={textareaRef}
                    placeholder={hasMessages ? 'Ask a follow-up question…' : 'Ask across your sources…'}
                    value={query}
                    onChange={(event) => onChange(event.target.value)}
                    fullWidth
                    disabled={busy}
                    inputProps={{ maxLength: 4000, 'aria-label': 'Your question', 'aria-describedby': 'research-composer-help' }}
                    sx={{
                        minWidth: 0,
                        flex: 1,
                        py: 0,
                        alignSelf: 'center',
                        '& textarea': { fontSize: 14, lineHeight: 1.6, resize: 'none', outline: 'none !important', boxShadow: 'none !important' },
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            if (canSubmit) onSubmit();
                        }
                    }}
                />
                <Tooltip title={voice.supported ? 'Voice input' : 'Voice input is unavailable'}>
                    <span>
                        <IconButton
                            aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                            aria-pressed={voice.listening}
                            disabled={busy || (!voice.supported && !voice.listening)}
                            onClick={() => (voice.listening ? voice.stopListening() : voice.startListening(addTranscript))}
                            sx={{ flexShrink: 0 }}
                        >
                            {voice.listening ? <MicOff size={19} /> : <Mic size={19} />}
                        </IconButton>
                    </span>
                </Tooltip>
                <Button type="submit" aria-label="Send question" disabled={!canSubmit} variant="contained" sx={{ minWidth: 40, height: 40, px: 1, flexShrink: 0, borderRadius: 2.5 }}>
                    {busy ? <CircularProgress size={19} color="inherit" /> : <ArrowUp size={19} />}
                </Button>
            </div>
            {(voice.listening || voice.error) && (
                <Typography variant="caption" role={voice.error ? 'alert' : 'status'} color={voice.error ? 'error' : 'text.secondary'}>
                    {voice.error || 'Listening…'}
                </Typography>
            )}
        </form>
    );
}
