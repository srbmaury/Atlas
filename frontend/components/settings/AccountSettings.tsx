'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle, LogOut, Moon, Sun, UserRound, ShieldCheck, UsersRound, Palette, Database, Plug, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import type { User, Workspace } from '../../lib/types';
import { useAtlasTheme } from '../../hooks/useAtlasTheme';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import { AccessManagement } from '../layout/AccessManagement';
import { WorkspaceDeletion } from './WorkspaceDeletion';
import '../../app/rebuild.css';
import '../../app/styles/settings.css';

type Section = 'profile' | 'appearance' | 'security' | 'data' | 'connections' | 'workspace' | 'organisation';
const sections = [
    { id: 'profile', label: 'My profile', icon: UserRound },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'data', label: 'Data & privacy', icon: Database },
    { id: 'workspace', label: 'Workspace & members', icon: UsersRound },
    { id: 'connections', label: 'Connections', icon: Plug },
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
    const [compact, setCompact] = useState(false);
    useEffect(() => { setCompact(window.localStorage.getItem('atlas-compact-view') === 'true'); }, []);
    function changeCompact(value: boolean) { setCompact(value); window.localStorage.setItem('atlas-compact-view', String(value)); }
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
        <div className={`atlas-v3 settings-shell${compact ? " settings-compact" : ""}`}>
            <aside className="settings-sidebar">
                <Link href={atlasHref} className="settings-back">
                    <ArrowLeft size={16} />
                    Back to Atlas
                </Link>
                <div className="settings-brand">
                    <AtlasMark />
                    <span>Atlas <small> / Settings</small></span>
                </div>
                <nav aria-label="Settings navigation">
                    <span className="settings-nav-group">PERSONAL</span>
                    {sections.map(({ id, label, icon: Icon }, index) => (
                        <div key={id} className="settings-nav-entry">
                        {index === 4 && <span className="settings-nav-group">WORKSPACE</span>}
                        <button type="button" aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}>
                            <Icon size={17} />
                            {label}
                        </button>
                        </div>
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
                    <h1>{section === 'profile' ? 'My profile' : section === 'appearance' ? 'Appearance' : section === 'security' ? 'Account security' : section === 'data' ? 'Data & privacy' : section === 'connections' ? 'Connections' : section === 'workspace' ? 'Workspace & members' : 'Organisations'}</h1>
                    <p>
                        {section === 'profile'
                            ? 'Your personal information and Atlas account.'
                            : section === 'appearance' ? 'Customize how Atlas looks on this device.'
                            : section === 'security' ? 'Manage your current sign-in session.'
                            : section === 'data' ? 'Understand how your workspace information is used.'
                            : section === 'connections' ? 'Review connected services and manage workspace integrations.'
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
                {section === 'profile' || section === 'appearance' || section === 'security' || section === 'data' || section === 'connections' ? (
                    <>
                        {section === 'profile' && <section className="settings-card" aria-label="Profile">
                            <div className="settings-section-title"><h2>My profile</h2><p>Information associated with your Atlas account.</p></div>
                            <div className="settings-profile">
                                <span className="settings-avatar">{user.email.slice(0, 2).toUpperCase()}</span>
                                <div><strong>{user.email.split('@')[0]}</strong><p>Atlas account</p></div>
                            </div>
                            <dl className="settings-facts">
                                <div><dt>Email address</dt><dd>{user.email}</dd></div>
                                <div><dt>Workspaces</dt><dd>{workspaces.length}</dd></div>
                            </dl>
                            <p className="settings-help">Profile editing is not available for this account yet.</p>
                        </section>}
                        {section === 'appearance' && <section className="settings-card">
                            <div className="settings-section-title"><h2>Appearance</h2><p>Choose your preferred interface style.</p></div>
                            <div className="settings-setting-row">
                                <div><strong>Color theme</strong><p>Applied throughout Atlas.</p></div>
                                <div className="settings-segmented" role="group" aria-label="Color theme">
                                    <button type="button" aria-pressed={theme === 'light'} onClick={() => { if (theme !== 'light') toggleTheme(); }}><Sun size={15}/> Light</button>
                                    <button type="button" aria-pressed={theme === 'dark'} onClick={() => { if (theme !== 'dark') toggleTheme(); }}><Moon size={15}/> Dark</button>
                                </div>
                            </div>
                            <div className="settings-setting-row">
                                <div><strong>Compact view</strong><p>Use tighter spacing on this settings page.</p></div>
                                <label className="settings-switch"><input type="checkbox" checked={compact} onChange={e => changeCompact(e.target.checked)} /><span>Compact</span></label>
                            </div>
                        </section>}
                        {section === 'data' && <section className="settings-card">
                            <div className="settings-section-title"><h2>Data & privacy</h2><p>Understand which workspace data Atlas can access.</p></div>
                            <div className="settings-setting-row"><div><strong>Workspace documents</strong><p>Uploaded documents are indexed to support document search and cited answers. Access is controlled by your workspace role.</p></div></div>
                            <div className="settings-setting-row"><div><strong>Connected services</strong><p>Connected sources are managed at the workspace level. Available sources depend on your permissions and the configured integrations.</p></div><button type="button" className="btn" onClick={() => navigate('connections')}>Connections <ExternalLink size={14}/></button></div>
                            <p className="settings-help">Data export, retention controls, and AI provider settings are not available on this page. No privacy setting is changed here.</p>
                        </section>}
                        {section === 'connections' && <section className="settings-card">
                            <div className="settings-section-title"><h2>Workspace connections</h2><p>Connect or disconnect services from the Atlas workspace.</p></div>
                            <div className="settings-setting-row"><div><strong>Active workspace</strong><p>{workspace?.name || 'No workspace selected'} · {workspace?.role || 'viewer'} access</p></div></div>
                            <div className="settings-setting-row"><div><strong>Manage integrations</strong><p>Open Connected sources in Atlas to inspect connection status, authenticate services, or disconnect accounts. Only workspace managers can change connections.</p></div><Link className="btn" href={atlasHref}>Open Atlas <ExternalLink size={14}/></Link></div>
                        </section>}
                        {section === 'security' && <section className="settings-card">
                            <div className="settings-section-title"><h2>Account security</h2><p>Review your current Atlas session.</p></div>
                            <div className="settings-setting-row"><div><strong>Current session</strong><p>Sign out of Atlas on this browser.</p></div>
                                <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}><LogOut size={16}/>{busy ? 'Signing out…' : 'Sign out'}</button>
                            </div>
                            <p className="settings-help">Password changes and session management will appear here when supported by the authentication API.</p>
                        </section>}
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
