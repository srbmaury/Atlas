'use client';
import Link from 'next/link';
import { ChevronDown, PanelLeftClose, Search, FileText, FolderOpen, Home as HomeIcon, MessageSquare, Clock3, LogOut, Settings2, Pencil, Trash2, Pin, Plus, X, Sparkles } from 'lucide-react';
import type { ChatSummary, Workspace } from '../../lib/types';
import { AtlasMark } from '../ui/WorkspacePrimitives';
type Tab = 'overview' | 'chat' | 'documents' | 'sources' | 'agents';

interface WorkspaceSidebarProps {
    open: boolean;
    onCollapse: () => void;
    onClose: () => void;
    onNewChat: () => void;
    busy: boolean;
    onWorkspaceSettings: () => void;
    workspace?: Workspace;
    workspaceCount: number;
    tab: Tab;
    onNavigate: (tab: Tab) => void;
    chats: ChatSummary[];
    activeChatId?: string | null;
    onOpenChat: (id: string) => void;
    onAllChats: () => void;
    onRenameChat: (chat: ChatSummary) => void;
    onDeleteChat: (chat: ChatSummary) => void;
    readyCount: number;
    storageLabel: string;
    initials: string;
    email: string;
    displayName?: string | null;
    onSignOut: () => void;
}
export function WorkspaceSidebar({
    open,
    onCollapse,
    onClose,
    onNewChat,
    busy,
    onWorkspaceSettings,
    workspace,
    workspaceCount,
    tab,
    onNavigate,
    chats,
    activeChatId,
    onOpenChat,
    onAllChats,
    onRenameChat,
    onDeleteChat,
    readyCount,
    storageLabel,
    initials,
    email,
    displayName,
    onSignOut,
}: WorkspaceSidebarProps) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const recent = chats.filter((chat) => !chat.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated);
    const groups = [
        { label: 'Today', items: recent.filter((item) => (item.updated < 1e12 ? item.updated * 1000 : item.updated) >= dayStart) },
        { label: 'Earlier', items: recent.filter((item) => (item.updated < 1e12 ? item.updated * 1000 : item.updated) < dayStart) },
    ];
    return (
        <aside className={`sidebar ${open ? 'open' : ''}`}>
            <div className="brand-row">
                <AtlasMark />
                <span>Atlas</span>
                <button className="sidebar-collapse" aria-label="Collapse sidebar" onClick={onCollapse}>
                    <PanelLeftClose />
                </button>
                <button type="button" className="icon-button mobile-drawer-close" aria-label="Close sidebar" onClick={onClose}>
                    <X />
                </button>
            </div>
            <button aria-label="Switch workspace" className="workspace-btn" onClick={onWorkspaceSettings}>
                <span className="ws-avatar">{workspace?.name[0]?.toUpperCase() || 'A'}</span>
                <span>
                    <strong>{workspace?.name || 'Choose workspace'}</strong>
                    <small>
                        {workspaceCount} workspace{workspaceCount === 1 ? '' : 's'}
                    </small>
                </span>
                <ChevronDown />
            </button>
            <nav className="nav" aria-label="Main navigation">
                {(
                    [
                        { id: 'overview', label: 'Overview', icon: HomeIcon },
                        { id: 'chat', label: 'Ask Atlas', icon: MessageSquare },
                        { id: 'documents', label: 'Documents', icon: FileText },
                        { id: 'sources', label: 'Connected sources', icon: FolderOpen },
                        { id: 'agents', label: 'Agents', icon: Sparkles },
                    ] as const
                ).map((item) => (
                    <button key={item.id} className={tab === item.id ? 'active' : ''} title={item.label} aria-current={tab === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
                        <item.icon />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="sidebar-research" aria-label="Recent conversations">
                <div className="sidebar-research-heading">
                    <div className="section-label">RECENT RESEARCH</div>
                    <button type="button" className="mobile-drawer-view-all" aria-label={`All conversations (${chats.length})`} onClick={onAllChats}>
                        View all
                    </button>
                </div>
                {groups.map(
                    (group) =>
                        group.items.length > 0 && (
                            <div className="sidebar-chat-group" key={group.label}>
                                <span className="sidebar-chat-date">{group.label}</span>
                                {group.items.map((item) => (
                                    <div className="sidebar-chat-row" key={item.id}>
                                        <button
                                            className={`workspace-stat ${activeChatId === item.id ? 'active' : ''}`}
                                            aria-current={activeChatId === item.id ? 'true' : undefined}
                                            onClick={() => onOpenChat(item.id)}
                                            title={item.title}
                                        >
                                            {item.pinned ? <Pin /> : <MessageSquare />}
                                            <span>{item.title}</span>
                                        </button>
                                        <div className="sidebar-chat-actions">
                                            <button type="button" aria-label={`Rename ${item.title}`} title="Rename" onClick={() => onRenameChat(item)}>
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" aria-label={`Delete ${item.title}`} title="Delete" onClick={() => onDeleteChat(item)}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ),
                )}
                <button className="workspace-stat sidebar-all-chats" onClick={onAllChats}>
                    <Clock3 />
                    <span>All conversations ({chats.length})</span>
                </button>
            </div>
            <div className="bottom">
                <Link className="sidebar-settings-entry" href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`}>
                    <Settings2 size={16} />
                    <span>Account & settings</span>
                </Link>
                <button type="button" className="btn primary mobile-drawer-new" disabled={busy} onClick={onNewChat}>
                    <Plus size={16} /> New chat
                </button>
                <div className="usage" title={`${readyCount} documents ready · ${storageLabel} stored`}>
                    <span>Storage</span>
                    <strong>{storageLabel}</strong>
                </div>
                <div className="profile">
                    <Link className="profile-settings-link" aria-label="Account settings" href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`}>
                        <span className="avatar">{initials}</span>
                        <div>
                            <strong>{displayName || email.split('@')[0]}</strong>
                            <small>{email}</small>
                        </div>
                    </Link>
                    <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
                        <LogOut />
                    </button>
                </div>
            </div>
        </aside>
    );
}
