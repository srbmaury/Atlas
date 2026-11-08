'use client';

import { useState } from 'react';
import { api } from '../../lib/api';

type Evidence = { title: string; path: string; url?: string; excerpt: string };
type Inspection = { repository: string; status: string; count: number; sources: Evidence[] };

export function RepositoryEvidence({ workspaceId }: { workspaceId: string }) {
    const [repository, setRepository] = useState('');
    const [question, setQuestion] = useState('Explain the architecture and main entry points');
    const [result, setResult] = useState<Inspection | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    const inspect = async () => {
        if (!repository.trim() || !question.trim() || busy) return;
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const data = await api<Inspection>(`/workspaces/${workspaceId}/repository-evidence`, {
                method: 'POST',
                body: JSON.stringify({ repository: repository.trim(), question: question.trim() }),
            });
            setResult(data);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not retrieve repository evidence.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="repository-evidence" aria-label="Repository evidence">
            <div className="repository-evidence-header">
                <div>
                    <strong>Repository evidence</strong>
                    <p>First retrieve real GitHub files. No AI answer or invented citations.</p>
                </div>
                <button className="btn" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Inspect repository'}</button>
            </div>
            {open && (
                <div className="repository-evidence-content">
                    <label htmlFor="evidence-repo">GitHub repository</label>
                    <input id="evidence-repo" placeholder="owner/repository" value={repository} onChange={(event) => setRepository(event.target.value)} />
                    <label htmlFor="evidence-question">What are you looking for?</label>
                    <textarea id="evidence-question" rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)} />
                    <button className="btn primary" type="button" onClick={() => void inspect()} disabled={busy || !repository.trim() || !question.trim()}>{busy ? 'Retrieving files…' : 'Find evidence'}</button>
                    {error && <p role="alert" className="repository-evidence-error">{error}</p>}
                    {result && (
                        <div aria-live="polite">
                            <p><strong>{result.count} real files retrieved</strong> from {result.repository}</p>
                            {result.count === 0 && <p>No matching files. Try a more specific question or verify repository permissions.</p>}
                            {result.sources.map((source) => (
                                <details key={source.path} className="repository-evidence-source">
                                    <summary>{source.path || source.title}</summary>
                                    {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open original file on GitHub</a>}
                                    <pre>{source.excerpt}</pre>
                                </details>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
