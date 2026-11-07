'use client';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { Check, ChevronDown, CircleHelp, Copy, FileText, MessageSquare, Plus, ArrowUpRight, BookOpen } from 'lucide-react';
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
    allDocumentsActive: boolean;
    pendingDocuments: { id: string; name: string; status: string }[];
    onRemoveDocument: (id: string) => void;
    uploadProgress: string;
    uploadResult: string;
    onDismissUploadResult: () => void;
    uploading: boolean;
    hasAskSources: boolean;
}

export function ResearchWorkspace(props: ResearchWorkspaceProps) {
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
                    chats={props.chats}
                    chatId={props.chatId}
                    busy={props.busy}
                    onRefresh={props.onRefreshChats}
                    onNewChat={props.onNewChat}
                    onOpenChat={props.onOpenChat}
                    onRenameChat={props.onRenameChat}
                    onDeleteChat={props.onDeleteChat}
                />
                <div className="research">
                    <div className="chat-pane">
                        <ConversationTranscript
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
                    <aside className="research-evidence-rail" aria-label="Supporting evidence">
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
