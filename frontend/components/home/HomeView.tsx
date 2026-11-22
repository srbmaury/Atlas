'use client';

import { useRef, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, BookOpenText, ChevronDown, FileText, Globe2, Lightbulb, Menu, MessageSquareText, Mic, MicOff, Paperclip, Search, Sparkles, TrendingUp } from 'lucide-react';
import { Box, Button, Card, CardActionArea, Chip, IconButton, Paper, TextField, Tooltip, Typography } from '@mui/material';
import type { ChatSummary, Doc, Message, Source } from '../../lib/types';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import { ResearchLandscape } from './ResearchLandscape';
import { WorkspaceInsightPanel } from './WorkspaceInsightPanel';

interface HomeViewProps {
    canEdit?: boolean;
    workspaceId: string;
    chatId: string | null;
    messages: Message[];
    query: string;
    mentionAgents?: { id: string; name: string; handle: string }[];
    onQueryChange: (value: string) => void;
    onAsk: () => void;
    hasAskSources: boolean;
    includeDocuments: boolean;
    onIncludeDocumentsChange: (include: boolean) => void;
    sourceLabels: string[];
    busy: boolean;
    chats: ChatSummary[];
    docs: Doc[];
    onOpenNavigation: () => void;
    onChooseSources: () => void;
    onOpenSources: () => void;
    onOpenConversations: () => void;
    onOpenConversation: (id: string) => void;
    onOpenResearch: () => void;
    onStartChat: () => void;
    onOpenDocuments: () => void;
    onInspectDocument: (doc: Doc) => void;
    onOpenSource: (source: Source) => void;
    uploadButton: ReactNode;
    dragging: boolean;
    onDragging: (value: boolean) => void;
    onDrop: (files: FileList) => void;
    maxSizeMB: number;
    uploading: boolean;
    onBrowse: () => void;
    formatSize: (value: number) => string;
}

const tasks = [
    { title: 'Compare countries', description: 'Explore differences with supporting evidence', icon: Globe2, prompt: 'Compare the economic growth and development of ' },
    { title: 'Summarize documents', description: 'Get key insights from your files', icon: FileText, prompt: 'Summarize my documents and identify the key findings about ' },
    { title: 'Analyze a topic', description: 'Trends, causes and impacts with sources', icon: TrendingUp, prompt: 'Analyze the main trends, causes and impacts of ' },
    { title: 'Create a research brief', description: 'A structured, cited overview', icon: Lightbulb, prompt: 'Create a structured research brief with citations about ' },
] as const;

function chatDate(timestamp: number): string {
    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (date.getTime() >= start) return 'Today';
    if (date.getTime() >= start - 86400000) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function HomeView({
    canEdit = true, workspaceId, chatId, messages, query, mentionAgents = [],
    onQueryChange, onAsk, hasAskSources, includeDocuments, onIncludeDocumentsChange,
    sourceLabels, busy, chats, docs, onOpenNavigation, onChooseSources, onOpenSources,
    onOpenConversations, onOpenConversation, onOpenResearch, onStartChat,
    onOpenDocuments, onInspectDocument, onOpenSource, uploadButton, dragging,
    onDragging, onDrop, maxSizeMB, uploading, onBrowse, formatSize,
}: HomeViewProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const voice = useVoiceInput();
    const canSubmit = !busy && !!query.trim() && hasAskSources;
    const mention = /(?:^|\s)@([a-z0-9-]*)$/i.exec(query);
    const matchingAgents = mention
        ? mentionAgents.filter((agent) => agent.handle.slice(1).includes(mention[1].toLowerCase())).slice(0, 6)
        : [];
    const recent = [...chats].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated).slice(0, 5);
    const ready = docs.filter((doc) => doc.status === 'ready').length;

    function useTask(prompt: string) {
        onQueryChange(prompt);
        composerRef.current?.focus();
        composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function addTranscript(transcript: string) {
        onQueryChange(query.trim() ? `${query.trim()} ${transcript}` : transcript);
    }

    return (
        <div className="atlas-reference-dashboard" data-testid="atlas-reference-dashboard">
            <div className="atlas-reference-main">
                <div className="atlas-reference-mobile-top">
                    <IconButton aria-label="Open menu" onClick={onOpenNavigation}><Menu size={20}/></IconButton>
                    <span>Atlas Research</span>
                    <IconButton aria-label="Open library" onClick={onOpenDocuments}><BookOpenText size={19}/></IconButton>
                </div>

                <section className="atlas-reference-hero" aria-labelledby="atlas-reference-title">
                    <ResearchLandscape />
                    <div className="atlas-reference-hero-copy">
                        <div className="atlas-reference-hero-mark"><AtlasMark /></div>
                        <Typography id="atlas-reference-title" component="h1" variant="h3">
                            Your AI Research Workspace
                        </Typography>
                        <Typography component="p">
                            Search your documents and connected sources — get reliable answers with citations.
                        </Typography>
                    </div>
                </section>

                <div className="atlas-reference-main-content">
                    <Paper component="form" elevation={0} variant="outlined" className="atlas-reference-composer"
                        onSubmit={(event) => { event.preventDefault(); if (canSubmit) onAsk(); }}
                    >
                        {matchingAgents.length > 0 && (
                            <Paper variant="outlined" role="listbox" aria-label="Mention an agent" className="atlas-reference-agent-menu">
                                {matchingAgents.map((agent) => (
                                    <Button key={agent.id} fullWidth size="small" role="option" aria-selected={false} sx={{ justifyContent: 'flex-start' }}
                                        onClick={() => { onQueryChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' ')); composerRef.current?.focus(); }}
                                    >{agent.name} · {agent.handle}</Button>
                                ))}
                            </Paper>
                        )}
                        <TextField
                            inputRef={composerRef} variant="standard" label="Ask Atlas" placeholder="Ask a research question…"
                            className="atlas-reference-input" multiline minRows={2} maxRows={7}
                            value={query} onChange={(event) => onQueryChange(event.target.value)}
                            disabled={busy} fullWidth
                            slotProps={{ input: { disableUnderline: true }, htmlInput: { maxLength: 4000 } }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    if (canSubmit) onAsk();
                                }
                            }}
                        />
                        <div className="atlas-reference-composer-bar">
                            <div className="atlas-reference-source-buttons">
                                {canEdit && <Tooltip title={`Upload files (up to ${maxSizeMB} MB)`}>
                                    <span><IconButton size="small" aria-label="Attach document" disabled={uploading} onClick={onBrowse}><Paperclip size={18}/></IconButton></span>
                                </Tooltip>}
                                <Tooltip title="Web search is not available in this workspace">
                                    <span className="atlas-reference-unavailable"><Globe2 size={15}/> Web</span>
                                </Tooltip>
                                <Button size="small" variant={includeDocuments ? 'contained' : 'outlined'} color="inherit"
                                    onClick={() => onIncludeDocumentsChange(!includeDocuments)}
                                    startIcon={<FileText size={16}/>} aria-pressed={includeDocuments}
                                    title={`${ready} searchable documents`}>Your Docs</Button>
                                <Button size="small" variant="outlined" color="inherit" startIcon={<BookOpenText size={16}/>}
                                    endIcon={<ChevronDown size={14}/>} onClick={onOpenSources}>
                                    Connected Sources
                                </Button>
                            </div>
                            <div className="atlas-reference-submit">
                                <span className="atlas-reference-auto"><Sparkles size={15}/> Source-backed</span>
                                <Button type="submit" variant="contained" disabled={!canSubmit} startIcon={<Sparkles size={17}/>}>Research</Button>
                            </div>
                        </div>
                        {!hasAskSources && mentionAgents.length === 0 && (
                            <div className="atlas-reference-empty-scope" role="status">
                                No searchable sources yet. <button type="button" onClick={onChooseSources}>Choose documents</button> or <button type="button" onClick={onOpenSources}>connect a source</button>.
                            </div>
                        )}
                        {voice.error && <Typography color="error" role="alert" variant="caption">{voice.error}</Typography>}
                        {voice.listening && <Typography role="status" variant="caption">Listening…</Typography>}
                    </Paper>

                    <div className="atlas-reference-section-header">
                        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>Try a research task</Typography>
                        <Button size="small" color="inherit" startIcon={voice.listening ? <MicOff size={15}/> : <Mic size={15}/>}
                            disabled={busy || (!voice.supported && !voice.listening)}
                            onClick={() => voice.listening ? voice.stopListening() : voice.startListening(addTranscript)}>
                            {voice.listening ? 'Stop voice' : 'Voice input'}
                        </Button>
                    </div>
                    <div className="atlas-reference-task-grid">
                        {tasks.map(({ title, description, icon: Icon, prompt }) => (
                            <Card variant="outlined" key={title} className="atlas-reference-task">
                                <CardActionArea disabled={busy} onClick={() => useTask(prompt)}>
                                    <div className="atlas-reference-task-content">
                                        <span className="atlas-reference-task-icon"><Icon size={23}/></span>
                                        <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
                                        <Typography variant="body2" color="text.secondary">{description}</Typography>
                                    </div>
                                </CardActionArea>
                            </Card>
                        ))}
                    </div>

                    <section className="atlas-reference-recent" aria-label="Recent research">
                        <div className="atlas-reference-section-header">
                            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>Recent research</Typography>
                            <Button size="small" endIcon={<ArrowRight size={15}/>} onClick={onOpenConversations}>View all</Button>
                        </div>
                        <div className="atlas-reference-recent-list">
                            {recent.map((chat) => (
                                <button type="button" key={chat.id} className="atlas-reference-recent-item" onClick={() => onOpenConversation(chat.id)}>
                                    <MessageSquareText size={17} aria-hidden="true" />
                                    <span className="atlas-reference-recent-title">{chat.title}</span>
                                    {chat.pinned && <span className="atlas-reference-recent-tag">Pinned</span>}
                                    <time dateTime={new Date((chat.updated < 1e12 ? chat.updated * 1000 : chat.updated)).toISOString()}>{chatDate(chat.updated)}</time>
                                    <ArrowUpRight size={15} aria-hidden="true" />
                                </button>
                            ))}
                            {!recent.length && (
                                <div className="atlas-reference-recent-empty">
                                    <Search size={19} aria-hidden="true" />
                                    <span>Your saved research conversations will appear here.</span>
                                    <Button size="small" onClick={onStartChat}>Start exploring</Button>
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="atlas-reference-library-footer">
                        <div><strong>{ready} ready documents</strong><span> · {formatSize(docs.reduce((total, doc) => total + doc.size, 0))} in your library</span></div>
                        <div className="atlas-reference-library-actions">
                            <Button size="small" onClick={onOpenDocuments}>Open library</Button>
                            {canEdit && uploadButton}
                        </div>
                    </div>
                    {canEdit && (
                        <div className={`atlas-reference-dropzone ${dragging ? 'is-dragging' : ''}`}
                            onDragOver={(event) => { event.preventDefault(); onDragging(true); }}
                            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragging(false); }}
                            onDrop={(event) => { event.preventDefault(); onDragging(false); if (!uploading && event.dataTransfer.files.length) onDrop(event.dataTransfer.files); }}
                        >
                            <Typography variant="caption" color="text.secondary">Drop a file here to add it to your workspace.</Typography>
                        </div>
                    )}
                </div>
            </div>

            <WorkspaceInsightPanel
                workspaceId={workspaceId}
                chatId={chatId}
                messages={messages}
                documents={docs}
                onOpenSource={onOpenSource}
                onInspectDocument={onInspectDocument}
                onOpenDocuments={onOpenDocuments}
                onOpenResearch={onOpenResearch}
                onStartChat={onStartChat}
            />
        </div>
    );
}
