'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../lib/api';

function ReadableMarkdown({ text }: { text: string }) {
    const clean = text.replace(/^Repository file retrieved via GitHub Contents API\s*/, '');
    return <div className="repository-evidence-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{clean}</ReactMarkdown></div>;
}

type Evidence = { title: string; path: string; url?: string; excerpt: string };
type Repository = { full_name: string; private: boolean };
type Inspection = { repository: string | null; status: string; count: number; answer?: string | null; answer_mode?: string; fallback?: { text: string; source_id: number; path: string } | null; sources: Evidence[]; web_sources?: { title: string; url: string; excerpt: string }[]; repositories?: Repository[]; message?: string };

export function RepositoryEvidence({ workspaceId }: { workspaceId: string }) {
    const [repository, setRepository] = useState('');
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [includeWeb, setIncludeWeb] = useState(false);
    const [question, setQuestion] = useState('');
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
                body: JSON.stringify({ repository: repository.trim() || null, question: question.trim(), include_web: includeWeb }),
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
                    <textarea id="evidence-question" placeholder="Ask a question about your connected repositories…" rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)} />
                    <label className="repository-evidence-web"><input type="checkbox" checked={includeWeb} onChange={(event) => setIncludeWeb(event.target.checked)} /> Include public web search (requires server configuration)</label>
                    <button className="btn primary" type="button" onClick={() => void inspect()} disabled={busy || !question.trim()}>{busy ? 'Retrieving files…' : 'Find evidence'}</button>
                    {error && <p role="alert" className="repository-evidence-error">{error}</p>}
                    {result && (
                        <div aria-live="polite">
                            <p><strong>{result.status === 'select_repository' ? 'Select a repository to continue' : `${result.count} real files retrieved`}</strong>{result.repository ? ` from ${result.repository}` : ''}</p>
                            {result.status === 'select_repository' && <p>{result.message}</p>}
                            {result.answer && <article className="repository-evidence-answer"><h3>Answer</h3><ReadableMarkdown text={result.answer} /><small>Citations [1], [2], etc. refer to the evidence files and web results below.</small></article>}
                            {!result.answer && result.fallback && <article className="repository-evidence-answer"><h3>Repository overview</h3><p className="repository-evidence-notice">A verified AI answer is unavailable. The following is an excerpt from {result.fallback.path} [{result.fallback.source_id}], not a generated explanation or architecture flowchart.</p><details className="repository-evidence-source"><summary>Read source excerpt</summary><ReadableMarkdown text={result.fallback.text} /></details></article>}
                            {!result.answer && !result.fallback && result.count > 0 && <p className="repository-evidence-notice">No verified answer was generated ({result.answer_mode || 'unavailable'}). Inspect the sources below.</p>}
                            {result.count === 0 && <p>No matching files. Try a more specific question or verify repository permissions.</p>}
                            {!!result.web_sources?.length && <div className="repository-evidence-web-results"><strong>Public web results</strong>{result.web_sources.map((source, index) => <div key={source.url}>[{result.sources.filter((item) => item.excerpt).length + index + 1}] <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a><p>{source.excerpt}</p></div>)}</div>}
                            {result.sources.map((source, index) => (
                                <details key={source.path} className="repository-evidence-source">
                                    <summary>[{index + 1}] {source.path || source.title}</summary>
                                    {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open original file on GitHub</a>}
                                    {source.path.toLowerCase().endsWith('.md') || source.path.toLowerCase().endsWith('.mdx') ? <ReadableMarkdown text={source.excerpt} /> : <pre>{source.excerpt}</pre>}
                                </details>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
