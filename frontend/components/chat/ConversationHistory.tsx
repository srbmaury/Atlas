'use client';
import { useMemo, useState } from 'react';
import { RotateCcw, Plus, MessageSquare, Trash2, Search, Pencil, X } from 'lucide-react';
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
    onDeleteChats: (items: ChatSummary[]) => void;
}

function conversationDate(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function ConversationHistory({ chats, chatId, busy, onRefresh, onNewChat, onOpenChat, onRenameChat, onDeleteChat, onDeleteChats }: ConversationHistoryProps) {
    const [search, setSearch] = useState('');
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const filteredChats = useMemo(() => chats.filter((chat) => chat.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => b.updated - a.updated), [chats, search]);

    const selectedVisible = filteredChats.filter((chat) => selected.includes(chat.id));
    const allVisibleSelected = filteredChats.length > 0 && filteredChats.every((chat) => selected.includes(chat.id));
    const toggleSelection = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const exitSelection = () => { setSelecting(false); setSelected([]); };

    return (
        <aside className="chat-history" aria-label="Conversation history">
            <div className="chat-history-header">
                <strong>Conversations</strong>
                <button type="button" onClick={onRefresh} disabled={busy} title="Refresh saved conversations" aria-label="Refresh saved conversations">
                    <RotateCcw size={15} />
                </button>
                <button type="button" onClick={onNewChat} disabled={busy} title="New conversation" aria-label="New conversation">
                    <Plus size={16} />
                </button>
            </div>
            {!!chats.length && (
                <div className="chat-history-selection-toolbar">
                    <button type="button" disabled={busy} onClick={() => selecting ? exitSelection() : setSelecting(true)}>
                        {selecting ? 'Cancel' : 'Select chats'}
                    </button>
                    {selecting && (
                        <>
                            <label><input type="checkbox" checked={allVisibleSelected} disabled={busy || !filteredChats.length} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...filteredChats.map((chat) => chat.id)])] : current.filter((id) => !filteredChats.some((chat) => chat.id === id)))} /> Select all shown</label>
                            <button type="button" disabled={busy || !selectedVisible.length} onClick={() => { onDeleteChats(selectedVisible); }}>
                                <Trash2 size={14} aria-hidden="true" /> Delete ({selectedVisible.length})
                            </button>
                        </>
                    )}
                </div>
            )}
            <div className="chat-history-search">
                <Search size={15} aria-hidden="true" />
                <input type="text" aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} />
                {search && (
                    <button type="button" className="chat-history-clear" aria-label="Clear conversation search" onClick={() => setSearch('')}>
                        <X size={14} />
                    </button>
                )}
            </div>
            <div className="chat-history-list" aria-label="Saved conversations">
                {filteredChats.map((item) => (
                    <div className={`chat-history-item ${chatId === item.id ? 'current' : ''}`} key={item.id}>
                        {selecting && <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item.id)} disabled={busy} onChange={() => toggleSelection(item.id)} />}
                        <button
                            type="button"
                            className="chat-history-open"
                            onClick={() => selecting ? toggleSelection(item.id) : onOpenChat(item.id)}
                            disabled={busy}
                            aria-current={chatId === item.id ? 'page' : undefined}
                            title={item.title}
                        >
                            <MessageSquare size={15} aria-hidden="true" />
                            <span className="chat-history-details">
                                <span className="chat-history-title">{item.title}</span>
                                <span className="chat-history-date">{conversationDate(item.updated)}</span>
                            </span>
                        </button>
                        {!selecting && <button type="button" className="chat-history-action" onClick={() => onRenameChat(item)} disabled={busy} aria-label={`Rename ${item.title}`} title="Rename">
                            <Pencil size={14} />
                        </button>}
                        {!selecting && <button type="button" className="chat-history-action" onClick={() => onDeleteChat(item)} disabled={busy} aria-label={`Delete ${item.title}`} title="Delete">
                            <Trash2 size={14} />
                        </button>}
                    </div>
                ))}
                {!chats.length && <p className="caption chat-history-empty">Your saved conversations will appear here.</p>}
                {!!chats.length && !filteredChats.length && (
                    <p className="caption chat-history-empty" role="status">
                        No conversations match your search.
                    </p>
                )}
            </div>
        </aside>
    );
}
