'use client';
import { ArrowUp, LoaderCircle, Mic, MicOff, Plus } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput';

interface ResearchComposerProps {
    query: string;
    onChange: (q: string) => void;
    onSubmit: () => void;
    onUpload: () => void;
    uploading: boolean;
    busy: boolean;
    hasAskSources: boolean;
    hasMessages: boolean;
}

export function ResearchComposer({ query, onChange, onSubmit, onUpload, uploading, busy, hasAskSources, hasMessages }: ResearchComposerProps) {
    const voice = useVoiceInput();

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
            <button className="icon-button" type="button" aria-label="Add documents" disabled={uploading} onClick={onUpload}>
                <Plus />
            </button>
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
