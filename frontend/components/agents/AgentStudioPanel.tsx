'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Chip, InputBase, Typography } from '@mui/material';
import {
    BookOpen,
    Bot,
    CalendarDays,
    Check,
    Copy,
    Search,
    Cloud,
    FileText,
    FolderOpen,
    Github,
    Layers3,
    Mail,
    MessageSquare,
    Plus,
    Settings2,
    Sparkles,
    X,
} from 'lucide-react';
import styles from '../../app/workspaces/[workspaceId]/agents/studio.module.css';

type SourceConfig = { include_documents?: boolean; document_ids?: string[]; include_gmail?: boolean; providers?: string[] };
type Agent = { id: string; name: string; instructions: string; output_format: string; source_config?: SourceConfig };
const SOURCE_NAMES: Record<string, string> = {
    documents: 'Documents',
    gmail: 'Gmail',
    drive: 'Google Drive',
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

function SourceIcon({ provider, size = 17 }: { provider: string; size?: number }) {
    switch (provider) {
        case 'documents':
            return <FileText size={size} />;
        case 'gmail':
        case 'outlook':
            return <Mail size={size} />;
        case 'drive':
        case 'onedrive':
            return <FolderOpen size={size} />;
        case 'github':
            return <Github size={size} />;
        case 'slack':
            return <MessageSquare size={size} />;
        case 'calendar':
            return <CalendarDays size={size} />;
        case 'sharepoint':
            return <Cloud size={size} />;
        case 'notion':
            return <BookOpen size={size} />;
        default:
            return <Layers3 size={size} />;
    }
}

export function AgentStudioPanel({ workspaceId, workspaceName, canEdit, onUse }: { workspaceId: string; workspaceName: string; canEdit: boolean; onUse?: (handle: string) => void }) {
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents`;
    const [agents, setAgents] = useState<Agent[]>([]);
    const [agentsLoadState, setAgentsLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [instructions, setInstructions] = useState('Find relevant evidence and cite sources.');
    const [outputFormat, setOutputFormat] = useState('detailed_notes');
    const [editing, setEditing] = useState(false);
    const [sourceOptions, setSourceOptions] = useState<{ documents: { id: string; name: string }[]; providers: string[] }>({ documents: [], providers: [] });
    const [includeDocuments, setIncludeDocuments] = useState(true);
    const [documentScope, setDocumentScope] = useState<'all' | 'selected'>('all');
    const [sourcesFailed, setSourcesFailed] = useState(false);
    const [documentIds, setDocumentIds] = useState<string[]>([]);
    const [includeGmail, setIncludeGmail] = useState(false);
    const [providers, setProviders] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const loadAgents = useCallback(async () => {
        setAgentsLoadState('loading');
        try {
            const response = await fetch(base, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) throw new Error(`Unable to load agents (HTTP ${response.status}).`);
            const items: unknown = await response.json();
            if (!Array.isArray(items)) throw new Error('The agents response was not a list.');
            const loaded = items as Agent[];
            setAgents(loaded);
            setSelected((current) => (loaded.some((agent) => agent.id === current) ? current : loaded[0]?.id || ''));
            setAgentsLoadState('ready');
        } catch (error) {
            setAgentsLoadState('error');
            throw error;
        }
    }, [base]);

    const loadSourceOptions = useCallback(async () => {
        setSourcesFailed(false);
        try {
            const response = await fetch(base + '/sources', { credentials: 'same-origin' });
            if (!response.ok) throw new Error();
            setSourceOptions(await response.json());
        } catch {
            setSourcesFailed(true);
        }
    }, [base]);

    useEffect(() => {
        if (workspaceId) {
            loadAgents().catch((err) => setError(err.message));
            void loadSourceOptions();
        }
    }, [workspaceId, loadAgents, loadSourceOptions]);

    const missingSelectedDocuments = includeDocuments && documentScope === 'selected' && !documentIds.length;

    async function createAgent() {
        if (!name.trim() || missingSelectedDocuments) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(editing ? `${base}/${encodeURIComponent(selected)}` : base, {
                method: editing ? 'PATCH' : 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    instructions,
                    output_format: outputFormat,
                    include_documents: includeDocuments,
                    document_ids: documentScope === 'selected' ? documentIds : [],
                    include_gmail: includeGmail,
                    providers,
                }),
            });
            if (!response.ok) throw new Error('Unable to create agent.');
            const agent: Agent = await response.json();
            await loadAgents();
            setSelected(agent.id);
            setName('');
            setShowCreate(false);
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create agent.');
        } finally {
            setBusy(false);
        }
    }

    const [agentSearch, setAgentSearch] = useState('');
    const [copiedHandle, setCopiedHandle] = useState('');
    const filteredAgents = agents.filter((agent) => (agent.name + ' ' + agent.instructions).toLowerCase().includes(agentSearch.toLowerCase()));

    return (
        <div className={styles.studio}>
            <div className={styles.pageHead}>
                <div>
                    <Typography component="h1" variant="h4" sx={{ fontWeight: 800 }}>
                        Agents
                    </Typography>
                    <p>Build focused research assistants, connect their knowledge, and invoke them anywhere with @mentions.</p>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                        Workspace: {workspaceName}
                    </Typography>
                </div>
                {canEdit && (
                    <Button
                        variant="contained"
                        startIcon={<Plus size={17} />}
                        onClick={() => {
                            setEditing(false);
                            setName('');
                            setInstructions('Find relevant evidence and cite sources.');
                            setOutputFormat('detailed_notes');
                            setIncludeDocuments(true);
                            setDocumentIds([]);
                            setDocumentScope('all');
                            setIncludeGmail(false);
                            setProviders([]);
                            setShowCreate(true);
                        }}
                    >
                        Create agent
                    </Button>
                )}
            </div>
            {error && (
                <Alert severity="error" role="alert" className={styles.error}>
                    {error}
                </Alert>
            )}
            <div className={styles.libraryTools}>
                <div className={styles.librarySearch} role="search">
                    <Search size={17} aria-hidden="true" />
                    <InputBase
                        fullWidth
                        type="search"
                        placeholder="Search agents by name or purpose..."
                        inputProps={{ 'aria-label': 'Search agents' }}
                        value={agentSearch}
                        onChange={(event) => setAgentSearch(event.target.value)}
                        sx={{ fontSize: 14, '& input': { outline: 'none !important', boxShadow: 'none !important' } }}
                    />
                </div>
                <Chip
                    variant="outlined"
                    label={
                        agentsLoadState === 'loading'
                            ? 'Loading agents…'
                            : agentsLoadState === 'error'
                              ? 'Agents unavailable'
                              : `${filteredAgents.length} ${filteredAgents.length === 1 ? 'agent' : 'agents'}`
                    }
                />
                <Button size="small" variant="text" onClick={() => void loadAgents().catch((err) => setError(err.message))} disabled={agentsLoadState === 'loading'}>
                    Refresh
                </Button>
            </div>
            {agentsLoadState === 'loading' && agents.length === 0 ? (
                <div className={styles.libraryEmpty} role="status">
                    <Bot size={26} aria-hidden="true" />
                    <h2>Loading your research agents…</h2>
                    <p>Checking {workspaceName} for saved agents.</p>
                </div>
            ) : agentsLoadState === 'error' && agents.length === 0 ? (
                <div className={styles.libraryEmpty} role="alert">
                    <Bot size={26} aria-hidden="true" />
                    <h2>Couldn’t load research agents</h2>
                    <p>The agent list for {workspaceName} could not be retrieved. Your existing agents may still be available.</p>
                    <Button variant="outlined" onClick={() => void loadAgents().catch((err) => setError(err.message))}>
                        Retry loading agents
                    </Button>
                </div>
            ) : filteredAgents.length ? (
                <div className={styles.libraryGrid}>
                    {filteredAgents.map((agent) => {
                        const scope = agent.source_config || {};
                        const sourceTypes = [...(scope.include_documents !== false ? ['documents'] : []), ...(scope.include_gmail ? ['gmail'] : []), ...(scope.providers || [])];
                        const handle =
                            '@' +
                            agent.name
                                .toLowerCase()
                                .trim()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '');
                        return (
                            <Card component="article" variant="outlined" className={styles.libraryCard} key={agent.id} sx={{ borderColor: 'divider', borderRadius: 3 }}>
                                <div className={styles.libraryCardAccent} aria-hidden="true" />
                                <div className={styles.libraryCardTitle}>
                                    <span className={styles.agentIcon}>
                                        <Bot size={21} />
                                    </span>
                                    <div>
                                        <h2>{agent.name}</h2>
                                        <span>
                                            {sourceTypes.length} search source{sourceTypes.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                </div>
                                <p className={styles.libraryDescription}>{agent.instructions}</p>
                                <div className={styles.librarySourceHeading}>KNOWLEDGE SOURCES</div>
                                <div className={styles.librarySources} aria-label="Agent research sources">
                                    {sourceTypes.map((provider) => (
                                        <span className={styles.sourcePill} key={provider} title={SOURCE_NAMES[provider] || provider}>
                                            <span className={styles.sourcePillIcon}>
                                                <SourceIcon provider={provider} size={15} />
                                            </span>
                                            <span>{provider === 'documents' && scope.document_ids?.length ? `${scope.document_ids.length} documents` : SOURCE_NAMES[provider] || provider}</span>
                                        </span>
                                    ))}
                                </div>
                                <div className={styles.libraryFooter}>
                                    {onUse && handle.length > 1 && (
                                        <button type="button" className={styles.mentionCopy} onClick={() => onUse(handle)}>
                                            Use in chat
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={styles.mentionCopy}
                                        aria-label={`Copy ${handle} mention`}
                                        title="Copy mention to use in Atlas Chat"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(handle);
                                                setCopiedHandle(handle);
                                            } catch {
                                                setError('Could not copy the agent handle.');
                                            }
                                        }}
                                    >
                                        <code>{handle}</code>
                                        {copiedHandle === handle ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                    {canEdit && (
                                        <div>
                                            <button
                                                className={styles.button}
                                                onClick={() => {
                                                    setSelected(agent.id);
                                                    setName(agent.name);
                                                    setInstructions(agent.instructions);
                                                    setOutputFormat(agent.output_format || 'detailed_notes');
                                                    setIncludeDocuments(scope.include_documents ?? true);
                                                    setDocumentIds(scope.document_ids || []);
                                                    setDocumentScope(scope.document_ids?.length ? 'selected' : 'all');
                                                    setIncludeGmail(scope.include_gmail || false);
                                                    setProviders(scope.providers || []);
                                                    setEditing(true);
                                                    setShowCreate(true);
                                                }}
                                            >
                                                <Settings2 size={14} /> Edit
                                            </button>
                                            <button
                                                className={styles.button}
                                                aria-label={`Delete ${agent.name}`}
                                                onClick={async () => {
                                                    if (!window.confirm(`Delete ${agent.name} and its runs?`)) return;
                                                    try {
                                                        const response = await fetch(`${base}/${encodeURIComponent(agent.id)}`, { method: 'DELETE', credentials: 'same-origin' });
                                                        if (!response.ok) throw new Error('Unable to delete agent.');
                                                        await loadAgents();
                                                    } catch (err) {
                                                        setError(err instanceof Error ? err.message : 'Delete failed.');
                                                    }
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className={styles.libraryEmpty} role="status">
                    <span className={styles.libraryEmptyIcon}>
                        <Bot size={24} aria-hidden="true" />
                    </span>
                    <h2>{agents.length ? 'No matching agents' : canEdit ? 'Build your first research agent' : 'No agents in this workspace'}</h2>
                    <p>
                        {agents.length
                            ? 'Try a different name or purpose to find an agent.'
                            : canEdit
                              ? `No agents were returned for ${workspaceName}. Connect trusted knowledge sources, define instructions, and use an agent in Chat.`
                              : 'An editor or manager can create one.'}
                    </p>
                    {agents.length ? (
                        <button className={styles.button} onClick={() => setAgentSearch('')}>
                            Clear search
                        </button>
                    ) : canEdit ? (
                        <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setShowCreate(true)}>
                            Create agent
                        </Button>
                    ) : null}
                </div>
            )}
            {showCreate && (
                <div
                    className={styles.modalBackdrop}
                    onClick={() => {
                        if (!busy) setShowCreate(false);
                    }}
                >
                    <div
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-agent-title"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && !busy) {
                                event.stopPropagation();
                                setShowCreate(false);
                            }
                        }}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <div className={styles.modalEyebrow}>
                                    <Sparkles size={14} /> AGENT BUILDER
                                </div>
                                <h2 id="create-agent-title">{editing ? 'Edit agent' : 'Create an agent'}</h2>
                            </div>
                            <button className={styles.button} onClick={() => setShowCreate(false)} aria-label="Close">
                                <X size={17} />
                            </button>
                        </div>
                        <p className={styles.hint}>Configure instructions, output style, and the documents or connected sources this agent may search.</p>
                        <label htmlFor="agent-name">Agent name</label>
                        <input id="agent-name" className={styles.input} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Research Agent" />
                        <label htmlFor="agent-instructions">Instructions</label>
                        <textarea id="agent-instructions" className={styles.textarea} value={instructions} maxLength={2000} onChange={(event) => setInstructions(event.target.value)} />
                        <label htmlFor="agent-format">Output format</label>
                        <select id="agent-format" className={styles.input} value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
                            <option value="detailed_notes">Detailed notes</option>
                            <option value="concise">Concise answer</option>
                            <option value="report">Structured report</option>
                        </select>
                        <fieldset className={styles.sourcePicker}>
                            <legend>Knowledge & connected sources</legend>
                            {sourcesFailed && (
                                <p role="status" className={styles.hint}>
                                    Source options couldn’t be loaded.{' '}
                                    <button type="button" onClick={() => void loadSourceOptions()}>
                                        Retry
                                    </button>
                                </p>
                            )}
                            <p className={styles.sourcePickerHint}>Choose what this agent can reference when answering in chat.</p>
                            <label className={styles.sourceOption}>
                                <span className={styles.sourceOptionIcon}>
                                    <SourceIcon provider="documents" size={19} />
                                </span>
                                <span className={styles.sourceOptionText}>
                                    <strong>Workspace documents</strong>
                                    <small>Indexed files in this workspace</small>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={includeDocuments}
                                    onChange={(event) => {
                                        setIncludeDocuments(event.target.checked);
                                        if (!event.target.checked) setDocumentIds([]);
                                    }}
                                />
                            </label>
                            {includeDocuments && (
                                <div className={styles.documentPicker}>
                                    <label>
                                        Document scope
                                        <select value={documentScope} onChange={(event) => setDocumentScope(event.target.value === 'selected' ? 'selected' : 'all')}>
                                            <option value="all">All documents</option>
                                            <option value="selected">Selected documents</option>
                                        </select>
                                    </label>
                                    {documentScope === 'selected' &&
                                        sourceOptions.documents.map((doc) => (
                                            <label key={doc.id} className={styles.documentOption}>
                                                <FileText size={15} />
                                                <span title={doc.name}>{doc.name}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={documentIds.includes(doc.id)}
                                                    onChange={(event) => setDocumentIds((ids) => (event.target.checked ? [...ids, doc.id] : ids.filter((id) => id !== doc.id)))}
                                                />
                                            </label>
                                        ))}
                                </div>
                            )}
                            {sourceOptions.providers.map((provider) => (
                                <label className={styles.sourceOption} key={provider}>
                                    <span className={styles.sourceOptionIcon}>
                                        <SourceIcon provider={provider} size={19} />
                                    </span>
                                    <span className={styles.sourceOptionText}>
                                        <strong>{SOURCE_NAMES[provider] || provider}</strong>
                                        <small>Connected workspace source</small>
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={provider === 'gmail' ? includeGmail : providers.includes(provider)}
                                        onChange={(event) => {
                                            if (provider === 'gmail') setIncludeGmail(event.target.checked);
                                            else setProviders((items) => (event.target.checked ? [...items, provider] : items.filter((item) => item !== provider)));
                                        }}
                                    />
                                </label>
                            ))}
                        </fieldset>
                        <p className={styles.hint}>Connected sources are searched read-only using your existing workspace permissions.</p>
                        <div className={styles.modalActions}>
                            <button className={styles.button} onClick={() => setShowCreate(false)}>
                                Cancel
                            </button>
                            <button
                                className={`${styles.button} ${styles.primary}`}
                                onClick={createAgent}
                                disabled={busy || !name.trim() || missingSelectedDocuments || !(includeDocuments || includeGmail || providers.length)}
                            >
                                <Check size={15} /> {editing ? 'Save changes' : 'Create agent'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
