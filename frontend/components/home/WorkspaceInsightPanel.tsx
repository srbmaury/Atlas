'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ExternalLink, FileText, Layers3, MessageSquareText, NotebookPen, Sparkles } from 'lucide-react';
import { Button, Chip, Tab, Tabs, TextField, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sourceDisplayName, sourceLocation, visibleEvidence } from '../../lib/evidence';
import type { Doc, Message, Source } from '../../lib/types';

type PanelTab = 'answer' | 'sources' | 'notes' | 'artifacts';

interface WorkspaceInsightPanelProps {
    workspaceId: string;
    chatId: string | null;
    messages: Message[];
    documents: Doc[];
    onOpenSource: (source: Source) => void;
    onInspectDocument: (document: Doc) => void;
    onOpenDocuments: () => void;
    onOpenResearch: () => void;
    onStartChat: () => void;
}

const panelTabs: { id: PanelTab; label: string; icon: typeof Sparkles }[] = [
    { id: 'answer', label: 'Answer', icon: Sparkles },
    { id: 'sources', label: 'Sources', icon: Layers3 },
    { id: 'notes', label: 'Notes', icon: NotebookPen },
    { id: 'artifacts', label: 'Artifacts', icon: FileText },
];

export function WorkspaceInsightPanel({ workspaceId, chatId, messages, documents, onOpenSource, onInspectDocument, onOpenDocuments, onOpenResearch, onStartChat }: WorkspaceInsightPanelProps) {
    const [tab, setTab] = useState<PanelTab>('answer');
    const [notes, setNotes] = useState('');
    const noteKey = `atlas:research-notes:${workspaceId}:${chatId || 'workspace'}`;
    useEffect(() => {
        try {
            setNotes(window.localStorage.getItem(noteKey) ?? '');
        } catch {
            setNotes('');
        }
    }, [noteKey]);

    const selected = useMemo(() => {
        const answerIndex = messages.findLastIndex((message) => message.role === 'assistant' && !!message.result);
        if (answerIndex < 0) return null;
        const message = messages[answerIndex];
        const question =
            messages
                .slice(0, answerIndex)
                .reverse()
                .find((item) => item.role === 'user')?.content || '';
        return { answer: message.result!, question };
    }, [messages]);
    const evidence = useMemo(() => visibleEvidence(selected?.answer), [selected]);
    const readyDocuments = documents.filter((doc) => doc.status === 'ready');

    return (
        <aside className="atlas-insight-panel" aria-label="Research insight panel">
            <Tabs value={tab} onChange={(_event, value: PanelTab) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Research insight tabs" className="atlas-insight-tabs">
                {panelTabs.map(({ id, label, icon: Icon }) => (
                    <Tab key={id} value={id} icon={<Icon size={16} />} iconPosition="start" label={id === 'sources' && evidence.length ? `${label} ${evidence.length}` : label} />
                ))}
            </Tabs>
            <div className="atlas-insight-body">
                {tab === 'answer' && (
                    <div role="tabpanel" aria-label="Answer" className="atlas-insight-answer">
                        {selected ? (
                            <>
                                {selected.question && (
                                    <div className="atlas-insight-question">
                                        <MessageSquareText size={17} aria-hidden="true" />
                                        <p>{selected.question}</p>
                                    </div>
                                )}
                                <div className="atlas-insight-response">
                                    <div className="atlas-insight-response-heading">
                                        <span className="atlas-insight-sparkle">
                                            <Sparkles size={19} />
                                        </span>
                                        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>
                                            Research answer
                                        </Typography>
                                    </div>
                                    <div className="atlas-insight-markdown">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.answer.answer}</ReactMarkdown>
                                    </div>
                                    {selected.answer.citation_note && <p className="atlas-insight-note">{selected.answer.citation_note}</p>}
                                    <Button variant="text" endIcon={<ArrowRight size={16} />} onClick={onOpenResearch}>
                                        Open conversation
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="atlas-insight-empty">
                                <span className="atlas-insight-empty-icon">
                                    <Sparkles size={25} />
                                </span>
                                <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                                    Research, with evidence
                                </Typography>
                                <Typography color="text.secondary" variant="body2">
                                    Ask a question to see an answer, inspect its citations, and work with the findings here.
                                </Typography>
                                <Button variant="outlined" onClick={onStartChat}>
                                    Start new research
                                </Button>
                            </div>
                        )}
                        <section aria-labelledby="atlas-panel-sources" className="atlas-panel-source-preview">
                            <div className="atlas-insight-section-title">
                                <Typography component="h3" variant="subtitle1" id="atlas-panel-sources" sx={{ fontWeight: 800 }}>
                                    Sources
                                </Typography>
                                <Chip label={evidence.length} size="small" variant="outlined" />
                                <Button size="small" onClick={() => setTab('sources')} sx={{ ml: 'auto' }}>
                                    View all
                                </Button>
                            </div>
                            {evidence.length ? (
                                <div className="atlas-insight-source-list">
                                    {evidence.slice(0, 3).map(({ source, number }) => (
                                        <button type="button" className="atlas-insight-source" key={`${number}:${source.chunk_id}`} onClick={() => onOpenSource(source)}>
                                            <span className="atlas-insight-source-number">[{number}]</span>
                                            <span className="atlas-insight-source-name">{sourceDisplayName(source)}</span>
                                            <ExternalLink size={16} aria-hidden="true" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="atlas-insight-muted">Cited sources will appear here after a research answer.</p>
                            )}
                        </section>
                    </div>
                )}
                {tab === 'sources' && (
                    <div role="tabpanel" aria-label="Sources" className="atlas-insight-tabcontent">
                        <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                            Cited sources
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Select a citation to inspect the original evidence.
                        </Typography>
                        {evidence.length ? (
                            evidence.map(({ source, number }) => (
                                <button type="button" className="atlas-insight-source atlas-insight-source-detailed" key={`${number}:${source.chunk_id}`} onClick={() => onOpenSource(source)}>
                                    <span className="atlas-insight-source-number">[{number}]</span>
                                    <span className="atlas-insight-source-name">
                                        <strong>{sourceDisplayName(source)}</strong>
                                        <small>{sourceLocation(source, number)}</small>
                                    </span>
                                    <ExternalLink size={16} aria-hidden="true" />
                                </button>
                            ))
                        ) : (
                            <p className="atlas-insight-muted">No cited sources in the current conversation yet.</p>
                        )}
                    </div>
                )}
                {tab === 'notes' && (
                    <div role="tabpanel" aria-label="Notes" className="atlas-insight-tabcontent">
                        <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                            Research notes
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                            Capture observations while you research.
                        </Typography>
                        <TextField
                            multiline
                            minRows={10}
                            fullWidth
                            placeholder="Write notes, questions or ideas…"
                            label="Research notes"
                            value={notes}
                            onChange={(event) => {
                                setNotes(event.target.value);
                                try {
                                    window.localStorage.setItem(noteKey, event.target.value);
                                } catch {
                                    /* Storage can be unavailable. */
                                }
                            }}
                            slotProps={{ htmlInput: { maxLength: 15000 } }}
                        />
                        <Typography variant="caption" color="text.secondary">
                            Saved in this browser only — not synced with your workspace.
                        </Typography>
                    </div>
                )}
                {tab === 'artifacts' && (
                    <div role="tabpanel" aria-label="Artifacts" className="atlas-insight-tabcontent">
                        <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                            Your research material
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Access documents behind your research. Generated artifacts aren't available in this view yet.
                        </Typography>
                        {readyDocuments.slice(0, 8).map((doc) => (
                            <button className="atlas-insight-source atlas-insight-source-detailed" type="button" onClick={() => onInspectDocument(doc)} key={doc.id}>
                                <BookOpen size={17} aria-hidden="true" />
                                <span className="atlas-insight-source-name">{doc.name}</span>
                                <ExternalLink size={16} aria-hidden="true" />
                            </button>
                        ))}
                        {!readyDocuments.length && <p className="atlas-insight-muted">There are no indexed documents in this workspace.</p>}
                        <Button variant="outlined" onClick={onOpenDocuments}>
                            Open library
                        </Button>
                    </div>
                )}
            </div>
        </aside>
    );
}
