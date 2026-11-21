'use client';
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
            <div className="integration-overview">
                <h2>Your connections</h2>
                <span>{connectedProviders.length} connected</span>
                {availableProviders.length > 0 && (
                    <button type="button" className="btn primary mobile-source-catalog" aria-expanded={catalogOpen} aria-controls="atlas-provider-list" onClick={() => setCatalogOpen((open) => !open)}>
                        {catalogOpen ? 'Hide catalog' : 'Add a source'}
                    </button>
                )}
            </div>
            {connectedProviders.length ? <div className="integrations-grid">{tiles(connectedProviders)}</div> : <p className="integration-empty">No sources connected.</p>}
            {availableProviders.length > 0 && (
                <section className="integration-catalog" id="atlas-provider-list" data-catalog-open={catalogOpen} aria-label="Available integrations">
                    <h2>Available integrations</h2>
                    <div className="integrations-grid">{tiles(availableProviders)}</div>
                </section>
            )}
        </>
    );
}
