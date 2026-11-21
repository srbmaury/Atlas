'use client';
import type { ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SourceHealth } from '../lib/types';

type Props = {
    name: string;
    description: string;
    connected?: boolean;
    account?: string | null;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    health?: SourceHealth;
};

export function IntegrationTile({ name, description, connected, account, icon, onClick, disabled, health }: Props) {
    return (
        <button type="button" className="integration-tile" data-connected={Boolean(connected)} onClick={onClick} disabled={disabled}>
            <span className="integration-tile-top">
                <span className="integration-tile-icon">{icon}</span>
                <ArrowUpRight size={17} className="integration-tile-arrow" />
            </span>
            <span className="integration-tile-name">{name}</span>
            <span className="integration-tile-description">{description}</span>
            <span className={`integration-tile-status ${connected ? 'connected' : ''} ${health && !health.healthy ? 'needs-attention' : ''}`} title={health?.error || undefined}>
                {connected ? (
                    health ? (
                        health.healthy ? (
                            <>
                                <CheckCircle2 size={14} /> Checked{' '}
                                {new Date(health.checked_at * 1000).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                })}{' '}
                                · {health.matches ?? 0} matches
                            </>
                        ) : (
                            <>
                                <AlertCircle size={14} /> Needs attention · {health.error || 'Access check failed'}
                            </>
                        )
                    ) : (
                        <>
                            <CheckCircle2 size={14} /> {account || 'Connected'}
                        </>
                    )
                ) : (
                    <>
                        <span className="integration-status-dot" />
                        Not connected
                    </>
                )}
            </span>
            <span className="mobile-source-tile-action">{connected ? 'Manage' : 'Connect'}</span>
        </button>
    );
}
