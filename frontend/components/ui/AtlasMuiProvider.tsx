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
        () =>
            createTheme({
                palette: {
                    mode,
                    primary: { main: mode === 'dark' ? '#a99cff' : '#6551f5' },
                    secondary: { main: mode === 'dark' ? '#9eb3f3' : '#6b7b9a' },
                    background: {
                        default: mode === 'dark' ? '#171b29' : '#fbfbff',
                        paper: mode === 'dark' ? '#252b3c' : '#ffffff',
                    },
                    text: {
                        primary: mode === 'dark' ? '#eff2ff' : '#161d33',
                        secondary: mode === 'dark' ? '#b6c0d4' : '#66718c',
                    },
                    divider: mode === 'dark' ? '#41465c' : '#e8eaf2',
                },
                shape: { borderRadius: 12 },
                typography: {
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    h1: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-.035em' },
                    h2: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-.032em' },
                    h3: { fontFamily: '"Manrope", sans-serif', fontWeight: 700, letterSpacing: '-.022em' },
                    h4: { fontFamily: '"Manrope", sans-serif', fontWeight: 700, letterSpacing: '-.02em' },
                    button: { textTransform: 'none', fontWeight: 700 },
                },
                components: {
                    MuiButton: {
                        defaultProps: { disableElevation: true },
                        styleOverrides: { root: { borderRadius: 11, paddingInline: 16, minHeight: 38 } },
                    },
                    MuiIconButton: { styleOverrides: { root: { borderRadius: 11 } } },
                    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
                    MuiCard: { styleOverrides: { root: { borderRadius: 12, boxShadow: 'none' } } },
                    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
                    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
                    MuiDialog: { styleOverrides: { paper: { borderRadius: 14 } } },
                },
            }),
        [mode],
    );

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
