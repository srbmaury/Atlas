'use client';

import { useRef, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, BookOpenText, FileText, GitCompareArrows, Globe2, MessageSquareText, Mic, MicOff, NotebookPen, Plus, Sparkles } from 'lucide-react';
import { Box, Button, Card, CardActionArea, CardContent, Chip, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import type { Doc, ChatSummary } from '../../lib/types';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { FileBadge } from '../ui/WorkspacePrimitives';
import { MetricCard, PageHeading, UploadDropTarget } from '../ui/AtlasKit';

interface HomeViewProps {
    canEdit?: boolean;
    query: string;
    mentionAgents?: { id: string; name: string; handle: string }[];
    onQueryChange: (value: string) => void;
    onAsk: () => void;
    hasAskSources: boolean;
    sourceLabels: string[];
    busy: boolean;
    chats: ChatSummary[];
    docs: Doc[];
    onChooseSources: () => void;
    onOpenSources: () => void;
    onOpenConversations: () => void;
    onOpenConversation: (id: string) => void;
    onStartChat: () => void;
    onOpenDocuments: () => void;
    onInspectDocument: (doc: Doc) => void;
    uploadButton: ReactNode;
    dragging: boolean;
    onDragging: (value: boolean) => void;
    onDrop: (files: FileList) => void;
    maxSizeMB: number;
    uploading: boolean;
    onBrowse: () => void;
    formatSize: (value: number) => string;
}

const startingPoints = [
    { title: 'Compare perspectives', description: 'Find agreements, gaps and competing arguments.', icon: GitCompareArrows, prompt: 'Compare the key perspectives and supporting evidence on ' },
    { title: 'Summarize documents', description: 'Turn long documents into cited findings.', icon: FileText, prompt: 'Summarize the key findings in my documents about ' },
    { title: 'Explore a topic', description: 'Investigate a question across your sources.', icon: Globe2, prompt: 'Research the main developments and evidence about ' },
    { title: 'Draft a research brief', description: 'Build a concise overview with citations.', icon: NotebookPen, prompt: 'Create a structured research brief with citations about ' },
] as const;

export function HomeView({
    canEdit = true, query, mentionAgents = [], onQueryChange, onAsk, hasAskSources,
    sourceLabels, busy, chats, docs, onChooseSources, onOpenSources, onOpenConversations,
    onOpenConversation, onStartChat, onOpenDocuments, onInspectDocument, uploadButton,
    dragging, onDragging, onDrop, maxSizeMB, uploading, onBrowse, formatSize,
}: HomeViewProps) {
    const voice = useVoiceInput();
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const canSubmit = !busy && !!query.trim() && hasAskSources;
    const matchingMention = /(?:^|\s)@([a-z0-9-]*)$/i.exec(query);
    const matchingAgents = matchingMention
        ? mentionAgents.filter((agent) => agent.handle.slice(1).includes(matchingMention[1].toLowerCase())).slice(0, 6)
        : [];
    const selectedAgent = mentionAgents.find((agent) => query.toLowerCase().includes(agent.handle + ' '));
    const readyCount = docs.filter((doc) => doc.status === 'ready').length;
    const latestChats = [...chats].sort((a, b) => b.updated - a.updated).slice(0, 4);
    const latestDocs = docs.slice(0, 4);

    function useStarter(prompt: string) {
        onQueryChange(prompt);
        composerRef.current?.focus();
    }
    function addTranscript(transcript: string) {
        onQueryChange(query.trim() ? `${query.trim()} ${transcript}` : transcript);
    }

    return (
        <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-7 pb-14">
            <Paper
                component="section"
                elevation={0}
                className="relative overflow-hidden rounded-[28px] px-6 py-9 sm:px-10 sm:py-12 lg:px-14"
                sx={{ border: '1px solid', borderColor: 'divider', background: (theme) => theme.palette.mode === 'dark' ? 'linear-gradient(125deg,#252447,#1b263f)' : 'linear-gradient(125deg,#f1f0ff,#fff 67%,#e9f3ff)' }}
            >
                <div className="relative z-10 max-w-[720px]">
                    <Chip label="YOUR RESEARCH WORKSPACE" size="small" color="primary" variant="outlined" sx={{ fontWeight: 800, letterSpacing: '.06em', mb: 2.5 }} />
                    <Typography component="h1" variant="h2" sx={{ fontSize: { xs: 34, sm: 45, lg: 54 }, lineHeight: 1.13, maxWidth: 650 }}>
                        Ideas are better with evidence.
                    </Typography>
                    <Typography color="text.secondary" sx={{ maxWidth: 580, mt: 2, fontSize: { xs: 14, sm: 16 }, lineHeight: 1.8 }}>
                        Ask across your documents and connected sources. Explore every answer with citations you can inspect.
                    </Typography>
                    <Stack direction="row" gap={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
                        <Button variant="contained" startIcon={<Plus size={17}/>} onClick={onStartChat}>New research</Button>
                        <Button variant="text" endIcon={<ArrowRight size={16}/>} onClick={onOpenDocuments}>Open library</Button>
                    </Stack>
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full border-[40px] border-violet-400/10" />
            </Paper>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard icon={<MessageSquareText size={20}/>} label="Conversations" value={chats.length} caption="Research history" onClick={onOpenConversations}/>
                <MetricCard icon={<BookOpenText size={20}/>} label="Ready documents" value={readyCount} caption={`${docs.length} documents in your library`} onClick={onOpenDocuments}/>
                <MetricCard icon={<Globe2 size={20}/>} label="Search scopes" value={sourceLabels.length} caption={sourceLabels.length ? sourceLabels.join(' · ') : 'Choose where Atlas searches'} onClick={onChooseSources}/>
            </div>

            <Paper component="section" variant="outlined" sx={{ borderRadius: 4, p: { xs: 2.5, sm: 3 }, boxShadow: '0 14px 40px rgba(24,38,83,.055)' }}>
                <div className="mb-3 flex items-center gap-2">
                    <Sparkles size={18} aria-hidden="true"/>
                    <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>Ask Atlas</Typography>
                    <Chip label="Evidence-first" size="small" variant="outlined" sx={{ ml: 'auto' }}/>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); if (canSubmit) onAsk(); }}>
                    {matchingAgents.length > 0 && (
                        <Paper variant="outlined" role="listbox" aria-label="Mention an agent" sx={{ mb: 1, p: 1, borderRadius: 2 }}>
                            {matchingAgents.map((agent) => (
                                <Button key={agent.id} role="option" aria-selected={false} size="small" fullWidth sx={{ justifyContent: 'flex-start' }} onClick={() => {
                                    onQueryChange(query.replace(/@[a-z0-9-]*$/i, agent.handle + ' '));
                                    composerRef.current?.focus();
                                }}>{agent.name} · {agent.handle}</Button>
                            ))}
                        </Paper>
                    )}
                    <TextField
                        inputRef={composerRef}
                        label="Research question"
                        placeholder="What would you like to understand?"
                        value={query}
                        multiline
                        minRows={3}
                        maxRows={7}
                        fullWidth
                        disabled={busy}
                        slotProps={{ htmlInput: { maxLength: 4000 } }}
                        onChange={(event) => onQueryChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                if (canSubmit) onAsk();
                            }
                        }}
                    />
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Chip size="small" icon={<FileText size={15}/>} label={selectedAgent ? `${selectedAgent.name} sources` : sourceLabels.length ? sourceLabels.join(' · ') : 'No sources selected'} variant="outlined" sx={{ maxWidth: 290 }} />
                            <Button size="small" onClick={onChooseSources}>Choose sources</Button>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <IconButton
                                aria-label={voice.listening ? 'Stop voice input' : voice.supported ? 'Start voice input' : 'Voice input unavailable'}
                                aria-pressed={voice.listening}
                                disabled={busy || (!voice.supported && !voice.listening)}
                                onClick={() => voice.listening ? voice.stopListening() : voice.startListening(addTranscript)}
                            >{voice.listening ? <MicOff size={19}/> : <Mic size={19}/>}</IconButton>
                            <Button type="submit" variant="contained" endIcon={<ArrowUp size={18}/>} disabled={!canSubmit}>Research</Button>
                        </div>
                    </div>
                    {(voice.listening || voice.error) && <Typography role={voice.error ? 'alert' : 'status'} variant="caption" color={voice.error ? 'error' : 'text.secondary'}>{voice.error || 'Listening…'}</Typography>}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Connected Calendar or GitHub can also be used for matching questions.</Typography>
                </form>
            </Paper>

            <section aria-labelledby="atlas-starters-heading">
                <PageHeading eyebrow="GET STARTED" title="A starting point for every question" description="Choose a workflow to prefill the composer. You can edit it before sending." />
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {startingPoints.map(({ title, description, icon: Icon, prompt }) => (
                        <Card key={title} variant="outlined" sx={{ height: '100%', borderColor: 'divider', '&:hover': { borderColor: 'primary.main', boxShadow: '0 10px 25px rgba(43,55,125,.07)' } }}>
                            <CardActionArea disabled={busy} onClick={() => useStarter(prompt)} sx={{ height: '100%', p: 2.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                                <div className="flex w-full flex-col items-start gap-3">
                                    <Box sx={{ bgcolor: 'action.hover', borderRadius: 2.5, color: 'primary.main', p: 1.3 }}><Icon size={20}/></Box>
                                    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800, textAlign: 'left' }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'left', lineHeight: 1.6 }}>{description}</Typography>
                                    <ArrowRight size={17} aria-hidden="true" className="self-end opacity-60"/>
                                </div>
                            </CardActionArea>
                        </Card>
                    ))}
                </div>
            </section>

            <section aria-label="Recent workspace activity">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                    <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Pick up where you left off</Typography>
                    <Button variant="text" onClick={onOpenSources} endIcon={<ArrowRight size={16}/>}>Manage sources</Button>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Card variant="outlined" sx={{ borderColor: 'divider' }}>
                        <CardContent sx={{ p: 3 }}>
                            <div className="mb-4 flex items-center justify-between gap-2">
                                <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>Recent conversations</Typography>
                                <Button size="small" onClick={onOpenConversations}>View all</Button>
                            </div>
                            {latestChats.length ? latestChats.map((chat) => (
                                <Button key={chat.id} fullWidth color="inherit" onClick={() => onOpenConversation(chat.id)} endIcon={<ArrowRight size={15}/>} sx={{ justifyContent: 'space-between', textAlign: 'left', py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                    <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                                </Button>
                            )) : <Typography color="text.secondary" variant="body2">Your first conversation will appear here. <Button size="small" onClick={onStartChat}>Start researching</Button></Typography>}
                        </CardContent>
                    </Card>
                    <Card variant="outlined" sx={{ borderColor: 'divider' }}>
                        <CardContent sx={{ p: 3 }}>
                            <div className="mb-4 flex items-center justify-between gap-2">
                                <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>Recent documents</Typography>
                                <Button size="small" onClick={onOpenDocuments}>View all</Button>
                            </div>
                            {latestDocs.length ? latestDocs.map((doc) => (
                                <Button key={doc.id} fullWidth color="inherit" onClick={() => onInspectDocument(doc)} sx={{ justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                    <FileBadge name={doc.name}/>
                                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{doc.name}</span><span className="block text-xs opacity-60">{formatSize(doc.size)} · {doc.status}</span></span>
                                </Button>
                            )) : <div className="flex flex-col items-start gap-2"><Typography color="text.secondary" variant="body2">Upload files to build your knowledge base.</Typography>{uploadButton}</div>}
                        </CardContent>
                    </Card>
                </div>
            </section>

            {canEdit && <UploadDropTarget title="Add knowledge to your workspace" description={`Drop PDF, DOCX, TXT, Markdown, CSV, JSON or HTML files · up to ${maxSizeMB} MB each.`} dragging={dragging} onDragging={onDragging} onDrop={onDrop} onBrowse={onBrowse} uploading={uploading}/>}
        </div>
    );
}
