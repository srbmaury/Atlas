'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Chip, InputAdornment, TextField, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    BookOpen,
    Bot,
    CalendarDays,
    Check,
    Copy,
    Search,
    Clock3,
    Cloud,
    FileText,
    FolderOpen,
    Github,
    History,
    Layers3,
    LoaderCircle,
    Mail,
    MessageSquare,
    Plus,
    Settings2,
    Sparkles,
    Square,
    X,
} from 'lucide-react';
import styles from '../../app/workspaces/[workspaceId]/agents/studio.module.css';

type SourceConfig = { include_documents?: boolean; document_ids?: string[]; include_gmail?: boolean; providers?: string[] };
type Agent = { id: string; name: string; instructions: string; output_format: string; source_config?: SourceConfig };
type EvidenceNode = { id: string; type: string; name?: string; page?: number; excerpt?: string };
type EvidenceGraph = { nodes: EvidenceNode[]; edges: { from: string; to: string; type: string }[] };
type Run = {
    id: string;
    status: string;
    question: string;
    created?: number;
    steps: { tool: string; source_count?: number; mode?: string; queries?: string[] }[];
    result?: {
        answer?: string;
        error?: string;
        mode?: string;
        sources?: unknown[];
        evidence_graph?: EvidenceGraph;
        claim_verification?: { verified: number; needs_review: number; unsupported: number; claims: { claim: string; status: string; source_ids: number[]; reason: string }[]; disclaimer: string };
    };
};

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

export function AgentStudioPanel({ workspaceId, canEdit, onUse }: { workspaceId: string; canEdit: boolean; onUse?: (handle: string) => void }) {
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents`;
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selected, setSelected] = useState('');
    const [selectedRun, setSelectedRun] = useState('');
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
    const [question, setQuestion] = useState('');
    const [runs, setRuns] = useState<Run[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [view, setView] = useState<'run' | 'history'>('run');
    const [detailTab, setDetailTab] = useState<'answer' | 'evidence' | 'graph'>('answer');

    const loadAgents = useCallback(async () => {
        const response = await fetch(base, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Unable to load agents.');
        const items: Agent[] = await response.json();
        setAgents(items);
        setSelected((current) => current || items[0]?.id || '');
    }, [base]);

    const loadRuns = useCallback(
        async (id: string) => {
            const response = await fetch(`${base}/${encodeURIComponent(id)}/runs`, { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Unable to load research runs.');
            const items: Run[] = await response.json();
            setRuns(items);
            setSelectedRun((current) => (items.some((run) => run.id === current) ? current : items[0]?.id || ''));
        },
        [base],
    );

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

    useEffect(() => {
        if (!selected) {
            setRuns([]);
            setSelectedRun('');
            return;
        }
        loadRuns(selected).catch((err) => setError(err.message));
        const interval = setInterval(() => {
            loadRuns(selected).catch((err) => setError(err.message));
        }, 3000);
        return () => clearInterval(interval);
    }, [selected, loadRuns]);

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
            setSelectedRun('');
            setName('');
            setShowCreate(false);
            setEditing(false);
            if (!editing) setRuns([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create agent.');
        } finally {
            setBusy(false);
        }
    }

    function editAgent() {
        if (!activeAgent) return;
        setName(activeAgent.name);
        setInstructions(activeAgent.instructions);
        setOutputFormat(activeAgent.output_format || 'detailed_notes');
        setIncludeDocuments(activeAgent.source_config?.include_documents ?? true);
        setDocumentIds(activeAgent.source_config?.document_ids || []);
        setDocumentScope(activeAgent.source_config?.document_ids?.length ? 'selected' : 'all');
        setIncludeGmail(activeAgent.source_config?.include_gmail || false);
        setProviders(activeAgent.source_config?.providers || []);
        setEditing(true);
        setShowCreate(true);
    }

    async function deleteAgent() {
        if (!activeAgent || !window.confirm(`Delete ${activeAgent.name} and its research history?`)) return;
        setError('');
        try {
            const response = await fetch(`${base}/${encodeURIComponent(activeAgent.id)}`, { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok) throw new Error('Cancel active research runs before deleting this agent.');
            setSelected('');
            setRuns([]);
            await loadAgents();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to delete agent.');
        }
    }

    async function research() {
        if (!selected || question.trim().length < 3) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`${base}/${encodeURIComponent(selected)}/runs`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question.trim() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(typeof body.detail === 'string' ? body.detail : 'Unable to start research.');
            }
            const run: Run = await response.json();
            setSelectedRun(run.id);
            setView('run');
            setDetailTab('answer');
            await loadRuns(selected);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Research failed.');
        } finally {
            setBusy(false);
        }
    }

    async function cancelRun(runId: string) {
        if (!selected) return;
        setError('');
        try {
            const response = await fetch(`${base}/${encodeURIComponent(selected)}/runs/${encodeURIComponent(runId)}/cancel`, {
                method: 'POST',
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error('Unable to cancel research.');
            await loadRuns(selected);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Cancellation failed.');
        }
    }

    const activeAgent = agents.find((agent) => agent.id === selected);
    const activeRun = runs.find((run) => run.id === selectedRun);
    const graph = activeRun?.result?.evidence_graph;
    const documents = graph?.nodes.filter((node) => node.type === 'document') || [];
    const passages = graph?.nodes.filter((node) => node.type !== 'document') || [];
    const isRunning = (status: string) => status === 'queued' || status === 'processing';
    const date = (value?: number) => (value ? new Date(value * 1000).toLocaleString() : '');

    const [agentSearch, setAgentSearch] = useState('');
    const [copiedHandle, setCopiedHandle] = useState('');
    const filteredAgents = agents.filter((agent) => (agent.name + ' ' + agent.instructions).toLowerCase().includes(agentSearch.toLowerCase()));

    return (
        <div className={styles.studio}>
            <div className={styles.pageHead}>
                <div>
                    <Typography component="h1" variant="h4" sx={{ fontWeight: 800 }}>Agents</Typography>
                    <p>Build focused research assistants, connect their knowledge, and invoke them anywhere with @mentions.</p>
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
                <TextField
                    className="w-full max-w-lg"
                    size="small"
                    label="Search agents"
                    placeholder="Search agents by name or purpose..."
                    value={agentSearch}
                    onChange={(event) => setAgentSearch(event.target.value)}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={17} /></InputAdornment> } }}
                />
                <Chip variant="outlined" label={`${filteredAgents.length} ${filteredAgents.length === 1 ? 'agent' : 'agents'}`} />
            </div>
            {filteredAgents.length ? (
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
                    <Bot size={28} aria-hidden="true" />
                    <h2>{agents.length ? 'No matching agents' : canEdit ? 'Build your first research agent' : 'No agents yet'}</h2>
                    <p>
                        {agents.length
                            ? 'Try a different name or purpose to find an agent.'
                            : canEdit
                              ? 'Choose trusted knowledge sources, define instructions, and use the agent directly in Chat.'
                              : 'An editor or manager can create one.'}
                    </p>
                    {agents.length ? (
                        <button className={styles.button} onClick={() => setAgentSearch('')}>
                            Clear search
                        </button>
                    ) : canEdit ? (
                        <button className={styles.primaryButton} onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> Create agent
                        </button>
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
