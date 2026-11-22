import type { Metadata } from 'next';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { AtlasMuiProvider } from '../components/ui/AtlasMuiProvider';
import './globals.css';

export const metadata: Metadata = {
    title: 'Atlas — Research workspace',
    description: 'A research workspace for source-backed answers, connected documents, and clearer thinking.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <AppRouterCacheProvider options={{ enableCssLayer: true }}>
                    <AtlasMuiProvider>{children}</AtlasMuiProvider>
                </AppRouterCacheProvider>
            </body>
        </html>
    );
}
