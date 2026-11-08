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
type Turn = { question: string; result: Inspection };
type Repository = { full_name: string; private: boolean };
type Inspection = { repository: string | null; status: string; count: number; answer?: string | null; answer_mode?: string; fallback?: { text: string; source_id: number; path: string } | null; sources: Evidence[]; web_sources?: { title: string; url: string; excerpt: string }[]; repositories?: Repository[]; message?: string };

export function RepositoryEvidence({ workspaceId }: { workspaceId: string }) {
    const [repository, setRepository] = useState('');
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [includeWeb, setIncludeWeb] = useState(false);
    const [question, setQuestion] = useState('');
    const [turns, setTurns] = useState<Turn[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    const inspect = async () => {
        if (!question.trim() || busy) return;
        setBusy(true);
        setError('');

        try {
            const data = await api<Inspection>(`/workspaces/${workspaceId}/repository-evidence`, {
                method: 'POST',
                body: JSON.stringify({ repository: repository.trim() || null, question: question.trim(), include_web: includeWeb, history: turns.slice(-3).flatMap(turn => [ { role: 'user', content: turn.question }, ...(turn.result.answer ? [{ role: 'assistant', content: turn.result.answer }] : []) ]) }),
            });
            if (data.repository && !repository) setRepository(data.repository);
            if (data.status !== 'select_repository') { setTurns(previous => [...previous, { question: question.trim(), result: data }]); setQuestion(''); }
            else setError(data.message || 'Select a repository to continue.');
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
                    <strong>Chat with your repository</strong>
                    <p>Ask questions, inspect sources, and follow up using connected GitHub evidence.</p>
                </div>
                <button className="btn" type="button" onClick={() => void toggle()} aria-expanded={open}>{open ? 'Close' : 'Open chat'}</button>
            </div>
            {open && (
                <div className="repository-evidence-content">
                    <label htmlFor="evidence-repo">Repository (optional — inferred from your question)</label>
                    <select id="evidence-repo" value={repository} onChange={(event) => setRepository(event.target.value)}>
                        <option value="">Automatically detect from question</option>
                        {repositories.map((item) => <option key={item.full_name} value={item.full_name}>{item.full_name}{item.private ? ' (private)' : ''}</option>)}
                    </select>
                    {turns.length > 0 && <button className="btn" type="button" onClick={() => { setTurns([]); setQuestion(''); }}>New conversation</button>}
                    <div className="repository-evidence-thread" role="log" aria-label="Repository conversation">{turns.map((turn, turnIndex) => { const result = turn.result; return <div key={turnIndex} className="repository-evidence-turn"><p className="repository-evidence-user"><strong>You</strong> {turn.question}</p><div className="repository-evidence-assistant"><strong>Atlas</strong><p>{result.count} files retrieved from {result.repository}</p>{result.answer ? <ReadableMarkdown text={result.answer} /> : <p className="repository-evidence-notice">A verified answer was not generated ({result.answer_mode}). Inspect the evidence below.</p>}{!result.answer && result.fallback && <details><summary>Read source excerpt</summary><ReadableMarkdown text={result.fallback.text} /></details>}{result.sources.map((source, index) => <details key={source.path || index} className="repository-evidence-source"><summary>[{index + 1}] {source.path || source.title}</summary>{source.url && <a href={source.url} target="_blank" rel="noreferrer">Open original on GitHub</a>}{source.path.toLowerCase().endsWith('.md') ? <ReadableMarkdown text={source.excerpt} /> : <pre>{source.excerpt}</pre>}</details>)}{!!result.web_sources?.length && result.web_sources.map((source, index) => <p key={source.url}>[{result.sources.length + index + 1}] <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</div></div>; })}</div>
                    <label htmlFor="evidence-question">{turns.length ? 'Ask a follow-up' : 'What are you looking for?'}</label>
                    <textarea id="evidence-question" placeholder="Ask a question about your connected repositories…" rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)} />
                    <label className="repository-evidence-web"><input type="checkbox" checked={includeWeb} onChange={(event) => setIncludeWeb(event.target.checked)} /> Include public web search (requires server configuration)</label>
                    <button className="btn primary" type="button" onClick={() => void inspect()} disabled={busy || !question.trim()}>{busy ? 'Retrieving files…' : 'Send message'}</button>
                    {error && <p role="alert" className="repository-evidence-error">{error}</p>}

                </div>
            )}
        </section>
    );
}
