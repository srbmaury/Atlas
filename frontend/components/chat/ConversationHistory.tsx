'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { RotateCcw, Plus, MessageSquare, Trash2, Search, Pencil, X, Pin, Archive, ArchiveRestore, MoreHorizontal } from 'lucide-react';
import type { ChatSummary } from '../../lib/types';

interface ConversationHistoryProps {
    chats: ChatSummary[];
    workspaceId: string;
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

export function ConversationHistory({ chats, workspaceId, chatId, busy, onRefresh, onNewChat, onOpenChat, onRenameChat, onDeleteChat, onDeleteChats }: ConversationHistoryProps) {
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [actionMenu, setActionMenu] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    useEffect(() => {
        if (!actionMenu) return;
        const dismiss = () => setActionMenu(null);
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('keydown', onKey);
        };
    }, [actionMenu]);
    function toggleMenu(id: string, element: HTMLButtonElement) {
        if (actionMenu === id) { setActionMenu(null); return; }
        const rect = element.getBoundingClientRect();
        const height = 176;
        const top = window.innerHeight - rect.bottom >= height + 12 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
        const left = Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184));
        setMenuPosition({ top, left });
        setActionMenu(id);
    }
    const [actionError, setActionError] = useState('');
    const [saving, setSaving] = useState<string | null>(null);
    async function updateOrganization(item: ChatSummary, field: 'pinned' | 'archived') {
        if (saving) return;
        setSaving(item.id);
        setActionError('');
        try {
            await api(`/workspaces/${workspaceId}/conversations/${item.id}/organization`, {
                method: 'PATCH',
                body: JSON.stringify({ [field]: !item[field] }),
            });
            onRefresh();
            setActionMenu(null);
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setSaving(null);
        }
    }
    const pinned = chats.filter((chat) => chat.pinned).map((chat) => chat.id);
    const archived = chats.filter((chat) => chat.archived).map((chat) => chat.id);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const filteredChats = useMemo(
        () =>
            chats
                .filter((chat) => (showArchived ? archived.includes(chat.id) : !archived.includes(chat.id)) && chat.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
                .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) || b.updated - a.updated),
        [chats, search, pinned, archived, showArchived],
    );

    const selectedVisible = filteredChats.filter((chat) => selected.includes(chat.id));
    const allVisibleSelected = filteredChats.length > 0 && filteredChats.every((chat) => selected.includes(chat.id));
    const toggleSelection = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    const exitSelection = () => {
        setSelecting(false);
        setSelected([]);
    };

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
                    <button type="button" disabled={busy} onClick={() => (selecting ? exitSelection() : setSelecting(true))}>
                        {selecting ? 'Cancel' : 'Select chats'}
                    </button>
                    {selecting && (
                        <>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    disabled={busy || !filteredChats.length}
                                    onChange={(event) =>
                                        setSelected((current) =>
                                            event.target.checked
                                                ? [...new Set([...current, ...filteredChats.map((chat) => chat.id)])]
                                                : current.filter((id) => !filteredChats.some((chat) => chat.id === id)),
                                        )
                                    }
                                />{' '}
                                Select all shown
                            </label>
                            <button
                                type="button"
                                disabled={busy || !selectedVisible.length}
                                onClick={() => {
                                    onDeleteChats(selectedVisible);
                                }}
                            >
                                <Trash2 size={14} aria-hidden="true" /> Delete ({selectedVisible.length})
                            </button>
                        </>
                    )}
                </div>
            )}
            {actionError && (
                <p role="alert" className="caption">
                    {actionError}
                </p>
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
            <div className="chat-history-selection-toolbar">
                <button
                    type="button"
                    aria-pressed={!showArchived}
                    onClick={() => {
                        setShowArchived(false);
                        setSelected([]);
                    }}
                >
                    Active ({chats.filter((chat) => !archived.includes(chat.id)).length})
                </button>
                <button
                    type="button"
                    aria-pressed={showArchived}
                    onClick={() => {
                        setShowArchived(true);
                        setSelected([]);
                    }}
                >
                    Archived ({chats.filter((chat) => archived.includes(chat.id)).length})
                </button>
            </div>
            <div className="chat-history-list" aria-label="Saved conversations">
                {filteredChats.map((item) => (
                    <div className={`chat-history-item ${chatId === item.id ? 'current' : ''}`} key={item.id}>
                        {selecting && <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item.id)} disabled={busy} onChange={() => toggleSelection(item.id)} />}
                        <button
                            type="button"
                            className="chat-history-open"
                            onClick={() => (selecting ? toggleSelection(item.id) : onOpenChat(item.id))}
                            disabled={busy}
                            aria-current={chatId === item.id ? 'page' : undefined}
                            title={item.title}
                        >
                            <MessageSquare size={15} aria-hidden="true" />
                            <span className="chat-history-details">
                                <span className="chat-history-title">
                                    {pinned.includes(item.id) && <Pin size={12} aria-label="Pinned" />} {item.title}
                                </span>
                                <span className="chat-history-date">{conversationDate(item.updated)}</span>
                            </span>
                        </button>
                        {!selecting && (
                            <div className="chat-history-menu-wrap">
                                <button
                                    type="button"
                                    className="chat-history-action"
                                    aria-label={`Actions for ${item.title}`}
                                    aria-expanded={actionMenu === item.id}
                                    onClick={(event) => toggleMenu(item.id, event.currentTarget)}
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                                {actionMenu === item.id && menuPosition && typeof document !== 'undefined' && createPortal(
                                    <div className="chat-history-menu chat-history-menu-portal" role="menu" style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: 176 }}>
                                        <button type="button" role="menuitem" disabled={saving === item.id} onClick={() => void updateOrganization(item, 'pinned')}>
                                            <Pin size={14} /> {item.pinned ? 'Unpin' : 'Pin'}
                                        </button>
                                        <button type="button" role="menuitem" disabled={saving === item.id} onClick={() => void updateOrganization(item, 'archived')}>
                                            {item.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {item.archived ? 'Restore' : 'Archive'}
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => { setActionMenu(null); onRenameChat(item); }}>
                                            <Pencil size={14} /> Rename
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => { setActionMenu(null); onDeleteChat(item); }}>
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>,
                                    document.body,
                                )}
                            </div>
                        )}
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
