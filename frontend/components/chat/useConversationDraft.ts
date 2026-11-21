import { useEffect } from 'react';

function draftKey(workspaceId: string, chatId: string | null) {
    return `atlas:draft:${workspaceId}:${chatId || 'new'}`;
}

function writeDraft(key: string, query: string) {
    try {
        if (query) sessionStorage.setItem(key, query);
        else sessionStorage.removeItem(key);
    } catch {
        /* Private browsing can disable session storage. */
    }
}

export function useConversationDraft(workspaceId: string, chatId: string | null, query: string, setQuery: (value: string) => void) {
    useEffect(() => {
        if (!workspaceId) return;
        const timer = window.setTimeout(() => writeDraft(draftKey(workspaceId, chatId), query), 250);
        return () => window.clearTimeout(timer);
    }, [workspaceId, chatId, query]);

    function saveDraft() {
        if (workspaceId) writeDraft(draftKey(workspaceId, chatId), query);
    }

    function restoreDraft(id: string | null) {
        try {
            setQuery(sessionStorage.getItem(draftKey(workspaceId, id)) || '');
        } catch {
            setQuery('');
        }
    }

    return { saveDraft, restoreDraft };
}
