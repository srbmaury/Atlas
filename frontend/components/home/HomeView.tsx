'use client';
import { type ReactNode, useRef } from 'react';
import { Sparkles, FileText, ArrowUpRight, LoaderCircle, ArrowUp, MessageSquare, ChevronRight, Upload, Mic, MicOff, Globe2, GitCompareArrows, NotebookPen, ShieldCheck, Clock3, FolderOpen } from 'lucide-react';
import type { Doc, ChatSummary } from '../../lib/types';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { FileBadge } from '../ui/WorkspacePrimitives';

interface HomeViewProps {
    canEdit?: boolean;
    query: string;
    mentionAgents?: { id: string; name: string; handle: string }[];
    onQueryChange: (value: string) => void;
    onAsk: () => void;
    hasAskSources: boolean;
    sourceLabels: string[];
    busy: boolean;
    chats: ChatSummary[];
    docs: Doc[];
    onChooseSources: () => void;
    onOpenSources: () => void;
    onOpenConversations: () => void;
    onOpenConversation: (id: string) => void;
    onStartChat: () => void;
    onOpenDocuments: () => void;
    onInspectDocument: (doc: Doc) => void;
    uploadButton: ReactNode;
    dragging: boolean;
    onDragging: (value: boolean) => void;
    onDrop: (files: FileList) => void;
    maxSizeMB: number;
    uploading: boolean;
    onBrowse: () => void;
    formatSize: (value: number) => string;
}

export function HomeView({
    canEdit = true,
    query,
    mentionAgents = [],
    onQueryChange,
    onAsk,
    hasAskSources,
    sourceLabels,
    busy,
    chats,
    docs,
    onChooseSources,
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
}: HomeViewProps) {
    const voice = useVoiceInput();
    const questionInputRef = useRef<HTMLTextAreaElement>(null);
    const mention = /(?:^|\s)@([a-z0-9-]*)$/i.exec(query);
    const matchingAgents = mention ? mentionAgents.filter((agent) => agent.handle.slice(1).includes(mention[1].toLowerCase())).slice(0, 6) : [];
    const selectedAgent = mentionAgents.find((agent) => query.toLowerCase().includes(agent.handle + ' '));

    const readyDocuments = docs.filter((doc) => doc.status === 'ready').length;
    const recentChats = [...chats].sort((a, b) => b.updated - a.updated);
    const recentDocs = [...docs].slice(0, 4);
    const sourceCount = sourceLabels.length;
    const canSubmit = !busy && Boolean(query.trim()) && hasAskSources;

    function addTranscript(transcript: string) {
        onQueryChange(query.trim() ? `${query.trim()} ${transcript}` : transcript);
    }

    return (
        <section className="atlas-home">
            <div className="home-hero home-hero-focused">
                <div className="home-hero-copy">
                    <h1>Research you can trace.</h1>
                    <p>Ask across your documents, the web, and connected sources. Explore answers with evidence you can inspect.</p>
                </div>
            </div>
            <div className="atlas-overview-meta" aria-label="Workspace overview">
                <span><ShieldCheck size={14} aria-hidden="true" /> Evidence-first research</span>
                <span><Clock3 size={14} aria-hidden="true" /> Pick up where you left off</span>
            </div>
            <div className="home-prompt-panel">
                <div className="home-prompt-top">
                    <Sparkles size={17} />
                    <span>Ask Atlas</span>
                    <span className="home-prompt-hint">Search your knowledge</span>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (canSubmit) onAsk();
                    }}
                >
                    {matchingAgents.length > 0 && (
                        <div className="home-agent-mention-menu" role="listbox" aria-label="Mention an agent">
                            <span className="agent-mention-title">AGENT SUGGESTIONS</span>
                            {matchingAgents.map((agent) => (
                                <button type="button" role="option" aria-selected={false} key={agent.id} onClick={() => { onQueryChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' ')); questionInputRef.current?.focus(); }}>
                                    <span className="home-agent-suggestion-icon">
                                        <Sparkles size={16} />
                                    </span>
                                    <span>
                                        <strong>{agent.name}</strong>
                                        <small>{agent.handle}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                    <textarea
                        ref={questionInputRef}
                        aria-label="Ask Atlas"
                        placeholder="Ask a question about your workspace…"
                        value={query}
                        maxLength={4000}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                if (!busy && query.trim() && hasAskSources) onAsk();
                            }
                        }}
                    />
                    <div className="home-prompt-bottom">
                        <div className="home-scope-summary">
                            <FileText size={15} />
                            <span aria-label="Sources included in this question">
                                {selectedAgent
                                    ? `${selectedAgent.name} · Uses agent-configured sources`
                                    : `Selected for search: ${sourceLabels.length ? sourceLabels.join(' · ') : 'No sources selected'}`}
                            </span>
                            <span>·</span>{' '}
                            <button type="button" onClick={onChooseSources}>
                                Choose sources <ArrowUpRight size={13} />
                            </button>
                        </div>
                        <div className="home-composer-actions">
                            <button
                                type="button"
                                className={`voice-input-button ${voice.listening ? 'is-listening' : ''}`}
                                aria-label={voice.listening ? 'Stop voice input' : voice.supported ? 'Start voice input' : 'Voice input not supported in this browser'}
                                aria-pressed={voice.listening}
                                title={voice.supported ? 'Use voice input' : 'Voice input is not supported in this browser'}
                                disabled={busy}
                                onClick={() => (voice.listening ? voice.stopListening() : voice.startListening(addTranscript))}
                            >
                                {voice.listening ? <MicOff size={17} /> : <Mic size={17} />}
                            </button>
                            <button className="home-send" aria-label="Ask Atlas" disabled={!canSubmit}>
                                {busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={18} />}
                            </button>
                        </div>
                    </div>
                    {(voice.listening || voice.error) && (
                        <div className="voice-input-status" role={voice.error ? 'alert' : 'status'}>
                            {voice.error || 'Listening…'}
                        </div>
                    )}
                    <p className="home-source-routing-note">Matching questions can also use a connected Calendar or GitHub automatically.</p>
                </form>
            </div>
            <section className="atlas-workspace-pulse" aria-label="Workspace at a glance">
                <div className="atlas-pulse-item">
                    <span className="atlas-pulse-icon"><MessageSquare size={18} aria-hidden="true" /></span>
                    <span><strong>{chats.length}</strong><small>Research conversations</small></span>
                    <button type="button" onClick={onOpenConversations} aria-label="View research conversations"><ArrowUpRight size={16} /></button>
                </div>
                <div className="atlas-pulse-item">
                    <span className="atlas-pulse-icon"><FileText size={18} aria-hidden="true" /></span>
                    <span><strong>{readyDocuments}<em> / {docs.length}</em></strong><small>Documents ready</small></span>
                    <button type="button" onClick={onOpenDocuments} aria-label="View document library"><ArrowUpRight size={16} /></button>
                </div>
                <div className="atlas-pulse-item">
                    <span className="atlas-pulse-icon"><FolderOpen size={18} aria-hidden="true" /></span>
                    <span><strong>{sourceCount}</strong><small>Search scopes selected</small></span>
                    <button type="button" onClick={onChooseSources} aria-label="Choose search sources"><ArrowUpRight size={16} /></button>
                </div>
            </section>
            <section className="atlas-research-shortcuts" aria-labelledby="research-shortcuts-heading">
                <div className="atlas-shortcuts-heading">
                    <h2 id="research-shortcuts-heading">Start with a research task</h2>
                    <p>Choose a starting point, then refine your question before sending.</p>
                </div>
                <div className="atlas-shortcuts-grid">
                    {([
                        { title: 'Compare perspectives', description: 'Find agreements and disagreements', icon: GitCompareArrows, prompt: 'Compare the key perspectives on ' },
                        { title: 'Summarize documents', description: 'Extract findings with citations', icon: FileText, prompt: 'Summarize the key findings from my documents about ' },
                        { title: 'Explore a topic', description: 'Investigate a question in depth', icon: Globe2, prompt: 'Research the main developments and evidence about ' },
                        { title: 'Draft a research brief', description: 'Build a structured, cited overview', icon: NotebookPen, prompt: 'Create a structured research brief with citations about ' },
                    ] as const).map((task) => (
                        <button type="button" className="atlas-shortcut" key={task.title} disabled={busy} aria-label={`${task.title}: ${task.description}`} onClick={() => {
                            onQueryChange(task.prompt);
                            questionInputRef.current?.focus();
                        }}>
                            <span className="atlas-shortcut-icon"><task.icon size={19} /></span>
                            <strong>{task.title}</strong>
                            <small>{task.description}</small>
                            <ArrowUpRight className="atlas-shortcut-arrow" size={16} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </section>
            <div className="home-section-header">
                <div>
                    <h2>Continue where you left off</h2>
                </div>
                <button className="text-action" onClick={onOpenSources}>
                    Connected sources <ArrowUpRight size={15} />
                </button>
            </div>
            <div className="home-activity-grid">
                <div className="home-activity-card">
                    <div className="home-card-head">
                        <div>
                            <span className="home-card-icon">
                                <MessageSquare size={18} />
                            </span>
                            <h3>Recent conversations</h3>
                        </div>
                        <button aria-label="Open conversations" onClick={onOpenConversations}>
                            <ArrowUpRight size={18} />
                        </button>
                    </div>
                    {recentChats.length ? (
                        <div className="home-activity-list">
                            {recentChats.slice(0, 4).map((item) => (
                                <button key={item.id} onClick={() => onOpenConversation(item.id)}>
                                    <span>
                                        <strong>{item.title}</strong>
                                        <small>{new Date(item.updated < 1e12 ? item.updated * 1000 : item.updated).toLocaleDateString()}</small>
                                    </span>
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="home-card-empty">
                            <p>Every good question starts a conversation.</p>
                            <button onClick={onStartChat}>
                                Start researching <ArrowUpRight size={14} />
                            </button>
                        </div>
                    )}
                </div>
                <div className="home-activity-card">
                    <div className="home-card-head">
                        <div>
                            <span className="home-card-icon">
                                <FileText size={18} />
                            </span>
                            <h3>Recent documents</h3>
                        </div>
                        <button aria-label="Open document library" onClick={onOpenDocuments}>
                            <ArrowUpRight size={18} />
                        </button>
                    </div>
                    {recentDocs.length ? (
                        <div className="home-activity-list">
                            {recentDocs.map((d) => (
                                <button key={d.id} onClick={() => onInspectDocument(d)}>
                                    <FileBadge name={d.name} />
                                    <span>
                                        <strong>{d.name}</strong>
                                        <small>
                                            {formatSize(d.size)} · {d.status === 'ready' ? 'Ready to explore' : d.status}
                                        </small>
                                    </span>
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="home-card-empty">
                            <p>Add a document to start building your knowledge.</p>
                            {uploadButton}
                        </div>
                    )}
                </div>
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
                        if (!uploading && e.dataTransfer.files.length) onDrop(e.dataTransfer.files);
                    }}
                >
                    <span className="home-drop-icon">
                        <Upload size={20} />
                    </span>
                    <div>
                        <strong>Upload documents</strong>
                        <p>Drop PDF, DOCX, TXT, Markdown, CSV, JSON or HTML files. Up to {maxSizeMB} MB each.</p>
                    </div>
                    <button type="button" className="btn" disabled={uploading} onClick={onBrowse}>
                        Choose files
                    </button>
                </div>
            )}
        </section>
    );
}
