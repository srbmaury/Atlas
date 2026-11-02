'use client';
import { type ReactNode, type RefObject } from 'react';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { Message, Answer } from '../../lib/types';
import { SOURCE_LABELS } from '../../lib/providers';
import { AtlasMark } from '../ui/WorkspacePrimitives';

interface ChatMessagesProps {
    messages: Message[];
    busy: boolean;
    readyCount: number;
    uploadButton: ReactNode;
    prompts: string[];
    onPrompt: (text: string) => void;
    initials: string;
    renderAnswer: (answer: Answer, onPrompt: (prompt: string) => void) => ReactNode;
    answerProgress: string;
    onStop: () => void;
    threadRef: RefObject<HTMLDivElement | null>;
    endRef: RefObject<HTMLDivElement | null>;
}

export function ConversationTranscript({ messages, busy, readyCount, uploadButton, prompts, onPrompt, initials, renderAnswer, answerProgress, onStop, threadRef, endRef }: ChatMessagesProps) {
    return (
        <div className="thread" ref={threadRef}>
            {!messages.length && (
                <div className="research-welcome">
                    <span className="welcome-mark">
                        <AtlasMark />
                    </span>
                    <span className="eyebrow">ASK YOUR KNOWLEDGE</span>
                    <h2>Ask across your knowledge.</h2>
                    <p>{readyCount ? 'Find a specific detail, compare documents, or follow an idea back to its source.' : 'Add your first documents to explore them with Atlas.'}</p>
                    {!readyCount ? (
                        uploadButton
                    ) : (
                        <div className="starter-questions">
                            {prompts.map((p) => (
                                <button key={p} onClick={() => onPrompt(p)}>
                                    {p}
                                    <ArrowUpRight />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {messages.map((m, i) =>
                m.role === 'user' ? (
                    <div className="user-message" key={i}>
                        <div className="bubble-row">
                            <span className="circle">{initials}</span>
                            <div className="bubble">{m.content}</div>
                        </div>
                    </div>
                ) : (
                    <div className="answer-row" key={i}>
                        <span className="assistant-mark">A</span>
                        <div className="answer">
                            <div className="answer-head">
                                <strong>Atlas</strong>
                                <span>
                                    {m.result?.mode === 'ai'
                                        ? 'AI synthesis'
                                        : m.result?.mode === 'connected'
                                          ? 'Cross-source research'
                                          : m.result?.mode === 'local_excerpts'
                                            ? 'Source excerpts'
                                            : m.result?.mode === 'source_results'
                                              ? 'Live source results'
                                              : m.result?.mode === 'insufficient_evidence'
                                                ? 'No matching evidence'
                                                : 'Evidence check'}
                                    {m.result?.scope?.length ? ` · ${m.result.scope.map((source) => SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] ?? source).join(' + ')}` : ''}
                                </span>
                            </div>
                            {m.result ? renderAnswer(m.result, onPrompt) : <p>{m.content}</p>}
                        </div>
                    </div>
                ),
            )}
            {busy && (
                <div className="thinking" role="status" aria-live="polite">
                    <LoaderCircle className="spin" />
                    <span>{answerProgress || 'Reading the relevant evidence…'}</span>
                    <button type="button" className="btn" onClick={onStop}>
                        Stop
                    </button>
                </div>
            )}
            <div ref={endRef} />
        </div>
    );
}
