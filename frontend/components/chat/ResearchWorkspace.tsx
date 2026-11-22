'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Typography } from '@mui/material';
import { createPortal, flushSync } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import {
    Check,
    ChevronDown,
    CircleHelp,
    Copy,
    FileText,
    MessageSquare,
    Plus,
    ArrowUpRight,
    BookOpen,
    Search,
    X,
    Activity,
    PanelRightClose,
    PanelRightOpen,
    ChevronUp,
    Menu,
    Ellipsis,
} from 'lucide-react';
import type { Answer, ChatSummary, ConnectedSourceStatus, GmailStatus, Message, ResearchProvider, Source } from '../../lib/types';
import type { DriveConnectionStatus } from '../../lib/types';
import { PROVIDER_LABELS, RESEARCH_PROVIDERS } from '../../lib/providers';
import { visibleEvidence, sourceDisplayName, sourceLocation, evidencePreview } from '../../lib/evidence';
import { prompts } from '../../utils/utils';
import { conversationExportName, conversationMarkdown, downloadConversationMarkdown } from '../../lib/conversationExport';
import { ConversationHistory } from './ConversationHistory';
import { ConversationTranscript } from './ConversationTranscript';
import { ResearchComposer } from './ResearchComposer';
import { ResearchSourceSelector } from './ResearchSourceSelector';

type Setter<T> = Dispatch<SetStateAction<T>>;

interface ResearchWorkspaceProps {
    workspaceId: string;
    openingChat?: boolean;
    mentionAgents?: { id: string; name: string; handle: string }[];
    searchTarget?: { chatId: string; index: number; phrase: string; token: number } | null;
    title: string;
    onOpenNavigation: () => void;
    onOpenGlobalSearch: () => void;
    onOpenSource: (source: Source) => void;
    userMode: string;
    readyCount: number;
    includeDocuments: boolean;
    setIncludeDocuments: Setter<boolean>;
    gmailStatus: GmailStatus | null;
    connectedGmail: boolean;
    setConnectedGmail: Setter<boolean>;
    connectedGmailQuery: string;
    setConnectedGmailQuery: Setter<string>;
    driveStatus: DriveConnectionStatus | null;
    sourceLoadFailed?: boolean;
    onRetrySources: () => void;
    sourceStatuses: ConnectedSourceStatus[];
    connectedProviders: ResearchProvider[];
    setConnectedProviders: Setter<ResearchProvider[]>;
    selectedCount: number;
    onOpenScope: () => void;
    onManageSources: () => void;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onCloseHistory: () => void;
    copied: boolean;
    canCopy: boolean;
    onCopy: () => void;
    busy: boolean;
    onNewChat: () => void;
    chats: ChatSummary[];
    chatId: string | null;
    onRefreshChats: () => void;
    onOpenChat: (id: string) => Promise<boolean>;
    onRenameChat: (chat: ChatSummary) => void;
    onDeleteChat: (chat: ChatSummary) => void;
    onDeleteChats: (chats: ChatSummary[]) => void;
    messages: Message[];
    uploadButton: ReactNode;
    onAsk: (question?: string) => void;
    initials: string;
    renderAnswer: (answer: Answer, onPrompt: (prompt: string) => void) => ReactNode;
    answerProgress: string;
    onStop: () => void;
    threadRef: RefObject<HTMLDivElement | null>;
    endRef: RefObject<HTMLDivElement | null>;
    query: string;
    setQuery: Setter<string>;
    onUpload: () => void;
    onBrowseLibrary: () => void;
    canUpload: boolean;
    selectedDocuments: { id: string; name: string }[];
    pendingDocuments: { id: string; name: string; status: string }[];
    onRemoveDocument: (id: string) => void;
    uploadProgress: string;
    uploadResult: string;
    onDismissUploadResult: () => void;
    uploading: boolean;
    hasAskSources: boolean;
}

export function ResearchWorkspace(props: ResearchWorkspaceProps) {
    const mobileActions = useRef<HTMLDetailsElement>(null);
    const [mobilePanel, setMobilePanel] = useState<'find' | null>(null);
    function chooseMobileAction(action: () => void) {
        if (mobileActions.current) mobileActions.current.open = false;
        action();
    }
    const historyClose = useRef<HTMLButtonElement>(null);
    const desktopExport = useRef<HTMLDetailsElement>(null);
    const [printMarkdown, setPrintMarkdown] = useState<string | null>(null);
    useEffect(() => {
        if (props.historyOpen && historyClose.current?.getClientRects().length) historyClose.current.focus();
    }, [props.historyOpen]);

    function closeMobileHistory() {
        if (!historyClose.current?.getClientRects().length) return;
        props.onCloseHistory();
        window.requestAnimationFrame(() => mobileActions.current?.querySelector('summary')?.focus());
    }

    useEffect(() => {
        if (printMarkdown === null) return;
        const clearPrint = () => setPrintMarkdown(null);
        window.addEventListener('afterprint', clearPrint);
        return () => window.removeEventListener('afterprint', clearPrint);
    }, [printMarkdown]);

    function exportConversation(format: 'pdf' | 'md') {
        if (!props.canCopy || props.busy) return;
        if (mobileActions.current) mobileActions.current.open = false;
        if (desktopExport.current) desktopExport.current.open = false;
        const markdown = conversationMarkdown(props.title, props.messages);
        const filename = conversationExportName(props.title);
        if (format === 'md') {
            downloadConversationMarkdown(filename, markdown);
            return;
        }
        flushSync(() => setPrintMarkdown(markdown));
        window.print();
    }

    const exportActions = (
        <>
            <button type="button" disabled={!props.canCopy || props.busy} onClick={() => exportConversation('md')}>
                Export Markdown (.md)
            </button>
            <button type="button" disabled={!props.canCopy || props.busy} onClick={() => exportConversation('pdf')}>
                Export as PDF
            </button>
        </>
    );

    const [messageSearch, setMessageSearch] = useState('');
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [evidenceHidden, setEvidenceHidden] = useState(false);
    function focusMatch(index: number) {
        setFocusedIndex(index);
        const node = props.threadRef.current?.querySelector<HTMLElement>(`[data-message-index="${index}"]`);
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    useEffect(() => {
        setFocusedIndex(null);
        setMessageSearch('');
        setMobilePanel(null);
    }, [props.chatId]);
    useEffect(() => {
        if (!props.searchTarget || props.chatId !== props.searchTarget.chatId) return;
        setMobilePanel('find');
        const target = props.searchTarget;
        if (!props.messages[target.index] || !props.messages[target.index].content.toLocaleLowerCase().includes(target.phrase.toLocaleLowerCase())) return;
        setMessageSearch(target.phrase);
        setFocusedIndex(target.index);
        const frame = window.requestAnimationFrame(() => {
            props.threadRef.current?.querySelector<HTMLElement>(`[data-message-index="${target.index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [props.searchTarget?.token, props.chatId, props.messages]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    function moveMatch(direction: -1 | 1) {
        if (!matches.length) return;
        const position = matches.findIndex(({ index }) => index === focusedIndex);
        const next = position < 0 ? (direction === 1 ? 0 : matches.length - 1) : (position + direction + matches.length) % matches.length;
        focusMatch(matches[next].index);
    }
    const [evidenceWidth, setEvidenceWidth] = useState(300);
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem('atlas:evidence-width'));
            if (saved >= 260 && saved <= 760) setEvidenceWidth(saved);
        } catch {
            /* Storage may be unavailable. */
        }
    }, []);
    function resizeEvidence(next: number) {
        const width = Math.max(260, Math.min(760, next));
        setEvidenceWidth(width);
        try {
            localStorage.setItem('atlas:evidence-width', String(width));
        } catch {
            /* Ignore storage failure. */
        }
    }
    useEffect(() => {
        function onShortcut(event: KeyboardEvent) {
            if (historyClose.current?.getClientRects().length) return;
            const target = event.target as HTMLElement | null;
            const editing = target?.matches('input, textarea, [contenteditable="true"]');
            if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                document.querySelector<HTMLTextAreaElement>('.chat-pane .composer textarea')?.focus();
            }
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        }
        window.addEventListener('keydown', onShortcut);
        return () => window.removeEventListener('keydown', onShortcut);
    }, []);
    const matches = messageSearch.trim()
        ? props.messages.map((message, index) => ({ message, index })).filter(({ message }) => message.content.toLocaleLowerCase().includes(messageSearch.trim().toLocaleLowerCase()))
        : [];
    const latestAnswer = [...props.messages].reverse().find((message) => message.role !== 'user' && message.result)?.result;
    const evidence = visibleEvidence(latestAnswer);
    const evidenceOpen = evidence.length > 0 && !evidenceHidden;
    const allSelected =
        props.includeDocuments &&
        (!props.gmailStatus?.connected || props.connectedGmail) &&
        [...(props.driveStatus?.connected ? ['drive' as const] : []), ...props.sourceStatuses.filter((item) => item.connected).map((item) => item.provider)].every((provider) =>
            props.connectedProviders.includes(provider),
        );

    return (
        <section className="research-page" data-mobile-panel={mobilePanel}>
            {printMarkdown !== null &&
                createPortal(
                    <article className="conversation-print" aria-label="Conversation export">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{printMarkdown}</ReactMarkdown>
                    </article>,
                    document.body,
                )}
            <header className="focus-chat-header border-b border-[var(--line)] bg-[var(--panel)]">
                <button type="button" className="icon-button" aria-label="Open menu" onClick={props.onOpenNavigation}>
                    <Menu />
                </button>
                <div className="focus-chat-title">
                    <Typography component="h1" variant="subtitle1" sx={{ fontWeight: 800 }} title={props.title}>
                        {props.title}
                    </Typography>
                    <Chip label="Research" variant="outlined" color="primary" size="small" />
                </div>
                <details
                    ref={mobileActions}
                    className="focus-chat-actions"
                    onKeyDown={(event) => {
                        if (event.key !== 'Escape' || !event.currentTarget.open) return;
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector('summary')?.focus();
                    }}
                >
                    <summary className="icon-button" aria-label="More chat actions">
                        <Ellipsis />
                    </summary>
                    <div className="focus-chat-menu">
                        <button type="button" disabled={!props.messages.length} onClick={() => chooseMobileAction(() => setMobilePanel((panel) => (panel === 'find' ? null : 'find')))}>
                            Find in conversation
                        </button>
                        <button type="button" onClick={() => chooseMobileAction(props.onToggleHistory)}>
                            {props.historyOpen ? 'Hide history' : 'History'}
                        </button>
                        <button type="button" onClick={() => chooseMobileAction(props.onOpenGlobalSearch)}>
                            Search workspace
                        </button>
                        <button type="button" disabled={!props.canCopy} onClick={() => chooseMobileAction(props.onCopy)}>
                            {props.copied ? 'Copied' : 'Copy chat'}
                        </button>
                        {exportActions}
                        <button type="button" disabled={props.busy} onClick={() => chooseMobileAction(props.onNewChat)}>
                            New chat
                        </button>
                    </div>
                </details>
            </header>
            <div className="crumb">
                Ask Atlas<span>›</span>
                <span className="crumb-title">{props.title}</span>
            </div>
            <div className="heading-row">
                <div className="research-heading">
                    <Typography component="h1" variant="h5" title={props.title} sx={{ fontWeight: 800, lineHeight: 1.3 }}>
                        {props.title}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                        Answers grounded in your knowledge, with citations you can verify.
                    </Typography>
                </div>
                <div className="actions">
                    <Button size="small" variant="outlined" startIcon={<MessageSquare size={15} />} onClick={props.onToggleHistory}>
                        {props.historyOpen ? 'Hide history' : 'History'}
                    </Button>
                    <Button size="small" variant="outlined" className="hide-small" startIcon={props.copied ? <Check size={16} /> : <Copy size={16} />} disabled={!props.canCopy} onClick={props.onCopy}>
                        {props.copied ? 'Copied' : 'Copy chat'}
                    </Button>
                    <details ref={desktopExport} className="conversation-export">
                        <summary className="btn">Export</summary>
                        <div className="focus-chat-menu">{exportActions}</div>
                    </details>
                    <Button size="small" variant="contained" startIcon={<Plus size={17} />} aria-label="New chat" disabled={props.busy} onClick={props.onNewChat}>
                        New chat
                    </Button>
                </div>
            </div>
            {props.userMode !== 'ai' && (
                <div className="feedback" role="status">
                    <CircleHelp />
                    <span>
                        <strong>Source search only.</strong> Atlas can find relevant passages, but it cannot write synthesized answers until an AI provider is configured. Set{' '}
                        <code>AI_PROVIDER=openai</code> with <code>OPENAI_API_KEY</code>, or use <code>AI_PROVIDER=ollama</code>, then restart the API.
                    </span>
                </div>
            )}
            <div className={`chat-workspace ${props.historyOpen ? 'history-visible' : ''}`}>
                <ConversationHistory
                    workspaceId={props.workspaceId}
                    chats={props.chats}
                    chatId={props.chatId}
                    busy={props.busy}
                    onRefresh={props.onRefreshChats}
                    onClose={closeMobileHistory}
                    closeRef={historyClose}
                    onNewChat={() => {
                        closeMobileHistory();
                        props.onNewChat();
                    }}
                    onOpenChat={async (id) => {
                        if (await props.onOpenChat(id)) closeMobileHistory();
                    }}
                    onRenameChat={props.onRenameChat}
                    onDeleteChat={props.onDeleteChat}
                    onDeleteChats={props.onDeleteChats}
                />
                <div className={`research ${evidenceOpen ? '' : 'evidence-collapsed'}`} style={{ ['--atlas-evidence-width' as string]: evidenceWidth + 'px' }}>
                    <div className="chat-pane">
                        {props.messages.length > 0 && (
                            <div className="message-search-panel">
                                <label className="message-search-input">
                                    <Search size={15} aria-hidden="true" />
                                    <input
                                        ref={searchInputRef}
                                        aria-label="Search messages in this conversation"
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                moveMatch(event.shiftKey ? -1 : 1);
                                            }
                                            if (event.key === 'Escape') {
                                                setMessageSearch('');
                                                setFocusedIndex(null);
                                                event.currentTarget.blur();
                                            }
                                        }}
                                        placeholder="Find in this conversation"
                                        value={messageSearch}
                                        onChange={(event) => {
                                            setMessageSearch(event.target.value);
                                            setFocusedIndex(null);
                                        }}
                                    />
                                </label>
                                {messageSearch && (
                                    <button
                                        type="button"
                                        aria-label="Clear message search"
                                        onClick={() => {
                                            setMessageSearch('');
                                            setFocusedIndex(null);
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                {messageSearch.trim() && (
                                    <div className="message-search-navigation" role="status" aria-live="polite">
                                        <span>
                                            {matches.length
                                                ? `${
                                                      Math.max(
                                                          0,
                                                          matches.findIndex(({ index }) => index === focusedIndex),
                                                      ) + 1
                                                  } of ${matches.length}`
                                                : 'No matches'}
                                        </span>
                                        <button type="button" aria-label="Previous match" disabled={!matches.length} onClick={() => moveMatch(-1)}>
                                            <ChevronUp size={15} />
                                        </button>
                                        <button type="button" aria-label="Next match" disabled={!matches.length} onClick={() => moveMatch(1)}>
                                            <ChevronDown size={15} />
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="evidence-toggle-inline"
                                    hidden={!evidence.length}
                                    aria-expanded={evidenceOpen}
                                    aria-controls="atlas-evidence-panel"
                                    onClick={() => setEvidenceHidden((hidden) => !hidden)}
                                    title={evidenceOpen ? 'Hide evidence' : 'Show evidence'}
                                >
                                    {evidenceOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                                    <span>{evidenceOpen ? 'Hide evidence' : 'Evidence'}</span>
                                </button>
                            </div>
                        )}
                        <ConversationTranscript
                            openingChat={props.openingChat}
                            searchPhrase={messageSearch}
                            focusedIndex={focusedIndex}
                            messages={props.messages}
                            busy={props.busy}
                            readyCount={props.readyCount}
                            uploadButton={props.uploadButton}
                            prompts={prompts}
                            onPrompt={props.onAsk}
                            initials={props.initials}
                            railAnswer={evidenceOpen ? latestAnswer : undefined}
                            renderAnswer={props.renderAnswer}
                            answerProgress={props.answerProgress}
                            onStop={props.onStop}
                            threadRef={props.threadRef}
                            endRef={props.endRef}
                        />
                        {!!props.messages.length && (
                            <div className="prompt-row">
                                {['What are the key risks?', 'What should be built first?', 'Summarize the next steps'].map((prompt) => (
                                    <button key={prompt} disabled={props.busy || !props.hasAskSources} onClick={() => props.onAsk(prompt)}>
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        )}
                        {props.connectedGmail && (
                            <div className="unified-gmail-scope">
                                <label>
                                    Gmail search scope{' '}
                                    <input aria-label="Gmail search scope" value={props.connectedGmailQuery} onChange={(event) => props.setConnectedGmailQuery(event.target.value)} />
                                </label>
                            </div>
                        )}
                        <ResearchComposer
                            sourceSelector={
                                <ResearchSourceSelector
                                includeDocuments={props.includeDocuments}
                                onIncludeDocuments={props.setIncludeDocuments}
                                gmailStatus={props.gmailStatus}
                                connectedGmail={props.connectedGmail}
                                onIncludeGmail={props.setConnectedGmail}
                                driveStatus={props.driveStatus}
                                sourceStatuses={props.sourceStatuses}
                                connectedProviders={props.connectedProviders}
                                onSelectAll={(select) => {
                                    props.setIncludeDocuments(select);
                                    props.setConnectedGmail(select && !!props.gmailStatus?.connected);
                                    props.setConnectedProviders(
                                        select
                                            ? RESEARCH_PROVIDERS.filter((provider) =>
                                                  provider === 'drive' ? props.driveStatus?.connected : props.sourceStatuses.some((item) => item.provider === provider && item.connected),
                                              )
                                            : [],
                                    );
                                }}
                                onToggleProvider={(provider, enabled) => props.setConnectedProviders((old) => (enabled ? [...new Set([...old, provider])] : old.filter((item) => item !== provider)))}
                                onManage={props.onManageSources}
                                onBrowseDocuments={props.onBrowseLibrary}
                                selectedCount={props.selectedCount}
                                sourceLoadFailed={props.sourceLoadFailed}
                                onRetrySources={props.onRetrySources}
                            />
                            }
                            mentionAgents={props.mentionAgents}
                            query={props.query}
                            onChange={props.setQuery}
                            onSubmit={() => props.onAsk()}
                            onUpload={props.onUpload}
                            onBrowseLibrary={props.onBrowseLibrary}
                            canUpload={props.canUpload}
                            selectedDocuments={props.selectedDocuments}
                            pendingDocuments={props.pendingDocuments}
                            onRemoveDocument={props.onRemoveDocument}
                            uploadProgress={props.uploadProgress}
                            uploadResult={props.uploadResult}
                            onDismissUploadResult={props.onDismissUploadResult}
                            uploading={props.uploading}
                            busy={props.busy}
                            hasAskSources={props.hasAskSources}
                            hasMessages={!!props.messages.length}
                        />
                        <p id="research-composer-help" className="caption composer-caption">
                            {props.messages.length ? 'Follow-ups use this conversation’s context. ' : ''}Review supporting passages before relying on an answer.
                        </p>
                    </div>
                    <aside id="atlas-evidence-panel" className="research-evidence-rail" aria-label="Supporting evidence" hidden={!evidenceOpen}>
                        <div className="evidence-width-controls" aria-label="Evidence panel width">
                            <button type="button" aria-label="Narrow evidence panel" onClick={() => resizeEvidence(evidenceWidth - 80)}>
                                −
                            </button>
                            <span>{evidenceWidth}px</span>
                            <button type="button" aria-label="Widen evidence panel" onClick={() => resizeEvidence(evidenceWidth + 80)}>
                                +
                            </button>
                            <button type="button" onClick={() => resizeEvidence(300)}>
                                Reset
                            </button>
                        </div>
                        {latestAnswer?.retrieval && (
                            <details className="investigation-timeline">
                                <summary>
                                    <Activity size={15} /> Investigation timeline
                                </summary>
                                <ol>
                                    <li>
                                        <strong>Research requested</strong>
                                        <span>Atlas searched the selected sources.</span>
                                    </li>
                                    {latestAnswer.retrieval.sources.map((step, index) => (
                                        <li key={index}>
                                            <strong>{PROVIDER_LABELS[step.provider as keyof typeof PROVIDER_LABELS] || step.provider}</strong>
                                            <span>
                                                {step.status === 'failed'
                                                    ? 'Search failed'
                                                    : step.status === 'partial'
                                                      ? 'Partial search · ' + step.found + ' matches'
                                                      : step.found
                                                        ? 'Searched · ' + step.found + ' matches'
                                                        : 'No matches'}
                                            </span>
                                        </li>
                                    ))}
                                    <li>
                                        <strong>Answer prepared</strong>
                                        <span>
                                            {latestAnswer.retrieval.passages_considered} passages considered; {latestAnswer.retrieval.passages_used} used.
                                        </span>
                                    </li>
                                    {latestAnswer.citation_audit && (
                                        <li>
                                            <strong>Citation audit</strong>
                                            <span>{latestAnswer.citation_audit.needs_review} claims flagged for review.</span>
                                        </li>
                                    )}
                                </ol>
                                <p className="caption">Recorded retrieval summary, not a live trace of internal model reasoning.</p>
                            </details>
                        )}

                        <div className="research-rail-heading">
                            <BookOpen size={17} />
                            <div>
                                <strong>Evidence</strong>
                                <span>{evidence.length ? `${evidence.length} cited passages` : 'Source references'}</span>
                            </div>
                        </div>
                        {evidence.length ? (
                            <div className="research-rail-list">
                                {Array.from(new Set(evidence.map(({ source }) => sourceDisplayName(source)))).map((name) => {
                                    const passages = evidence.filter(({ source }) => sourceDisplayName(source) === name);
                                    return (
                                        <div className="research-evidence-group" key={name}>
                                            <div className="research-evidence-group-title">
                                                <FileText size={15} />
                                                <strong title={name}>{name}</strong>
                                                <small>
                                                    {passages.length} {passages.length === 1 ? 'passage' : 'passages'}
                                                </small>
                                            </div>
                                            {passages.map(({ source, number }) => (
                                                <button type="button" className="research-rail-item" key={`${number}-${source.chunk_id}`} onClick={() => props.onOpenSource(source)}>
                                                    <span className="research-rail-number">{number}</span>
                                                    <span className="research-rail-copy">
                                                        <small>{sourceLocation(source, number)}</small>
                                                        <span>{evidencePreview(source.text, latestAnswer?.answer, number) || 'Open supporting passage'}</span>
                                                    </span>
                                                    <ArrowUpRight size={14} />
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="research-rail-empty">
                                <p>No evidence yet</p>
                                <span>Cited passages will appear here when Atlas answers a question.</span>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </section>
    );
}
