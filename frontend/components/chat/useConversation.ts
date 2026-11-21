'use client';
import { useRef, useState, useCallback } from 'react';
import type { Message } from '../../lib/types';

/** Keep synchronous request state and rendered conversation state in lockstep. */
export function useConversation() {
    const [messages, setReactMessages] = useState<Message[]>([]);
    const [chatId, setReactChatId] = useState<string | null>(null);
    const activeChat = useRef<string | null>(null);
    const chatMessages = useRef<Message[]>([]);
    const chatTitle = useRef('New chat');
    const setMessages = useCallback((next: Message[]) => {
        chatMessages.current = next;
        setReactMessages(next);
    }, []);
    const setChatId = useCallback((next: string | null) => {
        activeChat.current = next;
        setReactChatId(next);
    }, []);
    const reset = useCallback(() => {
        setMessages([]);
        setChatId(null);
        chatTitle.current = 'New chat';
    }, [setMessages, setChatId]);
    return { messages, chatId, setMessages, setChatId, activeChat, chatMessages, chatTitle, reset };
}
