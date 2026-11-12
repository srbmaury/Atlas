'use client';
import { chatLoadSequence } from '../lib/chatLoadSequence';
import { persistConversation } from '../lib/researchRequests';
import Link from 'next/link';
import { bootWorkspace, refreshWorkspaceMetadata, createSessionActions } from '../utils/sessionActions';
import { refreshDocuments, createDocumentActions } from '../utils/documentActions';
import { createConversationActions } from '../utils/conversationActions';
import { IntegrationsGallery } from './sources/IntegrationsGallery';
import { SourceConnectionDialog } from './sources/SourceConnectionDialog';
import { GmailWorkspaceView } from './sources/gmail/GmailWorkspaceView';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FolderOpen, Layers3, Plus, Search, Upload, X, LoaderCircle, Moon, Sun, PanelLeftOpen, Menu, Check, CheckCircle2, AlertCircle } from 'lucide-react';

import type { User, Workspace, Doc, Source, Answer, ChatSummary, DocumentPreview } from '../lib/types';

import { useConversation } from '../hooks/useConversation';
import { useAtlasTheme } from '../hooks/useAtlasTheme';
import { useSourceConnections } from '../hooks/useSourceConnections';
import { useGmailWorkspace } from '../hooks/useGmailWorkspace';
import { useConnectedSourcesController } from '../hooks/useConnectedSourcesController';

import '../app/rebuild.css';
import { ResearchAnswer } from './chat/ResearchAnswer';
import { EvidenceInspector } from './chat/EvidenceInspector';
import { ResearchWorkspace } from './chat/ResearchWorkspace';

import { WorkspaceSearchDialog } from './layout/WorkspaceSearchDialog';
import { WorkspaceManagerDialog } from './layout/WorkspaceManagerDialog';
import { WorkspaceSidebar } from './layout/WorkspaceSidebar';
import { AgentStudioPanel } from './agents/AgentStudioPanel';

import { WebPageImportForm } from './documents/WebPageImportForm';
import { DocumentsView } from './documents/DocumentsView';
import { DocumentTable } from './documents/DocumentTable';

import { HomeView } from './home/HomeView';
import { AuthView } from './auth/AuthView';

import { AtlasMark, FileBadge, EmptyState, Dialog } from './ui/WorkspacePrimitives';
import { flushSync } from 'react-dom';

import { prettyBytes } from '../utils/utils';
import { PROVIDER_LABELS } from '../lib/providers';

export function AtlasWorkspace({ initialTab = 'chat', initialWorkspaceId }: { initialTab?: 'chat' | 'agents'; initialWorkspaceId?: string } = {}) {
    const { theme, toggleTheme } = useAtlasTheme();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [register, setRegister] = useState(true);
    const [authNotice, setAuthNotice] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspaceId, setWorkspaceId] = useState('');
    const [docs, setDocs] = useState<Doc[]>([]);
    const [tab, setTab] = useState<'overview' | 'documents' | 'chat' | 'sources' | 'agents'>(initialTab);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [includeDocuments, setIncludeDocuments] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('');
    const { messages, chatId, setMessages, setChatId, activeChat, chatMessages, chatTitle } = useConversation();
    const sourceState = useSourceConnections();
    const gmailState = useGmailWorkspace();

    const {
        driveStatus,
        setDriveStatus,
        setDriveResults,
        sourceStatuses,
        setSourceStatuses,
        sourceChecks,
        setSourceChecks,
        sourceChecksBusy,
        sourceManage,
        setSourceManage,
        setSourceProvider,
        setSourceCredential,
        setSourceSearch,
        setSourceResults,
        connectedGmail,
        setConnectedGmail,
        connectedProviders,
        setConnectedProviders,
        connectedGmailQuery,
        setConnectedGmailQuery,
    } = sourceState;

    useEffect(() => {
        setConnectedProviders([]);
        setConnectedGmail(false);
        setIncludeDocuments(true);
        setSourceManage(null);
        setDriveStatus(null);
        setSourceStatuses([]);
        setSourceChecks({});
        setDriveResults([]);
        setSourceResults([]);
        setSourceCredential('');
        setSourceSearch('');
        setQuery('');
        setFilter('');
        setGlobalQuery('');
    }, [workspaceId]);

    const { gmailStatus, setGmailStatus, setGmailMessages, setGmailSelected, setGmailSummary, setGmailSummaryIds, setGmailMobileView, setGmailPreview } = gmailState;

    const [chats, setChats] = useState<ChatSummary[]>([]);
    const [busy, setBusy] = useState(false);
    const [answerProgress, setAnswerProgress] = useState('');
    const askController = useRef<AbortController | null>(null);
    const [uploading, setUploading] = useState(false);
    const [webUrl, setWebUrl] = useState('');
    const [webBusy, setWebBusy] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const autoAttachedUploads = useRef<Set<string>>(new Set());
    const [uploadSummary, setUploadSummary] = useState<{ ids: string[]; duplicates: number } | null>(null);
    const [source, setSource] = useState<Source | null>(null);
    const [preview, setPreview] = useState<DocumentPreview | null>(null);
    const [dragging, setDragging] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');
    const [newWorkspace, setNewWorkspace] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [scopeOpen, setScopeOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [globalQuery, setGlobalQuery] = useState('');
    const [searchTarget, setSearchTarget] = useState<{ chatId: string; index: number; phrase: string; token: number } | null>(null);
    const searchToken = useRef(0);
    const [copied, setCopied] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const chatEnd = useRef<HTMLDivElement>(null);
    const chatThread = useRef<HTMLDivElement>(null);
    const scope = useRef('');
    scope.current = workspaceId;

    const themeButton = (
        <button type="button" className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
    );

    const boot = useCallback(() => bootWorkspace({ setUser, setWorkspaces, setWorkspaceId, setLoading }), []);

    useEffect(() => {
        void boot();
    }, [boot]);
    const initialWorkspaceApplied = useRef(false);
    useEffect(() => {
        if (!initialWorkspaceId || initialWorkspaceApplied.current || !workspaces.some((item) => item.id === initialWorkspaceId)) return;
        initialWorkspaceApplied.current = true;
        setWorkspaceId(initialWorkspaceId);
    }, [initialWorkspaceId, workspaces]);
    const refresh = useCallback(() => refreshDocuments({ workspaceId, scope, setDocs, setSelected }), [workspaceId]);
    useEffect(() => {
        chatLoadSequence.invalidate();
        setDocs([]);
        setMessages([]);
        setChatId(null);
        activeChat.current = null;
        chatMessages.current = [];
        setChats([]);
        setSelected([]);
        setPreview(null);
        setSource(null);
        setError('');
        setNotice('');
        setUploadSummary(null);
        setGmailMessages([]);
        setGmailSelected([]);
        setGmailSummary(null);
        setGmailSummaryIds([]);
        setGmailStatus(null);
        setGmailMobileView('emails');
        setGmailPreview(null);
        void refreshWorkspaceMetadata({ workspaceId, scope, setGmailStatus, setChats, setError });
        void refresh().catch((e) => setError(e.message));
        const timer = setInterval(() => {
            void refresh().catch((e) => setError(e.message));
        }, 3000);
        return () => clearInterval(timer);
    }, [refresh]);
    useEffect(() => {
        if (tab === 'chat' && messages.length > 0 && chatThread.current) chatThread.current.scrollTo({ top: chatThread.current.scrollHeight, behavior: 'smooth' });
    }, [messages.length, busy, tab]);

    function newChat(preserveSourceSelection = false) {
        if (busy) return;
        setSearchTarget(null);
        chatLoadSequence.invalidate();
        try {
            if (query) sessionStorage.setItem(`atlas:draft:${workspaceId}:${chatId || 'new'}`, query);
        } catch {
            /* Storage unavailable. */
        }
        activeChat.current = null;
        setChatId(null);
        chatTitle.current = 'New chat';
        chatMessages.current = [];
        setMessages([]);
        restoreDraft(null);
        setSource(null);
        if (!preserveSourceSelection) {
            setIncludeDocuments(true);
            setConnectedGmail(false);
            setConnectedProviders([]);
        }
        navigate('chat');
    }

    function navigate(next: typeof tab) {
        flushSync(() => {
            setTab(next);
            setSidebarOpen(false);
        });
    }

    const {
        connectGmail,
        connectDrive,
        disconnectDrive,
        searchDrive,
        refreshConnections,
        verifySourceConnections,
        connectSource,
        connectOAuthSource,
        disconnectSource,
        searchSource,
        searchGmail,
        summarizeGmailQuery,
        summarizeGmail,
        disconnectGmail,
    } = useConnectedSourcesController({
        workspaceId,
        tab,
        scope,
        sourceState,
        gmailState,
        setError,
        setNotice,
    });

    useEffect(() => {
        function shortcuts(event: KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setSearchOpen(true);
            }
            if (event.key === 'Escape') {
                setSearchOpen(false);
                setScopeOpen(false);
                setNewWorkspace(false);
                setSourceManage(null);
                setSourceCredential('');
                setGmailPreview(null);
                setSource(null);
                setPreview(null);
                setSidebarOpen(false);
            }
        }
        window.addEventListener('keydown', shortcuts);
        return () => window.removeEventListener('keydown', shortcuts);
    }, []);

    const ready = docs.filter((d) => d.status === 'ready');
    const hasAskSources = (includeDocuments && ready.length > 0) || connectedGmail || connectedProviders.length > 0;
    const homeSourceLabels = [
        ...(includeDocuments ? [selected.length ? `Documents (${selected.length} selected)` : `Documents (all ${ready.length} ready)`] : []),
        ...(connectedGmail ? ['Gmail'] : []),
        ...connectedProviders.map((provider) => PROVIDER_LABELS[provider]),
    ];
    const filtered = docs.filter((d) => d.name.toLowerCase().includes(filter.toLowerCase()));
    const workspace = workspaces.find((w) => w.id === workspaceId);
    const canEdit = workspace?.role === 'editor' || workspace?.role === 'manager';
    const canManage = workspace?.role === 'manager';

    const storage = docs.reduce((sum, d) => sum + d.size, 0);
    // Only passages actually cited in the answer count as supporting evidence.
    // Preserve original retrieval indices so [3] always opens source 3.

    const title = messages.find((m) => m.role === 'user')?.content || 'New research';
    const initials = (user?.display_name || user?.email)?.slice(0, 2).toUpperCase() || 'A';
    const uploadedDocs = uploadSummary ? docs.filter((d) => uploadSummary.ids.includes(d.id)) : [];
    const uploadStatus = uploadSummary
        ? [
              ...(['queued', 'processing', 'ready', 'failed'] as const).map((status) => {
                  const count = uploadedDocs.filter((d) => d.status === status).length;
                  return count ? `${count} ${status === 'ready' ? 'ready to search' : status}` : '';
              }),
              uploadSummary.duplicates ? `${uploadSummary.duplicates} duplicates skipped` : '',
              uploadSummary.ids.some((id) => !docs.some((d) => d.id === id)) ? 'Refreshing document status' : '',
          ]
              .filter(Boolean)
              .join(' · ')
        : '';

    // Files uploaded from the question composer become part of its source scope
    // once indexing finishes. Keep the filename visible while processing.
    useEffect(() => {
        if (!uploadSummary?.ids.length) return;
        const newlyReady = docs.filter((doc) => uploadSummary.ids.includes(doc.id) && doc.status === 'ready' && !autoAttachedUploads.current.has(doc.id)).map((doc) => doc.id);
        if (newlyReady.length) {
            newlyReady.forEach((id) => autoAttachedUploads.current.add(id));
            setSelected((old) => [...new Set([...old, ...newlyReady])]);
        }
    }, [docs, uploadSummary]);

    useEffect(() => {
        if (!uploadSummary?.ids.some((id) => docs.some((doc) => doc.id === id && (doc.status === 'queued' || doc.status === 'processing')))) return;
        const timer = window.setInterval(() => {
            void refresh().catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [docs, uploadSummary, refresh]);

    const openAnswerSource = useCallback((item: Source, context?: string) => {
        setSource(context ? { ...item, highlight_context: context } : item);
    }, []);

    function renderAnswer(result: Answer, onPrompt: (prompt: string) => void) {
        return <ResearchAnswer result={result} onOpenSource={openAnswerSource} onPrompt={onPrompt} />;
    }

    const { authenticate, addWorkspace, signOut } = createSessionActions({
        register,
        email,
        password,
        workspaceName,
        boot,
        setUser,
        setWorkspaces,
        setWorkspaceId,
        setBusy,
        setError,
        setAuthNotice,
        setPassword,
        setDocs,
        setMessages,
        setPreview,
        setSource,
        setNewWorkspace,
        setWorkspaceName,
    });
    const { importWebPage, upload, remove, retry, inspect } = createDocumentActions({
        workspaceId,
        webUrl,
        webBusy,
        uploading,
        user,
        scope,
        input,
        refresh,
        setWebBusy,
        setWebUrl,
        setError,
        setNotice,
        setUploading,
        setUploadProgress,
        setUploadSummary,
        setSource,
        setPreview,
    });
    const { loadChat, renameChat, deleteChat, deleteChats, ask, refreshChats, copyConversation } = createConversationActions({
        workspaceId,
        query,
        busy,
        hasAskSources,
        user,
        includeDocuments,
        connectedGmail,
        connectedProviders,
        connectedGmailQuery,
        selected,
        messages,
        scope,
        askController,
        activeChat,
        chatMessages,
        chatTitle,
        setChatId,
        setMessages,
        setChats,
        setSource,
        setIncludeDocuments,
        setConnectedGmail,
        setConnectedProviders,
        setQuery,
        setTab,
        setError,
        setNotice,
        setBusy,
        setAnswerProgress,
        setCopied,
        navigate,
        newChat,
    });

    const [mentionAgents, setMentionAgents] = useState<{ id: string; name: string; handle: string }[]>([]);
    const [agentBusy, setAgentBusy] = useState(false);
    useEffect(() => {
        if (!workspaceId || !user) return;
        const controller = new AbortController();
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents`, { credentials: 'same-origin', signal: controller.signal })
            .then((response) => (response.ok ? response.json() : []))
            .then((items: { id: string; name: string }[]) =>
                setMentionAgents(
                    items.map((item) => ({
                        ...item,
                        handle:
                            '@' +
                            item.name
                                .toLowerCase()
                                .trim()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, ''),
                    })),
                ),
            )
            .catch(() => {
                if (!controller.signal.aborted) setMentionAgents([]);
            });
        return () => controller.abort();
    }, [workspaceId, user, tab]);

    async function askWithAgent(question?: string) {
        const text = (question ?? query).trim();
        const match = /^(@[a-z0-9-]+)\\s+([\\s\\S]+)$/i.exec(text);
        const agent = match && mentionAgents.find((item) => item.handle === match[1].toLowerCase());
        if (!agent) {
            void ask(question);
            return;
        }
        if (busy || agentBusy || !workspaceId) return;
        setAgentBusy(true);
        setQuery('');
        const questionMessage = { role: 'user' as const, content: text };
        chatMessages.current = [...chatMessages.current, questionMessage];
        setMessages(chatMessages.current);
        const conversationTitle = chatTitle.current === 'New chat' ? text.slice(0, 100) : chatTitle.current;
        let conversationId = activeChat.current;
        try {
            const saved = await persistConversation(workspaceId, conversationId, conversationTitle, chatMessages.current);
            conversationId = saved.id;
            activeChat.current = saved.id;
            setChatId(saved.id);
            chatTitle.current = conversationTitle;
            setChats((previous) => [{ id: saved.id, title: conversationTitle, updated: saved.updated }, ...previous.filter((item) => item.id !== saved.id)]);
            const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agent.id)}/runs`;
            const started = await fetch(base, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: match![2] }) });
            if (!started.ok) throw new Error(`Agent could not start (HTTP ${started.status}).`);
            const run: { id: string } = await started.json();
            let completed: { id: string; status: string; result?: { answer?: string; error?: string; mode?: string; sources?: Source[]; scope?: string[]; claim_verification?: { unsupported: number; supported?: number; claims?: { claim: string; status: string; source_ids: number[] }[] } }; error?: string } | undefined;
            for (let attempt = 0; attempt < 90; attempt++) {
                await new Promise((resolve) => window.setTimeout(resolve, 2000));
                const response = await fetch(base, { credentials: 'same-origin' });
                if (!response.ok) throw new Error('Could not load agent research results.');
                const runs: (typeof completed)[] = await response.json();
                const current = runs.find((item) => item?.id === run.id);
                if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
                    completed = current;
                    break;
                }
            }
            if (!completed) throw new Error('Agent is still running. Check its run history later.');
            const audit = completed.result?.claim_verification;
            const answer = completed.result?.answer || completed.result?.error || completed.error || 'No answer available.';
            const content = `**${agent.name}** · Agent\\n\\n${answer}${audit ? `\\n\\nEvidence assessment: ${audit.supported || 0} model-supported · ${audit.unsupported} uncertain or unsupported. Review original sources before relying on claims.` : ''}`;
            const agentResult = completed.result?.answer ? {
                answer: completed.result.answer,
                sources: completed.result.sources || [],
                mode: completed.result.mode || 'agent_research',
                scope: completed.result.scope || [],
                citation_audit: audit ? { claims: (audit.claims || []).map((claim) => ({ claim: claim.claim, citations: claim.source_ids, overlap: 0, status: claim.status })), needs_review: audit.unsupported, note: 'Automated model assessment; not independent factual verification.' } : undefined,
            } : undefined;
            const reply = { role: 'assistant' as const, content, result: agentResult, agent: { id: agent.id, name: agent.name, run_id: run.id } };
            chatMessages.current = [...chatMessages.current, reply];
            setMessages(chatMessages.current);
            await persistConversation(workspaceId, conversationId, conversationTitle, chatMessages.current);
        } catch (error) {
            const reply = { role: 'assistant' as const, content: `**${agent.name}** · ${error instanceof Error ? error.message : 'Research failed.'}` };
            setMessages((previous) => [...previous, reply]);
            chatMessages.current = [...chatMessages.current, reply];
            if (conversationId) {
                try {
                    await persistConversation(workspaceId, conversationId, conversationTitle, chatMessages.current);
                } catch {
                    /* Keep visible error. */
                }
            }
        } finally {
            setAgentBusy(false);
        }
    }

    // Drafts are scoped to workspace and conversation, including the unsaved new chat.
    const draftKey = (id: string | null) => `atlas:draft:${workspaceId}:${id || 'new'}`;
    useEffect(() => {
        if (!workspaceId) return;
        const key = draftKey(chatId);
        const timer = window.setTimeout(() => {
            try {
                if (query) sessionStorage.setItem(key, query);
                else sessionStorage.removeItem(key);
            } catch {
                /* Private browsing can disable session storage. */
            }
        }, 250);
        return () => window.clearTimeout(timer);
    }, [workspaceId, chatId, query]);

    function restoreDraft(id: string | null) {
        try {
            setQuery(sessionStorage.getItem(draftKey(id)) || '');
        } catch {
            setQuery('');
        }
    }

    async function switchChat(id: string, target?: { index: number; phrase: string }) {
        if (busy) return false;
        setSearchTarget(target ? { chatId: id, index: target.index, phrase: target.phrase, token: ++searchToken.current } : null);
        try {
            sessionStorage.setItem(draftKey(chatId), query);
        } catch {
            /* Storage unavailable. */
        }
        await loadChat(id);
        if (activeChat.current !== id) return false;
        restoreDraft(id);
        return true;
    }

    const uploadButton = (
        <button className="btn primary" disabled={uploading || !workspaceId || !canEdit} onClick={() => input.current?.click()}>
            {uploading ? <LoaderCircle className="spin" /> : <Plus />}
            <span>{uploading ? 'Uploading…' : 'Add documents'}</span>
        </button>
    );

    if (loading)
        return (
            <div className="opening">
                <AtlasMark />
                <LoaderCircle className="spin" />
                <span>Opening your research workspace…</span>
            </div>
        );
    if (!user)
        return (
            <AuthView
                themeButton={themeButton}
                register={register}
                email={email}
                password={password}
                error={error}
                notice={authNotice}
                busy={busy}
                onSubmit={authenticate}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onToggleMode={() => {
                    setRegister(!register);
                    setAuthNotice('');
                    setError('');
                }}
            />
        );

    return (
        <div className={`app atlas-v3 ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <input
                ref={input}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
                hidden
                onChange={(e) => {
                    if (canEdit && e.target.files) void upload(e.target.files);
                }}
            />
            {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
            <WorkspaceSidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onNewChat={() => newChat()}
                busy={busy}
                onCollapse={() => {
                    setSidebarCollapsed(true);
                    setSidebarOpen(false);
                }}
                onWorkspaceSettings={() => setNewWorkspace(true)}
                workspace={workspace}
                workspaceCount={workspaces.length}
                tab={tab}
                onNavigate={navigate}
                chats={chats}
                activeChatId={chatId}
                onOpenChat={(id) => void switchChat(id)}
                onRenameChat={(item) => void renameChat(item)}
                onDeleteChat={(item) => void deleteChat(item)}
                onAllChats={() => {
                    navigate('chat');
                    setHistoryOpen(true);
                    void refreshChats();
                }}
                readyCount={ready.length}
                storageLabel={storage ? prettyBytes(storage) : '0 KB'}
                initials={initials}
                email={user.email}
                displayName={user.display_name}
                onSignOut={() => void signOut()}
            />
            <main className="main">
                <header className="topbar">
                    <button className="icon-button mobile" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
                        <Menu />
                    </button>
                    <button className="icon-button expand-sidebar" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}>
                        <PanelLeftOpen />
                    </button>
                    <button className="global-search" onClick={() => setSearchOpen(true)}>
                        <Search />
                        <span>Search documents or ask a question…</span>
                        <kbd className="key">⌘ K</kbd>
                    </button>
                    <div className="top-actions">
                        {themeButton}
                        <Link className="initials" aria-label="Account settings" title="Account settings" href={`/settings?workspaceId=${encodeURIComponent(workspaceId)}`}>
                            {initials}
                        </Link>
                    </div>
                </header>
                <div className={`content ${tab === 'chat' || tab === 'agents' ? 'content-research' : ''}`}>
                    {error && (
                        <div className="feedback error" role="alert">
                            <AlertCircle />
                            <span>{error}</span>
                            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
                                <X />
                            </button>
                        </div>
                    )}
                    {notice && (
                        <div className="feedback" role="status">
                            <CheckCircle2 />
                            <span>{notice}</span>
                            <button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
                                <X />
                            </button>
                        </div>
                    )}
                    {tab !== 'chat' && uploadProgress && (
                        <div className="feedback" role="status">
                            <LoaderCircle className="spin" />
                            <span>{uploadProgress}</span>
                        </div>
                    )}
                    {tab !== 'chat' && uploadSummary && (
                        <div className="feedback" role="status">
                            <Upload />
                            <span>
                                {uploadStatus || 'No files added'}{' '}
                                <button className="text-button" onClick={() => navigate('documents')}>
                                    View documents
                                </button>
                            </span>
                            <button className="icon-button" aria-label="Dismiss upload status" onClick={() => setUploadSummary(null)}>
                                <X />
                            </button>
                        </div>
                    )}
                    {!workspaceId && (
                        <EmptyState
                            icon={<FolderOpen />}
                            title="A new space for your knowledge"
                            text="Create a workspace to add documents and begin researching."
                            action={
                                <button className="btn primary" onClick={() => setNewWorkspace(true)}>
                                    <Plus />
                                    Create workspace
                                </button>
                            }
                        />
                    )}
                    {workspaceId && tab === 'overview' && (
                        <HomeView
                            canEdit={canEdit}
                            query={query}
                            onQueryChange={setQuery}
                            onAsk={() => void ask(query, true)}
                            hasAskSources={hasAskSources || mentionAgents.length > 0}
                            sourceLabels={homeSourceLabels}
                            busy={busy}
                            chats={chats}
                            docs={docs}
                            onChooseSources={() => newChat(true)}
                            onOpenSources={() => navigate('sources')}
                            onOpenConversations={() => {
                                navigate('chat');
                                setHistoryOpen(true);
                                void refreshChats();
                            }}
                            onOpenConversation={(id) => void loadChat(id)}
                            onStartChat={() => {
                                newChat();
                                navigate('chat');
                            }}
                            onOpenDocuments={() => navigate('documents')}
                            onInspectDocument={(d) => void inspect(d)}
                            uploadButton={uploadButton}
                            dragging={dragging}
                            onDragging={setDragging}
                            onDrop={(files) => {
                                if (canEdit) void upload(files);
                            }}
                            maxSizeMB={Math.round(user.max_file_bytes / 1024 / 1024)}
                            uploading={uploading}
                            onBrowse={() => {
                                if (canEdit) input.current?.click();
                            }}
                            formatSize={prettyBytes}
                        />
                    )}
                    {workspaceId && tab === 'chat' && (
                        <ResearchWorkspace
                            workspaceId={workspaceId}
                            searchTarget={searchTarget?.chatId === chatId ? searchTarget : null}
                            onOpenSource={openAnswerSource}
                            title={title}
                            onOpenNavigation={() => setSidebarOpen(true)}
                            onOpenGlobalSearch={() => setSearchOpen(true)}
                            userMode={user.mode}
                            readyCount={ready.length}
                            includeDocuments={includeDocuments}
                            setIncludeDocuments={setIncludeDocuments}
                            gmailStatus={gmailStatus}
                            connectedGmail={connectedGmail}
                            setConnectedGmail={setConnectedGmail}
                            connectedGmailQuery={connectedGmailQuery}
                            setConnectedGmailQuery={setConnectedGmailQuery}
                            driveStatus={driveStatus}
                            sourceStatuses={sourceStatuses}
                            connectedProviders={connectedProviders}
                            setConnectedProviders={setConnectedProviders}
                            selectedCount={selected.length}
                            onOpenScope={() => setScopeOpen(true)}
                            onManageSources={() => navigate('sources')}
                            historyOpen={historyOpen}
                            onToggleHistory={() => setHistoryOpen((open) => !open)}
                            onCloseHistory={() => setHistoryOpen(false)}
                            copied={copied}
                            canCopy={messages.length > 0}
                            onCopy={() => void copyConversation()}
                            busy={busy || agentBusy}
                            mentionAgents={mentionAgents}
                            onNewChat={() => newChat()}
                            chats={chats}
                            chatId={chatId}
                            onRefreshChats={() => void refreshChats()}
                            onOpenChat={switchChat}
                            onRenameChat={(item) => void renameChat(item)}
                            onDeleteChat={(item) => void deleteChat(item)}
                            onDeleteChats={(items) => void deleteChats(items)}
                            messages={messages}
                            uploadButton={uploadButton}
                            onAsk={(question) => void askWithAgent(question)}
                            initials={initials}
                            renderAnswer={renderAnswer}
                            answerProgress={answerProgress}
                            onStop={() => askController.current?.abort()}
                            threadRef={chatThread}
                            endRef={chatEnd}
                            query={query}
                            setQuery={setQuery}
                            canUpload={canEdit}
                            selectedDocuments={ready.filter((doc) => selected.includes(doc.id)).map((doc) => ({ id: doc.id, name: doc.name }))}
                            pendingDocuments={uploadedDocs.filter((doc) => doc.status !== 'ready').map((doc) => ({ id: doc.id, name: doc.name, status: doc.status }))}
                            onRemoveDocument={(id) => setSelected((old) => old.filter((item) => item !== id))}
                            uploadProgress={uploadProgress}
                            uploadResult={
                                uploadSummary
                                    ? uploadedDocs.length
                                        ? `${uploadedDocs
                                              .map((doc) => doc.name)
                                              .slice(0, 2)
                                              .join(', ')}${uploadedDocs.length > 2 ? ` and ${uploadedDocs.length - 2} more` : ''} · ${uploadStatus || 'Added to library'}`
                                        : uploadStatus || 'No new documents added'
                                    : ''
                            }
                            onDismissUploadResult={() => setUploadSummary(null)}
                            onBrowseLibrary={() => setScopeOpen(true)}
                            onUpload={() => {
                                if (canEdit) input.current?.click();
                            }}
                            uploading={uploading}
                            hasAskSources={hasAskSources}
                        />
                    )}
                    {workspaceId && tab === 'agents' && <AgentStudioPanel workspaceId={workspaceId} />}
                    {workspaceId && tab === 'documents' && (
                        <DocumentsView
                            uploadButton={uploadButton}
                            canEdit={canEdit}
                            webImport={
                                canEdit ? (
                                    <WebPageImportForm url={webUrl} busy={webBusy} onUrlChange={setWebUrl} onSubmit={(event) => void importWebPage(event)} />
                                ) : (
                                    <p>You have viewer access. Ask an editor or manager to add documents.</p>
                                )
                            }
                            totalDocuments={docs.length}
                            readyDocuments={ready.length}
                            storageLabel={storage ? prettyBytes(storage) : '0 KB'}
                            filteredCount={filtered.length}
                            filter={filter}
                            onFilter={setFilter}
                            documentTable={
                                <DocumentTable
                                    canEdit={canEdit}
                                    items={filtered}
                                    filter={filter}
                                    onClearFilter={() => setFilter('')}
                                    uploadButton={uploadButton}
                                    onInspect={(d) => void inspect(d)}
                                    onRetry={(d) => void retry(d)}
                                    onRemove={(d) => void remove(d)}
                                    downloadUrl={(d) => `/api/workspaces/${workspaceId}/documents/${d.id}/original`}
                                    formatSize={prettyBytes}
                                />
                            }
                            dragging={dragging}
                            onDragging={setDragging}
                            onDrop={(files) => {
                                if (canEdit) void upload(files);
                            }}
                            maxSizeMB={Math.round(user.max_file_bytes / 1024 / 1024)}
                            uploading={uploading}
                            onBrowse={() => {
                                if (canEdit) input.current?.click();
                            }}
                        />
                    )}
                    {workspaceId && tab === 'sources' && (
                        <section className="connected-page">
                            {sourceManage !== 'gmail' && (
                                <div className="sources-overview">
                                    <div className="crumb">
                                        Workspace<span>›</span>Sources
                                    </div>
                                    <div className="heading-row">
                                        <div>
                                            <span className="eyebrow">YOUR INTEGRATIONS</span>
                                            <h1>Connected sources</h1>
                                            <p className="subtitle">Connect external services to your research workspace. Access stays read-only.</p>
                                        </div>
                                        <div className="source-header-actions">
                                            <button className="btn" onClick={() => void refreshConnections()}>
                                                Refresh list
                                            </button>
                                            <button className="btn primary" disabled={sourceChecksBusy || !canManage} onClick={() => void verifySourceConnections()}>
                                                {sourceChecksBusy ? (
                                                    <>
                                                        <LoaderCircle className="spin" />
                                                        Checking access…
                                                    </>
                                                ) : (
                                                    'Check source access'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <IntegrationsGallery
                                        gmailStatus={gmailStatus}
                                        driveStatus={driveStatus}
                                        sourceStatuses={sourceStatuses}
                                        sourceChecks={sourceChecks}
                                        onOpen={(provider) => {
                                            if (!canManage) {
                                                setNotice('Select shared sources above the chat prompt to search them. A manager handles connections.');
                                                return;
                                            }
                                            setSourceManage(provider);
                                            if (provider === 'gmail') window.scrollTo({ top: 0, behavior: 'instant' });
                                            if (['github', 'notion', 'slack', 'calendar', 'linear', 'jira', 'onedrive', 'outlook', 'sharepoint'].includes(provider)) {
                                                setSourceProvider(provider as 'github' | 'notion' | 'slack' | 'calendar' | 'linear' | 'jira' | 'onedrive' | 'outlook' | 'sharepoint');
                                                setSourceResults([]);
                                            }
                                        }}
                                    />
                                </div>
                            )}
                            {sourceManage === 'gmail' && (
                                <GmailWorkspaceView
                                    state={gmailState}
                                    onBack={() => {
                                        setSourceManage(null);
                                        window.scrollTo({ top: 0, behavior: 'instant' });
                                    }}
                                    onDisconnect={() => void disconnectGmail()}
                                    onConnect={() => void connectGmail()}
                                    onSearch={() => void searchGmail()}
                                    onSummarizeQuery={() => void summarizeGmailQuery()}
                                    onSummarizeSelected={() => void summarizeGmail()}
                                    onFollowUp={(question) => void summarizeGmail(question)}
                                    onNotice={setNotice}
                                    onError={setError}
                                />
                            )}
                            <SourceConnectionDialog
                                state={sourceState}
                                onClose={() => {
                                    setSourceManage(null);
                                    setSourceCredential('');
                                }}
                                onSearchDrive={() => void searchDrive()}
                                onDisconnectDrive={() => void disconnectDrive()}
                                onConnectDrive={() => void connectDrive()}
                                onConnectSource={() => void connectSource()}
                                onConnectOAuthSource={() => void connectOAuthSource()}
                                onSearchSource={() => void searchSource()}
                                onDisconnectSource={(provider) => void disconnectSource(provider)}
                            />
                            <p className="caption">All connections are scoped to this workspace. Source content is accessed on demand; you can disconnect accounts at any time.</p>
                        </section>
                    )}
                </div>
            </main>
            {searchOpen && (
                <WorkspaceSearchDialog
                    query={globalQuery}
                    onQueryChange={setGlobalQuery}
                    onClose={() => setSearchOpen(false)}
                    onAsk={(question) => {
                        setSearchOpen(false);
                        void ask(question, true);
                        setGlobalQuery('');
                    }}
                    onInspect={(doc) => {
                        setSearchOpen(false);
                        void inspect(doc);
                    }}
                    documents={docs}
                    workspaceId={workspaceId}
                    chats={chats}
                    onOpenChat={(id) => {
                        setSearchOpen(false);
                        void switchChat(id);
                    }}
                    onOpenMessage={(id, index, phrase) => {
                        setSearchOpen(false);
                        void switchChat(id, { index, phrase });
                    }}
                    onNewChat={() => {
                        setSearchOpen(false);
                        newChat();
                    }}
                    onNavigate={(next) => {
                        setSearchOpen(false);
                        navigate(next);
                    }}
                    canAsk={!busy && hasAskSources}
                />
            )}
            {scopeOpen && (
                <Dialog title="Choose your sources" onClose={() => setScopeOpen(false)}>
                    <p className="dialog-intro">Ask across all ready documents, or choose a focused set.</p>
                    <button className="btn" onClick={() => setSelected([])}>
                        <Layers3 />
                        Use all documents
                    </button>
                    <div className="scope-list">
                        {ready.map((d) => (
                            <label key={d.id}>
                                <input
                                    type="checkbox"
                                    checked={selected.includes(d.id)}
                                    onChange={(e) => setSelected((old) => (e.target.checked ? [...old, d.id] : old.filter((id) => id !== d.id)))}
                                />
                                <FileBadge name={d.name} />
                                <span>{d.name}</span>
                            </label>
                        ))}
                    </div>
                    <div className="dialog-footer">
                        <span className="caption">{selected.length ? `${selected.length} selected` : 'All ready documents included'}</span>
                        <button className="btn primary" onClick={() => setScopeOpen(false)}>
                            Done
                            <Check />
                        </button>
                    </div>
                </Dialog>
            )}
            {newWorkspace && (
                <WorkspaceManagerDialog
                    workspaces={workspaces}
                    activeId={workspaceId}
                    busy={busy}
                    uploading={uploading}
                    name={workspaceName}
                    onClose={() => setNewWorkspace(false)}
                    onSelect={(id) => {
                        setWorkspaceId(id);
                        setNewWorkspace(false);
                    }}
                    onName={setWorkspaceName}
                    onCreate={addWorkspace}
                />
            )}
            <EvidenceInspector
                workspaceId={workspaceId}
                source={source}
                preview={preview}
                onClose={() => {
                    setSource(null);
                    setPreview(null);
                }}
                onPreviewChange={setPreview}
                onError={setError}
            />
        </div>
    );
}
