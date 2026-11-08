'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ArrowUpRight, ChevronRight, Search, Sparkles } from 'lucide-react';
import type { Doc, ChatSummary } from '../../lib/types';
import { prettyBytes } from '../../utils/utils';
import { FileBadge, Dialog } from '../ui/WorkspacePrimitives';

export function WorkspaceSearchDialog({
    query,
    onQueryChange,
    onClose,
    onAsk,
    onInspect,
    documents,
    canAsk,
    chats,
    onOpenChat,
    onNewChat,
    onNavigate,
    workspaceId,
}: {
    query: string;
    onQueryChange: (value: string) => void;
    onClose: () => void;
    onAsk: (question: string) => void;
    onInspect: (document: Doc) => void;
    documents: Doc[];
    canAsk: boolean;
    chats: ChatSummary[];
    workspaceId: string;
    onOpenChat: (id: string) => void;
    onNewChat: () => void;
    onNavigate: (tab: 'documents' | 'sources') => void;
}) {
    const [messageMatches, setMessageMatches] = useState<{ chat_id: string; title: string; message_index: number; excerpt: string; role: string }[]>([]);
    useEffect(() => {
        if (query.trim().length < 2 || !workspaceId) { setMessageMatches([]); return; }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            api<{ results: typeof messageMatches }>(`/workspaces/${workspaceId}/conversations/search?q=${encodeURIComponent(query.trim())}`)
                .then((data) => { if (!cancelled) setMessageMatches(data.results); })
                .catch(() => { if (!cancelled) setMessageMatches([]); });
        }, 300);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [workspaceId, query]);
    const matches = documents.filter((doc) => doc.name.toLowerCase().includes(query.toLowerCase()));
    return (
        <Dialog title="Search & commands" onClose={onClose} className="search-dialog">
            <div className="modal-search">
                <Search />
                <input
                    autoFocus
                    data-autofocus
                    aria-label="Search your workspace"
                    placeholder="Search chats, documents, or run a command…"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                />
            </div>
            <div className="search-results-heading">Commands</div>
            <div className="search-results">
                {[
                    { label: 'New chat', action: onNewChat },
                    { label: 'Open documents', action: () => onNavigate('documents') },
                    { label: 'Manage sources', action: () => onNavigate('sources') },
                ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).map((item) => (
                    <button type="button" className="doc-item" key={item.label} onClick={item.action}><Sparkles size={15} /> {item.label} <ChevronRight size={15} /></button>
                ))}
            </div>
            <div className="search-results-heading">Conversations</div>
            <div className="search-results">
                {chats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map((chat) => (
                    <button type="button" className="doc-item" key={chat.id} onClick={() => onOpenChat(chat.id)}><Search size={15} /><span>{chat.title}</span><ChevronRight size={15} /></button>
                ))}
            </div>
            {query.trim().length >= 2 && (
                <>
                    <div className="search-results-heading">Matching messages</div>
                    <div className="search-results">
                        {messageMatches.map((match) => (
                            <button type="button" className="doc-item" key={match.chat_id + ':' + match.message_index} onClick={() => onOpenChat(match.chat_id)}>
                                <Search size={15} />
                                <span className="doc-item-info"><strong>{match.title}</strong><small>{match.role}: {match.excerpt}</small></span>
                                <ChevronRight size={15} />
                            </button>
                        ))}
                    </div>
                </>
            )}
            <div className="search-results-heading">Documents in this workspace</div>
            {query.trim() && (
                <button className="search-question" disabled={!canAsk} onClick={() => onAsk(query)}>
                    <Sparkles />
                    <span>Search selected sources with Atlas: {query}</span>
                    <ArrowUpRight />
                </button>
            )}
            <div className="search-results">
                {matches.slice(0, 12).map((doc) => (
                    <button className="doc-item" key={doc.id} onClick={() => onInspect(doc)}>
                        <FileBadge name={doc.name} />
                        <span className="doc-item-info">
                            <strong>{doc.name}</strong>
                            <small>
                                {prettyBytes(doc.size)} · {doc.chunk_count} passages
                            </small>
                        </span>
                        <ChevronRight />
                    </button>
                ))}
                {!matches.length && <p className="evidence-empty">No matching documents.</p>}
            </div>
        </Dialog>
    );
}
