'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Bot, Check, Clock3, FileText, History, Layers3, LoaderCircle, Plus, Settings2, Sparkles, Square, X } from 'lucide-react';
import styles from '../../app/workspaces/[workspaceId]/agents/studio.module.css';

type Agent = { id: string; name: string; instructions: string };
type EvidenceNode = { id: string; type: string; name?: string; page?: number; excerpt?: string };
type EvidenceGraph = { nodes: EvidenceNode[]; edges: { from: string; to: string; type: string }[] };
type Run = {
    id: string;
    status: string;
    question: string;
    created?: number;
    steps: { tool: string; source_count?: number; mode?: string; queries?: string[] }[];
    result?: { answer?: string; error?: string; sources?: unknown[]; evidence_graph?: EvidenceGraph };
};

export function AgentStudioPanel({ workspaceId }: { workspaceId: string }) {
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents`;
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selected, setSelected] = useState('');
    const [selectedRun, setSelectedRun] = useState('');
    const [name, setName] = useState('');
    const [instructions, setInstructions] = useState('Find relevant evidence and cite sources.');
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

    useEffect(() => {
        if (workspaceId) loadAgents().catch((err) => setError(err.message));
    }, [workspaceId, loadAgents]);

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

    async function createAgent() {
        if (!name.trim()) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(base, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), instructions }),
            });
            if (!response.ok) throw new Error('Unable to create agent.');
            const agent: Agent = await response.json();
            await loadAgents();
            setSelected(agent.id);
            setSelectedRun('');
            setName('');
            setShowCreate(false);
            setRuns([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create agent.');
        } finally {
            setBusy(false);
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

    return (
        <div className={styles.studio}>
            <div className={styles.pageHead}>
                <div>
                    <h1>
                        Agent Studio <span className={styles.beta}>Beta</span>
                    </h1>
                    <p>Create, run, and manage AI research agents for your workspace.</p>
                </div>
                <button className={`${styles.button} ${styles.primary}`} onClick={() => setShowCreate(true)}>
                    <Plus size={17} /> Create Agent
                </button>
            </div>
            {error && (
                <div role="alert" className={styles.error}>
                    {error}
                </div>
            )}
            <div className={styles.columns}>
                <section className={`${styles.panel} ${styles.agentPanel}`} aria-label="Agents">
                    <h2 className={styles.panelTitle}>
                        Agents <span className={styles.count}>{agents.length}</span>
                    </h2>
                    {agents.length === 0 && <div className={styles.empty}>No agents yet. Create one to get started.</div>}
                    {agents.map((agent) => (
                        <button
                            key={agent.id}
                            className={`${styles.agentItem} ${selected === agent.id ? styles.agentItemSelected : ''}`}
                            onClick={() => {
                                setSelected(agent.id);
                                setSelectedRun('');
                                setView('run');
                            }}
                        >
                            <span className={styles.agentIcon}>
                                <Bot size={21} />
                            </span>
                            <span>
                                <span className={styles.agentName}>{agent.name}</span>
                                <span className={styles.agentDesc}>{agent.instructions}</span>
                            </span>
                        </button>
                    ))}
                </section>
                <section className={`${styles.panel} ${styles.middle}`} aria-label="Agent research">
                    <div className={styles.agentHeader}>
                        <span className={styles.agentIcon}>
                            <BookOpen size={24} />
                        </span>
                        <div>
                            <h2>{activeAgent?.name || 'Select an agent'}</h2>
                            <p>{activeAgent?.instructions || 'Create an agent to begin source-grounded research.'}</p>
                        </div>
                    </div>
                    <div className={styles.tabs}>
                        <button className={`${styles.tab} ${view === 'run' ? styles.tabActive : ''}`} onClick={() => setView('run')}>
                            <Sparkles size={15} /> Run
                        </button>
                        <button className={`${styles.tab} ${view === 'history' ? styles.tabActive : ''}`} onClick={() => setView('history')}>
                            <History size={15} /> History
                        </button>
                    </div>
                    {view === 'run' && (
                        <div className={styles.card}>
                            <h3>Ask a research question</h3>
                            <textarea
                                className={styles.textarea}
                                aria-label="Research question"
                                value={question}
                                maxLength={2000}
                                onChange={(event) => setQuestion(event.target.value)}
                                placeholder="What do our documents say about…?"
                            />
                            <div className={styles.formBottom}>
                                <span className={styles.hint}>
                                    <Layers3 size={14} style={{ verticalAlign: 'middle' }} /> Workspace documents · source-grounded
                                </span>
                                <button className={`${styles.button} ${styles.primary}`} disabled={busy || !selected || question.trim().length < 3} onClick={research}>
                                    {busy ? <LoaderCircle size={15} /> : <Sparkles size={15} />} {busy ? 'Starting…' : 'Run Research'}
                                </button>
                            </div>
                        </div>
                    )}
                    <div className={styles.card}>
                        <h3>{view === 'history' ? 'Research history' : 'Recent runs'}</h3>
                        {runs.length === 0 && <div className={styles.empty}>Research runs will appear here.</div>}
                        {runs.map((run) => (
                            <div key={run.id} className={`${styles.runItem} ${selectedRun === run.id ? styles.runSelected : ''}`}>
                                <button
                                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
                                    onClick={() => {
                                        setSelectedRun(run.id);
                                        setDetailTab('answer');
                                    }}
                                    aria-label={`View research: ${run.question}`}
                                >
                                    <span className={styles.runQuestion}>
                                        <FileText size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
                                        {run.question}
                                    </span>
                                    <span className={styles.runMeta}>
                                        {date(run.created)} · {run.steps.find((step) => step.source_count !== undefined)?.source_count ?? 0} sources
                                    </span>
                                </button>
                                <span className={`${styles.status} ${styles[run.status as keyof typeof styles] || ''}`}>{run.status}</span>
                                {isRunning(run.status) ? (
                                    <button className={styles.button} onClick={() => cancelRun(run.id)} aria-label="Cancel research">
                                        <Square size={13} />
                                    </button>
                                ) : (
                                    <button className={styles.button} onClick={() => setSelectedRun(run.id)}>
                                        View
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
                <aside className={`${styles.panel} ${styles.details}`} aria-label="Run details">
                    <h2 className={styles.panelTitle}>
                        Run Details {activeRun && <span className={`${styles.status} ${styles[activeRun.status as keyof typeof styles] || ''}`}>{activeRun.status}</span>}
                    </h2>
                    {!activeRun ? (
                        <div className={styles.empty}>Select a research run to inspect its answer, sources, and provenance.</div>
                    ) : (
                        <>
                            <h3 className={styles.detailQuestion}>{activeRun.question}</h3>
                            <div className={styles.detailMeta}>
                                <Clock3 size={14} style={{ verticalAlign: 'middle' }} /> {date(activeRun.created)} · {passages.length} evidence passages
                            </div>
                            <div className={`${styles.tabs} ${styles.rightTabs}`}>
                                <button className={`${styles.tab} ${detailTab === 'answer' ? styles.tabActive : ''}`} onClick={() => setDetailTab('answer')}>
                                    Answer
                                </button>
                                <button className={`${styles.tab} ${detailTab === 'evidence' ? styles.tabActive : ''}`} onClick={() => setDetailTab('evidence')}>
                                    Evidence
                                </button>
                                <button className={`${styles.tab} ${detailTab === 'graph' ? styles.tabActive : ''}`} onClick={() => setDetailTab('graph')}>
                                    Graph
                                </button>
                            </div>
                            {detailTab === 'answer' && (
                                <div className={styles.card}>
                                    <h3>Research answer</h3>
                                    <div className={styles.answer}>
                                        {activeRun.result?.answer ||
                                            activeRun.result?.error ||
                                            (isRunning(activeRun.status) ? 'Research is in progress. This panel will update automatically.' : 'No answer available.')}
                                    </div>
                                </div>
                            )}
                            {detailTab === 'evidence' && (
                                <div>
                                    <p className={styles.hint}>Retrieved passages are evidence candidates, not independently verified claims.</p>
                                    {passages.length === 0 && <div className={styles.empty}>No evidence passages available.</div>}
                                    {passages.map((node) => (
                                        <div className={styles.source} key={node.id}>
                                            <strong>
                                                <FileText size={14} style={{ verticalAlign: 'middle' }} /> Page {node.page ?? 'unknown'}
                                            </strong>
                                            <p>{node.excerpt}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {detailTab === 'graph' && (
                                <div>
                                    <p className={styles.hint}>Document-to-passage provenance relationships. These edges do not establish factual entailment.</p>
                                    {documents.map((node) => (
                                        <div className={styles.source} key={node.id}>
                                            <strong>
                                                <BookOpen size={14} style={{ verticalAlign: 'middle' }} /> {node.name || 'Document'}
                                            </strong>
                                            {graph?.edges
                                                .filter((edge) => edge.from === node.id)
                                                .map((edge, index) => (
                                                    <div className={styles.graphEdge} key={index}>
                                                        ↳ {passages.find((item) => item.id === edge.to)?.excerpt?.slice(0, 120) || 'Source passage'}
                                                    </div>
                                                ))}
                                        </div>
                                    ))}
                                    {documents.length === 0 && <div className={styles.empty}>No provenance graph available.</div>}
                                </div>
                            )}
                            <details>
                                <summary className={styles.hint} style={{ cursor: 'pointer' }}>
                                    <Settings2 size={14} style={{ verticalAlign: 'middle' }} /> Execution trace
                                </summary>
                                <ol className={styles.trace}>
                                    {activeRun.steps.map((step, index) => (
                                        <li key={index}>
                                            {step.tool}
                                            {step.source_count === undefined ? '' : ` · ${step.source_count} sources`}
                                        </li>
                                    ))}
                                </ol>
                            </details>
                        </>
                    )}
                </aside>
            </div>
            {showCreate && (
                <div className={styles.modalBackdrop} onClick={() => setShowCreate(false)}>
                    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-agent-title" onClick={(event) => event.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h2 id="create-agent-title">Create an agent</h2>
                            <button className={styles.button} onClick={() => setShowCreate(false)} aria-label="Close">
                                <X size={17} />
                            </button>
                        </div>
                        <p className={styles.hint}>Agents research your workspace's indexed documents.</p>
                        <label htmlFor="agent-name">Agent name</label>
                        <input id="agent-name" className={styles.input} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Research Agent" />
                        <label htmlFor="agent-instructions">Instructions</label>
                        <textarea id="agent-instructions" className={styles.textarea} value={instructions} maxLength={2000} onChange={(event) => setInstructions(event.target.value)} />
                        <div className={styles.modalActions}>
                            <button className={styles.button} onClick={() => setShowCreate(false)}>
                                Cancel
                            </button>
                            <button className={`${styles.button} ${styles.primary}`} onClick={createAgent} disabled={busy || !name.trim()}>
                                <Check size={15} /> Create agent
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
