'use client';

import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { Button, CircularProgress, InputAdornment, Paper, TextField, Typography } from '@mui/material';
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
        <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_90%_20%,rgba(106,90,235,.13),transparent_40%),radial-gradient(ellipse_at_10%_95%,rgba(49,183,188,.12),transparent_45%)]">
            <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
                <div className="flex items-center gap-2 text-lg font-extrabold">
                    <AtlasMark />
                    <span>Atlas</span>
                </div>
                {themeButton}
            </header>
            <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-2 lg:gap-20">
                <div className="max-w-xl">
                    <Typography color="primary.main" sx={{ fontWeight: 800, letterSpacing: '.14em', fontSize: 12 }}>
                        RESEARCH WITHOUT THE GUESSWORK
                    </Typography>
                    <Typography component="h1" variant="h2" sx={{ fontSize: { xs: 38, sm: 56, lg: 64 }, lineHeight: 1.15, mt: 2 }}>
                        Build knowledge you can trust.
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 2.5, lineHeight: 1.9, maxWidth: 460 }}>
                        Connect documents, compare perspectives, and explore source-backed answers in one focused workspace.
                    </Typography>
                    <div className="mt-9 flex items-center gap-2 text-sm font-semibold opacity-80">
                        <Sparkles size={19} /> Every answer has a path back to its evidence.
                    </div>
                </div>
                <Paper variant="outlined" sx={{ borderRadius: 4, p: { xs: 3, sm: 4 }, maxWidth: 500, width: '100%', mx: 'auto', boxShadow: '0 24px 60px rgba(25,38,78,.07)' }}>
                    <form
                        className="flex flex-col gap-5"
                        onSubmit={(event) => {
                            if (forgot) void requestReset(event);
                            else {
                                setGoogleError(false);
                                onSubmit(event);
                            }
                        }}
                    >
                        <div>
                            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
                                {forgot ? 'Reset your password' : register ? 'Create your workspace' : 'Welcome back'}
                            </Typography>
                            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                                {forgot ? 'We’ll send you a password reset link.' : register ? 'Set up your account and start your first investigation.' : 'Sign in to return to your research.'}
                            </Typography>
                        </div>
                        <TextField
                            label="Email address"
                            type="email"
                            autoComplete="email"
                            required
                            fullWidth
                            placeholder="you@company.com"
                            value={email}
                            onChange={(event) => onEmailChange(event.target.value)}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Mail size={18} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        {!forgot && (
                            <TextField
                                label="Password"
                                type="password"
                                autoComplete={register ? 'new-password' : 'current-password'}
                                required
                                fullWidth
                                placeholder="At least 10 characters"
                                value={password}
                                onChange={(event) => onPasswordChange(event.target.value)}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <LockKeyhole size={18} />
                                            </InputAdornment>
                                        ),
                                    },
                                    htmlInput: { minLength: 10, maxLength: 200 },
                                }}
                            />
                        )}
                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={busy || sending}
                            endIcon={busy || sending ? <CircularProgress color="inherit" size={17} /> : <ArrowRight size={18} />}
                        >
                            {forgot ? 'Send reset link' : register ? 'Create account' : 'Sign in'}
                        </Button>
                        {verifiedAuth && !forgot && (
                            <Button component="a" href="/api/auth/google" variant="outlined" size="large">
                                Continue with Google
                            </Button>
                        )}
                        {verifiedAuth && !forgot && !register && (
                            <Button
                                size="small"
                                onClick={() => {
                                    setRecoveryError('');
                                    setRecoveryMessage('');
                                    setForgot(true);
                                }}
                            >
                                Forgot password?
                            </Button>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Typography variant="body2" color="text.secondary">
                                {forgot ? 'Remembered your password?' : register ? 'Already have an account?' : 'New to Atlas?'}
                            </Typography>
                            <Button size="small" onClick={forgot ? () => setForgot(false) : onToggleMode}>
                                {forgot ? 'Back to sign in' : register ? 'Sign in' : 'Create an account'}
                            </Button>
                        </div>
                    </form>
                </Paper>
            </main>
            {authMessage && <AuthToast key={`${forgot}:${Boolean(authError)}:${authMessage}`} error={Boolean(authError)} message={authMessage} />}
            <PublicFooter />
        </div>
    );
}
