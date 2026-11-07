'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, LoaderCircle, SearchCheck, XCircle, StopCircle } from 'lucide-react';
import { api } from '../../lib/api';

type Stage = { key: string; label: string; status: string };
type Finding = {
    title: string;
    question: string;
    verified?: boolean;
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

const finished = new Set(['completed', 'cancelled', 'failed']);

export function DeepResearchPanel({ workspaceId, documentIds, includeDocuments, includeGmail, gmailQuery, providers }: Props) {
    const [question, setQuestion] = useState('');
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
                                        {run.question.slice(0, 85)} · {run.status}
                                    </option>
                                ))}
                            </select>
                            {active && (
                                <div className="deep-research-run">
                                    <div className="deep-research-run-heading">
                                        <strong>{active.question}</strong>
                                        <span aria-live="polite">{active.status}</span>
                                        {!finished.has(active.status) && (
                                            <button type="button" className="btn" onClick={() => void cancel()}>
                                                <StopCircle size={14} /> Cancel
                                            </button>
                                        )}
                                    </div>
                                    <ol className="deep-research-stages" aria-label="Research progress">
                                        {active.stages.map((stage) => (
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
                                    {active.status === 'completed' && (
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
