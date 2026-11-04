'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import type { Workspace } from '../../lib/types';

export function WorkspaceDeletion({ workspace, onDeleted }: { workspace: Workspace; onDeleted: () => Promise<void> }) {
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <section className="settings-card settings-danger" aria-label="Delete workspace">
            <h2>Delete workspace</h2>
            <p>Permanently remove this workspace, its documents, indexed passages and saved conversations. This cannot be undone.</p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (busy || confirmation !== workspace.name) return;
                    setBusy(true);
                    setError('');
                    void api(`/workspaces/${workspace.id}`, { method: 'DELETE', body: JSON.stringify({ name: confirmation }) })
                        .then(onDeleted)
                        .catch((failure: Error) => setError(failure.message))
                        .finally(() => setBusy(false));
                }}
            >
                <label>
                    Type {workspace.name} to confirm
                    <input aria-label="Type workspace name to confirm" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
                </label>
                <button className="btn danger" disabled={busy || confirmation !== workspace.name}>
                    {busy ? 'Deleting…' : 'Delete workspace'}
                </button>
            </form>
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
