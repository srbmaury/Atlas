'use client';

import { useState } from 'react';
import { api } from '../../lib/api';

type Evidence = { title: string; path: string; url?: string; excerpt: string };
type Repository = { full_name: string; private: boolean };
type Inspection = { repository: string | null; status: string; count: number; sources: Evidence[]; repositories?: Repository[]; message?: string };

export function RepositoryEvidence({ workspaceId }: { workspaceId: string }) {
    const [repository, setRepository] = useState('');
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [question, setQuestion] = useState('Explain the architecture and main entry points');
    const [result, setResult] = useState<Inspection | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    const inspect = async () => {
        if (!question.trim() || busy) return;
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const data = await api<Inspection>(`/workspaces/${workspaceId}/repository-evidence`, {
                method: 'POST',
                body: JSON.stringify({ repository: repository.trim(), question: question.trim() }),
            });
            setResult(data);
            if (data.repositories) setRepositories(data.repositories);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not retrieve repository evidence.');
        } finally {
            setBusy(false);
        }
    };

    const toggle = async () => {
        if (open) { setOpen(false); return; }
        setOpen(true);
        if (loaded) return;
        try {
            const data = await api<{ repositories: Repository[] }>(`/workspaces/${workspaceId}/repository-evidence/repositories`);
            setRepositories(data.repositories);
            setLoaded(true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Connect GitHub to inspect repositories.');
        }
    };

    return (
        <section className="repository-evidence" aria-label="Repository evidence">
            <div className="repository-evidence-header">
                <div>
                    <strong>Repository evidence</strong>
                    <p>Discover repositories from your connected GitHub account and inspect real files.</p>
                </div>
                <button className="btn" type="button" onClick={() => void toggle()} aria-expanded={open}>{open ? 'Close' : 'Inspect repository'}</button>
            </div>
            {open && (
                <div className="repository-evidence-content">
                    <label htmlFor="evidence-repo">Repository (optional — inferred from your question)</label>
                    <select id="evidence-repo" value={repository} onChange={(event) => setRepository(event.target.value)}>
                        <option value="">Automatically detect from question</option>
                        {repositories.map((item) => <option key={item.full_name} value={item.full_name}>{item.full_name}{item.private ? ' (private)' : ''}</option>)}
                    </select>
                    <label htmlFor="evidence-question">What are you looking for?</label>
                    <textarea id="evidence-question" rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)} />
                    <button className="btn primary" type="button" onClick={() => void inspect()} disabled={busy || !question.trim()}>{busy ? 'Retrieving files…' : 'Find evidence'}</button>
                    {error && <p role="alert" className="repository-evidence-error">{error}</p>}
                    {result && (
                        <div aria-live="polite">
                            <p><strong>{result.status === 'select_repository' ? 'Select a repository to continue' : `${result.count} real files retrieved`}</strong>{result.repository ? ` from ${result.repository}` : ''}</p>
                            {result.status === 'select_repository' && <p>{result.message}</p>}
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
