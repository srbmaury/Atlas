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
    const connectedCount = providers.filter(([, , , , connected]) => connected).length;
    const orderedProviders = [...providers].sort((left, right) => Number(Boolean(right[4])) - Number(Boolean(left[4])));
    return (
        <>
            <div className="integration-overview">
                <div>
                    <h2>Your connections</h2>
                    <p>Connect the tools your team uses, and inspect connection health and access.</p>
                </div>
                <span>{connectedCount} connected</span>
                <button type="button" className="btn primary mobile-source-catalog" aria-expanded={catalogOpen} aria-controls="atlas-provider-list" onClick={() => setCatalogOpen((open) => !open)}>
                    {catalogOpen ? 'Hide catalog' : 'Add a source'}
                </button>
            </div>
            {!connectedCount && !catalogOpen && <p className="mobile-source-empty">No sources connected. Add a source to get started.</p>}
            <div className="integrations-grid" id="atlas-provider-list" data-catalog-open={catalogOpen}>
                {orderedProviders.map(([id, name, description, Icon, connected, account]) => (
                    <IntegrationTile
                        key={id}
                        name={name}
                        description={description}
                        icon={<Icon size={23} />}
                        connected={!!connected}
                        account={account}
                        health={sourceChecks[id]}
                        onClick={() => onOpen(id)}
                    />
                ))}
            </div>
        </>
    );
}
