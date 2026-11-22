'use client';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { api } from '../../lib/api';
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
} from '../../lib/types';
import { useSourceConnections } from './useSourceConnections';
import { useGmailWorkspace } from './gmail/useGmailWorkspace';

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
        setGmailThreads,
        setGmailActiveThread,
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
    const [sourceFailure, setSourceFailure] = useState<{ workspaceId: string; failed: boolean }>();
    const lastAutomaticRefresh = useRef<{ workspaceId: string; at: number } | null>(null);
    useEffect(() => {
        if (!workspaceId || !['sources', 'chat', 'overview'].includes(tab)) return;
        // Avoid four redundant requests each time users switch between workspace tabs.
        // Explicit connection and manual refresh actions are not throttled.
        const last = lastAutomaticRefresh.current;
        // The Sources page always requests the latest connection status.
        // Never cache a failed/partial read for 30 seconds.
        if (tab !== 'sources' && !sourceFailure?.failed && last?.workspaceId === workspaceId && Date.now() - last.at < 30000) return;
        const target = workspaceId;
        void refreshConnections().then((complete) => {
            if (complete && scope.current === target) lastAutomaticRefresh.current = { workspaceId: target, at: Date.now() };
        });
    }, [tab, workspaceId]);

    async function refreshDrive() {
        if (!workspaceId) return;
        const status = await api<DriveConnectionStatus>(`/workspaces/${workspaceId}/drive/status`);
        if (scope.current === workspaceId) setDriveStatus(status);
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
            if (scope.current !== workspaceId) return;
            setDriveStatus((status) => status && { ...status, connected: false, account: null });
            setDriveResults([]);
            setConnectedProviders((old) => old.filter((p) => p !== 'drive'));
            await refreshConnections();
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
        const outcomes = await Promise.allSettled([
            refreshDrive(),
            refreshSourceStatuses(),
            loadSourceChecks(),
            api<GmailStatus>(`/gmail/status?workspaceId=${encodeURIComponent(target)}`).then((status) => {
                if (scope.current === target) setGmailStatus(status);
            }),
        ]);
        const complete = outcomes.every((outcome) => outcome.status === 'fulfilled');
        if (scope.current === target) setSourceFailure({ workspaceId: target, failed: !complete });
        return complete;
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
        const status = await api<ConnectedSourceStatus[]>(`/workspaces/${workspaceId}/sources`);
        if (scope.current === workspaceId) setSourceStatuses(status);
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
            if (scope.current !== workspaceId) return;
            setSourceStatuses((items) => items.map((item) => (item.provider === provider ? { ...item, connected: false, account: null } : item)));
            setSourceResults([]);
            setConnectedProviders((old) => old.filter((p) => p !== provider));
            await refreshConnections();
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
                body: JSON.stringify({ query: gmailQuery, limit: 20, expand_threads: true }),
            });
            setGmailMessages(result.messages);
            setGmailThreads(result.threads || []);
            setGmailActiveThread(null);
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
    async function summarizeGmail(followUp?: string) {
        if (!gmailSelected.length && !followUp) return;
        const selectedForSummary = followUp ? gmailState.gmailSummaryIds : [...gmailSelected];
        if (!selectedForSummary.length) return;
        setGmailBusy(true);
        setGmailSummarizing(true);
        setError('');
        setGmailMobileView('summary');
        try {
            const result = await api<GmailSummary>(`/workspaces/${workspaceId}/gmail/summarize`, {
                method: 'POST',
                body: JSON.stringify({ message_ids: selectedForSummary, intelligence: gmailState.gmailIntelligence || Boolean(followUp), follow_up: followUp || undefined }),
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
        sourceLoadFailed: sourceFailure?.workspaceId === workspaceId && sourceFailure.failed,
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
