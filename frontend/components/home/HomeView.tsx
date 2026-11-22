'use client';

import { useRef, type ReactNode } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    BookOpenText,
    ChevronDown,
    Clock3,
    FileText,
    Globe2,
    Menu,
    MessageSquareText,
    Mic,
    MicOff,
    Paperclip,
    Sparkles,
    TrendingUp,
    Lightbulb,
    SlidersHorizontal,
} from 'lucide-react';
import { Button, IconButton, Paper, TextField, Typography } from '@mui/material';
import type { Answer, ChatSummary, Doc, Source } from '../../lib/types';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { AtlasBrand } from '../ui/AtlasBrand';
import { AtlasReferencePanel } from './AtlasReferencePanel';

interface HomeViewProps {
    canEdit?: boolean;
    query: string;
    mentionAgents?: { id: string; name: string; handle: string }[];
    onQueryChange: (value: string) => void;
    onAsk: () => void;
    hasAskSources: boolean;
    sourceLabels: string[];
    includeDocuments: boolean;
    onIncludeDocumentsChange: (enabled: boolean) => void;
    busy: boolean;
    chats: ChatSummary[];
    docs: Doc[];
    onChooseSources: () => void;
    sourcePicker?: ReactNode;
    onOpenSources: () => void;
    onOpenConversations: () => void;
    onOpenConversation: (id: string) => void;
    onStartChat: () => void;
    onOpenDocuments: () => void;
    onInspectDocument: (doc: Doc) => void;
    uploadButton: ReactNode;
    dragging: boolean;
    onDragging: (dragging: boolean) => void;
    onDrop: (files: FileList) => void;
    maxSizeMB: number;
    uploading: boolean;
    onBrowse: () => void;
    formatSize: (value: number) => string;
    latestAnswer?: Answer;
    latestQuestion?: string;
    answerProgress?: string;
    onOpenSource: (source: Source) => void;
    onOpenMobileMenu: () => void;
}

const tasks = [
    { title: 'Compare countries', description: 'Explore differences with evidence', prompt: 'Compare the key differences between ', icon: Globe2, color: '#5b50ed' },
    { title: 'Summarize documents', description: 'Find insights in your files', prompt: 'Summarize the main findings in my documents about ', icon: FileText, color: '#7596e7' },
    { title: 'Analyze a topic', description: 'Trends, causes and impacts', prompt: 'Analyze the evidence, developments and implications of ', icon: TrendingUp, color: '#a25ce3' },
    { title: 'Create a research brief', description: 'A structured, cited overview', prompt: 'Create a concise research brief with citations about ', icon: Lightbulb, color: '#6955f5' },
] as const;

export function HomeView({
    canEdit = true,
    query,
    mentionAgents = [],
    onQueryChange,
    onAsk,
    hasAskSources,
    sourceLabels,
    includeDocuments,
    onIncludeDocumentsChange,
    busy,
    chats,
    docs,
    onChooseSources,
    sourcePicker,
    onOpenSources,
    onOpenConversations,
    onOpenConversation,
    onStartChat,
    onOpenDocuments,
    onInspectDocument,
    uploadButton,
    dragging,
    onDragging,
    onDrop,
    maxSizeMB,
    uploading,
    onBrowse,
    formatSize,
    latestAnswer,
    latestQuestion,
    answerProgress,
    onOpenSource,
    onOpenMobileMenu,
}: HomeViewProps) {
    const voice = useVoiceInput();
    const prompt = useRef<HTMLTextAreaElement>(null);
    const canSubmit = !busy && Boolean(query.trim()) && hasAskSources;
    const mention = /(?:^|\s)@([a-z0-9-]*)$/i.exec(query);
    const matchingAgents = mention ? mentionAgents.filter((agent) => agent.handle.slice(1).includes(mention[1].toLowerCase())).slice(0, 6) : [];
    const recent = [...chats]
        .filter((chat) => !chat.archived)
        .sort((a, b) => b.updated - a.updated)
        .slice(0, 4);
    const recentDocs = docs.slice(0, 3);
    const readyCount = docs.filter((doc) => doc.status === 'ready').length;

    function applyTask(value: string) {
        onQueryChange(value);
        prompt.current?.focus();
    }

    function addTranscript(value: string) {
        onQueryChange(query.trim() ? `${query.trim()} ${value}` : value);
    }

    return (
        <div className="atlas-ref-grid">
            <div className="atlas-ref-canvas">
                <section className="atlas-ref-hero" aria-labelledby="atlas-ref-hero-title">
                    <IconButton className="atlas-ref-mobile-menu" aria-label="Open menu" onClick={onOpenMobileMenu}>
                        <Menu size={21} />
                    </IconButton>
                    <AtlasBrand size={53} />
                    <h1 id="atlas-ref-hero-title">Your AI Research Workspace</h1>
                    <p>
                        Search your documents and connected sources —<br className="hidden sm:block" /> get reliable answers with citations.
                    </p>
                </section>

                <Paper component="section" elevation={0} className="atlas-ref-composer" aria-label="Ask a research question">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (canSubmit) onAsk();
                        }}
                    >
                        {matchingAgents.length > 0 && (
                            <Paper variant="outlined" role="listbox" aria-label="Mention an agent" sx={{ p: 1, mb: 1, borderRadius: 2 }}>
                                {matchingAgents.map((agent) => (
                                    <Button
                                        key={agent.id}
                                        fullWidth
                                        size="small"
                                        role="option"
                                        aria-selected={false}
                                        sx={{ justifyContent: 'flex-start' }}
                                        onClick={() => {
                                            onQueryChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' '));
                                            prompt.current?.focus();
                                        }}
                                    >
                                        {agent.name} · {agent.handle}
                                    </Button>
                                ))}
                            </Paper>
                        )}
                        <TextField
                            inputRef={prompt}
                            variant="standard"
                            label="Ask a research question"
                            placeholder="Ask a research question..."
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    if (canSubmit) onAsk();
                                }
                            }}
                            multiline
                            minRows={2}
                            maxRows={7}
                            fullWidth
                            disabled={busy}
                            slotProps={{ input: { disableUnderline: true }, htmlInput: { maxLength: 4000 } }}
                            sx={{ '& .MuiInputBase-root': { alignItems: 'flex-start' }, '& textarea': { fontSize: 15, lineHeight: 1.65 } }}
                        />
                        <div className="atlas-ref-composer-bottom">
                            <div className="atlas-ref-pills">
                                <button className="atlas-ref-pill" type="button" onClick={onBrowse} disabled={!canEdit || uploading} title="Attach a document">
                                    <Paperclip size={16} />
                                </button>
                                <span className="atlas-ref-pill atlas-ref-pill-disabled" aria-disabled="true" title="Live web search is not yet available in Atlas">
                                    <Globe2 size={16} /> Web
                                </span>
                                <button
                                    className="atlas-ref-pill"
                                    type="button"
                                    aria-pressed={includeDocuments}
                                    title={`${readyCount} searchable documents`}
                                    onClick={() => onIncludeDocumentsChange(!includeDocuments)}
                                >
                                    <FileText size={16} /> Your Docs <span className="opacity-60">{readyCount}</span>
                                </button>
                                {sourcePicker || (
                                    <button className="atlas-ref-pill" type="button" onClick={onChooseSources}>
                                        <SlidersHorizontal size={16} /> Connected Sources <ChevronDown size={13} />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500" title="Atlas uses your chosen sources">
                                    Auto
                                </span>
                                <IconButton
                                    aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                                    disabled={busy || (!voice.supported && !voice.listening)}
                                    aria-pressed={voice.listening}
                                    onClick={() => (voice.listening ? voice.stopListening() : voice.startListening(addTranscript))}
                                    size="small"
                                >
                                    {voice.listening ? <MicOff size={17} /> : <Mic size={17} />}
                                </IconButton>
                                <button className="atlas-ref-primary-button" type="submit" disabled={!canSubmit}>
                                    <span className="flex items-center gap-2">
                                        <Sparkles size={16} /> Research
                                    </span>
                                </button>
                            </div>
                        </div>
                        {voice.listening || voice.error ? (
                            <Typography role={voice.error ? 'alert' : 'status'} variant="caption" color={voice.error ? 'error' : 'text.secondary'}>
                                {voice.error || 'Listening…'}
                            </Typography>
                        ) : null}
                        {!hasAskSources && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Select a source or add a document to enable research.
                            </Typography>
                        )}
                        {!!sourceLabels.length && (
                            <div className="mt-2 text-[11px] text-slate-500" aria-label="Active sources">
                                {sourceLabels.join(' · ')}
                            </div>
                        )}
                    </form>
                </Paper>

                <section aria-labelledby="atlas-ref-tasks-heading">
                    <div className="atlas-ref-section-heading">
                        <strong id="atlas-ref-tasks-heading">Try a research task</strong>
                    </div>
                    <div className="atlas-ref-task-grid">
                        {tasks.map(({ title, description, prompt: starter, icon: Icon, color }) => (
                            <button className="atlas-ref-task" type="button" key={title} onClick={() => applyTask(starter)} disabled={busy}>
                                <Icon size={24} color={color} aria-hidden="true" />
                                <strong>{title}</strong>
                                <small>{description}</small>
                            </button>
                        ))}
                    </div>
                </section>

                <section aria-labelledby="atlas-ref-recent-heading">
                    <div className="atlas-ref-section-heading">
                        <strong id="atlas-ref-recent-heading">Recent research</strong>
                        <Button onClick={onOpenConversations} size="small" endIcon={<ArrowRight size={15} />}>
                            View all
                        </Button>
                    </div>
                    <div className="atlas-ref-research-list">
                        {recent.length ? (
                            recent.map((chat) => (
                                <button key={chat.id} className="atlas-ref-research-row" type="button" onClick={() => onOpenConversation(chat.id)}>
                                    <MessageSquareText size={17} color="#8d91b0" />
                                    <span>{chat.title}</span>
                                    {chat.pinned && <small>Pinned</small>}
                                    <Clock3 size={14} color="#a0a7bf" />
                                </button>
                            ))
                        ) : (
                            <div className="px-5 py-7 text-sm text-slate-500">
                                No research conversations yet.{' '}
                                <Button size="small" onClick={onStartChat}>
                                    Start a conversation
                                </Button>
                            </div>
                        )}
                    </div>
                </section>

                <section className="mt-8" aria-label="Recent library documents">
                    <div className="atlas-ref-section-heading">
                        <strong>Recent documents</strong>
                        <Button size="small" onClick={onOpenDocuments} endIcon={<ArrowUpRight size={15} />}>
                            Open library
                        </Button>
                    </div>
                    <div className="atlas-ref-research-list">
                        {recentDocs.length ? (
                            recentDocs.map((doc) => (
                                <button className="atlas-ref-research-row" key={doc.id} onClick={() => onInspectDocument(doc)}>
                                    <FileText size={16} color="#8d91b0" />
                                    <span>{doc.name}</span>
                                    <small>{formatSize(doc.size)}</small>
                                </button>
                            ))
                        ) : (
                            <div className="px-5 py-6 text-sm text-slate-500">Upload a file to start your knowledge library. {canEdit && uploadButton}</div>
                        )}
                    </div>
                </section>

                {canEdit && (
                    <section
                        className="mt-6 rounded-xl border border-dashed border-[#d9dcf0] bg-white p-4"
                        aria-label="Drop documents to upload"
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
                            if (!uploading && event.dataTransfer.files.length) onDrop(event.dataTransfer.files);
                        }}
                        style={{ borderColor: dragging ? '#6551f5' : undefined }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-xs text-slate-500">Drop research documents here · up to {maxSizeMB} MB per file</span>
                            <Button variant="outlined" size="small" disabled={uploading} startIcon={<Paperclip size={15} />} onClick={onBrowse}>
                                {uploading ? 'Uploading…' : 'Add files'}
                            </Button>
                        </div>
                    </section>
                )}
            </div>
            <AtlasReferencePanel answer={latestAnswer} question={latestQuestion} progress={answerProgress} onOpenSource={onOpenSource} onPrompt={applyTask} onManageSources={onOpenSources} />
        </div>
    );
}
