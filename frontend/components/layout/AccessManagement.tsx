'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Workspace } from '../../lib/types';

type Organisation = { id: string; name: string; role: 'owner' | 'admin' | 'member' };
type Member = { id: string; email: string; role: string; owner: boolean };
type Sharing = { provider: string; owned: boolean; shared: boolean };

export function AccessManagement({ workspace, onRefresh }: { workspace?: Workspace; onRefresh: () => Promise<void> }) {
    const [organisations, setOrganisations] = useState<Organisation[]>([]);
    const [organisationId, setOrganisationId] = useState('');
    const [kind, setKind] = useState<'workspace' | 'organisation'>('workspace');
    const [members, setMembers] = useState<Member[]>([]);
    const [connections, setConnections] = useState<Sharing[]>([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('viewer');
    const [name, setName] = useState('');
    const [workspaceName, setWorkspaceName] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [revision, setRevision] = useState(0);
    const organisation = organisations.find((item) => item.id === organisationId);
    const canManage = kind === 'workspace' ? workspace?.role === 'manager' : organisation?.role === 'owner' || organisation?.role === 'admin';
    const base = kind === 'workspace' ? (workspace ? `/workspaces/${workspace.id}` : '') : organisationId ? `/organisations/${organisationId}` : '';

    useEffect(() => {
        let active = true;
        void api<Organisation[]>('/organisations')
            .then((items) => {
                if (!active) return;
                setOrganisations(items);
                setOrganisationId((id) => (items.some((item) => item.id === id) ? id : items[0]?.id || ''));
            })
            .catch((failure: Error) => {
                if (active) setError(failure.message);
            });
        return () => {
            active = false;
        };
    }, [revision]);

    useEffect(() => {
        let active = true;
        setError('');
        setMembers([]);
        setConnections([]);
        setRole(kind === 'workspace' ? 'viewer' : 'member');
        setLoading(false);
        if (!base || (kind === 'workspace' && !canManage)) return;
        setLoading(true);
        void Promise.all([api<Member[]>(`${base}/members`), kind === 'workspace' ? api<Sharing[]>(`${base}/connection-sharing`) : Promise.resolve([])])
            .then(([people, sharing]) => {
                if (active) {
                    setMembers(people);
                    setConnections(sharing);
                }
            })
            .catch((failure: Error) => {
                if (active) setError(failure.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [base, kind, canManage, revision]);

    async function perform(action: () => Promise<unknown>, message: string) {
        if (busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await action();
            await onRefresh();
            setRevision((value) => value + 1);
            setNotice(message);
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="access-management" aria-label="Members and access">
            <h2>Members &amp; access</h2>
            <p>Organisation membership and workspace access are separate. Conversations stay private to their author.</p>
            <label>
                Manage access for
                <select
                    value={kind}
                    disabled={busy}
                    onChange={(event) => {
                        setKind(event.target.value as typeof kind);
                        setNotice('');
                    }}
                >
                    <option value="workspace">Current workspace</option>
                    <option value="organisation">Organisation</option>
                </select>
            </label>
            {kind === 'organisation' && (
                <label>
                    Organisation
                    <select value={organisationId} disabled={busy} onChange={(event) => setOrganisationId(event.target.value)}>
                        <option value="">Choose an organisation</option>
                        {organisations.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} · {item.role}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {kind === 'workspace' && (
                <p>
                    Your role: <strong>{workspace?.role || 'No workspace selected'}</strong>. Viewers read and ask; editors also manage documents; managers also manage members and connections.
                </p>
            )}
            {error && (
                <p role="alert" className="access-error">
                    {error}
                </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {loading && <p role="status">Loading access…</p>}
            {!loading && base && (
                <>
                    {members.length > 0 && (
                        <ul className="access-members">
                            {members.map((member) => (
                                <li key={member.id}>
                                    <span>
                                        <strong>{member.email}</strong>
                                        <small>
                                            {member.role}
                                            {member.owner ? ' · owner' : ''}
                                        </small>
                                    </span>
                                    {canManage && !member.owner && (
                                        <button
                                            type="button"
                                            className="btn"
                                            disabled={busy}
                                            onClick={() => void perform(() => api(`${base}/members/${member.id}`, { method: 'DELETE' }), 'Member removed.')}
                                        >
                                            Remove
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {canManage ? (
                        <form
                            className="access-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void perform(() => api(`${base}/members`, { method: 'PUT', body: JSON.stringify({ email, role }) }), 'Access saved.').then(() => setEmail(''));
                            }}
                        >
                            <label>
                                Registered member email
                                <input type="email" required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" />
                            </label>
                            <label>
                                Role
                                <select value={role} disabled={busy} onChange={(event) => setRole(event.target.value)}>
                                    {(kind === 'workspace' ? ['viewer', 'editor', 'manager'] : ['member', 'admin']).map((value) => (
                                        <option key={value}>{value}</option>
                                    ))}
                                </select>
                            </label>
                            <button className="btn" disabled={busy}>
                                Add or update member
                            </button>
                            <small>The account must already be registered. Organisation workspaces also require organisation membership.</small>
                        </form>
                    ) : (
                        <p>Ask a {kind === 'workspace' ? 'workspace manager' : 'organisation administrator'} to change membership.</p>
                    )}
                    {kind === 'workspace' && canManage && (
                        <div className="access-sharing">
                            <h3>Connection sharing</h3>
                            <p>
                                Connections are private by default. Sharing lets every workspace member retrieve content using that account. Members may save excerpts in their own chats. Unsharing
                                stops future retrieval, but does not erase saved excerpts.
                            </p>
                            {connections.length === 0 && <p>No connections available to manage.</p>}
                            {connections.map((connection) => (
                                <label key={connection.provider} className="access-share-row">
                                    <input
                                        type="checkbox"
                                        checked={connection.shared}
                                        disabled={busy || !connection.owned}
                                        onChange={(event) =>
                                            void perform(
                                                () => api(`${base}/connection-sharing/${connection.provider}`, { method: 'PATCH', body: JSON.stringify({ shared: event.target.checked }) }),
                                                'Connection sharing updated.',
                                            )
                                        }
                                    />
                                    Share {connection.provider} with this workspace{!connection.owned && ' · managed by its owner'}
                                </label>
                            ))}
                        </div>
                    )}
                    {kind === 'organisation' && canManage && (
                        <form
                            className="access-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void perform(
                                    () => api('/workspaces', { method: 'POST', body: JSON.stringify({ name: workspaceName, organisation_id: organisationId }) }),
                                    'Organisation workspace created. Select it from your workspace list.',
                                );
                            }}
                        >
                            <label>
                                New organisation workspace
                                <input required maxLength={100} value={workspaceName} disabled={busy} onChange={(event) => setWorkspaceName(event.target.value)} />
                            </label>
                            <button className="btn" disabled={busy}>
                                Create organisation workspace
                            </button>
                        </form>
                    )}
                </>
            )}
            <form
                className="access-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                        const created = await api<Organisation>('/organisations', { method: 'POST', body: JSON.stringify({ name }) });
                        setKind('organisation');
                        setOrganisationId(created.id);
                        setName('');
                    }, 'Organisation created.');
                }}
            >
                <label>
                    New organisation
                    <input required maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Organisation name" />
                </label>
                <button className="btn" disabled={busy}>
                    Create organisation
                </button>
            </form>
        </section>
    );
}
