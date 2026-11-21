'use client';
import { useState } from 'react';
import type { ConnectedSourceSearchResult, ConnectedSourceStatus, DriveConnectionStatus, DriveSearchResult, ExternalSourceProvider, ResearchProvider, SourceHealth } from '../../lib/types';

/** Source connection, provider discovery and research selection state. */
export function useSourceConnections() {
    const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus | null>(null);
    const [driveQuery, setDriveQuery] = useState('');
    const [driveResults, setDriveResults] = useState<DriveSearchResult[]>([]);
    const [driveBusy, setDriveBusy] = useState(false);
    const [sourceStatuses, setSourceStatuses] = useState<ConnectedSourceStatus[]>([]);
    const [sourceChecks, setSourceChecks] = useState<Record<string, SourceHealth>>({});
    const [sourceChecksBusy, setSourceChecksBusy] = useState(false);
    const [sourceManage, setSourceManage] = useState<string | null>(null);
    const [sourceProvider, setSourceProvider] = useState<ExternalSourceProvider>('github');
    const [sourceCredential, setSourceCredential] = useState('');
    const [sourceSearch, setSourceSearch] = useState('');
    const [sourceResults, setSourceResults] = useState<ConnectedSourceSearchResult[]>([]);
    const [sourceBusy, setSourceBusy] = useState(false);
    const [connectedGmail, setConnectedGmail] = useState(false);
    const [connectedProviders, setConnectedProviders] = useState<ResearchProvider[]>([]);
    const [connectedGmailQuery, setConnectedGmailQuery] = useState('newer_than:30d');
    return {
        driveStatus,
        setDriveStatus,
        driveQuery,
        setDriveQuery,
        driveResults,
        setDriveResults,
        driveBusy,
        setDriveBusy,
        sourceStatuses,
        setSourceStatuses,
        sourceChecks,
        setSourceChecks,
        sourceChecksBusy,
        setSourceChecksBusy,
        sourceManage,
        setSourceManage,
        sourceProvider,
        setSourceProvider,
        sourceCredential,
        setSourceCredential,
        sourceSearch,
        setSourceSearch,
        sourceResults,
        setSourceResults,
        sourceBusy,
        setSourceBusy,
        connectedGmail,
        setConnectedGmail,
        connectedProviders,
        setConnectedProviders,
        connectedGmailQuery,
        setConnectedGmailQuery,
    };
}
