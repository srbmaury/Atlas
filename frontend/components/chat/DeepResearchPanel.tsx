'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, LoaderCircle, SearchCheck, XCircle, StopCircle } from 'lucide-react';
import { api } from '../../lib/api';

type Stage = { key: string; label: string; status: string };
type Finding = {
    title: string;
    question: string;
    verified?: boolean;
    diagnostics?: { outcome: string; passages_considered: number; passages_used: number; providers: { provider: string; status: string; found: number; considered: number; used: number }[] };
    result: { answer?: string; sources?: { name?: string; title?: string; url?: string }[]; mode?: string };
};
type Run = {
    id: string;
    question: string;
    status: string;
    stages: Stage[];
    findings: Finding[];
    error?: string | null;
};
type Props = {
    workspaceId: string;
    documentIds: string[];
    includeDocuments: boolean;
    includeGmail: boolean;
    gmailQuery: string;
    providers: string[];
};

const finished = new Set(['completed', 'cancelled', 'failed', 'insufficient_evidence']);
const displayStatus = (run: Run) =>
    run.status === 'completed' && run.findings.length > 0 && run.findings.every((finding) => !finding.verified && !finding.result.sources?.length)
        ? 'Insufficient evidence'
        : run.status === 'insufficient_evidence'
          ? 'Insufficient evidence'
          : run.status;
const displayStages = (run: Run) => {
    // Recover the visual timeline for older runs whose JSON stage mutations were not persisted.
    if (finished.has(run.status) && run.findings.length && run.stages.every((stage) => stage.status === 'queued')) {
        return run.stages.map((stage) => ({ ...stage, status: run.status === 'failed' || run.status === 'cancelled' ? run.status : 'completed' }));
    }
    return run.stages;
};

export function DeepResearchPanel({ workspaceId, documentIds, includeDocuments, includeGmail, gmailQuery, providers }: Props) {
    const [question, setQuestion] = useState('');
    const [repository, setRepository] = useState('');
    const [depth, setDepth] = useState<'standard' | 'deep'>('standard');
    const [runs, setRuns] = useState<Run[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [starting, setStarting] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const active = runs.find((run) => run.id === activeId) || runs[0];

    const refresh = useCallback(async () => {
        try {
            const list = await api<Run[]>(`/workspaces/${workspaceId}/research-runs`);
            setRuns(list);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not load research history.');
        }
    }, [workspaceId]);

    useEffect(() => {
        setRuns([]);
        setActiveId(null);
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!runs.some((run) => !finished.has(run.status))) return;
        const timer = window.setInterval(() => void refresh(), 1500);
        return () => window.clearInterval(timer);
    }, [runs, refresh]);

    const start = async () => {
        if (!question.trim() || starting) return;
        setStarting(true);
        setError('');
        try {
            const run = await api<Run>(`/workspaces/${workspaceId}/research-runs`, {
                method: 'POST',
                body: JSON.stringify({
                    question: question.trim(),
                    depth,
                    document_ids: includeDocuments ? documentIds : [],
                    include_documents: includeDocuments,
                    include_gmail: includeGmail,
                    gmail_query: gmailQuery,
                    providers,
                    ...(repository.trim() ? { repository: repository.trim() } : {}),
                }),
            });
            setRuns((old) => [run, ...old]);
            setActiveId(run.id);
            setExpanded(true);
            setQuestion('');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not start research.');
        } finally {
            setStarting(false);
        }
    };

    const cancel = async () => {
        if (!active) return;
        try {
            await api(`/workspaces/${workspaceId}/research-runs/${active.id}/cancel`, { method: 'POST' });
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not cancel research.');
        }
    };

    return (
        <section className="deep-research-panel" aria-label="Deep Research">
            <div className="deep-research-heading">
                <div>
                    <span className="eyebrow">MULTI-STEP INVESTIGATIONS</span>
                    <h2>Deep Research</h2>
                    <p>Investigate a question across your selected sources, with saved progress and independently cited findings.</p>
                </div>
                <button type="button" className="btn" aria-expanded={expanded} onClick={() => setExpanded((old) => !old)}>
                    {expanded ? 'Hide research' : 'Open research'}
                </button>
            </div>
            {expanded && (
                <div className="deep-research-body">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void start();
                        }}
                    >
                        <label htmlFor="deep-research-question">Research question</label>
                        <textarea
                            id="deep-research-question"
                            value={question}
                            maxLength={4000}
                            rows={3}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="What changed in our architecture, and what risks remain?"
                        />
                        {providers.includes('github') && (
                            <div className="deep-research-repository">
                                <label htmlFor="deep-research-repository">GitHub repository (optional)</label>
                                <input
                                    id="deep-research-repository"
                                    value={repository}
                                    onChange={(event) => setRepository(event.target.value)}
                                    placeholder="owner/repository"
                                    pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
                                    title="Use owner/repository, for example srbmaury/Atlas"
                                />
                                <small>Use an exact repository to avoid searching unrelated issues and files.</small>
                            </div>
                        )}
                        <div className="deep-research-controls">
                            <label htmlFor="deep-research-depth">Depth</label>
                            <select id="deep-research-depth" value={depth} onChange={(event) => setDepth(event.target.value as 'standard' | 'deep')}>
                                <option value="standard">Standard · 2 investigations</option>
                                <option value="deep">Deep · 3 investigations</option>
                            </select>
                            <button className="btn primary" disabled={starting || !question.trim() || !(includeDocuments || includeGmail || providers.length)} type="submit">
                                <SearchCheck size={15} /> {starting ? 'Starting…' : 'Start research'}
                            </button>
                        </div>
                    </form>
                    {error && (
                        <p role="alert" className="deep-research-error">
                            {error}
                        </p>
                    )}
                    {runs.length > 0 && (
                        <div className="deep-research-results">
                            <label htmlFor="deep-research-history">Saved investigations</label>
                            <select id="deep-research-history" value={active?.id || ''} onChange={(event) => setActiveId(event.target.value)}>
                                {runs.map((run) => (
                                    <option key={run.id} value={run.id}>
                                        {run.question.slice(0, 85)} · {displayStatus(run)}
                                    </option>
                                ))}
                            </select>
                            {active && (
                                <div className="deep-research-run">
                                    <div className="deep-research-run-heading">
                                        <strong>{active.question}</strong>
                                        <span aria-live="polite">{displayStatus(active)}</span>
                                        {!finished.has(active.status) && (
                                            <button type="button" className="btn" onClick={() => void cancel()}>
                                                <StopCircle size={14} /> Cancel
                                            </button>
                                        )}
                                    </div>
                                    <ol className="deep-research-stages" aria-label="Research progress">
                                        {displayStages(active).map((stage) => (
                                            <li key={stage.key} data-status={stage.status}>
                                                {stage.status === 'completed' ? (
                                                    <CheckCircle2 size={17} />
                                                ) : stage.status === 'running' ? (
                                                    <LoaderCircle size={17} className="deep-research-spinner" />
                                                ) : stage.status === 'failed' ? (
                                                    <XCircle size={17} />
                                                ) : (
                                                    <Circle size={17} />
                                                )}
                                                <span>{stage.label}</span>
                                                <small>{stage.status}</small>
                                            </li>
                                        ))}
                                    </ol>
                                    {displayStatus(active) === 'Insufficient evidence' && !active.error && (
                                        <p role="status" className="deep-research-error">
                                            No cited findings were produced. Try a more specific question or connect relevant sources.
                                        </p>
                                    )}
                                    {active.error && (
                                        <p role="alert" className="deep-research-error">
                                            {active.error}
                                        </p>
                                    )}
                                    {active.findings.map((finding, index) => (
                                        <article className="deep-research-finding" key={index}>
                                            <h3>{finding.title}</h3>
                                            <p className="deep-research-subquestion">{finding.question}</p>
                                            <p className="deep-research-answer">{finding.result.answer || 'No answer was returned.'}</p>
                                            {finding.result.mode === 'citation_check_failed' && (
                                                <p className="deep-research-evidence-label">Retrieved passages could not be converted into a citation-valid answer.</p>
                                            )}
                                            {finding.diagnostics && (
                                                <details className="deep-research-diagnostics" open={!finding.verified}>
                                                    <summary>Retrieval diagnostics · {finding.diagnostics.outcome.replaceAll('_', ' ')}</summary>
                                                    <p>
                                                        Passages considered: {finding.diagnostics.passages_considered} · cited: {finding.diagnostics.passages_used}
                                                    </p>
                                                    <ul>
                                                        {finding.diagnostics.providers.map((provider) => (
                                                            <li key={provider.provider}>
                                                                {provider.provider}: {provider.status}; found {provider.found}, considered {provider.considered}, cited {provider.used}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </details>
                                            )}
                                            <span className="deep-research-evidence-label">
                                                {finding.verified ? 'Evidence cited' : 'Evidence not verified'} · {finding.result.sources?.length || 0} sources
                                            </span>
                                            {!!finding.result.sources?.length && (
                                                <details>
                                                    <summary>View source references</summary>
                                                    <ol>
                                                        {finding.result.sources.map((source, i) => (
                                                            <li key={i}>
                                                                {source.url ? (
                                                                    <a href={source.url} target="_blank" rel="noreferrer">
                                                                        {source.name || source.title || `Source ${i + 1}`}
                                                                    </a>
                                                                ) : (
                                                                    <span>{source.name || source.title || `Source ${i + 1}`}</span>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </details>
                                            )}
                                        </article>
                                    ))}
                                    {active.status === 'completed' && active.findings.some((finding) => finding.verified) && (
                                        <p className="deep-research-disclaimer">
                                            These are independently retrieved, cited findings—not a guarantee of factual correctness. Review the original evidence before making decisions.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
