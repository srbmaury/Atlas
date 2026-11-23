'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    BookOpenText,
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
    LoaderCircle,
    PanelRightOpen,
    PanelRightClose,
} from 'lucide-react';
import { Button, IconButton, Typography } from '@mui/material';
import type { AgentMention, Answer, ChatSummary, Doc, Source } from '../../lib/types';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { AtlasBrand } from '../ui/AtlasBrand';
import { AgentMentionSuggestions } from '../agents/AgentMentionSuggestions';
import { AtlasReferencePanel } from './AtlasReferencePanel';
import { ResearchQuestionBox } from '../chat/ResearchQuestionBox';

interface HomeViewProps {
    canEdit?: boolean;
    query: string;
    mentionAgents?: AgentMention[];
    onQueryChange: (value: string) => void;
    onAsk: () => void;
    hasAskSources: boolean;
    sourceLabels: string[];
    includeDocuments: boolean;
    onIncludeDocumentsChange: (enabled: boolean) => void;
    busy: boolean;
    chats: ChatSummary[];
    chatsLoading: boolean;
    chatsFailed: boolean;
    workspaceName: string;
    onRefreshChats: () => void;
    docs: Doc[];
    sourcePicker: ReactNode;
    themeButton?: ReactNode;
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
    chatsLoading,
    chatsFailed,
    workspaceName,
    onRefreshChats,
    docs,
    sourcePicker,
    themeButton,
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
    const [insightOpen, setInsightOpen] = useState(true);

    function applyTask(value: string) {
        onQueryChange(value);
        prompt.current?.focus();
    }

    function addTranscript(value: string) {
        onQueryChange(query.trim() ? `${query.trim()} ${value}` : value);
    }

    return (
        <div className={`atlas-ref-grid ${insightOpen ? '' : 'atlas-ref-insight-collapsed'}`}>
            <div className="atlas-ref-canvas">
                <section className="atlas-ref-hero" aria-labelledby="atlas-ref-hero-title">
                    <IconButton
                        className="atlas-ref-insight-toggle"
                        aria-label={insightOpen ? 'Collapse research insights' : 'Expand research insights'}
                        aria-expanded={insightOpen}
                        aria-controls="atlas-reference-insights"
                        onClick={() => setInsightOpen((open) => !open)}
                        size="small"
                        title={insightOpen ? 'Focus on research' : 'Show research insights'}
                    >
                        {insightOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
                    </IconButton>
                    {themeButton && (
                        <div className="atlas-ref-hero-theme" aria-label="Appearance">
                            {themeButton}
                        </div>
                    )}
                    <IconButton className="atlas-ref-mobile-menu" aria-label="Open menu" onClick={onOpenMobileMenu}>
                        <Menu size={21} />
                    </IconButton>
                    <AtlasBrand size={53} />
                    <h1 id="atlas-ref-hero-title">Your AI Research Workspace</h1>
                    <p>
                        Search your documents and connected sources —<br className="hidden sm:block" /> get reliable answers with citations.
                    </p>
                </section>

                <ResearchQuestionBox
                    ariaLabel="Ask a research question"
                    className="atlas-ref-composer"
                    query={query}
                    onQueryChange={onQueryChange}
                    onRequestSubmit={onAsk}
                    canSubmit={canSubmit}
                    busy={busy}
                    inputRef={prompt}
                    inputLabel="Ask a research question"
                    placeholder="Ask a research question..."
                    maxRows={7}
                    sourceSelector={sourcePicker}
                    context={
                        <AgentMentionSuggestions
                            agents={matchingAgents}
                            onSelect={(agent) => {
                                onQueryChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' '));
                                prompt.current?.focus();
                            }}
                        />
                    }
                    leadingActions={
                        <>
                            <button className="atlas-ref-pill" type="button" onClick={onBrowse} disabled={!canEdit || uploading} title="Attach a document">
                                <Paperclip size={16} />
                            </button>
                            <span className="atlas-ref-pill atlas-ref-pill-disabled" aria-disabled="true" title="Live web search is not available yet. To research a webpage, import its URL in Library → Add knowledge.">
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
                        </>
                    }
                    trailingActions={
                        <>
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
                        </>
                    }
                    footer={
                        <>
                            {(voice.listening || voice.error) && (
                                <Typography role={voice.error ? 'alert' : 'status'} variant="caption" color={voice.error ? 'error' : 'text.secondary'}>
                                    {voice.error || 'Listening…'}
                                </Typography>
                            )}
                            {!hasAskSources && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
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
                {answerProgress && (
                    <div className="atlas-ref-progress-inline" role="status" aria-live="polite">
                        <LoaderCircle size={16} className="spin" aria-hidden="true" />
                        <span>{answerProgress}</span>
                        {!insightOpen && (
                            <button type="button" onClick={() => setInsightOpen(true)}>
                                Show details
                            </button>
                        )}
                    </div>
                )}

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
                        <strong id="atlas-ref-recent-heading">
                            Recent research <small className="atlas-ref-workspace-caption">· {workspaceName}</small>
                        </strong>
                        <Button onClick={onOpenConversations} size="small" endIcon={<ArrowRight size={15} />}>
                            View all
                        </Button>
                    </div>
                    <div className="atlas-ref-research-list">
                        {chatsLoading && !chats.length ? (
                            <div className="px-5 py-7 text-sm text-[var(--sub)]" role="status">
                                Loading saved conversations…
                            </div>
                        ) : chatsFailed ? (
                            <div className="px-5 py-7 text-sm text-[var(--sub)]" role="alert">
                                Couldn’t load conversations.{' '}
                                <Button size="small" onClick={onRefreshChats}>
                                    Retry
                                </Button>
                            </div>
                        ) : recent.length ? (
                            recent.map((chat) => (
                                <button key={chat.id} className="atlas-ref-research-row" type="button" onClick={() => onOpenConversation(chat.id)}>
                                    <MessageSquareText size={17} color="#8d91b0" />
                                    <span>{chat.title}</span>
                                    {chat.pinned && <small>Pinned</small>}
                                    <Clock3 size={14} color="#a0a7bf" />
                                </button>
                            ))
                        ) : (
                            <div className="px-5 py-7 text-sm text-[var(--sub)]">
                                No research conversations in {workspaceName} yet.{' '}
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
                            <div className="px-5 py-6 text-sm text-[var(--sub)]">Upload a file to start your knowledge library. {canEdit && uploadButton}</div>
                        )}
                    </div>
                </section>

                {canEdit && (
                    <section
                        className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-4"
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
                        style={{ borderColor: dragging ? 'var(--atlas-ref-accent)' : undefined }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-xs text-[var(--sub)]">Drop research documents here · up to {maxSizeMB} MB per file</span>
                            <Button variant="outlined" size="small" disabled={uploading} startIcon={<Paperclip size={15} />} onClick={onBrowse}>
                                {uploading ? 'Uploading…' : 'Add files'}
                            </Button>
                        </div>
                    </section>
                )}
            </div>
            <AtlasReferencePanel
                answer={latestAnswer}
                question={latestQuestion}
                progress={answerProgress}
                onOpenSource={onOpenSource}
                onPrompt={applyTask}
                onManageSources={onOpenSources}
                onCollapse={() => setInsightOpen(false)}
                hidden={!insightOpen}
            />
        </div>
    );
}
