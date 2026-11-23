const EXTERNAL_SOURCE_PROVIDERS = ['github', 'notion', 'slack', 'calendar', 'linear', 'jira', 'onedrive', 'outlook', 'sharepoint'] as const;

export type ExternalSourceProvider = (typeof EXTERNAL_SOURCE_PROVIDERS)[number];

export const RESEARCH_PROVIDERS = ['drive', ...EXTERNAL_SOURCE_PROVIDERS] as const;
export type ResearchProvider = (typeof RESEARCH_PROVIDERS)[number];

export type IntegrationProvider = 'gmail' | ResearchProvider;

export const PROVIDER_LABELS: Record<ResearchProvider, string> = {
    drive: 'Drive',
    github: 'GitHub',
    notion: 'Notion',
    slack: 'Slack',
    calendar: 'Calendar',
    linear: 'Linear',
    jira: 'Jira',
    onedrive: 'OneDrive',
    outlook: 'Outlook',
    sharepoint: 'SharePoint',
};

export const SOURCE_LABELS: Record<IntegrationProvider | 'documents', string> = {
    documents: 'Documents',
    gmail: 'Gmail',
    ...PROVIDER_LABELS,
};

export function isResearchProvider(value: string): value is ResearchProvider {
    return (RESEARCH_PROVIDERS as readonly string[]).includes(value);
}
