'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { AccessMember } from './OwnershipTransfer';

type AuditEvent = {
    id: string;
    scope_type: string;
    scope_id: string;
    actor_id: string;
    actor_email?: string | null;
    target_email?: string | null;
    action: string;
    target_id?: string | null;
    details: Record<string, unknown>;
    created: number;
};
type AuditPage = { events: AuditEvent[]; next_cursor: string | null };

export function SecurityAudit({ base, members, revision }: { base: string; members: AccessMember[]; revision: number }) {
    const [page, setPage] = useState<AuditPage>({ events: [], next_cursor: null });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setPage({ events: [], next_cursor: null });
        setError('');
        setBusy(true);
        void api<AuditPage>(`${base}/audit?limit=20`)
            .then((result) => {
                if (active) setPage(result);
            })
            .catch((failure: Error) => {
                if (active) setError(failure.message);
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [base, revision]);
    async function more() {
        if (busy || !page.next_cursor) return;
        const target = base;
        setBusy(true);
        setError('');
        try {
            const result = await api<AuditPage>(`${target}/audit?limit=20&cursor=${encodeURIComponent(page.next_cursor)}`);
            setPage((previous) => ({ events: [...previous.events, ...result.events], next_cursor: result.next_cursor }));
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }
    const label = (id?: string | null) => members.find((member) => member.id === id)?.email || id || '—';
    return (
        <section className="access-audit" aria-label="Security history">
            <h3>Security history</h3>
            <p>Role, ownership, and connection-access changes. Entries contain access metadata, never credentials or source content.</p>
            {error && (
                <p role="alert" className="access-error">
                    {error}
                </p>
            )}
            <ul className="access-events">
                {page.events.map((event) => (
                    <li key={event.id}>
                        <strong>{event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
                        <small>
                            {new Date(event.created * 1000).toLocaleString()} · {event.actor_email || label(event.actor_id)}
                        </small>
                        {event.target_id && <small>Target: {event.target_email || label(event.target_id)}</small>}
                        <details>
                            <summary>Change details</summary>
                            <pre>{JSON.stringify(event.details, null, 2)}</pre>
                        </details>
                    </li>
                ))}
            </ul>
            {!busy && !page.events.length && !error && <p>No security events recorded yet.</p>}
            {busy && <p role="status">Loading security history…</p>}
            {page.next_cursor && (
                <button type="button" className="btn" disabled={busy} onClick={() => void more()}>
                    Load older events
                </button>
            )}
        </section>
    );
}
