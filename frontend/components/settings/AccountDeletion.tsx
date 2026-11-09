'use client';

import { useState } from 'react';
import { api } from '../../lib/api';

export function AccountDeletion({ email, onDeleted }: { email: string; onDeleted: () => void }) {
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    return (
        <section className="settings-card settings-danger" aria-label="Delete account">
            <h2>Delete account</h2>
            <p>Permanently delete your account, private workspaces, saved chats, and connections. Transfer or delete shared workspaces and organisations you own first.</p>
            <p>For security, sign in again if your current session is more than 10 minutes old.</p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (busy || confirmation !== email) return;
                    setBusy(true);
                    setError('');
                    void api('/me', { method: 'DELETE', body: JSON.stringify({ email: confirmation }) })
                        .then(onDeleted)
                        .catch((failure: Error) => setError(failure.message))
                        .finally(() => setBusy(false));
                }}
            >
                <label>
                    Type {email} to confirm
                    <input type="email" value={confirmation} autoComplete="off" disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
                </label>
                <button className="btn danger" disabled={busy || confirmation !== email}>
                    {busy ? 'Deleting…' : 'Delete account'}
                </button>
            </form>
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
