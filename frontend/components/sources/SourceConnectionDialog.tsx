'use client';
import { ArrowUpRight } from 'lucide-react';
import { Dialog } from '../ui/WorkspacePrimitives';
import { useSourceConnections } from './useSourceConnections';
import type { ExternalSourceProvider } from '../../lib/providers';
type State = ReturnType<typeof useSourceConnections>;

interface SourceConnectionDialogProps {
    state: State;
    onClose: () => void;
    onSearchDrive: () => void;
    onDisconnectDrive: () => void;
    onConnectDrive: () => void;
    onConnectSource: () => void;
    onConnectOAuthSource: () => void;
    onSearchSource: () => void;
    onDisconnectSource: (provider: ExternalSourceProvider) => void;
}
export function SourceConnectionDialog({
    state,
    onClose,
    onSearchDrive,
    onDisconnectDrive,
    onConnectDrive,
    onConnectSource,
    onConnectOAuthSource,
    onSearchSource,
    onDisconnectSource,
}: SourceConnectionDialogProps) {
    const {
        driveStatus,
        driveQuery,
        setDriveQuery,
        driveResults,
        driveBusy,
        sourceStatuses,
        sourceManage,
        sourceProvider,
        sourceCredential,
        setSourceCredential,
        sourceSearch,
        setSourceSearch,
        sourceResults,
        sourceBusy,
    } = state;
    return (
        <>
            {sourceManage && sourceManage !== 'gmail' && (
                <Dialog
                    title="Manage source connection"
                    onClose={() => {
                        onClose();
                    }}
                    className="source-dialog"
                >
                    {sourceManage === 'drive' && (
                        <div className="connected-card" id="drive-connection">
                            <h2>Google Drive</h2>
                            <p className="caption">Authorize read-only access to browse and search Drive. Atlas fetches selected content on demand.</p>
                            {driveStatus?.connected ? (
                                <>
                                    <p className="caption">Connected: {driveStatus.account}</p>
                                    <div className="source-search-controls">
                                        <input
                                            className="connected-field"
                                            value={driveQuery}
                                            onChange={(e) => setDriveQuery(e.target.value)}
                                            placeholder="Search Drive file names or text"
                                            aria-label="Search Drive"
                                        />
                                        <button className="btn" disabled={driveBusy} onClick={onSearchDrive}>
                                            Search Drive
                                        </button>
                                        <button className="btn" disabled={driveBusy} onClick={onDisconnectDrive}>
                                            Disconnect
                                        </button>
                                    </div>
                                    {driveResults.map((x) => (
                                        <div className="connected-evidence" key={x.id}>
                                            <strong>{x.title}</strong>
                                            <p>{x.excerpt}</p>
                                            <a href={x.url} target="_blank" rel="noopener noreferrer">
                                                Open in Drive <ArrowUpRight size={14} />
                                            </a>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <button className="btn primary" disabled={driveBusy || !driveStatus?.configured} onClick={onConnectDrive}>
                                    Connect Google Drive
                                </button>
                            )}
                            {!driveStatus?.configured && <p className="caption">Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI on the server to enable Drive.</p>}
                        </div>
                    )}
                    {sourceManage !== null && sourceManage !== 'drive' && (
                        <div className="connected-card">
                            <h2>
                                {
                                    (
                                        {
                                            github: 'GitHub',
                                            notion: 'Notion',
                                            slack: 'Slack',
                                            calendar: 'Google Calendar',
                                            linear: 'Linear',
                                            jira: 'Jira',
                                            onedrive: 'OneDrive',
                                            outlook: 'Outlook',
                                            sharepoint: 'SharePoint',
                                        } as Record<string, string>
                                    )[sourceProvider]
                                }{' '}
                                connection
                            </h2>
                            <p className="caption">
                                {sourceProvider === 'notion'
                                    ? 'Provide a Notion integration token, then share the pages Atlas should read with that integration. Atlas cannot access unshared workspace pages.'
                                    : sourceProvider === 'slack'
                                      ? 'Slack message search needs a user-scoped token with search:read. Bot tokens can authenticate, but Slack does not allow them to search messages.'
                                      : ['calendar', 'onedrive', 'outlook', 'sharepoint'].includes(sourceProvider)
                                        ? 'Authorize read-only access through your provider. Atlas keeps the refresh credential encrypted.'
                                        : 'Connect with a provider-issued read-only access token. Atlas encrypts it at rest.'}
                            </p>
                            {sourceProvider === 'github' && (
                                <p className="caption">
                                    <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noreferrer">
                                        Create a fine-grained GitHub token
                                    </a>{' '}
                                    for the repositories you want to search. Grant read access to Contents, Issues, and Pull requests as needed.
                                </p>
                            )}
                            {['calendar', 'onedrive', 'outlook'].includes(sourceProvider) && (
                                <div className="source-search-controls">
                                    <button className="btn primary" disabled={sourceBusy} onClick={onConnectOAuthSource}>
                                        Connect with OAuth
                                    </button>
                                    <p className="caption">Read-only permissions. Atlas encrypts your refresh credential so you can reconnect automatically.</p>
                                </div>
                            )}
                            {['linear', 'jira'].includes(sourceProvider) && (
                                <p className="caption" role="note">
                                    Use a provider-issued read-only token. Jira requires server-side ATLAS_JIRA_BASE_URL.
                                </p>
                            )}
                            {!['calendar', 'onedrive', 'outlook'].includes(sourceProvider) && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        onConnectSource();
                                    }}
                                >
                                    <input
                                        className="connected-field"
                                        type="password"
                                        autoComplete="off"
                                        aria-label="Provider access token"
                                        value={sourceCredential}
                                        onChange={(e) => setSourceCredential(e.target.value)}
                                        placeholder="Paste read-only access token"
                                    />
                                    <button type="submit" className="btn primary" disabled={sourceBusy || !sourceCredential.trim()}>
                                        {sourceBusy ? 'Connecting…' : 'Connect account'}
                                    </button>
                                </form>
                            )}
                            {sourceStatuses.some((x) => x.provider === sourceProvider && x.connected) && (
                                <>
                                    <div className="source-search-controls">
                                        <input
                                            className="connected-field"
                                            value={sourceSearch}
                                            onChange={(e) => setSourceSearch(e.target.value)}
                                            placeholder={sourceProvider === 'github' ? 'Search issues and PRs' : sourceProvider === 'notion' ? 'Search page titles' : 'Search messages'}
                                            aria-label="Search connected provider"
                                        />
                                        <button className="btn" disabled={sourceBusy || !sourceSearch.trim()} onClick={onSearchSource}>
                                            Search
                                        </button>
                                        <button className="btn" disabled={sourceBusy} onClick={() => onDisconnectSource(sourceProvider)}>
                                            Disconnect
                                        </button>
                                    </div>
                                    {sourceResults.map((x) => (
                                        <div className="connected-evidence" key={x.id}>
                                            <strong>{x.title}</strong>
                                            <p>{x.excerpt}</p>
                                            {x.url && (
                                                <a href={x.url} target="_blank" rel="noopener noreferrer">
                                                    Open source <ArrowUpRight size={14} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </Dialog>
            )}
        </>
    );
}
