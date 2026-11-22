'use client';

import Link from 'next/link';
import { IconButton, Tooltip } from '@mui/material';
import {
    BookOpenText,
    ChevronDown,
    CircleHelp,
    FileText,
    FolderClosed,
    FolderPlus,
    LogOut,
    PanelLeftClose,
    Plug,
    Plus,
    Settings2,
    Sparkles,
    X,
} from 'lucide-react';
import type { Workspace } from '../../lib/types';
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
    workspaces?: Workspace[];
    onSelectWorkspace?: (id: string) => void;
    workspaceCount: number;
    tab: Tab;
    onNavigate: (tab: Tab) => void;
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
    workspaces = [],
    onSelectWorkspace,
    workspaceCount,
    tab,
    onNavigate,
    readyCount,
    storageLabel,
    initials,
    email,
    displayName,
    onSignOut,
}: WorkspaceSidebarProps) {
    const settingsUrl = `/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`;
    const handleNavigate = (next: Tab) => {
        onNavigate(next);
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
                {(workspaces.length ? workspaces : workspace ? [workspace] : []).map((item) => (
                    <button
                        className="atlas-ref-workspace"
                        key={item.id}
                        data-selected={workspace?.id === item.id}
                        type="button"
                        aria-current={workspace?.id === item.id ? 'true' : undefined}
                        aria-label={`Switch to ${item.name}`}
                        title={item.name}
                        onClick={() => {
                            onSelectWorkspace?.(item.id);
                            onClose();
                        }}
                    >
                        <FolderClosed size={18} color={workspace?.id === item.id ? '#a174fb' : '#97a6c5'} />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    </button>
                ))}
                <button className="atlas-ref-workspace" type="button" onClick={onWorkspaceSettings} title="Manage workspaces">
                    <FolderPlus size={17} color="#97a6c5" />
                    <span>New or manage workspaces</span>
                    <ChevronDown size={15} />
                </button>

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
