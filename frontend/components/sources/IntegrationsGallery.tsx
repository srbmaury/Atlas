'use client';
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
    return (
        <>
            <div className="integration-overview">
                <div>
                    <h2>Connected sources</h2>
                    <p>Connect the tools your team uses, and inspect connection health and access.</p>
                </div>
                <span>{[gmailStatus?.connected, driveStatus?.connected, ...sourceStatuses.map((x) => x.connected)].filter(Boolean).length} connected</span>
            </div>
            <div className="integrations-grid">
                <IntegrationTile
                    name="Gmail"
                    description="Search conversations and summarize email."
                    icon={<Mail size={23} />}
                    connected={!!gmailStatus?.connected}
                    account={gmailStatus?.email}
                    health={sourceChecks.gmail}
                    onClick={() => {
                        onOpen('gmail');
                    }}
                />
                <IntegrationTile
                    name="Google Drive"
                    description="Explore documents and cloud files."
                    icon={<HardDrive size={23} />}
                    connected={!!driveStatus?.connected}
                    account={driveStatus?.account}
                    health={sourceChecks.drive}
                    onClick={() => onOpen('drive')}
                />
                <IntegrationTile
                    name="GitHub"
                    description="Find issues, pull requests and decisions."
                    icon={<Github size={23} />}
                    connected={!!sourceStatuses.find((x) => x.provider === 'github')?.connected}
                    account={sourceStatuses.find((x) => x.provider === 'github')?.account}
                    health={sourceChecks.github}
                    onClick={() => {
                        onOpen('github');
                    }}
                />
                <IntegrationTile
                    name="Notion"
                    description="Search shared pages and knowledge."
                    icon={<NotebookPen size={23} />}
                    connected={!!sourceStatuses.find((x) => x.provider === 'notion')?.connected}
                    account={sourceStatuses.find((x) => x.provider === 'notion')?.account}
                    health={sourceChecks.notion}
                    onClick={() => {
                        onOpen('notion');
                    }}
                />
                <IntegrationTile
                    name="Slack"
                    description="Find team conversations and updates."
                    icon={<Hash size={23} />}
                    connected={!!sourceStatuses.find((x) => x.provider === 'slack')?.connected}
                    account={sourceStatuses.find((x) => x.provider === 'slack')?.account}
                    health={sourceChecks.slack}
                    onClick={() => {
                        onOpen('slack');
                    }}
                />
                {(
                    [
                        ['calendar', 'Google Calendar', 'Search meeting events.', CalendarDays],
                        ['linear', 'Linear', 'Search engineering issues.', ListTodo],
                        ['jira', 'Jira', 'Search project tickets.', Ticket],
                        ['onedrive', 'OneDrive', 'Search Microsoft files.', Cloud],
                        ['outlook', 'Outlook', 'Search Microsoft email.', Inbox],
                        ['sharepoint', 'SharePoint', 'Search accessible SharePoint files.', Building2],
                    ] as const
                ).map(([id, name, description, Icon]) => (
                    <IntegrationTile
                        key={id}
                        name={name}
                        description={description}
                        icon={<Icon size={23} />}
                        connected={!!sourceStatuses.find((x) => x.provider === id)?.connected}
                        account={sourceStatuses.find((x) => x.provider === id)?.account}
                        health={sourceChecks[id]}
                        onClick={() => onOpen(id)}
                    />
                ))}
            </div>
        </>
    );
}
