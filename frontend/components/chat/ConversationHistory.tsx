'use client';
import { useMemo, useState } from 'react';
import { RotateCcw, Plus, MessageSquare, Trash2, Search } from 'lucide-react';
import type { ChatSummary } from '../../lib/types';

interface ConversationHistoryProps {
    chats: ChatSummary[];
    chatId: string | null;
    busy: boolean;
    onRefresh: () => void;
    onNewChat: () => void;
    onOpenChat: (id: string) => void;
    onRenameChat: (item: ChatSummary) => void;
    onDeleteChat: (item: ChatSummary) => void;
}

export function ConversationHistory({ chats, chatId, busy, onRefresh, onNewChat, onOpenChat, onRenameChat, onDeleteChat }: ConversationHistoryProps) {
    const [search, setSearch] = useState('');
    const filteredChats = useMemo(() => chats.filter((chat) =>
        chat.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    ), [chats, search]);

    return (
        <aside className="chat-history">
            <div className="chat-history-header">
                <strong>Conversations</strong>
                <button type="button" onClick={onRefresh} title="Refresh saved conversations" aria-label="Refresh saved conversations">
                    <RotateCcw size={15} />
                </button>
                <button type="button" onClick={onNewChat} title="New conversation" aria-label="New conversation">
                    <Plus size={16} />
                </button>
            </div>
            <label className="chat-history-search">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Search conversations</span>
                <input type="search" aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="chat-history-list">
                {filteredChats.map((item) => (
                    <div className={`chat-history-item ${chatId === item.id ? 'current' : ''}`} key={item.id}>
                        <button className="chat-history-open" onClick={() => onOpenChat(item.id)} disabled={busy} title={item.title}>
                            <MessageSquare size={15} />
                            <span>{item.title}</span>
                        </button>
                        <button className="chat-history-action" onClick={() => onRenameChat(item)} disabled={busy} aria-label={`Rename ${item.title}`} title="Rename">
                            ✎
                        </button>
                        <button className="chat-history-action" onClick={() => onDeleteChat(item)} disabled={busy} aria-label={`Delete ${item.title}`} title="Delete">
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                {!chats.length && <p className="caption chat-history-empty">Your saved conversations will appear here.</p>}
                {!!chats.length && !filteredChats.length && <p className="caption chat-history-empty">No conversations match your search.</p>}
            </div>
        </aside>
    );
}
