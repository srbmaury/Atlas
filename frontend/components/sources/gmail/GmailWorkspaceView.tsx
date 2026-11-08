'use client';
import { ArrowUpRight, LoaderCircle, Copy, CheckCircle2, RotateCcw, FileText, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGmailWorkspace } from '../../../hooks/useGmailWorkspace';
type State = ReturnType<typeof useGmailWorkspace>;

interface GmailWorkspaceViewProps {
    state: State;
    onBack: () => void;
    onDisconnect: () => void;
    onConnect: () => void;
    onSearch: () => void;
    onSummarizeQuery: () => void;
    onSummarizeSelected: () => void;
    onNotice: (text: string) => void;
    onError: (text: string) => void;
}

export function GmailWorkspaceView({ state, onBack, onDisconnect, onConnect, onSearch, onSummarizeQuery, onSummarizeSelected, onNotice, onError }: GmailWorkspaceViewProps) {
    const {
        gmailStatus,
        gmailMessages,
        gmailQuery,
        setGmailQuery,
        gmailSummarizeQuery,
        setGmailSummarizeQuery,
        gmailQueryLimit,
        setGmailQueryLimit,
        gmailQuerySummaryLabel,
        gmailSelected,
        gmailIntelligence,
        setGmailIntelligence,
        setGmailSelected,
        gmailSummary,
        setGmailSummary,
        gmailBusy,
        gmailSummarizing,
        gmailSummaryIds,
        setGmailSummaryIds,
        gmailMobileView,
        setGmailMobileView,
        gmailPreview,
        setGmailPreview,
        gmailSummaryHeading,
    } = state;
    return (
        <section className="gmail-page gmail-integrated">
            <div className="gmail-integrated-back">
                <button className="btn" type="button" onClick={onBack}>
                    ← All sources
                </button>
            </div>
            <div className="heading-row">
                <div>
                    <h1>Gmail</h1>
                    <p className="subtitle">Find messages and summarize only the emails you select.</p>
                </div>
                {gmailStatus?.connected && (
                    <button className="btn" disabled={gmailBusy} onClick={onDisconnect}>
                        Disconnect
                    </button>
                )}
            </div>
            <div className="gmail-intro">
                <div>
                    <strong>{gmailStatus?.connected ? gmailStatus.email : 'Connect your Gmail account'}</strong>
                    <p className="caption">
                        {gmailStatus?.connected
                            ? 'Read-only access · emails are fetched on demand, not added to your document library.'
                            : 'Atlas requests read-only Gmail permission. No emails are sent, edited, or deleted.'}
                    </p>
                </div>
                {!gmailStatus?.connected && (
                    <button className="btn primary" disabled={gmailBusy} onClick={onConnect}>
                        Connect Gmail <ArrowUpRight />
                    </button>
                )}
            </div>
            {gmailStatus?.connected && (
                <>
                    <form
                        className="gmail-search"
                        onSubmit={(e) => {
                            e.preventDefault();
                            onSearch();
                        }}
                    >
                        <label htmlFor="gmail-query">Gmail search</label>
                        <div>
                            <input id="gmail-query" value={gmailQuery} onChange={(e) => setGmailQuery(e.target.value)} placeholder="in:inbox newer_than:30d" />
                            <button className="btn primary" disabled={gmailBusy}>
                                {gmailBusy ? 'Searching…' : 'Find emails'}
                            </button>
                        </div>
                    </form>
                    <form
                        className="gmail-query-summary"
                        onSubmit={(e) => {
                            e.preventDefault();
                            onSummarizeQuery();
                        }}
                    >
                        <div className="gmail-query-summary-title">
                            <strong>Summarize by search</strong>
                            <span className="caption">Search your connected mailbox, not just the messages loaded below.</span>
                        </div>
                        <div className="gmail-query-presets">
                            <button type="button" className="btn" onClick={() => setGmailSummarizeQuery('subject:(offer OR discount OR sale) newer_than:30d')}>
                                Offers & discounts
                            </button>
                            <button type="button" className="btn" onClick={() => setGmailSummarizeQuery('category:promotions newer_than:30d')}>
                                Promotions
                            </button>
                            <button type="button" className="btn" onClick={() => setGmailSummarizeQuery('is:unread newer_than:7d')}>
                                Unread this week
                            </button>
                        </div>
                        <div className="gmail-query-controls">
                            <input
                                aria-label="Gmail query to summarize"
                                value={gmailSummarizeQuery}
                                onChange={(e) => setGmailSummarizeQuery(e.target.value)}
                                placeholder="from:someone@gmail.com or subject:offer"
                            />
                            <select aria-label="Maximum matching emails" value={gmailQueryLimit} onChange={(e) => setGmailQueryLimit(Number(e.target.value))}>
                                <option value={15}>Up to 15</option>
                                <option value={30}>Up to 30</option>
                                <option value={60}>Up to 60</option>
                            </select>
                            <button className="btn primary" disabled={gmailBusy || !gmailSummarizeQuery.trim()} type="submit">
                                Summarize matches
                            </button>
                        </div>
                        <p className="caption">Examples: from:sender@gmail.com, subject:offer, category:promotions. Results are capped per run; no background mailbox indexing.</p>
                    </form>
                    <div className="gmail-mobile-tabs" role="group" aria-label="Gmail view">
                        <button type="button" aria-pressed={gmailMobileView === 'emails'} className={gmailMobileView === 'emails' ? 'active' : ''} onClick={() => setGmailMobileView('emails')}>
                            Emails
                        </button>
                        <button type="button" aria-pressed={gmailMobileView === 'summary'} className={gmailMobileView === 'summary' ? 'active' : ''} onClick={() => setGmailMobileView('summary')}>
                            Summary{gmailSummary ? ' • Ready' : ''}
                        </button>
                    </div>
                    <div className="gmail-workspace">
                        <div className={`gmail-mail-panel ${gmailMobileView === 'emails' ? 'mobile-active' : ''}`}>
                            <div className="gmail-panel-head">
                                <strong>Emails</strong>
                                <span className="caption">{gmailMessages.length} results</span>
                            </div>
                            <div className="gmail-actions">
                                <div className="gmail-selection">
                                    <span>{gmailSelected.length} selected · maximum 15</span>
                                    <button type="button" className="btn" disabled={gmailBusy || !gmailMessages.length} onClick={() => setGmailSelected(gmailMessages.slice(0, 15).map((m) => m.id))}>
                                        Select all{gmailMessages.length > 15 ? ' (first 15)' : ''}
                                    </button>
                                    <button type="button" className="btn" disabled={gmailBusy || !gmailSelected.length} onClick={() => setGmailSelected([])}>
                                        Deselect
                                    </button>
                                </div>
                            </div>
                            <div className="gmail-list">
                                {gmailMessages.map((m) => (
                                    <div className="gmail-item" key={m.id}>
                                        <input
                                            aria-label={`Select ${m.subject}`}
                                            type="checkbox"
                                            checked={gmailSelected.includes(m.id)}
                                            disabled={gmailBusy}
                                            onChange={(e) => setGmailSelected((old) => (e.target.checked ? (old.length < 15 ? [...old, m.id] : old) : old.filter((x) => x !== m.id)))}
                                        />
                                        <button type="button" className="gmail-message-preview" onClick={() => setGmailPreview(m)}>
                                            <strong>{m.subject}</strong>
                                            <small>
                                                {m.sender} · {m.date}
                                            </small>
                                            <span>{m.snippet}</span>
                                        </button>
                                        <a href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${m.subject} in Gmail`}>
                                            <ArrowUpRight size={15} />
                                        </a>
                                    </div>
                                ))}
                            </div>
                            <div className="gmail-mail-footer">
                                <label className="caption" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <input type="checkbox" checked={gmailIntelligence} onChange={(e) => setGmailIntelligence(e.target.checked)} disabled={gmailBusy} />
                                    Analyze decisions, commitments, owners and deadlines
                                </label>
                                <button className="btn primary" disabled={gmailBusy || !gmailSelected.length} onClick={onSummarizeSelected}>
                                    {gmailSummarizing ? 'Analyzing emails…' : gmailIntelligence ? 'Analyze selected' : 'Summarize selected'}
                                </button>
                            </div>
                        </div>
                        <section className={`gmail-summary-panel ${gmailMobileView === 'summary' ? 'mobile-active' : ''}`} aria-label="Email summary" aria-busy={gmailSummarizing}>
                            <div className="gmail-panel-head">
                                <h2 ref={gmailSummaryHeading} tabIndex={-1}>
                                    {gmailSummary?.mode === 'intelligence' ? 'Gmail Intelligence' : 'AI Summary'}
                                </h2>
                                {gmailSummary && !gmailSummarizing && (
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label="Copy email summary"
                                        title="Copy summary"
                                        onClick={() =>
                                            void navigator.clipboard
                                                .writeText(gmailSummary.summary)
                                                .then(() => onNotice('Summary copied.'))
                                                .catch(() => onError('Unable to copy summary.'))
                                        }
                                    >
                                        <Copy size={16} />
                                    </button>
                                )}
                            </div>
                            {gmailSummarizing ? (
                                <div className="gmail-summary-state" role="status" aria-live="polite">
                                    <LoaderCircle className="spin" />
                                    <strong>Reading selected emails…</strong>
                                    <p>Atlas is preparing a cited summary for {gmailSelected.length} messages.</p>
                                </div>
                            ) : gmailSummary ? (
                                <div className="gmail-summary-content">
                                    {gmailQuerySummaryLabel ? (
                                        <p className="gmail-ready">{gmailQuerySummaryLabel}</p>
                                    ) : gmailSelected.length !== gmailSummaryIds.length || gmailSelected.some((id) => !gmailSummaryIds.includes(id)) ? (
                                        <p className="gmail-stale">Showing the previous summary. Your selection has changed; regenerate to summarize the current emails.</p>
                                    ) : (
                                        <p className="gmail-ready">
                                            <CheckCircle2 size={15} /> Summary ready · {gmailSummaryIds.length} messages
                                        </p>
                                    )}
                                    <div className="markdown">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{gmailSummary.summary}</ReactMarkdown>
                                    </div>
                                    <div className="gmail-summary-sources">
                                        <h3>Sources</h3>
                                        {gmailSummary.sources.map((item) => (
                                            <div className="gmail-source" key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const m = gmailMessages.find((msg) => msg.id === item.id);
                                                        if (m) setGmailPreview(m);
                                                        else window.open(item.url, '_blank', 'noopener,noreferrer');
                                                    }}
                                                >
                                                    [{item.number}] {item.subject}
                                                </button>
                                                {item.excerpt && (
                                                    <details className="caption" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
                                                        <summary>View cited message evidence{item.truncated ? ' (excerpt truncated)' : ''}</summary>
                                                        <p>{item.sender}{item.date ? ` · ${item.date}` : ''}</p>
                                                        <p style={{ whiteSpace: 'pre-wrap' }}>{item.excerpt}</p>
                                                    </details>
                                                )}
                                                <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.subject} in Gmail`}>
                                                    <ArrowUpRight size={14} />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="gmail-summary-footer">
                                        <button className="btn" disabled={gmailBusy || !gmailSelected.length} onClick={onSummarizeSelected}>
                                            <RotateCcw size={15} /> Regenerate
                                        </button>
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                setGmailSummary(null);
                                                setGmailSummaryIds([]);
                                                setGmailMobileView('emails');
                                            }}
                                        >
                                            New summary
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="gmail-summary-state">
                                    <FileText size={25} />
                                    <strong>Summary will appear here</strong>
                                    <p>Select emails on the left, then choose Summarize selected. Original messages remain available as sources.</p>
                                </div>
                            )}
                        </section>
                    </div>
                    {gmailPreview && (
                        <div className="gmail-preview-overlay" role="presentation" onClick={() => setGmailPreview(null)}>
                            <aside role="dialog" aria-modal="true" aria-label="Email preview" className="gmail-preview-drawer" onClick={(e) => e.stopPropagation()}>
                                <div className="gmail-preview-head">
                                    <h2>{gmailPreview.subject}</h2>
                                    <button type="button" className="icon-button" aria-label="Close email preview" onClick={() => setGmailPreview(null)}>
                                        <X />
                                    </button>
                                </div>
                                <p className="caption">
                                    {gmailPreview.sender} · {gmailPreview.date}
                                </p>
                                <div className="gmail-preview-body">{gmailPreview.body || gmailPreview.snippet || 'No readable plain-text content available.'}</div>
                                <a className="btn" target="_blank" rel="noopener noreferrer" href={gmailPreview.url}>
                                    Open original in Gmail <ArrowUpRight size={15} />
                                </a>
                            </aside>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
