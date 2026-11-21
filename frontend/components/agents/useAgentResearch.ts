import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { chatLoadSequence } from '../../lib/chatLoadSequence';
import { persistConversation } from '../../lib/researchRequests';
import type { ChatSummary, Source } from '../../lib/types';
import type { useConversation } from '../chat/useConversation';

type AgentMention = { id: string; name: string; handle: string };

type ActiveAgentRun = {
    controller: AbortController;
    start?: Promise<{ id: string; url: string }>;
    cancelling: boolean;
};

async function cancelAgentRun(start: NonNullable<ActiveAgentRun['start']>) {
    const { url } = await start;
    const response = await fetch(`${url}/cancel`, { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not stop agent research. Try Stop again.');
}

type AgentResearchOptions = {
    workspaceId: string;
    userId?: string;
    tab: string;
    busy: boolean;
    scope: RefObject<string>;
    conversation: Pick<ReturnType<typeof useConversation>, 'activeChat' | 'chatMessages' | 'chatTitle' | 'setChatId' | 'setMessages'>;
    setChats: Dispatch<SetStateAction<ChatSummary[]>>;
    setQuery: (query: string) => void;
    setError: (error: string) => void;
};

export function useAgentResearch({ workspaceId, userId, tab, busy, scope, conversation, setChats, setQuery, setError }: AgentResearchOptions) {
    const { activeChat, chatMessages, chatTitle, setChatId, setMessages } = conversation;
    const [agentBusy, setAgentBusy] = useState(false);
    const activeRun = useRef<ActiveAgentRun | null>(null);

    async function stopAgent() {
        const run = activeRun.current;
        if (!run || run.cancelling) return;
        setError('');
        run.cancelling = true;
        try {
            if (run.start) await cancelAgentRun(run.start);
            if (activeRun.current !== run) return;
            activeRun.current = null;
            run.controller.abort();
            setAgentBusy(false);
        } catch {
            if (activeRun.current === run) setError('Could not stop agent research. Try Stop again.');
        } finally {
            run.cancelling = false;
        }
    }

    useLayoutEffect(
        () => () => {
            const run = activeRun.current;
            if (!run) return;
            activeRun.current = null;
            run.controller.abort();
            setAgentBusy(false);
            if (run.start && !run.cancelling) void cancelAgentRun(run.start).catch(() => {});
        },
        [workspaceId, userId],
    );

    const [agentList, setAgentList] = useState<{ workspaceId: string; userId: string; agents: AgentMention[] }>();
    useEffect(() => {
        if (!workspaceId || !userId) return;
        const controller = new AbortController();
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents`, { credentials: 'same-origin', signal: controller.signal })
            .then((response) => (response.ok ? response.json() : []))
            .then((items: { id: string; name: string }[]) => {
                if (controller.signal.aborted) return;
                setAgentList({
                    workspaceId,
                    userId,
                    agents: items.map((item) => ({
                        ...item,
                        handle:
                            '@' +
                            item.name
                                .toLowerCase()
                                .trim()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, ''),
                    })),
                });
            })
            .catch(() => {
                if (!controller.signal.aborted) setAgentList(undefined);
            });
        return () => controller.abort();
    }, [workspaceId, userId, tab]);

    const mentionAgents = agentList?.workspaceId === workspaceId && agentList.userId === userId ? agentList.agents : [];

    function handleAgentMention(text: string) {
        const match = /(?:^|\s)(@[a-z0-9-]+)(?=\s|$)/i.exec(text);
        if (!match) return false;
        const agent = mentionAgents.find((item) => item.handle === match[1].toLowerCase());
        if (!agent) {
            setError(`Unknown agent ${match[1]}. Select an agent from the @ menu.`);
            return true;
        }
        const agentQuestion = text.replace(match[0], ' ').trim();
        if (agentQuestion.length < 3) {
            setError('Add a research question when mentioning an agent.');
            return true;
        }
        if (!busy && !activeRun.current && workspaceId) void runAgent(agent, text, agentQuestion);
        return true;
    }

    async function runAgent(agent: AgentMention, text: string, agentQuestion: string) {
        const controller = new AbortController();
        const { signal } = controller;
        const pending: ActiveAgentRun = { controller, cancelling: false };
        activeRun.current = pending;
        const sequence = chatLoadSequence.next();
        const isCurrent = () => !signal.aborted && scope.current === workspaceId && chatLoadSequence.isCurrent(sequence);
        setAgentBusy(true);
        setQuery('');
        const questionMessage = { role: 'user' as const, content: text };
        const questionMessages = [...chatMessages.current, questionMessage];
        setMessages(questionMessages);
        const conversationTitle = chatTitle.current === 'New chat' ? text.slice(0, 100) : chatTitle.current;
        let conversationId = activeChat.current;
        try {
            const saved = await persistConversation(workspaceId, conversationId, conversationTitle, questionMessages);
            if (!isCurrent()) return;
            conversationId = saved.id;
            setChatId(saved.id);
            chatTitle.current = conversationTitle;
            setChats((previous) => [{ id: saved.id, title: conversationTitle, updated: saved.updated }, ...previous.filter((item) => item.id !== saved.id)]);
            const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agent.id)}/runs`;
            pending.start = (async () => {
                const started = await fetch(base, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: agentQuestion }) });
                if (!started.ok) throw new Error(`Agent could not start (HTTP ${started.status}).`);
                const run: { id: string } = await started.json();
                return { id: run.id, url: `${base}/${encodeURIComponent(run.id)}` };
            })();
            const run = await pending.start;
            if (!isCurrent()) {
                if (!signal.aborted) void cancelAgentRun(pending.start).catch(() => {});
                return;
            }
            let completed:
                | {
                      id: string;
                      status: string;
                      result?: {
                          answer?: string;
                          error?: string;
                          mode?: string;
                          sources?: Source[];
                          scope?: string[];
                          source_scope_fingerprints?: Record<string, string>;
                          claim_verification?: { unsupported: number; supported?: number; claims?: { claim: string; status: string; source_ids: number[] }[] };
                      };
                      error?: string;
                  }
                | undefined;
            for (let attempt = 0; attempt < 90; attempt++) {
                await new Promise((resolve) => window.setTimeout(resolve, 2000));
                if (!isCurrent()) return;
                const response = await fetch(base, { credentials: 'same-origin', signal });
                if (!response.ok) throw new Error('Could not load agent research results.');
                const runs: (typeof completed)[] = await response.json();
                if (!isCurrent()) return;
                const current = runs.find((item) => item?.id === run.id);
                if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
                    completed = current;
                    break;
                }
            }
            if (!completed) throw new Error('Agent is still running. Check its run history later.');
            const audit = completed.result?.claim_verification;
            const answer = completed.result?.answer || completed.result?.error || completed.error || 'No answer available.';
            const content = `**${agent.name}** · Agent\\n\\n${answer}${audit ? `\\n\\nEvidence assessment: ${audit.supported || 0} model-supported · ${audit.unsupported} uncertain or unsupported. Review original sources before relying on claims.` : ''}`;
            const agentResult = completed.result?.answer
                ? {
                      answer: completed.result.answer,
                      sources: completed.result.sources || [],
                      mode: completed.result.mode || 'agent_research',
                      scope: completed.result.scope || [],
                      citation_audit: audit
                          ? {
                                claims: (audit.claims || []).map((claim) => ({ claim: claim.claim, citations: claim.source_ids, overlap: 0, status: claim.status })),
                                needs_review: audit.unsupported,
                                note: 'Automated model assessment; not independent factual verification.',
                            }
                          : undefined,
                  }
                : undefined;
            const reply = {
                role: 'assistant' as const,
                content,
                result: agentResult,
                agent: {
                    id: agent.id,
                    name: agent.name,
                    run_id: run.id,
                    providers: (completed.result?.scope || []).filter((provider) => provider !== 'documents'),
                    scope_fingerprints: completed.result?.source_scope_fingerprints || {},
                },
            };
            setMessages([...chatMessages.current, reply]);
            await persistConversation(workspaceId, conversationId, conversationTitle, chatMessages.current);
        } catch (error) {
            if (!isCurrent()) return;
            const reply = { role: 'assistant' as const, content: `**${agent.name}** · ${error instanceof Error ? error.message : 'Research failed.'}` };
            setMessages([...chatMessages.current, reply]);
            if (conversationId) {
                try {
                    await persistConversation(workspaceId, conversationId, conversationTitle, chatMessages.current);
                } catch {
                    /* Keep visible error. */
                }
            }
        } finally {
            if (activeRun.current === pending) {
                activeRun.current = null;
                setAgentBusy(false);
            }
        }
    }

    return { agentBusy, mentionAgents, handleAgentMention, stopAgent };
}
