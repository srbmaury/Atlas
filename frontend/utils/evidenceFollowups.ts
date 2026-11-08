import type { Answer, Message, Source } from '../lib/types';

export type EvidenceIntent = 'explain' | 'compare' | null;

/** Evidence follow-ups are source-independent: never require a Gmail citation. */
export function evidenceIntent(question: string): EvidenceIntent {
    if (!/\b(?:cited|citations?|evidence|passages?)\b/i.test(question)) return null;
    if (/\b(?:compare|contrast|differences?|agreements?|conflicts?)\b/i.test(question)) return 'compare';
    if (/\b(?:explain|expand|elaborate|clarify|details?|describe)\b/i.test(question)) return 'explain';
    return null;
}

export function previousEvidence(messages: Message[]): { sources: Source[]; verified: boolean } | null {
    // Use the most recent answer that actually retained evidence. A failed
    // citation check must not erase the user's ability to inspect prior results.
    for (const message of [...messages].reverse()) {
        if (message.role !== 'assistant' || !message.result) continue;
        if (message.result.sources.length) return { sources: message.result.sources, verified: true };
        if (message.result.evidence_sources?.length) {
            return { sources: message.result.evidence_sources, verified: false };
        }
    }
    return null;
}

function excerpt(source: Source): string {
    return (source.text || '').replace(/\s+/g, ' ').trim().slice(0, 480) || 'No excerpt available.';
}

export function inspectPreviousEvidence(intent: EvidenceIntent, previous: ReturnType<typeof previousEvidence>): Answer {
    if (!previous) {
        return {
            answer: 'No evidence was retained in this conversation. Run a source search first, then inspect its results.',
            sources: [],
            mode: 'insufficient_evidence',
        };
    }
    const { sources, verified } = previous;
    const prefix = verified
        ? 'These are excerpts from the previous answer’s source references. They are not a new AI analysis.'
        : 'The previous answer had no validated citations, but its retrieved passages were retained. These excerpts are **not verified claims**.';
    const selected = sources.slice(0, 12);
    const groups = new Map<string, Source[]>();
    for (const source of selected) {
        const provider = source.provider || source.location_type || 'unknown';
        groups.set(provider, [...(groups.get(provider) || []), source]);
    }
    const lines = [prefix, ''];
    if (intent === 'compare') {
        lines.push('### Evidence by source', '');
        for (const [provider, entries] of groups) {
            lines.push(`**${provider} (${entries.length} passage${entries.length === 1 ? '' : 's'})**`);
            for (const source of entries) lines.push(`- **${source.name}**: “${excerpt(source)}”`);
            lines.push('');
        }
        lines.push('**Comparison limitation:** These passages are grouped by origin, not verified as agreeing or conflicting. Review their full context before drawing conclusions.');
    } else {
        lines.push('### Retrieved passages', '');
        selected.forEach((source, index) => {
            lines.push(`**${index + 1}. ${source.name}** (${source.provider || source.location_type || 'source'})`);
            lines.push(`> ${excerpt(source)}`, '');
        });
    }
    if (sources.length > selected.length) lines.push(`Showing ${selected.length} of ${sources.length} retained passages.`);
    return {
        answer: lines.join('\n'),
        sources: [],
        evidence_sources: sources,
        mode: 'evidence_inspection',
        scope: [...groups.keys()],
    };
}
