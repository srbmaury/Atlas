'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';

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
                        default: mode === 'dark' ? '#111113' : '#fbfbff',
                        paper: mode === 'dark' ? '#212225' : '#ffffff',
                    },
                    text: {
                        primary: mode === 'dark' ? '#edeef0' : '#161d33',
                        secondary: mode === 'dark' ? '#b0b4ba' : '#66718c',
                    },
                    divider: mode === 'dark' ? '#363a3f' : '#e8eaf2',
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
                    MuiInputBase: {
                        styleOverrides: {
                            input: {
                                '&:focus, &:focus-visible': { outline: 'none', boxShadow: 'none' },
                            },
                        },
                    },
                    MuiOutlinedInput: {
                        styleOverrides: {
                            root: {
                                borderRadius: 12,
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5 },
                            },
                        },
                    },
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
