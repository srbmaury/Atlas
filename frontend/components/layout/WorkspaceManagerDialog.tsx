'use client';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Plus, Settings } from 'lucide-react';
import type { Workspace } from '../../lib/types';
import { Dialog } from '../ui/WorkspacePrimitives';

export function WorkspaceManagerDialog({
    workspaces,
    activeId,
    busy,
    uploading,
    name,
    onClose,
    onSelect,
    onName,
    onCreate,
}: {
    workspaces: Workspace[];
    activeId: string;
    busy: boolean;
    uploading: boolean;
    name: string;
    onClose: () => void;
    onSelect: (id: string) => void;
    onName: (value: string) => void;
    onCreate: (event: FormEvent) => void;
}) {
    return (
        <Dialog title="Your workspaces" onClose={onClose}>
            <p className="dialog-intro">Switch workspaces or create a new space for your research.</p>
            <div className="workspace-list">
                {workspaces.map((workspace) => (
                    <div className="workspace-manage-row" key={workspace.id}>
                        <button className={workspace.id === activeId ? 'selected' : ''} disabled={busy || uploading} onClick={() => onSelect(workspace.id)}>
                            <span className="ws-avatar">{workspace.name[0].toUpperCase()}</span>
                            <strong>
                                {workspace.name}
                                <small className="workspace-role">
                                    {workspace.role || 'viewer'} · {workspace.organisation_id ? 'Organisation' : 'Personal'}
                                </small>
                            </strong>
                            {workspace.id === activeId ? <Check /> : <ChevronRight />}
                        </button>
                    </div>
                ))}
            </div>
            <form className="workspace-form" onSubmit={onCreate}>
                <label>
                    New workspace
                    <input required maxLength={100} disabled={busy || uploading} value={name} onChange={(event) => onName(event.target.value)} placeholder="e.g. Product research" />
                </label>
                <button className="btn primary" disabled={busy || uploading || !name.trim()}>
                    <Plus />
                    Create workspace
                </button>
            </form>
            <div className="workspace-settings-link">
                <Link href={`/settings?section=workspace${activeId ? `&workspaceId=${encodeURIComponent(activeId)}` : ''}`}>
                    <Settings size={16} />
                    Members, permissions &amp; workspace settings
                    <ChevronRight size={16} />
                </Link>
            </div>
        </Dialog>
    );
}
