'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { Check, ChevronDown, CircleHelp, Copy, FileText, MessageSquare, Plus, ArrowUpRight, BookOpen, Search, X, Activity, PanelRightClose, PanelRightOpen, ChevronUp } from 'lucide-react';
import type { Answer, ChatSummary, ConnectedSourceStatus, GmailStatus, Message, ResearchProvider, Source } from '../../lib/types';
import type { DriveConnectionStatus } from '../../lib/types';
import { PROVIDER_LABELS, RESEARCH_PROVIDERS } from '../../lib/providers';
import { visibleEvidence, sourceDisplayName, sourceLocation } from '../../lib/evidence';
import { prompts } from '../../utils/utils';
import { ConversationHistory } from './ConversationHistory';
import { ConversationTranscript } from './ConversationTranscript';
import { ResearchComposer } from './ResearchComposer';
import { ResearchSourceSelector } from './ResearchSourceSelector';

type Setter<T> = Dispatch<SetStateAction<T>>;

interface ResearchWorkspaceProps {
    workspaceId: string;
    searchTarget?: { chatId: string; index: number; phrase: string; token: number } | null;
    title: string;
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
    sourceStatuses: ConnectedSourceStatus[];
    connectedProviders: ResearchProvider[];
    setConnectedProviders: Setter<ResearchProvider[]>;
    selectedCount: number;
    onOpenScope: () => void;
    onManageSources: () => void;
    historyOpen: boolean;
    onToggleHistory: () => void;
    copied: boolean;
    canCopy: boolean;
    onCopy: () => void;
    busy: boolean;
    onNewChat: () => void;
    chats: ChatSummary[];
    chatId: string | null;
    onRefreshChats: () => void;
    onOpenChat: (id: string) => void;
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
    const [messageSearch, setMessageSearch] = useState('');
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [evidenceOpen, setEvidenceOpen] = useState(true);
    function focusMatch(index: number) {
        setFocusedIndex(index);
        const node = props.threadRef.current?.querySelector<HTMLElement>(`[data-message-index="${index}"]`);
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    useEffect(() => {
        if (!props.searchTarget || props.chatId !== props.searchTarget.chatId) return;
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
    useEffect(() => {
        setFocusedIndex(null);
        setMessageSearch('');
    }, [props.chatId]);
    const [evidenceWidth, setEvidenceWidth] = useState(340);
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
    const evidence = latestAnswer ? visibleEvidence(latestAnswer) : [];
    const allSelected =
        props.includeDocuments &&
        (!props.gmailStatus?.connected || props.connectedGmail) &&
        [...(props.driveStatus?.connected ? ['drive' as const] : []), ...props.sourceStatuses.filter((item) => item.connected).map((item) => item.provider)].every((provider) =>
            props.connectedProviders.includes(provider),
        );

    return (
        <section>
            <div className="crumb">
                Ask Atlas<span>›</span>
                <span className="crumb-title">{props.title}</span>
            </div>
            <div className="heading-row">
                <div className="research-heading">
                    <span className="eyebrow">ASK ATLAS</span>
                    <h1 title={props.title}>{props.title}</h1>
                    <p className="subtitle">Answers grounded in your knowledge, with citations you can verify.</p>
                </div>
                <div className="actions">
                    <button className="btn" onClick={props.onToggleHistory}>
                        <MessageSquare size={15} />
                        {props.historyOpen ? 'Hide history' : 'History'}
                    </button>
                    <button className="btn hide-small" disabled={!props.canCopy} onClick={props.onCopy}>
                        {props.copied ? <Check /> : <Copy />}
                        {props.copied ? 'Copied' : 'Copy chat'}
                    </button>
                    <button className="btn primary" disabled={props.busy} onClick={props.onNewChat}>
                        <Plus />
                        <span>New chat</span>
                    </button>
                </div>
            </div>
            <div className="research-source-toolbar">
                <button className="research-document-scope" type="button" onClick={props.onOpenScope}>
                    <FileText size={15} />
                    {props.selectedCount ? `${props.selectedCount} selected documents` : 'All documents'}
                    <ChevronDown size={14} />
                </button>
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
                />
            </div>
            {props.connectedGmail && (
                <div className="unified-gmail-scope">
                    <label>
                        Gmail search scope <input aria-label="Gmail search scope" value={props.connectedGmailQuery} onChange={(event) => props.setConnectedGmailQuery(event.target.value)} />
                    </label>
                </div>
            )}
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
                    onNewChat={props.onNewChat}
                    onOpenChat={props.onOpenChat}
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
                                            if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); }
                                            if (event.key === 'Escape') { setMessageSearch(''); setFocusedIndex(null); event.currentTarget.blur(); }
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
                                        <span>{matches.length ? `${Math.max(0, matches.findIndex(({ index }) => index === focusedIndex)) + 1} of ${matches.length}` : 'No matches'}</span>
                                        <button type="button" aria-label="Previous match" disabled={!matches.length} onClick={() => moveMatch(-1)}><ChevronUp size={15} /></button>
                                        <button type="button" aria-label="Next match" disabled={!matches.length} onClick={() => moveMatch(1)}><ChevronDown size={15} /></button>
                                    </div>
                                )}
                                <button type="button" className="evidence-toggle-inline" aria-expanded={evidenceOpen} aria-controls="atlas-evidence-panel" onClick={() => setEvidenceOpen((open) => !open)} title={evidenceOpen ? 'Hide evidence' : 'Show evidence'}>
                                    {evidenceOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                                    <span>{evidenceOpen ? 'Hide evidence' : 'Evidence'}</span>
                                </button>
                            </div>
                        )}
                        <ConversationTranscript
                            searchPhrase={messageSearch}
                            focusedIndex={focusedIndex}
                            messages={props.messages}
                            busy={props.busy}
                            readyCount={props.readyCount}
                            uploadButton={props.uploadButton}
                            prompts={prompts}
                            onPrompt={props.onAsk}
                            initials={props.initials}
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
                        <ResearchComposer
                            query={props.query}
                            onChange={props.setQuery}
                            onSubmit={() => props.onAsk()}
                            onUpload={props.onUpload}
                            onBrowseLibrary={props.onBrowseLibrary}
                            canUpload={props.canUpload}
                            selectedDocuments={props.selectedDocuments}
                            allDocumentsActive={props.includeDocuments && props.selectedCount === 0 && props.readyCount > 0}
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
                            <button type="button" onClick={() => resizeEvidence(340)}>
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
                                            <span>{step.status === 'failed' ? 'Search failed' : `${step.found} found · ${step.considered} retained · ${step.used} cited`}</span>
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
                                                        <small>{sourceLocation(source)}</small>
                                                        <span>
                                                            {source.text?.replace(/\s+/g, ' ').slice(0, 110) || 'Open supporting passage'}
                                                            {(source.text?.length || 0) > 110 ? '…' : ''}
                                                        </span>
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
                                <p>Evidence from your answers appears here.</p>
                                <span>Choose a citation to inspect the original passage and surrounding context.</span>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </section>
    );
}
