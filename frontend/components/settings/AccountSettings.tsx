'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, FolderOpen, LoaderCircle, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { api } from '../../lib/api';
import type { User, Workspace } from '../../lib/types';
import { useAtlasTheme } from '../../hooks/useAtlasTheme';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import { AccessManagement } from '../layout/AccessManagement';
import { WorkspaceDeletion } from './WorkspaceDeletion';
import '../../app/rebuild.css';
import '../../app/styles/settings.css';

type Section = 'profile' | 'workspace' | 'organisation';
const sections = [
    { id: 'profile', label: 'Profile & preferences', icon: UserRound },
    { id: 'workspace', label: 'Workspace settings', icon: FolderOpen },
    { id: 'organisation', label: 'Organisations', icon: Building2 },
] as const;

export function AccountSettings() {
    const { theme, toggleTheme } = useAtlasTheme();
    const [user, setUser] = useState<User | null>(null);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspaceId, setWorkspaceId] = useState('');
    const [section, setSection] = useState<Section>('profile');
    const [loading, setLoading] = useState(true);
    const [signedOut, setSignedOut] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const atlasHref = workspaceId ? `/?workspaceId=${encodeURIComponent(workspaceId)}` : '/';

    useEffect(() => {
        let active = true;
        const query = new URLSearchParams(window.location.search);
        const requested = query.get('section');
        if (sections.some((item) => item.id === requested)) setSection(requested as Section);
        void Promise.all([api<User>('/me'), api<Workspace[]>('/workspaces')])
            .then(([actor, list]) => {
                if (!active) return;
                setUser(actor);
                setWorkspaces(list);
                setWorkspaceId(list.some((item) => item.id === query.get('workspaceId')) ? query.get('workspaceId')! : list[0]?.id || '');
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
    }, []);

    useEffect(() => {
        function onPop() {
            const query = new URLSearchParams(window.location.search);
            const value = query.get('section');
            setSection(sections.some((item) => item.id === value) ? (value as Section) : 'profile');
            const selected = query.get('workspaceId');
            if (selected && workspaces.some((item) => item.id === selected)) setWorkspaceId(selected);
        }
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [workspaces]);

    function navigate(next: Section, selected = workspaceId) {
        setSection(next);
        setWorkspaceId(selected);
        setNotice('');
        const query = new URLSearchParams({ section: next });
        if (selected) query.set('workspaceId', selected);
        window.history.pushState(null, '', `/settings?${query}`);
    }
    async function refresh() {
        const list = await api<Workspace[]>('/workspaces');
        setWorkspaces(list);
        setWorkspaceId((current) => (list.some((item) => item.id === current) ? current : list[0]?.id || ''));
    }
    async function signOut() {
        setBusy(true);
        setError('');
        try {
            await api('/auth/logout', { method: 'POST' });
            setUser(null);
            setSignedOut(true);
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }

    if (loading)
        return (
            <div className="opening">
                <AtlasMark />
                <LoaderCircle className="spin" />
                <span>Opening account settings…</span>
            </div>
        );
    if (!user)
        return (
            <main className="settings-signed-out">
                <AtlasMark />
                <h1>{signedOut ? 'You’re signed out' : 'Sign in to manage your account'}</h1>
                {error && <p role="alert">{error}</p>}
                <Link className="btn primary" href="/">
                    Return to Atlas
                </Link>
            </main>
        );

    return (
        <div className="atlas-v3 settings-shell">
            <aside className="settings-sidebar">
                <Link href={atlasHref} className="settings-back">
                    <ArrowLeft size={16} />
                    Back to Atlas
                </Link>
                <div className="settings-brand">
                    <AtlasMark />
                    <span>Account &amp; settings</span>
                </div>
                <nav aria-label="Settings navigation">
                    {sections.map(({ id, label, icon: Icon }) => (
                        <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}>
                            <Icon size={17} />
                            {label}
                        </button>
                    ))}
                </nav>
                <div className="settings-identity">
                    <span className="avatar">{user.email.slice(0, 2).toUpperCase()}</span>
                    <span>{user.email}</span>
                </div>
            </aside>
            <main className="settings-main">
                <header className="settings-heading">
                    <span className="eyebrow">YOUR ATLAS</span>
                    <h1>{section === 'profile' ? 'Profile & preferences' : section === 'workspace' ? 'Workspace settings' : 'Organisations'}</h1>
                    <p>
                        {section === 'profile'
                            ? 'Your account, appearance, and session.'
                            : section === 'workspace'
                              ? 'Manage membership and source access in one place.'
                              : 'Manage your teams and organisation membership.'}
                    </p>
                </header>
                {error && (
                    <p className="feedback error" role="alert">
                        {error}
                    </p>
                )}
                {notice && (
                    <p className="feedback" role="status">
                        {notice}
                    </p>
                )}
                {section === 'profile' ? (
                    <>
                        <section className="settings-card" aria-label="Profile">
                            <div className="settings-profile">
                                <span className="settings-avatar">{user.email.slice(0, 2).toUpperCase()}</span>
                                <div>
                                    <h2>{user.email.split('@')[0]}</h2>
                                    <p>{user.email}</p>
                                </div>
                            </div>
                            <dl className="settings-facts">
                                <div>
                                    <dt>Email address</dt>
                                    <dd>{user.email}</dd>
                                </div>
                                <div>
                                    <dt>Account ID</dt>
                                    <dd>{user.id}</dd>
                                </div>
                            </dl>
                        </section>
                        <section className="settings-card settings-inline">
                            <div>
                                <h2>Appearance</h2>
                                <p>Choose the theme used across Atlas.</p>
                            </div>
                            <button type="button" className="btn" onClick={toggleTheme}>
                                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}Switch to {theme === 'light' ? 'dark' : 'light'} mode
                            </button>
                        </section>
                        <section className="settings-card settings-inline">
                            <div>
                                <h2>Session</h2>
                                <p>Sign out of Atlas on this browser.</p>
                            </div>
                            <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
                                <LogOut size={16} />
                                {busy ? 'Signing out…' : 'Sign out'}
                            </button>
                        </section>
                    </>
                ) : (
                    <>
                        {section === 'workspace' && (
                            <label className="settings-workspace-picker">
                                Workspace
                                <select value={workspaceId} onChange={(event) => navigate('workspace', event.target.value)}>
                                    {workspaces.map((item) => (
                                        <option value={item.id} key={item.id}>
                                            {item.name} · {item.role || 'viewer'}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {section === 'organisation' || workspace ? (
                            <section className="settings-card">
                                <AccessManagement key={`${section}:${workspaceId}`} view={section} userId={user.id} workspace={workspace} onRefresh={refresh} />
                            </section>
                        ) : (
                            <section className="settings-card">
                                <h2>No workspace selected</h2>
                                <p>Create a workspace in Atlas to get started.</p>
                                <Link className="btn" href="/">
                                    Open Atlas
                                </Link>
                            </section>
                        )}
                        {section === 'workspace' && workspace?.role === 'manager' && (
                            <WorkspaceDeletion
                                key={workspace.id}
                                workspace={workspace}
                                onDeleted={async () => {
                                    await refresh();
                                    setNotice('Workspace deleted.');
                                }}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
