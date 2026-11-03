'use client';
import { useEffect, type MutableRefObject } from 'react';
import { api } from '../lib/api';
import type {
    ConnectedSourceSearchResponse,
    ConnectedSourceStatus,
    DriveConnectionStatus,
    DriveSearchResponse,
    ExternalSourceProvider,
    GmailMessage,
    GmailQuerySummary,
    GmailSearchResponse,
    GmailStatus,
    GmailSummary,
    OAuthAuthorizationResponse,
    SourceHealthCheckResponse,
    SourceHealthListResponse,
} from '../lib/types';
import { useSourceConnections } from './useSourceConnections';
import { useGmailWorkspace } from './useGmailWorkspace';

type Sources = ReturnType<typeof useSourceConnections>;
type Gmail = ReturnType<typeof useGmailWorkspace>;

interface useConnectedSourcesControllerProps {
    workspaceId: string;
    tab: string;
    scope: MutableRefObject<string>;
    sourceState: Sources;
    gmailState: Gmail;
    setError: (text: string) => void;
    setNotice: (text: string) => void;
}

export function useConnectedSourcesController({ workspaceId, tab, scope, sourceState, gmailState, setError, setNotice }: useConnectedSourcesControllerProps) {
    const {
        setDriveStatus,
        driveQuery,
        setDriveResults,
        setDriveBusy,
        setSourceStatuses,
        setSourceChecks,
        sourceChecksBusy,
        setSourceChecksBusy,
        sourceProvider,
        sourceCredential,
        setSourceCredential,
        sourceSearch,
        setSourceResults,
        setSourceBusy,
        setConnectedProviders,
    } = sourceState;
    const {
        setGmailStatus,
        setGmailMessages,
        gmailQuery,
        gmailSummarizeQuery,
        gmailQueryLimit,
        setGmailQuerySummaryLabel,
        gmailSelected,
        setGmailSelected,
        setGmailSummary,
        setGmailBusy,
        setGmailSummarizing,
        setGmailSummaryIds,
        setGmailMobileView,
        gmailSummaryHeading,
    } = gmailState;
    async function connectGmail() {
        setGmailBusy(true);
        setError('');
        try {
            const value = await api<OAuthAuthorizationResponse>(`/gmail/connect?workspaceId=${encodeURIComponent(workspaceId)}`);
            window.location.assign(value.authorization_url);
        } catch (e) {
            setError((e as Error).message);
            setGmailBusy(false);
        }
    }
    useEffect(() => {
        if ((tab === 'sources' || tab === 'chat') && workspaceId) {
            void refreshDrive();
            void api<ConnectedSourceStatus[]>(`/workspaces/${workspaceId}/sources`)
                .then((status) => {
                    if (scope.current === workspaceId) setSourceStatuses(status);
                })
                .catch((e) => setError((e as Error).message));
            void loadSourceChecks();
        }
    }, [tab, workspaceId]);
    async function refreshDrive() {
        if (!workspaceId) return;
        try {
            const status = await api<DriveConnectionStatus>(`/workspaces/${workspaceId}/drive/status`);
            if (scope.current === workspaceId) setDriveStatus(status);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    async function connectDrive() {
        setDriveBusy(true);
        setError('');
        try {
            const result = await api<OAuthAuthorizationResponse>(`/drive/connect?workspaceId=${encodeURIComponent(workspaceId)}`);
            window.location.assign(result.authorization_url);
        } catch (e) {
            setError((e as Error).message);
            setDriveBusy(false);
        }
    }
    async function disconnectDrive() {
        if (!window.confirm('Disconnect Google Drive from this workspace?')) return;
        setDriveBusy(true);
        setError('');
        try {
            await api(`/workspaces/${workspaceId}/drive`, { method: 'DELETE' });
            await refreshDrive();
            setDriveResults([]);
            setConnectedProviders((old) => old.filter((p) => p !== 'drive'));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setDriveBusy(false);
        }
    }
    async function searchDrive() {
        setDriveBusy(true);
        setError('');
        try {
            const data = await api<DriveSearchResponse>(`/workspaces/${workspaceId}/drive/search`, {
                method: 'POST',
                body: JSON.stringify({ query: driveQuery }),
            });
            setDriveResults(data.results);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setDriveBusy(false);
        }
    }
    async function refreshConnections() {
        const target = workspaceId;
        await Promise.all([
            refreshDrive(),
            refreshSourceStatuses(),
            loadSourceChecks(),
            api<GmailStatus>(`/gmail/status?workspaceId=${encodeURIComponent(target)}`)
                .then((status) => {
                    if (scope.current === target) setGmailStatus(status);
                })
                .catch((e) => setError(e.message)),
        ]);
    }
    async function verifySourceConnections() {
        if (!workspaceId || sourceChecksBusy) return;
        setSourceChecksBusy(true);
        setError('');
        try {
            const result = await api<SourceHealthCheckResponse>(`/workspaces/${workspaceId}/sources/health/check`, { method: 'POST' });
            if (scope.current !== workspaceId) return;
            setSourceChecks(Object.fromEntries(result.checks.map((item) => [item.provider, item])));
            const connected = result.checks.filter((item) => item.connected);
            const healthy = connected.filter((item) => item.healthy).length;
            setNotice(connected.length ? `Verified ${healthy} of ${connected.length} connected sources.` : 'No connected sources to check.');
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSourceChecksBusy(false);
        }
    }
    async function refreshSourceStatuses() {
        if (!workspaceId) return;
        try {
            const status = await api<ConnectedSourceStatus[]>(`/workspaces/${workspaceId}/sources`);
            if (scope.current === workspaceId) setSourceStatuses(status);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    async function loadSourceChecks() {
        if (!workspaceId) return;
        try {
            const result = await api<SourceHealthListResponse>(`/workspaces/${workspaceId}/sources/health`);
            if (scope.current === workspaceId) setSourceChecks(Object.fromEntries(result.checks.map((item) => [item.provider, item])));
        } catch {
            /* A health check has not been recorded yet. */
        }
    }
    async function connectOAuthSource() {
        if (!(['calendar', 'onedrive', 'outlook', 'sharepoint'] as string[]).includes(sourceProvider)) return;
        setSourceBusy(true);
        setError('');
        try {
            const response = await api<OAuthAuthorizationResponse>(`/connected-oauth/${sourceProvider}/connect?workspaceId=${encodeURIComponent(workspaceId)}`);
            window.location.assign(response.authorization_url);
        } catch (e) {
            setError((e as Error).message);
            setSourceBusy(false);
        }
    }
    async function connectSource() {
        if (!sourceCredential.trim()) return;
        setSourceBusy(true);
        setError('');
        try {
            await api(`/workspaces/${workspaceId}/sources/${sourceProvider}`, {
                method: 'POST',
                body: JSON.stringify({ token: sourceCredential.trim() }),
            });
            setSourceCredential('');
            await refreshSourceStatuses();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSourceBusy(false);
        }
    }
    async function disconnectSource(provider: ExternalSourceProvider) {
        if (!window.confirm(`Disconnect ${provider} from this workspace?`)) return;
        setSourceBusy(true);
        setError('');
        try {
            await api(`/workspaces/${workspaceId}/sources/${provider}`, { method: 'DELETE' });
            await refreshSourceStatuses();
            setSourceResults([]);
            setConnectedProviders((old) => old.filter((p) => p !== provider));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSourceBusy(false);
        }
    }
    async function searchSource() {
        if (!sourceSearch.trim()) return;
        setSourceBusy(true);
        setError('');
        try {
            const r = await api<ConnectedSourceSearchResponse>(`/workspaces/${workspaceId}/sources/${sourceProvider}/search`, {
                method: 'POST',
                body: JSON.stringify({ query: sourceSearch.trim() }),
            });
            setSourceResults(r.results);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSourceBusy(false);
        }
    }
    async function searchGmail() {
        setGmailBusy(true);
        setError('');
        setGmailSelected([]);
        setGmailMobileView('emails');
        try {
            const result = await api<GmailSearchResponse>(`/workspaces/${workspaceId}/gmail/search`, {
                method: 'POST',
                body: JSON.stringify({ query: gmailQuery, limit: 20 }),
            });
            setGmailMessages(result.messages);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setGmailBusy(false);
        }
    }
    async function summarizeGmailQuery() {
        if (!gmailSummarizeQuery.trim()) return;
        setGmailBusy(true);
        setGmailSummarizing(true);
        setError('');
        setGmailMobileView('summary');
        try {
            const result = await api<GmailQuerySummary>(`/workspaces/${workspaceId}/gmail/summarize-query`, {
                method: 'POST',
                body: JSON.stringify({
                    query: gmailSummarizeQuery.trim(),
                    limit: gmailQueryLimit,
                }),
            });
            setGmailSummary(result);
            setGmailSummaryIds([]);
            setGmailQuerySummaryLabel(`Query: ${gmailSummarizeQuery.trim()} · ${result.count} emails${result.limited ? ' (limit reached)' : ''}`);
            window.requestAnimationFrame(() => gmailSummaryHeading.current?.focus());
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setGmailBusy(false);
            setGmailSummarizing(false);
        }
    }
    async function summarizeGmail() {
        if (!gmailSelected.length) return;
        const selectedForSummary = [...gmailSelected];
        setGmailBusy(true);
        setGmailSummarizing(true);
        setError('');
        setGmailMobileView('summary');
        try {
            const result = await api<GmailSummary>(`/workspaces/${workspaceId}/gmail/summarize`, {
                method: 'POST',
                body: JSON.stringify({ message_ids: gmailSelected }),
            });
            setGmailSummary(result);
            setGmailSummaryIds(selectedForSummary);
            setGmailQuerySummaryLabel('');
            window.requestAnimationFrame(() => gmailSummaryHeading.current?.focus());
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setGmailBusy(false);
            setGmailSummarizing(false);
        }
    }
    async function disconnectGmail() {
        if (!window.confirm('Disconnect Gmail from this workspace?')) return;
        setGmailBusy(true);
        try {
            await api(`/workspaces/${workspaceId}/gmail`, { method: 'DELETE' });
            setGmailStatus({ connected: false, email: null, configured: true });
            setGmailMessages([]);
            setGmailSelected([]);
            setGmailSummary(null);
            setGmailSummaryIds([]);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setGmailBusy(false);
        }
    }

    return {
        connectGmail,
        refreshDrive,
        connectDrive,
        disconnectDrive,
        searchDrive,
        refreshConnections,
        verifySourceConnections,
        refreshSourceStatuses,
        loadSourceChecks,
        connectSource,
        connectOAuthSource,
        disconnectSource,
        searchSource,
        searchGmail,
        summarizeGmailQuery,
        summarizeGmail,
        disconnectGmail,
    };
}
