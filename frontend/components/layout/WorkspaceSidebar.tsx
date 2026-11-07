'use client';
import Link from 'next/link';
import { ChevronDown, PanelLeftClose, Search, FileText, FolderOpen, Home as HomeIcon, MessageSquare, Clock3, LogOut, Settings2, Pencil, Trash2 } from 'lucide-react';
import type { ChatSummary, Workspace } from '../../lib/types';
import { AtlasMark } from '../ui/WorkspacePrimitives';
type Tab = 'overview' | 'chat' | 'documents' | 'sources';

interface WorkspaceSidebarProps {
    open: boolean;
    onCollapse: () => void;
    onWorkspaceSettings: () => void;
    workspace?: Workspace;
    workspaceCount: number;
    tab: Tab;
    onNavigate: (tab: Tab) => void;
    chats: ChatSummary[];
    onOpenChat: (id: string) => void;
    onAllChats: () => void;
    onRenameChat: (chat: ChatSummary) => void;
    onDeleteChat: (chat: ChatSummary) => void;
    readyCount: number;
    storageLabel: string;
    initials: string;
    email: string;
    onSignOut: () => void;
}
export function WorkspaceSidebar({
    open,
    onCollapse,
    onWorkspaceSettings,
    workspace,
    workspaceCount,
    tab,
    onNavigate,
    chats,
    onOpenChat,
    onAllChats,
    onRenameChat,
    onDeleteChat,
    readyCount,
    storageLabel,
    initials,
    email,
    onSignOut,
}: WorkspaceSidebarProps) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const recent = [...chats].sort((a,b) => b.updated - a.updated).slice(0, 6);
    const groups = [
        { label: 'Today', items: recent.filter(item => (item.updated < 1e12 ? item.updated * 1000 : item.updated) >= dayStart) },
        { label: 'Earlier', items: recent.filter(item => (item.updated < 1e12 ? item.updated * 1000 : item.updated) < dayStart) },
    ];
    return (
        <aside className={`sidebar ${open ? 'open' : ''}`}>
            <div className="brand-row">
                <AtlasMark />
                <span>Atlas</span>
                <button className="sidebar-collapse" aria-label="Collapse sidebar" onClick={onCollapse}>
                    <PanelLeftClose />
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
                    ] as const
                ).map((item) => (
                    <button key={item.id} className={tab === item.id ? 'active' : ''} title={item.label} aria-current={tab === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
                        <item.icon />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="sidebar-research" aria-label="Recent conversations">
                <div className="section-label">RECENT RESEARCH</div>
                {groups.map(group => group.items.length > 0 && <div className="sidebar-chat-group" key={group.label}>
                    <span className="sidebar-chat-date">{group.label}</span>
                    {group.items.map(item => <div className="sidebar-chat-row" key={item.id}>
                        <button className="workspace-stat" onClick={() => onOpenChat(item.id)} title={item.title}>
                            <MessageSquare/><span>{item.title}</span>
                        </button>
                        <div className="sidebar-chat-actions">
                            <button type="button" aria-label={`Rename ${item.title}`} title="Rename" onClick={() => onRenameChat(item)}><Pencil size={13}/></button>
                            <button type="button" aria-label={`Delete ${item.title}`} title="Delete" onClick={() => onDeleteChat(item)}><Trash2 size={13}/></button>
                        </div>
                    </div>)}
                </div>)}
                <button className="workspace-stat" onClick={onAllChats}>
                    <Clock3 />
                    <span>All conversations ({chats.length})</span>
                </button>
            </div>
            <div className="bottom"><Link className="sidebar-settings-entry" href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`}><Settings2 size={16} /><span>Account & settings</span></Link>
                <div className="usage" title={`${readyCount} documents ready · ${storageLabel} stored`}>
                    <span>Storage</span>
                    <strong>{storageLabel}</strong>
                </div>
                <div className="profile">
                    <Link className="profile-settings-link" aria-label="Account settings" href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`}>
                        <span className="avatar">{initials}</span>
                        <div>
                            <strong>{email.split('@')[0]}</strong>
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
