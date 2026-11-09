'use client';
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { PublicFooter } from '../public/PublicFooter';
import { AtlasMark } from '../ui/WorkspacePrimitives';
import { AuthToast } from './AuthToast';

interface AuthViewProps {
    themeButton: ReactNode;
    register: boolean;
    email: string;
    password: string;
    error: string;
    notice: string;
    busy: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onEmailChange: (email: string) => void;
    onPasswordChange: (password: string) => void;
    onToggleMode: () => void;
}

export function AuthView({ themeButton, register, email, password, error, notice, busy, onSubmit, onEmailChange, onPasswordChange, onToggleMode }: AuthViewProps) {
    const [verifiedAuth, setVerifiedAuth] = useState(false);
    const [forgot, setForgot] = useState(false);
    const [sending, setSending] = useState(false);
    const [recoveryMessage, setRecoveryMessage] = useState('');
    const [recoveryError, setRecoveryError] = useState('');
    const [googleError, setGoogleError] = useState(false);

    useEffect(() => {
        void api<{ verified_auth: boolean }>('/auth/options')
            .then((result) => setVerifiedAuth(result.verified_auth))
            .catch(() => undefined);
        setGoogleError(new URLSearchParams(window.location.search).get('auth_error') === 'google');
    }, []);

    async function requestReset(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSending(true);
        setRecoveryError('');
        setRecoveryMessage('');
        try {
            await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
            setRecoveryMessage('If an account exists for this address, you’ll receive a password reset link.');
        } catch (failure) {
            setRecoveryError((failure as Error).message);
        } finally {
            setSending(false);
        }
    }

    const authError = forgot ? recoveryError : error || (googleError ? 'Google sign-in couldn’t be completed. Try again.' : '');
    const authMessage = authError || (forgot ? recoveryMessage : notice);

    return (
        <div className="auth-page auth-page-with-footer">
            <header>
                <div className="brand-row">
                    <AtlasMark />
                    <span>Atlas</span>
                </div>
                {themeButton}
            </header>
            <div className="auth-grid">
                <form
                    className="auth-form"
                    onSubmit={(event) => {
                        if (forgot) {
                            void requestReset(event);
                        } else {
                            setGoogleError(false);
                            onSubmit(event);
                        }
                    }}
                >
                    <h2>{forgot ? 'Reset your password' : register ? 'Create your workspace' : 'Welcome back'}</h2>
                    <p>{forgot ? 'Enter your email to request a reset link.' : register ? 'Create an account to upload documents and start researching.' : 'Sign in to your research workspace.'}</p>
                    <label>
                        Email address
                        <input type="email" autoComplete="email" required value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="you@company.com" />
                    </label>
                    {!forgot && (
                        <label>
                            Password
                            <input
                                type="password"
                                autoComplete={register ? 'new-password' : 'current-password'}
                                required
                                minLength={10}
                                maxLength={200}
                                value={password}
                                onChange={(e) => onPasswordChange(e.target.value)}
                                placeholder="At least 10 characters"
                            />
                        </label>
                    )}
                    <button className="btn primary" disabled={busy || sending}>
                        {busy || sending ? <LoaderCircle className="spin" /> : <ArrowUpRight />}
                        {forgot ? 'Send reset link' : register ? 'Create account' : 'Sign in'}
                    </button>
                    {verifiedAuth && !forgot && (
                        <a className="btn" href="/api/auth/google">
                            Continue with Google
                        </a>
                    )}
                    {verifiedAuth && !forgot && !register && (
                        <div className="auth-switch">
                            <button
                                type="button"
                                onClick={() => {
                                    setRecoveryError('');
                                    setRecoveryMessage('');
                                    setForgot(true);
                                }}
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}
                    {forgot ? (
                        <div className="auth-switch">
                            <button type="button" onClick={() => setForgot(false)}>
                                Back to sign in
                            </button>
                        </div>
                    ) : (
                        <div className="auth-switch">
                            {register ? 'Already have an account?' : 'New to Atlas?'}{' '}
                            <button type="button" onClick={onToggleMode}>
                                {register ? 'Sign in' : 'Create an account'}
                            </button>
                        </div>
                    )}
                </form>
            </div>
            {authMessage && <AuthToast key={`${forgot}:${Boolean(authError)}:${authMessage}`} error={Boolean(authError)} message={authMessage} />}
            <PublicFooter />
        </div>
    );
}
