'use client';

import { Button, Paper, Typography } from '@mui/material';
import type { AgentMention } from '../../lib/types';

export function AgentMentionSuggestions({ agents, onSelect }: { agents: AgentMention[]; onSelect: (agent: AgentMention) => void }) {
    if (!agents.length) return null;
    return (
        <Paper variant="outlined" role="listbox" aria-label="Mention an agent" sx={{ p: 0.5, mb: 1, borderRadius: 2, maxWidth: 480, maxHeight: 250, overflowY: 'auto' }}>
            {agents.map((agent) => (
                <Button
                    key={agent.id}
                    type="button"
                    fullWidth
                    size="small"
                    role="option"
                    aria-selected={false}
                    onClick={() => onSelect(agent)}
                    sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 0.25, py: 1, px: 1.5, minWidth: 0 }}
                >
                    <Typography component="span" variant="body2" sx={{ fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.name}{' '}
                        <Typography component="span" variant="body2" color="text.secondary">
                            · {agent.handle}
                        </Typography>
                    </Typography>
                    {agent.description && (
                        <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', lineHeight: 1.5, maxWidth: '100%' }}
                        >
                            {agent.description}
                        </Typography>
                    )}
                </Button>
            ))}
        </Paper>
    );
}
