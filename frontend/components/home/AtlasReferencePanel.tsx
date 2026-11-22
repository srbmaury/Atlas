'use client';

import { useState } from 'react';
import { Button, IconButton, Tab, Tabs, TextareaAutosize, Tooltip, Typography } from '@mui/material';
import { ArrowUpRight, BookOpenText, Check, Copy, Download, FileText, Layers, StickyNote, Sparkles } from 'lucide-react';
import type { Answer, Source } from '../../lib/types';
import { sourceDisplayName, sourceLocation, visibleEvidence } from '../../lib/evidence';
import { ResearchAnswer } from '../chat/ResearchAnswer';

type PanelTab = 'answer' | 'sources' | 'notes' | 'artifacts';

export function AtlasReferencePanel({ answer, question, onOpenSource, onPrompt, onManageSources }: {
    answer?: Answer;
    question?: string;
    onOpenSource: (source: Source) => void;
    onPrompt: (question: string) => void;
    onManageSources: () => void;
}) {
    const [tab, setTab] = useState<PanelTab>('answer');
    const [notes, setNotes] = useState('');
    const [copied, setCopied] = useState(false);
    const sources = visibleEvidence(answer);

    function copyAnswer() {
        if (!answer) return;
        void navigator.clipboard.writeText(answer.answer).then(() => setCopied(true)).catch(() => setCopied(false));
    }
    function exportAnswer() {
        if (!answer) return;
        const content = `# ${question || 'Atlas research'}\n\n${answer.answer}\n\n## Cited sources\n${sources.map(({ source, number }) => `${number}. ${sourceDisplayName(source)} — ${sourceLocation(source, number)}`).join('\n')}`;
        const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'atlas-research.md';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <aside className="atlas-ref-insight" aria-label="Research insights">
            <div className="atlas-ref-insight-tabs">
                <Tabs value={tab} onChange={(_event, value: PanelTab) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Research insights tabs">
                    <Tab value="answer" icon={<Sparkles size={16} />} iconPosition="start" label="Answer" />
                    <Tab value="sources" icon={<BookOpenText size={16} />} iconPosition="start" label={`Sources ${sources.length}`} />
                    <Tab value="notes" icon={<StickyNote size={16} />} iconPosition="start" label="Notes" />
                    <Tab value="artifacts" icon={<Layers size={16} />} iconPosition="start" label="Artifacts" />
                </Tabs>
            </div>

            <div className="atlas-ref-insight-body">
                {tab === 'answer' && (
                    <section aria-label="Answer preview">
                        {answer ? (
                            <>
                                {question && <div className="atlas-ref-question"><span>{question}</span></div>}
                                <div className="atlas-ref-answer-intro">
                                    <span className="atlas-ref-spark"><Sparkles size={19} /></span>
                                    <Typography component="h2" variant="subtitle1">Research answer</Typography>
                                    <Tooltip title={copied ? 'Copied' : 'Copy answer'}>
                                        <IconButton size="small" onClick={copyAnswer} aria-label="Copy research answer">{copied ? <Check size={16} /> : <Copy size={16} />}</IconButton>
                                    </Tooltip>
                                </div>
                                <div className="atlas-ref-answer">
                                    <ResearchAnswer result={answer} onOpenSource={onOpenSource} onPrompt={onPrompt} />
                                </div>
                            </>
                        ) : (
                            <div className="atlas-ref-empty">
                                <span className="atlas-ref-spark"><Sparkles size={25} /></span>
                                <Typography component="h2" variant="h6">Your research, connected.</Typography>
                                <Typography variant="body2" color="text.secondary">Ask a question to see the answer and its supporting evidence here. Citations will link to your original sources.</Typography>
                                <Button size="small" variant="outlined" onClick={onManageSources}>Explore connected sources</Button>
                            </div>
                        )}
                        {sources.length > 0 && (
                            <section className="atlas-ref-source-preview" aria-label="Cited sources">
                                <div className="atlas-ref-section-heading"><strong>Sources</strong><span>{sources.length}</span><Button size="small" onClick={() => setTab('sources')}>View all</Button></div>
                                {sources.slice(0, 4).map(({ source, number }) => (
                                    <button className="atlas-ref-source-row" key={number} onClick={() => onOpenSource(source)}>
                                        <b>[{number}]</b><span>{sourceDisplayName(source)}</span><ArrowUpRight size={15} />
                                    </button>
                                ))}
                            </section>
                        )}
                    </section>
                )}
                {tab === 'sources' && (
                    <section aria-label="Cited sources">
                        <div className="atlas-ref-section-heading"><strong>Sources</strong><span>{sources.length} cited</span></div>
                        {sources.length ? sources.map(({ source, number }) => (
                            <button className="atlas-ref-source-row" key={number} onClick={() => onOpenSource(source)}>
                                <b>[{number}]</b>
                                <span><strong>{sourceDisplayName(source)}</strong><small>{sourceLocation(source, number)}</small></span>
                                <ArrowUpRight size={16} />
                            </button>
                        )) : <div className="atlas-ref-empty"><BookOpenText size={28} /><Typography variant="body2" color="text.secondary">Cited sources will appear after a research answer is generated.</Typography><Button onClick={onManageSources} size="small">Manage sources</Button></div>}
                    </section>
                )}
                {tab === 'notes' && (
                    <section aria-label="Session notes">
                        <div className="atlas-ref-section-heading"><strong>Quick notes</strong><span>Session only</span></div>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Scratch notes for this browser session. They are not saved to your workspace.</Typography>
                        <TextareaAutosize className="atlas-ref-notes" minRows={9} placeholder="Capture ideas, follow-up questions, or observations…" aria-label="Quick notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
                        <Button size="small" startIcon={<Copy size={15} />} disabled={!notes.trim()} onClick={() => void navigator.clipboard.writeText(notes)}>Copy notes</Button>
                    </section>
                )}
                {tab === 'artifacts' && (
                    <section aria-label="Research artifacts">
                        <div className="atlas-ref-section-heading"><strong>Artifacts</strong></div>
                        {answer ? (
                            <div className="atlas-ref-artifact-card">
                                <FileText size={26} />
                                <div><strong>Research brief</strong><p>Export the current answer and its cited source list as a Markdown document.</p></div>
                                <Button startIcon={<Download size={16} />} variant="outlined" onClick={exportAnswer}>Export .md</Button>
                            </div>
                        ) : <div className="atlas-ref-empty"><Layers size={28} /><Typography variant="body2" color="text.secondary">Your answer can be exported as a research brief after you run a question.</Typography></div>}
                    </section>
                )}
            </div>
        </aside>
    );
}
