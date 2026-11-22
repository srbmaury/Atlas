'use client';

import Link from 'next/link';
import { Avatar, Button, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { BookOpen, ChevronDown, CircleHelp, FileText, Folder, FolderPlus, Globe2, LogOut, MessageSquareText, PanelLeftClose, Pin, Plus, Settings2, Sparkles, X } from 'lucide-react';
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
    onSelectWorkspace?: (id: string) => void;
    workspaces?: Workspace[];
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

const navigation = [
    { id: 'overview', label: 'Research', icon: MessageSquareText },
    { id: 'documents', label: 'Library', icon: BookOpen },
    { id: 'sources', label: 'Connectors', icon: Globe2 },
] as const;

export function WorkspaceSidebar({
    open, onCollapse, onClose, onNewChat, busy, onWorkspaceSettings, onSelectWorkspace, workspaces = [],
    workspace, workspaceCount, tab, onNavigate, chats, activeChatId, onOpenChat, onAllChats,
    readyCount, storageLabel, initials, email, displayName, onSignOut,
}: WorkspaceSidebarProps) {
    const go = (next: Tab) => { onNavigate(next); onClose(); };
    return (
        <aside className={`sidebar atlas-reference-sidebar ${open ? 'open' : ''}`} aria-label="Workspace sidebar">
            <div className="atlas-reference-sidebar-header">
                <div className="atlas-reference-sidebar-brand"><AtlasMark/><span>Atlas</span></div>
                <Tooltip title="Collapse sidebar">
                    <IconButton className="sidebar-collapse" aria-label="Collapse sidebar" size="small" onClick={onCollapse}><PanelLeftClose size={18}/></IconButton>
                </Tooltip>
                <IconButton className="mobile-drawer-close" aria-label="Close sidebar" size="small" onClick={onClose}><X size={19}/></IconButton>
            </div>

            <nav aria-label="Main navigation" className="atlas-reference-sidebar-nav">
                <List disablePadding>
                    {navigation.map(({ id, label, icon: Icon }) => (
                        <ListItemButton className="atlas-reference-nav-item" key={id}
                            selected={tab === id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
                            <ListItemIcon><Icon size={19}/></ListItemIcon>
                            <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: tab === id ? 800 : 600, fontSize: 14 } } }}/>
                        </ListItemButton>
                    ))}
                    <ListItemButton className="atlas-reference-nav-item atlas-reference-nav-subtle" selected={tab === 'chat'}
                        aria-current={tab === 'chat' ? 'page' : undefined} onClick={() => go('chat')}>
                        <ListItemIcon><Sparkles size={19}/></ListItemIcon>
                        <ListItemText primary="Ask Atlas" slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 13 } } }}/>
                    </ListItemButton>
                </List>
            </nav>

            <div className="atlas-reference-sidebar-workspaces">
                <button type="button" className="atlas-reference-workspace-heading" onClick={onWorkspaceSettings}
                    aria-label="Manage workspaces">
                    <Folder size={17}/><span>Workspaces</span><ChevronDown size={16}/>
                </button>
                <div className="atlas-reference-workspace-list">
                    {(workspaces.length ? workspaces : workspace ? [workspace] : []).slice(0, 8).map((item) => (
                        <button key={item.id} type="button" aria-current={workspace?.id === item.id ? 'true' : undefined}
                            className={`atlas-reference-workspace-item ${workspace?.id === item.id ? 'is-active' : ''}`}
                            onClick={() => { onSelectWorkspace?.(item.id); onClose(); }}>
                            <Folder size={17}/><span>{item.name}</span>
                        </button>
                    ))}
                </div>
                <button type="button" className="atlas-reference-new-workspace" onClick={onWorkspaceSettings}>
                    <Plus size={16}/> New Workspace
                </button>
                <button type="button" className="atlas-reference-sidebar-tool" onClick={() => go('agents')}>
                    <Sparkles size={17}/> Agent studio
                </button>
                <button type="button" className="atlas-reference-sidebar-tool" onClick={() => { onAllChats(); onClose(); }}>
                    <MessageSquareText size={17}/> All conversations {chats.length > 0 ? `(${chats.length})` : ''}
                </button>
                {activeChatId && chats.some((chat) => chat.id === activeChatId) && (
                    <button type="button" className="atlas-reference-active-chat" onClick={() => { onOpenChat(activeChatId); onClose(); }}>
                        <Pin size={15}/><span>{chats.find((chat) => chat.id === activeChatId)?.title}</span>
                    </button>
                )}
            </div>

            <div className="atlas-reference-sidebar-bottom">
                <div className="atlas-reference-usage">
                    <div className="atlas-reference-usage-heading"><span>Workspace usage</span><span className="atlas-reference-usage-pro">Atlas</span></div>
                    <div className="atlas-reference-usage-details"><FileText size={16}/><span>{readyCount} documents ready</span></div>
                    <div className="atlas-reference-usage-storage">{storageLabel} stored · {workspaceCount} workspace{workspaceCount === 1 ? '' : 's'}</div>
                </div>
                <Link href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`} className="atlas-reference-bottom-link">
                    <Settings2 size={19}/> Settings
                </Link>
                <a href="https://github.com/srbmaury/Atlas#readme" target="_blank" rel="noopener noreferrer" className="atlas-reference-bottom-link">
                    <CircleHelp size={19}/> Help &amp; Docs
                </a>
                <div className="atlas-reference-profile">
                    <Link href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`} className="atlas-reference-profile-link" aria-label="Account settings">
                        <Avatar sx={{ width: 36, height: 36, bgcolor: '#7757e8', fontSize: 15, fontWeight: 800 }}>{initials}</Avatar>
                        <span><strong>{displayName || email.split('@')[0]}</strong><small>{email}</small></span>
                    </Link>
                    <Tooltip title="Sign out"><IconButton onClick={onSignOut} size="small" aria-label="Sign out"><LogOut size={18}/></IconButton></Tooltip>
                </div>
            </div>
        </aside>
    );
}
