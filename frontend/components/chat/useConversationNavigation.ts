import { useRef, type RefObject } from 'react';

export type ConversationSearchTarget = { chatId: string; index: number; phrase: string; token: number };

type NavigationOptions = {
    busy: boolean;
    activeChat: RefObject<string | null>;
    loadChat: (id: string) => Promise<unknown>;
    saveDraft: () => void;
    restoreDraft: (id: string) => void;
    setSearchTarget: (target: ConversationSearchTarget | null) => void;
};

export function useConversationNavigation({ busy, activeChat, loadChat, saveDraft, restoreDraft, setSearchTarget }: NavigationOptions) {
    const searchToken = useRef(0);

    async function switchChat(id: string, target?: { index: number; phrase: string }) {
        if (busy) return false;
        setSearchTarget(target ? { ...target, chatId: id, token: ++searchToken.current } : null);
        saveDraft();
        await loadChat(id);
        if (activeChat.current !== id) return false;
        restoreDraft(id);
        return true;
    }

    return { switchChat };
}
