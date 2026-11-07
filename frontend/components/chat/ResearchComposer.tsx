'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, FolderOpen, LoaderCircle, Mic, MicOff, Plus } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput';

interface ResearchComposerProps {
    query: string;
    onChange: (q: string) => void;
    onSubmit: () => void;
    onUpload: () => void;
    onBrowseLibrary: () => void;
    canUpload: boolean;
    uploading: boolean;
    busy: boolean;
    hasAskSources: boolean;
    hasMessages: boolean;
    selectedDocuments: { id: string; name: string }[];
    pendingDocuments: { id: string; name: string; status: string }[];
    onRemoveDocument: (id: string) => void;
    uploadProgress: string;
    uploadResult: string;
    onDismissUploadResult: () => void;
}

export function ResearchComposer({ query, onChange, onSubmit, onUpload, onBrowseLibrary, canUpload, uploading, busy, hasAskSources, hasMessages, selectedDocuments, pendingDocuments, onRemoveDocument, uploadProgress, uploadResult, onDismissUploadResult }: ResearchComposerProps) {
    const voice = useVoiceInput();
    const [addOpen, setAddOpen] = useState(false);
    const addRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!addOpen) return;
        function dismiss(event: MouseEvent) { if (addRef.current && !addRef.current.contains(event.target as Node)) setAddOpen(false); }
        function escape(event: KeyboardEvent) { if (event.key === 'Escape') setAddOpen(false); }
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
    }, [addOpen]);

    function addTranscript(transcript: string) {
        onChange(query.trim() ? `${query.trim()} ${transcript}` : transcript);
    }

    return (
        <form
            className="composer research-composer-v2"
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            {(selectedDocuments.length > 0 || pendingDocuments.length > 0 || uploadProgress || uploadResult) && <div className="composer-context" aria-label="Question context">
                {selectedDocuments.length > 0 && <div className="composer-context-documents">
                    {selectedDocuments.map(doc => <span className="composer-document-chip" key={doc.id}><FileText size={13}/><span title={doc.name}>{doc.name}</span><button type="button" aria-label={`Remove ${doc.name} from question`} onClick={() => onRemoveDocument(doc.id)}>×</button></span>)}
                </div>}
                {pendingDocuments.length > 0 && <div className="composer-context-documents">
                    {pendingDocuments.map(doc => <span className="composer-document-chip composer-document-pending" key={doc.id}><FileText size={13}/><span title={doc.name}>{doc.name}</span><small>{doc.status === 'failed' ? 'Indexing failed' : doc.status === 'processing' ? 'Indexing…' : 'Queued'}</small></span>)}
                </div>}
                {uploadProgress && <div className="composer-upload-status" role="status"><LoaderCircle size={14} className="spin"/><span>{uploadProgress}</span></div>}
                {!uploadProgress && uploadResult && <div className="composer-upload-status" role="status"><FileText size={14}/><span>{uploadResult}</span><button type="button" aria-label="Dismiss upload status" onClick={onDismissUploadResult}>×</button></div>}
            </div>}
            <div className="composer-add-wrap" ref={addRef}>
                <button className="icon-button composer-add-trigger" type="button" aria-label="Add context" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen(open => !open)}>
                    <Plus />
                </button>
                {addOpen && <div className="composer-add-menu" role="menu" aria-label="Add context">
                    <div className="composer-add-menu-title">Add to your question</div>
                    <button type="button" role="menuitem" disabled={!canUpload || uploading} onClick={() => { setAddOpen(false); onUpload(); }}>
                        <FileText size={17}/><span><strong>Upload a document</strong><small>{canUpload ? 'PDF, Word, text, and more' : 'Editor access required'}</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setAddOpen(false); onBrowseLibrary(); }}>
                        <FolderOpen size={17}/><span><strong>Choose from library</strong><small>Select existing workspace documents</small></span>
                    </button>
                </div>}
            </div>
            <textarea
                aria-label="Your question"
                aria-describedby="research-composer-help"
                placeholder={hasMessages ? 'Ask a follow-up question…' : 'Ask a question across your sources…'}
                rows={1}
                maxLength={4000}
                value={query}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (hasAskSources && !busy && query.trim()) onSubmit();
                    }
                }}
            />
            <button
                className={`voice-input-button ${voice.listening ? 'is-listening' : ''}`}
                type="button"
                aria-label={voice.listening ? 'Stop voice input' : voice.supported ? 'Start voice input' : 'Voice input not supported in this browser'}
                aria-pressed={voice.listening}
                title={voice.supported ? 'Use voice input' : 'Voice input is not supported in this browser'}
                disabled={busy}
                onClick={() => (voice.listening ? voice.stopListening() : voice.startListening(addTranscript))}
            >
                {voice.listening ? <MicOff /> : <Mic />}
            </button>
            <button className="send" aria-label="Send question" disabled={busy || !query.trim() || !hasAskSources}>
                {busy ? <LoaderCircle className="spin" /> : <ArrowUp />}
            </button>
            {(voice.listening || voice.error) && (
                <span className="voice-input-status" role={voice.error ? 'alert' : 'status'}>
                    {voice.error || 'Listening…'}
                </span>
            )}
        </form>
    );
}
