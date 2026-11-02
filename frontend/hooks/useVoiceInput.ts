'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceAlternative {
    transcript: string;
}

interface VoiceResult extends ArrayLike<VoiceAlternative> {
    isFinal: boolean;
}

interface VoiceResultEvent extends Event {
    resultIndex: number;
    results: ArrayLike<VoiceResult>;
}

interface VoiceErrorEvent extends Event {
    error: string;
}

interface VoiceRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: VoiceResultEvent) => void) | null;
    onerror: ((event: VoiceErrorEvent) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

type VoiceRecognitionConstructor = new () => VoiceRecognition;
type VoiceWindow = Window & {
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
};

function voiceErrorMessage(error: string) {
    if (error === 'not-allowed' || error === 'service-not-allowed') return 'Allow microphone access to use voice input.';
    if (error === 'no-speech') return 'No speech detected. Try again.';
    if (error === 'audio-capture') return 'No microphone was found.';
    return 'Voice input could not start. Try again.';
}

export function useVoiceInput() {
    const recognitionRef = useRef<VoiceRecognition | null>(null);
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const browser = window as VoiceWindow;
        setSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
        return () => recognitionRef.current?.abort();
    }, []);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    const startListening = useCallback((onTranscript: (transcript: string) => void) => {
        const browser = window as VoiceWindow;
        const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
        if (!Recognition) {
            setError('Voice input is not supported in this browser.');
            return;
        }

        recognitionRef.current?.abort();
        const recognition = new Recognition();
        recognitionRef.current = recognition;
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .slice(event.resultIndex)
                .filter((result) => result.isFinal)
                .map((result) => result[0]?.transcript ?? '')
                .join(' ')
                .trim();
            if (transcript) onTranscript(transcript);
        };
        recognition.onerror = (event) => setError(voiceErrorMessage(event.error));
        recognition.onend = () => {
            if (recognitionRef.current === recognition) {
                recognitionRef.current = null;
                setListening(false);
            }
        };
        setError('');
        setListening(true);
        try {
            recognition.start();
        } catch {
            recognitionRef.current = null;
            setListening(false);
            setError('Voice input could not start. Try again.');
        }
    }, []);

    return { supported, listening, error, startListening, stopListening };
}
