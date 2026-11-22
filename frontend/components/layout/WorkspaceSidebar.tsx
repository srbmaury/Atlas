'use client';

import Link from 'next/link';
import { IconButton, Tooltip } from '@mui/material';
import {
    BookOpenText,
    ChevronDown,
    CircleHelp,
    Clock3,
    FileText,
    FolderClosed,
    FolderPlus,
    LogOut,
    MessageSquare,
    PanelLeftClose,
    Pencil,
    Plug,
    Plus,
    Settings2,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import type { ChatSummary, Workspace } from '../../lib/types';
import { AtlasBrand } from '../ui/AtlasBrand';

type Tab = 'overview' | 'chat' | 'documents' | 'sources' | 'agents';
interface WorkspaceSidebarProps {
    open: boolean;
    collapsed: boolean;
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

const mainNavigation = [
    { id: 'overview', label: 'Research', icon: MessageSquare },
    { id: 'documents', label: 'Library', icon: BookOpenText },
    { id: 'sources', label: 'Connectors', icon: Plug },
    { id: 'chat', label: 'Ask Atlas', icon: Sparkles },
    { id: 'agents', label: 'Agent Studio', icon: FolderClosed },
] as const;

export function WorkspaceSidebar({
    open,
    collapsed,
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
    const recent = [...chats]
        .filter((chat) => !chat.archived)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated)
        .slice(0, 4);
    const settingsUrl = `/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`;
    const handleNavigate = (next: Tab) => {
        onNavigate(next);
        onClose();
    };
    const handleOpenChat = (id: string) => {
        onOpenChat(id);
        onClose();
    };

    return (
        <aside className={`sidebar atlas-reference-sidebar ${open ? 'open' : ''}`} aria-label="Workspace sidebar">
            <div className="atlas-ref-sidebar-body">
                <div className="atlas-ref-brand">
                    <AtlasBrand size={38} />
                    <span>Atlas</span>
                    <div className="atlas-ref-brand-actions">
                        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                            <IconButton className="sidebar-collapse" onClick={onCollapse} size="small" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} sx={{ color: '#aeb8d3' }}>
                                <PanelLeftClose size={18} />
                            </IconButton>
                        </Tooltip>
                        <IconButton className="atlas-ref-close-mobile" onClick={onClose} size="small" aria-label="Close sidebar" sx={{ color: '#cbd4ed' }}>
                            <X size={19} />
                        </IconButton>
                    </div>
                </div>

                <nav className="atlas-ref-nav" aria-label="Main navigation">
                    {mainNavigation.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            className="atlas-ref-nav-item"
                            data-active={tab === id}
                            aria-current={tab === id ? 'page' : undefined}
                            title={label}
                            onClick={() => handleNavigate(id)}
                        >
                            <Icon size={19} />
                            <span>{label}</span>
                        </button>
                    ))}
                    <button
                        type="button"
                        className="atlas-ref-nav-item"
                        onClick={() => {
                            onNewChat();
                            onClose();
                        }}
                        disabled={busy}
                        title="New chat"
                    >
                        <Plus size={19} />
                        <span>New chat</span>
                    </button>
                </nav>

                <div className="atlas-ref-sidebar-label">Workspaces</div>
                <button className="atlas-ref-workspace" data-selected="true" type="button" onClick={onWorkspaceSettings} aria-label="Switch workspace" title={workspace?.name || 'Choose workspace'}>
                    <FolderClosed size={18} color="#a174fb" />
                    <span className="min-w-0 flex-1 truncate">{workspace?.name || 'My workspace'}</span>
                    <ChevronDown size={15} />
                </button>
                <button className="atlas-ref-workspace" type="button" onClick={onWorkspaceSettings} title="Manage workspaces">
                    <FolderPlus size={17} color="#97a6c5" />
                    <span>Manage {workspaceCount > 1 ? `${workspaceCount} workspaces` : 'workspaces'}</span>
                </button>

                <div className="atlas-ref-sidebar-label">Recent research</div>
                <div className="atlas-ref-recent">
                    {recent.map((chat) => (
                        <div key={chat.id} className="group flex min-w-0 items-center gap-1">
                            <button type="button" onClick={() => handleOpenChat(chat.id)} aria-current={activeChatId === chat.id ? 'true' : undefined} title={chat.title}>
                                <MessageSquare size={14} />
                                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                            </button>
                            <Tooltip title="Rename conversation">
                                <IconButton onClick={() => onRenameChat(chat)} aria-label={`Rename ${chat.title}`} size="small" sx={{ color: '#97a6c5', padding: '3px' }}>
                                    <Pencil size={13} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete conversation">
                                <IconButton onClick={() => onDeleteChat(chat)} aria-label={`Delete ${chat.title}`} size="small" sx={{ color: '#97a6c5', padding: '3px' }}>
                                    <Trash2 size={13} />
                                </IconButton>
                            </Tooltip>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            onAllChats();
                            onClose();
                        }}
                    >
                        <Clock3 size={15} />
                        <span>View all conversations</span>
                    </button>
                </div>

                <div className="atlas-ref-usage" title={`${readyCount} documents ready · ${storageLabel} stored`}>
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="rounded-full bg-[#5948c4] px-2 py-0.5 text-white">Workspace</span>
                        <span>{readyCount} ready</span>
                    </div>
                    <div className="mt-3 flex justify-between text-xs text-[#b8c3de]">
                        <span>Document storage</span>
                        <span>{storageLabel}</span>
                    </div>
                </div>
                <div className="atlas-ref-sidebar-bottom">
                    <Link className="atlas-ref-sidebar-link" href={settingsUrl}>
                        <Settings2 size={17} />
                        <span>Settings</span>
                    </Link>
                    <a className="atlas-ref-sidebar-link" href="https://github.com/srbmaury/Atlas#readme" target="_blank" rel="noopener noreferrer">
                        <CircleHelp size={17} />
                        <span>Help & Docs</span>
                    </a>
                    <div className="atlas-ref-profile">
                        <span className="atlas-ref-profile-avatar">{initials}</span>
                        <Link href={settingsUrl} className="min-w-0 flex-1 text-inherit no-underline" aria-label="Account settings">
                            <span className="block truncate font-bold">{displayName || email.split('@')[0]}</span>
                            <span className="block truncate text-[11px] text-[#a2aec9]">{email}</span>
                        </Link>
                        <Tooltip title="Sign out">
                            <IconButton size="small" onClick={onSignOut} aria-label="Sign out" sx={{ color: '#aab6d2' }}>
                                <LogOut size={17} />
                            </IconButton>
                        </Tooltip>
                    </div>
                </div>
            </div>
        </aside>
    );
}
