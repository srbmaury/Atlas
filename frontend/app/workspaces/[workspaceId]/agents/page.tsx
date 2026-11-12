'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Agent = { id: string; name: string; instructions: string };
type Run = {
  id: string;
  status: string;
  question: string;
  steps: { tool: string; source_count?: number; mode?: string }[];
  result?: { answer?: string; error?: string; sources?: unknown[]; evidence_graph?: { nodes: { id: string; type: string; name?: string; page?: number; excerpt?: string }[]; edges: { from: string; to: string; type: string }[] } };
};

export default function AgentStudio() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents`;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAgents() {
    const response = await fetch(base, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to load agents.');
    setAgents(await response.json());
  }

  async function loadRuns(id: string) {
    const response = await fetch(`${base}/${encodeURIComponent(id)}/runs`);
    if (!response.ok) throw new Error('Unable to load runs.');
    setRuns(await response.json());
  }

  useEffect(() => {
    if (workspaceId) loadAgents().catch((e) => setError(e.message));
  }, [workspaceId]);

  async function createAgent() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, instructions: 'Find evidence and cite sources.' }),
      });
      if (!response.ok) throw new Error('Unable to create agent.');
      const agent: Agent = await response.json();
      await loadAgents();
      setSelected(agent.id);
      setName('');
      setRuns([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function research() {
    if (!selected || !question.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${base}/${encodeURIComponent(selected)}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) throw new Error('Research failed.');
      await loadRuns(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 850, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>Atlas Agent Studio</h1>
      <p>Create a read-only research agent for this workspace and inspect its evidence trace.</p>
      <section>
        <h2>New agent</h2>
        <input aria-label="Agent name" value={name} maxLength={100}
          onChange={(e) => setName(e.target.value)} placeholder="Research Assistant" />
        <button disabled={busy || !name.trim()} onClick={createAgent}>Create agent</button>
      </section>
      <section>
        <h2>Research</h2>
        <select aria-label="Select agent" value={selected} onChange={(e) => {
          setSelected(e.target.value);
          setRuns([]);
          if (e.target.value) loadRuns(e.target.value).catch((err) => setError(err.message));
        }}>
          <option value="">Choose an agent</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <textarea aria-label="Research question" value={question} maxLength={2000}
          onChange={(e) => setQuestion(e.target.value)} placeholder="What do our documents say about…?" />
        <button disabled={busy || !selected || question.trim().length < 3} onClick={research}>
          {busy ? 'Working…' : 'Run research'}
        </button>
      </section>
      {error && <p role="alert">{error}</p>}
      <section aria-label="Research runs">
        <h2>Run history</h2>
        {runs.map((run) => (
          <article key={run.id} style={{ borderTop: '1px solid #888', padding: '1rem 0' }}>
            <h3>{run.question}</h3>
            <p>Status: {run.status}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{run.result?.answer || run.result?.error}</p>
            <details><summary>Execution trace</summary>
              <ol>{run.steps.map((step, index) => <li key={index}>
                {step.tool} {step.source_count === undefined ? '' : `(${step.source_count} sources)`}
              </li>)}</ol>
            </details>
            <p>Sources returned: {run.result?.sources?.length || 0}</p>
            {run.result?.evidence_graph && <details><summary>Evidence provenance</summary>
              <p>Documents and source excerpts (relationships indicate provenance, not factual entailment).</p>
              <ul>{run.result.evidence_graph.nodes.map((node) => <li key={node.id}>
                <strong>{node.type === 'document' ? node.name : `Evidence on page ${node.page ?? 'unknown'}`}</strong>
                {node.excerpt && <p style={{ whiteSpace: 'pre-wrap' }}>{node.excerpt}</p>}
              </li>)}</ul>
            </details>}
          </article>
        ))}
      </section>
    </main>
  );
}
