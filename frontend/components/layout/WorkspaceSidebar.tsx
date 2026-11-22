'use client';

import Link from 'next/link';
import { Avatar, Box, Button, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { ChevronDown, PanelLeftClose, FileText, FolderOpen, Home as HomeIcon, MessageSquare, Clock3, LogOut, Settings2, Pencil, Trash2, Pin, Plus, X, Sparkles } from 'lucide-react';
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

const navigation = [
    { id: 'overview', label: 'Overview', icon: HomeIcon },
    { id: 'chat', label: 'Research', icon: MessageSquare },
    { id: 'documents', label: 'Library', icon: FileText },
    { id: 'sources', label: 'Integrations', icon: FolderOpen },
    { id: 'agents', label: 'Agent studio', icon: Sparkles },
] as const;

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
    const recent = [...chats]
        .filter((chat) => !chat.archived)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated)
        .slice(0, 10);
    const groups = [
        { label: 'Today', items: recent.filter((item) => (item.updated < 1e12 ? item.updated * 1000 : item.updated) >= dayStart) },
        { label: 'Earlier', items: recent.filter((item) => (item.updated < 1e12 ? item.updated * 1000 : item.updated) < dayStart) },
    ];

    return (
        <aside className={`sidebar ${open ? 'open' : ''} flex flex-col bg-[#151d33] text-slate-100`} aria-label="Workspace sidebar">
            <div className="brand-row">
                <AtlasMark />
                <span>Atlas</span>
                <Tooltip title="Collapse sidebar">
                    <IconButton className="sidebar-collapse" size="small" aria-label="Collapse sidebar" onClick={onCollapse} sx={{ ml: 'auto', color: '#c5cbe4' }}>
                        <PanelLeftClose size={19} />
                    </IconButton>
                </Tooltip>
                <IconButton className="mobile-drawer-close" size="small" aria-label="Close sidebar" onClick={onClose} sx={{ color: '#c5cbe4' }}>
                    <X size={20} />
                </IconButton>
            </div>
            <Button
                fullWidth
                color="inherit"
                variant="outlined"
                aria-label="Switch workspace"
                onClick={onWorkspaceSettings}
                sx={{
                    my: 2,
                    mx: 'auto',
                    width: 'calc(100% - 28px)',
                    justifyContent: 'flex-start',
                    gap: 1.2,
                    borderColor: 'rgba(220,224,255,.18)',
                    color: '#f6f6ff',
                    textAlign: 'left',
                    p: 1.25,
                    '&:hover': { bgcolor: 'rgba(255,255,255,.08)', borderColor: 'rgba(220,224,255,.3)' },
                }}
            >
                <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: '#554dd5', fontWeight: 800, fontSize: 14 }}>
                    {workspace?.name[0]?.toUpperCase() || 'A'}
                </Avatar>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{workspace?.name || 'Choose workspace'}</span>
                    <span className="block text-[11px] font-normal text-slate-400">
                        {workspaceCount} workspace{workspaceCount === 1 ? '' : 's'}
                    </span>
                </span>
                <ChevronDown size={16} />
            </Button>
            <Box component="nav" aria-label="Main navigation" sx={{ px: 1.5, pb: 1.5 }}>
                <Typography variant="overline" sx={{ color: '#8999ba', letterSpacing: '.14em', pl: 2, fontWeight: 800 }}>
                    Workspace
                </Typography>
                <List disablePadding sx={{ mt: 1 }}>
                    {navigation.map(({ id, label, icon: Icon }) => (
                        <ListItemButton
                            key={id}
                            selected={tab === id}
                            aria-current={tab === id ? 'page' : undefined}
                            onClick={() => onNavigate(id)}
                            sx={{
                                borderRadius: 2.3,
                                mb: 0.5,
                                minHeight: 43,
                                color: tab === id ? '#ffffff' : '#c3cee9',
                                bgcolor: tab === id ? 'rgba(109,112,244,.24)' : 'transparent',
                                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(109,112,244,.24)', color: 'white' },
                                '&:hover': { bgcolor: 'rgba(255,255,255,.07)' },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 35, color: tab === id ? '#aaa8ff' : '#8ea1c7' }}>
                                <Icon size={19} />
                            </ListItemIcon>
                            <ListItemText primary={label} slotProps={{ primary: { fontWeight: tab === id ? 800 : 600, fontSize: 13 } }} />
                        </ListItemButton>
                    ))}
                </List>
                <Button variant="contained" disabled={busy} startIcon={<Plus size={17} />} onClick={onNewChat} fullWidth sx={{ mt: 1.5, bgcolor: '#605be9', '&:hover': { bgcolor: '#7571f0' } }}>
                    New research
                </Button>
            </Box>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Recent conversations">
                <div className="mb-2 flex items-center justify-between gap-2 px-2">
                    <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '.12em', color: '#8999ba' }}>
                        Recent research
                    </Typography>
                    <Button size="small" onClick={onAllChats} sx={{ color: '#b6b7ff', minWidth: 0, p: 0.5 }}>
                        View all
                    </Button>
                </div>
                {groups.map(
                    (group) =>
                        group.items.length > 0 && (
                            <div key={group.label} className="mb-4">
                                <Typography variant="caption" sx={{ color: '#91a0bc', display: 'block', px: 1, mb: 0.6 }}>
                                    {group.label}
                                </Typography>
                                {group.items.map((item) => (
                                    <div className="group flex items-center" key={item.id}>
                                        <ListItemButton
                                            onClick={() => onOpenChat(item.id)}
                                            selected={activeChatId === item.id}
                                            aria-current={activeChatId === item.id ? 'true' : undefined}
                                            title={item.title}
                                            sx={{
                                                flex: 1,
                                                minWidth: 0,
                                                borderRadius: 2,
                                                px: 1,
                                                py: 0.5,
                                                color: '#c3cee9',
                                                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(120,122,225,.20)', color: 'white' },
                                                '&:hover': { bgcolor: 'rgba(255,255,255,.07)' },
                                            }}
                                        >
                                            <ListItemIcon sx={{ minWidth: 28, color: '#94a6c9' }}>{item.pinned ? <Pin size={15} /> : <MessageSquare size={15} />}</ListItemIcon>
                                            <ListItemText primary={item.title} slotProps={{ primary: { noWrap: true, fontSize: 12 } }} />
                                        </ListItemButton>
                                        <Tooltip title="Rename conversation">
                                            <IconButton size="small" aria-label={`Rename ${item.title}`} onClick={() => onRenameChat(item)} sx={{ color: '#9aa9c6' }}>
                                                <Pencil size={14} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete conversation">
                                            <IconButton size="small" aria-label={`Delete ${item.title}`} onClick={() => onDeleteChat(item)} sx={{ color: '#9aa9c6' }}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        ),
                )}
                <Button startIcon={<Clock3 size={16} />} size="small" fullWidth onClick={onAllChats} sx={{ justifyContent: 'flex-start', color: '#aeb9dc' }}>
                    All conversations ({chats.length})
                </Button>
            </div>
            <div className="bottom">
                <Link className="sidebar-settings-entry" href={`/settings?workspaceId=${encodeURIComponent(workspace?.id || '')}`}>
                    <Settings2 size={16} />
                    <span>Account & settings</span>
                </Link>
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
                    <Tooltip title="Sign out">
                        <IconButton aria-label="Sign out" onClick={onSignOut} sx={{ color: '#c3cee9' }}>
                            <LogOut size={19} />
                        </IconButton>
                    </Tooltip>
                </div>
            </div>
        </aside>
    );
}
