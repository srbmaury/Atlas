'use client';
import { LoaderCircle } from 'lucide-react';
import { IntegrationsGallery } from './IntegrationsGallery';
import { SourceConnectionDialog } from './SourceConnectionDialog';
import { GmailWorkspaceView } from './gmail/GmailWorkspaceView';
import type { useSourceConnections } from './useSourceConnections';
import type { useGmailWorkspace } from './gmail/useGmailWorkspace';
import type { useConnectedSourcesController } from './useConnectedSourcesController';

type Props = {
    sourceState: ReturnType<typeof useSourceConnections>;
    gmailState: ReturnType<typeof useGmailWorkspace>;
    controller: ReturnType<typeof useConnectedSourcesController>;
    setNotice: (notice: string) => void;
    setError: (error: string) => void;
};
export function ConnectedSourcesView({ sourceState, gmailState, controller, setNotice, setError }: Props) {
    const { sourceManage, setSourceManage, sourceChecksBusy, sourceStatuses, sourceChecks, driveStatus, setSourceProvider, setSourceResults, setSourceCredential } = sourceState;
    const { gmailStatus } = gmailState;
    const {
        connectGmail,
        connectDrive,
        disconnectDrive,
        searchDrive,
        refreshConnections,
        verifySourceConnections,
        connectSource,
        connectOAuthSource,
        disconnectSource,
        searchSource,
        searchGmail,
        summarizeGmailQuery,
        summarizeGmail,
        disconnectGmail,
    } = controller;
    return (
        <section className="connected-page">
            {sourceManage !== 'gmail' && (
                <div className="sources-overview">
                    <div className="crumb">
                        Workspace<span>›</span>Sources
                    </div>
                    <div className="heading-row">
                        <div>
                            <span className="eyebrow">YOUR INTEGRATIONS</span>
                            <h1>Connected sources</h1>
                            <p className="subtitle">Connect external services to your research workspace. Access stays read-only.</p>
                        </div>
                        <div className="source-header-actions">
                            <button className="btn" onClick={() => void refreshConnections()}>
                                Refresh list
                            </button>
                            <button className="btn primary" disabled={sourceChecksBusy} onClick={() => void verifySourceConnections()}>
                                {sourceChecksBusy ? (
                                    <>
                                        <LoaderCircle className="spin" />
                                        Checking access…
                                    </>
                                ) : (
                                    'Check source access'
                                )}
                            </button>
                        </div>
                    </div>
                    <IntegrationsGallery
                        gmailStatus={gmailStatus}
                        driveStatus={driveStatus}
                        sourceStatuses={sourceStatuses}
                        sourceChecks={sourceChecks}
                        onOpen={(provider) => {
                            setSourceManage(provider);
                            if (provider === 'gmail') window.scrollTo({ top: 0, behavior: 'instant' });
                            if (provider !== 'gmail' && provider !== 'drive') {
                                setSourceProvider(provider);
                                setSourceResults([]);
                            }
                        }}
                    />
                </div>
            )}
            {sourceManage === 'gmail' && (
                <GmailWorkspaceView
                    state={gmailState}
                    onBack={() => {
                        setSourceManage(null);
                        window.scrollTo({ top: 0, behavior: 'instant' });
                    }}
                    onDisconnect={() => void disconnectGmail()}
                    onConnect={() => void connectGmail()}
                    onSearch={() => void searchGmail()}
                    onSummarizeQuery={() => void summarizeGmailQuery()}
                    onSummarizeSelected={() => void summarizeGmail()}
                    onFollowUp={(question) => void summarizeGmail(question)}
                    onNotice={setNotice}
                    onError={setError}
                />
            )}
            <SourceConnectionDialog
                state={sourceState}
                onClose={() => {
                    setSourceManage(null);
                    setSourceCredential('');
                }}
                onSearchDrive={() => void searchDrive()}
                onDisconnectDrive={() => void disconnectDrive()}
                onConnectDrive={() => void connectDrive()}
                onConnectSource={() => void connectSource()}
                onConnectOAuthSource={() => void connectOAuthSource()}
                onSearchSource={() => void searchSource()}
                onDisconnectSource={(provider) => void disconnectSource(provider)}
            />
            <p className="caption">All connections are scoped to this workspace. Source content is accessed on demand; you can disconnect accounts at any time.</p>
        </section>
    );
}
