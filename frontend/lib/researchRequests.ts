import { api, apiStream } from './api';
import type { Answer, Message, SavedChat } from './types';

export type ResearchRequest = {
    workspaceId: string;
    question: string;
    history: Message[];
    documentIds: string[];
    includeDocuments: boolean;
    includeGmail: boolean;
    gmailQuery: string;
    gmailSourceIds?: string[];
    providers: string[];
    useConnected: boolean;
};

export async function requestResearchAnswer(request: ResearchRequest, signal: AbortSignal, onStatus: (text: string) => void, onDelta: (text: string) => void): Promise<Answer> {
    const { workspaceId, question, history, documentIds, includeDocuments, includeGmail, gmailQuery, gmailSourceIds, providers, useConnected } = request;
    if (useConnected) {
        return apiStream<Answer>(
            `/workspaces/${workspaceId}/connected-chat/stream`,
            {
                question,
                history,
                document_ids: documentIds,
                include_documents: includeDocuments,
                include_gmail: includeGmail,
                gmail_query: gmailQuery,
                gmail_source_ids: gmailSourceIds || [],
                providers,
            },
            (event) => {
                if (event.type === 'status') onStatus(event.text);
                if (event.type === 'delta') onDelta(event.text);
            },
            signal,
        );
    }
    const result = await api<Answer>(`/workspaces/${workspaceId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ question, history, document_ids: documentIds }),
        signal,
    });
    return { ...result, scope: ['documents'] };
}

export async function persistConversation(workspaceId: string, id: string | null, title: string, messages: Message[]): Promise<SavedChat> {
    if (id) {
        return api<SavedChat>(`/workspaces/${workspaceId}/conversations/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, messages }),
        });
    }
    return api<SavedChat>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ title, messages }),
    });
}
