'use client';
import Link from 'next/link';
import { Alert, Button, FormControlLabel, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle, LogOut, Moon, Sun, UserRound, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import type { User, Workspace } from '../../lib/types';
import { useAtlasTheme } from '../../hooks/useAtlasTheme';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import { AccessManagement } from '../layout/AccessManagement';
import { AccountDeletion } from './AccountDeletion';
import { WorkspaceDeletion } from './WorkspaceDeletion';
import '../../app/rebuild.css';
import '../../app/styles/settings.css';

type Section = 'profile' | 'workspace' | 'organisation';
const sections = [
    { id: 'profile', label: 'Account', icon: UserRound },
    { id: 'workspace', label: 'Workspace & members', icon: UsersRound },
    { id: 'organisation', label: 'Organisations', icon: Building2 },
] as const;

export function AccountSettings() {
    const { theme, toggleTheme } = useAtlasTheme();
    const [user, setUser] = useState<User | null>(null);
    const [name, setName] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspaceId, setWorkspaceId] = useState('');
    const [section, setSection] = useState<Section>('profile');
    const [loading, setLoading] = useState(true);
    const [signedOut, setSignedOut] = useState(false);
    const [deleted, setDeleted] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        setCompact(window.localStorage.getItem('atlas-compact-view') === 'true');
    }, []);
    function changeCompact(value: boolean) {
        setCompact(value);
        window.localStorage.setItem('atlas-compact-view', String(value));
    }
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
                setName(actor.display_name || '');
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
    async function saveProfile() {
        setSavingName(true);
        setError('');
        setNotice('');
        try {
            const profile = await api<User>('/me', {
                method: 'PATCH',
                body: JSON.stringify({ display_name: name }),
            });
            setUser(profile);
            setName(profile.display_name || '');
            setNotice('Display name saved.');
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setSavingName(false);
        }
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
                <h1>{deleted ? 'Account deleted' : signedOut ? 'You’re signed out' : 'Sign in to manage your account'}</h1>
                {error && <p role="alert">{error}</p>}
                <Link className="btn primary" href="/">
                    Return to Atlas
                </Link>
            </main>
        );

    return (
        <div className={`atlas-v3 settings-shell${compact ? ' settings-compact' : ''}`}>
            <aside className="settings-sidebar">
                <Link href={atlasHref} className="settings-back">
                    <ArrowLeft size={16} />
                    Back to Atlas
                </Link>
                <div className="settings-brand">
                    <AtlasMark />
                    <span>
                        Atlas <small> / Settings</small>
                    </span>
                </div>
                <label className="settings-mobile-switch">
                    <span>Settings section</span>
                    <select value={section} onChange={(event) => navigate(event.target.value as Section)}>
                        {sections.map(({ id, label }) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <nav aria-label="Settings navigation">
                    <span className="settings-nav-group">PERSONAL</span>
                    {sections.map(({ id, label, icon: Icon }, index) => (
                        <div key={id} className="settings-nav-entry">
                            {index === 1 && <span className="settings-nav-group">WORKSPACE</span>}
                            <button type="button" aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}>
                                <Icon size={17} />
                                {label}
                            </button>
                        </div>
                    ))}
                </nav>
                <div className="settings-identity">
                    <span className="avatar">{(user.display_name || user.email).slice(0, 2).toUpperCase()}</span>
                    <span>{user.display_name || user.email}</span>
                </div>
            </aside>
            <main className="settings-main">
                <header className="settings-heading">
                    <span className="eyebrow">YOUR ATLAS</span>
                    <Typography component="h1" variant="h4" sx={{ fontWeight: 800 }}>
                        {section === 'profile' ? 'Account' : section === 'workspace' ? 'Workspace & members' : 'Organisations'}
                    </Typography>
                    <p>
                        {section === 'profile'
                            ? 'Your profile, appearance, and session in one place.'
                            : section === 'workspace'
                              ? 'Manage workspace membership and access.'
                              : 'Manage organisation membership.'}
                    </p>
                </header>
                {error && (
                    <Alert severity="error" role="alert">
                        {error}
                    </Alert>
                )}
                {notice && (
                    <Alert severity="success" role="status">
                        {notice}
                    </Alert>
                )}
                {section === 'profile' ? (
                    <>
                        {section === 'profile' && (
                            <section className="settings-card" aria-label="Profile">
                                <div className="settings-section-title">
                                    <h2>My profile</h2>
                                    <p>Information associated with your Atlas account.</p>
                                </div>
                                <div className="settings-profile">
                                    <span className="settings-avatar">{(user.display_name || user.email).slice(0, 2).toUpperCase()}</span>
                                    <div>
                                        <strong>{user.display_name || user.email.split('@')[0]}</strong>
                                        <p>Atlas account</p>
                                    </div>
                                </div>
                                <dl className="settings-facts">
                                    <div>
                                        <dt>Email address</dt>
                                        <dd>{user.email}</dd>
                                    </div>
                                    <div>
                                        <dt>Workspaces</dt>
                                        <dd>{workspaces.length}</dd>
                                    </div>
                                </dl>
                                <form
                                    className="settings-profile-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        if (!savingName) void saveProfile();
                                    }}
                                >
                                    <TextField
                                        name="display_name"
                                        label="Display name"
                                        autoComplete="name"
                                        slotProps={{ htmlInput: { maxLength: 100 } }}
                                        value={name}
                                        disabled={savingName}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder={user.email.split('@')[0]}
                                        size="small"
                                        fullWidth
                                    />
                                    <Button type="submit" variant="contained" disabled={savingName || name.trim() === (user.display_name || '')}>
                                        {savingName ? 'Saving…' : 'Save name'}
                                    </Button>
                                </form>
                            </section>
                        )}
                        <section className="settings-card">
                            <div className="settings-section-title">
                                <h2>Appearance</h2>
                                <p>Customize Atlas on this device.</p>
                            </div>
                            <div className="settings-setting-row">
                                <div>
                                    <strong>Theme</strong>
                                    <p>Choose a light or dark interface.</p>
                                </div>
                                <ToggleButtonGroup
                                    size="small"
                                    exclusive
                                    aria-label="Color theme"
                                    value={theme}
                                    onChange={(_event, nextTheme: 'light' | 'dark' | null) => {
                                        if (nextTheme && nextTheme !== theme) toggleTheme();
                                    }}
                                >
                                    <ToggleButton value="light" aria-label="Light theme">
                                        <Sun size={15} className="mr-2" /> Light
                                    </ToggleButton>
                                    <ToggleButton value="dark" aria-label="Dark theme">
                                        <Moon size={15} className="mr-2" /> Dark
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </div>
                            <div className="settings-setting-row">
                                <div>
                                    <strong>Compact settings</strong>
                                    <p>Reduce spacing on this page.</p>
                                </div>
                                <FormControlLabel label="Compact" control={<Switch checked={compact} onChange={(event) => changeCompact(event.target.checked)} />} />
                            </div>
                        </section>
                        <section className="settings-card">
                            <div className="settings-section-title">
                                <h2>Session</h2>
                                <p>Manage your sign-in on this browser.</p>
                            </div>
                            <div className="settings-setting-row">
                                <div>
                                    <strong>Signed in as {user.email}</strong>
                                    <p>Sign out of Atlas on this browser.</p>
                                </div>
                                <Button type="button" variant="outlined" startIcon={<LogOut size={16} />} disabled={busy} onClick={() => void signOut()}>
                                    {busy ? 'Signing out…' : 'Sign out'}
                                </Button>
                            </div>
                        </section>
                        <AccountDeletion
                            email={user.email}
                            onDeleted={() => {
                                setDeleted(true);
                                setUser(null);
                            }}
                        />
                    </>
                ) : (
                    <>
                        {section === 'workspace' && (
                            <label className="settings-workspace-picker">
                                Workspace
                                <select value={workspaceId} onChange={(event) => navigate('workspace', event.target.value)}>
                                    {workspaces.map((item) => {
                                        const duplicate = workspaces.some((other) => other.id !== item.id && other.name === item.name);
                                        const role = item.owner_id === user.id ? 'Owner' : item.role || 'viewer';
                                        return (
                                            <option value={item.id} key={item.id}>
                                                {item.name} · {role}
                                                {duplicate && ' · ' + (item.organisation_id ? 'Organisation' : 'Personal') + ' · ' + item.id.slice(0, 8)}
                                            </option>
                                        );
                                    })}
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
