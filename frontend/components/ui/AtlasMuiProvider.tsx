'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';

/**
 * The existing theme toggle writes data-theme on <html>. Keep it authoritative
 * during the incremental component migration so every screen stays in sync.
 */
export function AtlasMuiProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        const root = document.documentElement;
        const sync = () => setMode(root.dataset.theme === 'dark' ? 'dark' : 'light');
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    const theme = useMemo(
        () => createTheme({
            palette: {
                mode,
                primary: { main: mode === 'dark' ? '#a5a1ff' : '#5a54e8' },
                secondary: { main: '#13a999' },
                background: {
                    default: mode === 'dark' ? '#111627' : '#f7f8fc',
                    paper: mode === 'dark' ? '#1b2235' : '#ffffff',
                },
                text: {
                    primary: mode === 'dark' ? '#f1f4ff' : '#18223b',
                    secondary: mode === 'dark' ? '#b4bdd4' : '#63718b',
                },
                divider: mode === 'dark' ? '#343d56' : '#e5e9f3',
            },
            shape: { borderRadius: 12 },
            typography: {
                fontFamily: '"DM Sans", system-ui, sans-serif',
                h1: { fontFamily: '"Manrope", sans-serif', fontWeight: 800, letterSpacing: '-.055em' },
                h2: { fontFamily: '"Manrope", sans-serif', fontWeight: 800, letterSpacing: '-.045em' },
                h3: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-.035em' },
                h4: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-.035em' },
                button: { textTransform: 'none', fontWeight: 700 },
            },
            components: {
                MuiButton: {
                    defaultProps: { disableElevation: true },
                    styleOverrides: { root: { borderRadius: 11, paddingInline: 16, minHeight: 38 } },
                },
                MuiIconButton: { styleOverrides: { root: { borderRadius: 11 } } },
                MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
                MuiCard: { styleOverrides: { root: { borderRadius: 18 } } },
                MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
                MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
                MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
            },
        }), [mode],
    );

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
