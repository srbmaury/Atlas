'use client';
import { memo, Children, cloneElement, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Answer, Source } from '../../lib/types';
import { visibleEvidence, sourceDisplayName, sourceLocation } from '../../lib/evidence';
import { SOURCE_LABELS } from '../../lib/providers';
import { FileBadge } from '../ui/WorkspacePrimitives';

function plainText(children: ReactNode): string {
    return Children.toArray(children)
        .map((child) => {
            if (typeof child === 'string' || typeof child === 'number') return String(child);
            return isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '';
        })
        .join('');
}

function citationText(
    children: ReactNode,
    evidence: Source[],
    onOpen: (source: Source, context: string) => void,
    context: string,
): ReactNode {
    return Children.map(children, (child) =>
        typeof child === 'string'
            ? child.split(/(\[\d+\])/g).map((part, index) => {
                  const match = /^\[(\d+)\]$/.exec(part);
                  const passage = match ? evidence[Number(match[1]) - 1] : undefined;
                  return passage ? (
                      <button key={index} className="cite" onClick={() => onOpen(passage, context)} aria-label={`Open source ${match?.[1]}: ${passage.name}`}>
                          {match?.[1]}
                      </button>
                  ) : (
                      part
                  );
              })
            : isValidElement<{ children?: ReactNode }>(child) && child.type !== 'code' && child.type !== 'a'
              ? cloneElement(child, {}, citationText(child.props.children, evidence, onOpen, context))
              : child,
    );
}
export const ResearchAnswer = memo(function ResearchAnswer({ result, onOpenSource, onPrompt }: { result: Answer; onOpenSource: (source: Source, context?: string) => void; onPrompt: (prompt: string) => void }) {
    const sources = visibleEvidence(result);
    return (
        <>
            <div className="markdown research-answer-content">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        p: ({ children }) => {
                            const context =
                                plainText(children).replace(/\[\d+\]/g, '').trim() ||
                                result.answer.replace(/\[\d+\]/g, '').trim();
                            return <p>{citationText(children, sources.length ? result.sources : [], onOpenSource, context)}</p>;
                        },
                        li: ({ children }) => {
                            const context =
                                plainText(children).replace(/\[\d+\]/g, '').trim() ||
                                result.answer.replace(/\[\d+\]/g, '').trim();
                            return <li>{citationText(children, sources.length ? result.sources : [], onOpenSource, context)}</li>;
                        },
                    }}
                >
                    {result.answer}
                </ReactMarkdown>
            </div>
            {result.coverage_note && (
                <p className="answer-evidence-review" role="status">
                    {result.coverage_note}
                </p>
            )}
            {result.decision_timeline && result.decision_timeline.length > 0 && (
                <section className="connected-card" aria-label="Evidence timeline">
                    <strong>Evidence timeline</strong>
                    <p className="caption">Dated statements from linked sources, not independently verified events.</p>
                    <ol>
                        {result.decision_timeline.map((item, index) => (
                            <li key={index}>
                                <b>{item.date}</b> · {item.event} · {item.references.join(', ')}{' '}
                                <button
                                    className="cite"
                                    onClick={() => {
                                        const source = result.sources[item.source - 1];
                                        if (source) onOpenSource(source);
                                    }}
                                    aria-label={`Inspect source ${item.source}`}
                                >
                                    [{item.source}]
                                </button>
                                <p className="caption">{item.excerpt}</p>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            {result.related_sources && result.related_sources.length > 0 && (
                <section className="connected-card" aria-label="Related evidence">
                    <strong>Connected evidence</strong>
                    <p className="caption">Sources sharing explicit issue or PR references; not proof of a decision or causal relationship.</p>
                    {result.related_sources.map((link, index) => (
                        <div key={index} className="source-search-controls">
                            <button
                                className="source-chip"
                                onClick={() => {
                                    const source = result.sources[link.left - 1];
                                    if (source) onOpenSource(source);
                                }}
                            >
                                Source [{link.left}]
                            </button>
                            <span className="caption">{link.references.join(', ')}</span>
                            <button
                                className="source-chip"
                                onClick={() => {
                                    const source = result.sources[link.right - 1];
                                    if (source) onOpenSource(source);
                                }}
                            >
                                Source [{link.right}]
                            </button>
                        </div>
                    ))}
                </section>
            )}
            {result.citation_audit && result.citation_audit.needs_review > 0 && (
                <p className="answer-evidence-review" role="status">
                    Some claims may need a closer look. Open the cited passages to check their support.
                </p>
            )}
            {result.retrieval && <AnswerTrace result={result} onOpenSource={onOpenSource} />}
            {sources.length > 0 && (
                <div className="source-chips evidence-source-links">
                    {sources.map(({ source, number }) => (
                        <button className="source-chip" key={`${number}-${source.chunk_id}`} onClick={() => onOpenSource(source)}>
                            <FileBadge name={sourceDisplayName(source)} />
                            <span>
                                <b>{sourceDisplayName(source)}</b>
                                <small>
                                    {result.mode === 'local_excerpts' ? 'Search match' : 'Citation'} [{number}] · {sourceLocation(source)}
                                </small>
                                {source.text?.trim() && (
                                    <small className="citation-preview">
                                        “{source.text.trim().replace(/\s+/g, ' ').slice(0, 200)}
                                        {source.text.trim().length > 200 ? '…' : ''}”
                                    </small>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {sources.length > 0 && onPrompt && (
                <div className="answer-followups" aria-label="Suggested follow-up questions">
                    <span>Explore this evidence</span>
                    <button onClick={() => onPrompt('Explain the cited evidence in more detail')}>Explain this evidence</button>
                    {new Set(sources.map(({ source }) => source.provider || 'documents')).size > 1 && (
                        <button onClick={() => onPrompt('Compare the cited evidence across sources')}>Compare sources</button>
                    )}
                </div>
            )}
        </>
    );
});

function AnswerTrace({ result, onOpenSource }: { result: Answer; onOpenSource: (source: Source) => void }) {
    const retrieval = result.retrieval;
    if (!retrieval) return null;
    const citations = new Set(Array.from(result.answer.matchAll(/\[(\d+)\]/g), (match) => Number(match[1])));
    const isListing = result.mode === 'source_results';
    return (
        <details className="answer-trace">
            <summary>
                Sources and evidence{' '}
                <span>
                    {retrieval.sources.length} searched · {citations.size} citations
                </span>
            </summary>
            <div className="answer-trace-flow" aria-label="Answer generation steps">
                <span>
                    Retrieved {retrieval.passages_considered} relevant {retrieval.passages_considered === 1 ? 'passage' : 'passages'}
                </span>
                <i aria-hidden="true">→</i>
                <span>{isListing ? 'Results shown' : 'Answer generated'}</span>
            </div>
            <ul className="answer-trace-sources">
                {retrieval.sources.map((item) => {
                    const sourceCitations = result.sources.flatMap((source, index) => ((source.provider || 'documents') === item.provider && citations.has(index + 1) ? [index + 1] : []));
                    return (
                        <li key={item.provider}>
                            <strong>{SOURCE_LABELS[item.provider as keyof typeof SOURCE_LABELS] || item.provider}</strong>
                            <span className={item.status === 'failed' ? 'answer-trace-failed' : ''}>
                                {item.status === 'failed'
                                    ? 'Could not search this source'
                                    : item.found === 0
                                      ? 'No matching passages'
                                      : `${item.found} matches · ${item.considered} kept · ${item.used} ${isListing ? 'shown' : 'cited'}`}
                            </span>
                            {sourceCitations.length > 0 && (
                                <span className="answer-trace-citations">
                                    Evidence{' '}
                                    {sourceCitations.map((number) => (
                                        <button key={number} className="cite" onClick={() => onOpenSource(result.sources[number - 1])} aria-label={`Open citation ${number}`}>
                                            [{number}]
                                        </button>
                                    ))}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            {result.citation_audit?.needs_review ? (
                <div className="answer-trace-review">
                    <strong>
                        {result.citation_audit.needs_review} claim{result.citation_audit.needs_review === 1 ? '' : 's'} need review
                    </strong>
                    {result.citation_audit.claims
                        .filter((claim) => claim.status !== 'lexically_supported')
                        .map((claim, index) => (
                            <p key={`${claim.claim}-${index}`}>
                                {claim.claim}{' '}
                                {claim.citations.map((number) => (
                                    <button key={number} className="cite" onClick={() => result.sources[number - 1] && onOpenSource(result.sources[number - 1])}>
                                        [{number}]
                                    </button>
                                ))}
                            </p>
                        ))}
                </div>
            ) : null}
            <p className="answer-trace-caption">Citation links open the source passage. Automated checks are heuristic; review the source for context and conflicting evidence.</p>
        </details>
    );
}
