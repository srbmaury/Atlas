'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material';
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
    const needsAttention = Boolean(connected && health && !health.healthy);
    const status = !connected ? 'Not connected' : needsAttention ? 'Needs attention' : account || 'Connected';
    const statusColor = !connected ? 'default' : needsAttention ? 'warning' : 'success';
    return (
        <Card
            variant="outlined"
            sx={{
                height: '100%',
                minHeight: 213,
                borderColor: 'divider',
                transition: 'border-color .15s, box-shadow .15s',
                '&:hover': { borderColor: 'primary.main', boxShadow: '0 12px 30px rgba(31,41,96,.08)' },
            }}
        >
            <CardActionArea disabled={disabled} onClick={onClick} aria-label={`${connected ? 'Manage' : 'Connect'} ${name}`} sx={{ height: '100%', p: 2.5, display: 'flex', alignItems: 'stretch' }}>
                <div className="flex w-full flex-col items-start gap-3 text-left">
                    <div className="flex w-full items-start justify-between">
                        <Box sx={{ display: 'grid', placeItems: 'center', p: 1.4, borderRadius: 2.5, bgcolor: 'action.hover', color: 'primary.main' }}>{icon}</Box>
                        <ArrowUpRight size={18} aria-hidden="true" className="opacity-50" />
                    </div>
                    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {description}
                    </Typography>
                    <div className="mt-auto flex w-full flex-wrap items-center gap-2 pt-2">
                        <Chip
                            size="small"
                            color={statusColor}
                            variant="outlined"
                            icon={needsAttention ? <AlertCircle size={14} /> : connected ? <CheckCircle2 size={14} /> : undefined}
                            label={status}
                            title={health?.error || undefined}
                            sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                        />
                        {health?.healthy && (
                            <Typography variant="caption" color="text.secondary">
                                {health.matches ?? 0} matches
                            </Typography>
                        )}
                    </div>
                </div>
            </CardActionArea>
        </Card>
    );
}
