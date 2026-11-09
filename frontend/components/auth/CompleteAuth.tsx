'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import '../../app/rebuild.css';

export function CompleteAuth() {
    const [link, setLink] = useState<{ mode: string; token: string }>();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const consumed = useRef(false);

    useEffect(() => {
        if (consumed.current) return;
        consumed.current = true;
        const url = new URL(window.location.href);
        const mode = url.searchParams.get('mode') || '';
        const token = new URLSearchParams(url.hash.slice(1)).get('token_hash') || '';
        setLink({ mode, token });
        window.history.replaceState(null, '', url.pathname + url.search);
    }, []);

    const reset = link?.mode === 'reset';
    const valid = link?.token && (reset || link.mode === 'confirm');

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!valid || !link || busy) return;
        setBusy(true);
        setError('');
        try {
            await api(reset ? '/auth/reset' : '/auth/confirm', {
                method: 'POST',
                body: JSON.stringify({ token_hash: link.token, ...(reset ? { password } : {}) }),
            });
            setPassword('');
            if (reset) setDone(true);
            else window.location.replace('/');
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="auth-page">
            <header>
                <div className="brand-row">
                    <AtlasMark />
                    <span>Atlas</span>
                </div>
            </header>
            <div className="auth-grid">
                <form className="auth-form" onSubmit={(event) => void submit(event)}>
                    <h2>{reset ? 'Choose a new password' : 'Verify your email'}</h2>
                    {done ? (
                        <p role="status">Password updated. Sign in with your new password.</p>
                    ) : !link ? (
                        <p>Checking your link…</p>
                    ) : valid ? (
                        <>
                            {reset && (
                                <label>
                                    New password
                                    <input type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                                </label>
                            )}
                            {error && (
                                <p role="alert" className="feedback error">
                                    {error}
                                </p>
                            )}
                            <button className="btn primary" disabled={busy}>
                                {reset ? 'Update password' : 'Verify email'}
                            </button>
                        </>
                    ) : (
                        <p role="alert">This link is missing its verification token. Request a new email from Atlas.</p>
                    )}
                    <Link href="/">Back to Atlas</Link>
                </form>
            </div>
        </main>
    );
}
