'use client';
import { Button, Chip, Typography } from '@mui/material';
import { useState } from 'react';
import { Mail, HardDrive, Github, NotebookPen, Hash, CalendarDays, ListTodo, Ticket, Cloud, Inbox, Building2 } from 'lucide-react';
import { IntegrationTile } from '../IntegrationTile';
import type { ConnectedSourceStatus, IntegrationProvider, SourceHealth } from '../../lib/types';

interface IntegrationsGalleryProps {
    gmailStatus: { connected: boolean; email: string | null } | null;
    driveStatus: { connected: boolean; account: string | null } | null;
    sourceStatuses: ConnectedSourceStatus[];
    sourceChecks: Record<string, SourceHealth>;
    onOpen: (provider: IntegrationProvider) => void;
}

export function IntegrationsGallery({ gmailStatus, driveStatus, sourceStatuses, sourceChecks, onOpen }: IntegrationsGalleryProps) {
    const [catalogOpen, setCatalogOpen] = useState(false);
    const providers = [
        ['gmail', 'Gmail', 'Search conversations and summarize email.', Mail, gmailStatus?.connected, gmailStatus?.email],
        ['drive', 'Google Drive', 'Explore documents and cloud files.', HardDrive, driveStatus?.connected, driveStatus?.account],
        ...(
            [
                ['github', 'GitHub', 'Find issues, pull requests and decisions.', Github],
                ['notion', 'Notion', 'Search shared pages and knowledge.', NotebookPen],
                ['slack', 'Slack', 'Find team conversations and updates.', Hash],
                ['calendar', 'Google Calendar', 'Search meeting events.', CalendarDays],
                ['linear', 'Linear', 'Search engineering issues.', ListTodo],
                ['jira', 'Jira', 'Search project tickets.', Ticket],
                ['onedrive', 'OneDrive', 'Search Microsoft files.', Cloud],
                ['outlook', 'Outlook', 'Search Microsoft email.', Inbox],
                ['sharepoint', 'SharePoint', 'Search accessible SharePoint files.', Building2],
            ] as const
        ).map(([id, name, description, Icon]) => {
            const status = sourceStatuses.find((source) => source.provider === id);
            return [id, name, description, Icon, status?.connected, status?.account] as const;
        }),
    ] as const;
    const connectedProviders = providers.filter((provider) => provider[4]);
    const availableProviders = providers.filter((provider) => !provider[4]);
    const tiles = (items: (typeof providers)[number][]) =>
        items.map(([id, name, description, Icon, connected, account]) => (
            <IntegrationTile
                key={id}
                name={name}
                description={description}
                icon={<Icon size={19} />}
                connected={!!connected}
                account={account}
                health={connected ? sourceChecks[id] : undefined}
                onClick={() => onOpen(id)}
            />
        ));
    return (
        <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
                    Your connections
                </Typography>
                <Chip size="small" color="success" label={`${connectedProviders.length} connected`} variant="outlined" />
                {availableProviders.length > 0 && (
                    <Button variant="outlined" size="small" className="md:hidden" aria-expanded={catalogOpen} aria-controls="atlas-provider-list" onClick={() => setCatalogOpen((open) => !open)}>
                        {catalogOpen ? 'Hide catalog' : 'Add a source'}
                    </Button>
                )}
            </div>
            {connectedProviders.length ? (
                <div className="integrations-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{tiles(connectedProviders)}</div>
            ) : (
                <Typography color="text.secondary" variant="body2" sx={{ py: 3 }}>
                    No external sources are connected yet. Choose one below to get started.
                </Typography>
            )}
            {availableProviders.length > 0 && (
                <section className={`mt-8 ${catalogOpen ? 'block' : 'hidden md:block'}`} id="atlas-provider-list" aria-label="Available integrations">
                    <Typography component="h2" variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
                        Explore integrations
                    </Typography>
                    <div className="integrations-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{tiles(availableProviders)}</div>
                </section>
            )}
        </>
    );
}
