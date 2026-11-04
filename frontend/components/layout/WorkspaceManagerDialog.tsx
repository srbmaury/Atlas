'use client';
import type { FormEvent } from 'react';
import { Check, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Workspace } from '../../lib/types';
import { AccessManagement } from './AccessManagement';
import { Dialog } from '../ui/WorkspacePrimitives';

export function WorkspaceManagerDialog({
    workspaces,
    activeId,
    userId,
    busy,
    uploading,
    deleting,
    deleteId,
    confirmation,
    name,
    onClose,
    onSelect,
    onSelectDelete,
    onConfirmation,
    onCancelDelete,
    onDelete,
    onName,
    onCreate,
    onRefresh,
}: {
    workspaces: Workspace[];
    activeId: string;
    userId: string;
    busy: boolean;
    uploading: boolean;
    deleting: boolean;
    deleteId: string | null;
    confirmation: string;
    name: string;
    onClose: () => void;
    onSelect: (id: string) => void;
    onSelectDelete: (id: string) => void;
    onConfirmation: (value: string) => void;
    onCancelDelete: () => void;
    onDelete: () => void;
    onName: (value: string) => void;
    onCreate: (event: FormEvent) => void;
    onRefresh: () => Promise<void>;
}) {
    const target = workspaces.find((workspace) => workspace.id === deleteId);
    return (
        <Dialog title="Your workspaces" onClose={onClose}>
            <p className="dialog-intro">Manage your workspaces and their saved conversations.</p>
            <div className="workspace-list">
                {workspaces.map((workspace) => (
                    <div className="workspace-manage-row" key={workspace.id}>
                        <button className={workspace.id === activeId ? 'selected' : ''} disabled={busy || uploading || deleting} onClick={() => onSelect(workspace.id)}>
                            <span className="ws-avatar">{workspace.name[0].toUpperCase()}</span>
                            <strong>
                                {workspace.name}
                                <small className="workspace-role">
                                    {workspace.role || 'manager'}
                                    {workspace.organisation_id ? ' · organisation' : ' · personal'}
                                </small>
                            </strong>
                            {workspace.id === activeId ? <Check /> : <ChevronRight />}
                        </button>
                        {workspace.role === 'manager' && (
                            <button
                                className="workspace-delete"
                                type="button"
                                title={`Delete ${workspace.name}`}
                                aria-label={`Delete workspace ${workspace.name}`}
                                onClick={() => onSelectDelete(workspace.id)}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {target && (
                <div className="workspace-delete-confirm" role="group" aria-label="Confirm workspace deletion">
                    <strong>Delete “{target.name}”?</strong>
                    <p>This permanently deletes its documents, indexed passages, and saved chats. Type the workspace name to confirm.</p>
                    <input
                        aria-label="Type workspace name to confirm"
                        autoComplete="off"
                        value={confirmation}
                        onChange={(event) => onConfirmation(event.target.value)}
                        placeholder="Exact workspace name"
                    />
                    <div className="dialog-actions">
                        <button className="btn" type="button" onClick={onCancelDelete}>
                            Cancel
                        </button>
                        <button className="btn danger" type="button" disabled={deleting || busy || uploading || confirmation !== target.name} onClick={onDelete}>
                            {deleting ? 'Deleting…' : 'Delete workspace'}
                        </button>
                    </div>
                </div>
            )}
            <form className="workspace-form" onSubmit={onCreate}>
                <label>
                    New workspace
                    <input required maxLength={100} value={name} onChange={(event) => onName(event.target.value)} placeholder="e.g. Product research" />
                </label>
                <button className="btn primary">
                    <Plus />
                    Create workspace
                </button>
            </form>
            <AccessManagement userId={userId} workspace={workspaces.find((item) => item.id === activeId)} onRefresh={onRefresh} />
        </Dialog>
    );
}
