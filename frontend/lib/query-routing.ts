import { isResearchProvider } from './providers';
import type { ResearchProvider } from './providers';

export type ResearchScope = {
    includeDocuments: boolean;
    includeGmail: boolean;
    providers: ResearchProvider[];
};

/** Preserve the user's selected sources while removing duplicate or unsupported providers. */
export function normalizeResearchScope(scope: ResearchScope): ResearchScope {
    return {
        includeDocuments: scope.includeDocuments,
        includeGmail: scope.includeGmail,
        providers: [...new Set(scope.providers.filter(isResearchProvider))],
    };
}
