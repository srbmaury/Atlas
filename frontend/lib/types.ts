/** Shared frontend API contracts for workspace, research and connected sources. */
import type { ExternalSourceProvider } from './providers';
export type { ExternalSourceProvider, IntegrationProvider, ResearchProvider } from './providers';

export type User = { id: string; email: string; mode: string; max_file_bytes: number };
export type Workspace = { id: string; name: string };
export type Doc = {
    id: string;
    name: string;
    size: number;
    status: string;
    error?: string;
    pages: number;
    ocr_pages?: number[];
    chunk_count: number;
};
export type DocumentPreview = {
    document: Doc;
    chunks: { id: string; page: number; text: string; ocr?: boolean }[];
    current_page?: number;
};
export type Source = {
    chunk_id: string;
    document_id: string;
    name: string;
    page: number;
    text: string;
    location_type: string;
    provider?: string;
    url?: string;
    date?: string;
    ocr?: boolean;
    highlight_context?: string;
};
export type Answer = {
    answer: string;
    sources: Source[];
    related_sources?: { left: number; right: number; references: string[]; status: string }[];
    decision_timeline?: {
        date: string;
        source: number;
        references: string[];
        event: string;
        excerpt: string;
        status: string;
    }[];
    mode: string;
    citation_note?: string;
    scope?: string[];
    retrieval?: {
        passages_considered: number;
        passages_used: number;
        sources: {
            provider: string;
            status: 'searched' | 'failed';
            found: number;
            considered: number;
            used: number;
        }[];
    };
    citation_audit?: {
        claims: { claim: string; citations: number[]; overlap: number; status: string }[];
        needs_review: number;
        note: string;
    };
    coverage_note?: string | null;
};
export type Message = { role: 'user' | 'assistant'; content: string; result?: Answer };
export type GmailMessage = {
    id: string;
    subject: string;
    sender: string;
    date: string;
    snippet: string;
    body: string;
    url: string;
};
export type GmailStatus = { connected: boolean; email: string | null; configured: boolean };
export type OAuthAuthorizationResponse = { authorization_url: string };
export type DriveConnectionStatus = {
    connected: boolean;
    account: string | null;
    configured: boolean;
};
export type DriveSearchResult = {
    id: string;
    title: string;
    excerpt: string;
    url: string;
};
export type DriveSearchResponse = { results: DriveSearchResult[] };
export type ConnectedSourceSearchResult = {
    provider: ExternalSourceProvider;
    id: string;
    title: string;
    excerpt: string;
    url?: string;
};
export type ConnectedSourceSearchResponse = { results: ConnectedSourceSearchResult[] };
export type ConnectedSourceStatus = {
    provider: ExternalSourceProvider;
    connected: boolean;
    account: string | null;
};
export type SourceHealth = {
    healthy: boolean;
    matches: number | null;
    error: string | null;
    checked_at: number;
};
export type SourceHealthEntry = SourceHealth & {
    provider: ExternalSourceProvider;
};
export type SourceHealthCheck = SourceHealthEntry & {
    connected: boolean;
    account: string | null;
};
export type SourceHealthListResponse = { checks: SourceHealthEntry[] };
export type SourceHealthCheckResponse = { checks: SourceHealthCheck[] };
export type GmailSearchResponse = { messages: GmailMessage[] };
export type GmailQuerySummary = GmailSummary & { count: number; limited: boolean };
export type GmailSummary = {
    summary: string;
    sources: { number: number; id: string; subject: string; url: string }[];
};
export type ChatSummary = { id: string; title: string; updated: number };
export type SavedChat = ChatSummary & { messages: Message[] };
