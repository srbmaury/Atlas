import type { Answer, Source } from './types';

/** Preserve original source positions; visible evidence cannot renumber citations. */
export function visibleEvidence(result: Answer | undefined) {
    if (!result || !['ai', 'local_excerpts', 'connected', 'source_results'].includes(result.mode)) return [];
    const cited = new Set(Array.from(result.answer.matchAll(/\[(\d+)\]/g), (match) => Number(match[1])));
    return result.sources.flatMap((source, index) => (cited.has(index + 1) ? [{ source, number: index + 1 }] : []));
}

/** Connected records have provider metadata, rather than numbered document sections. */
export function sourceLocation(source: Source) {
    if (source.provider && source.provider !== 'documents')
        return (
            (
                {
                    github: 'GitHub',
                    drive: 'Google Drive',
                    gmail: 'Gmail',
                    notion: 'Notion',
                    slack: 'Slack',
                    calendar: 'Google Calendar',
                    linear: 'Linear',
                    jira: 'Jira',
                    onedrive: 'OneDrive',
                    outlook: 'Outlook',
                    sharepoint: 'SharePoint',
                } as Record<string, string>
            )[source.provider] || source.provider
        );
    return source.page > 0 ? `${source.location_type === 'page' ? 'Page' : 'Section'} ${source.page}` : 'Source excerpt';
}

/** Hide connector IDs accidentally used as a title when no human label exists. */
export function sourceDisplayName(source: Source) {
    if (source.provider === 'slack' && /^#?[A-Z0-9]{8,}$/.test(source.name.trim())) return 'Slack message';
    return source.name;
}

const citationStopWords = new Set(
    'about after again also among because been before being between can could does done each from have into its more most other over such than that their them then there these they this those through under upon were what when where which while with would your'.split(
        ' ',
    ),
);

/** Find the source sentence that best supports the answer text linked to a citation. */
export function citedSentence(text: string, context?: string) {
    const sentences = text.match(/[^.!?\n]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
    if (!context?.trim() || !sentences.length) return null;
    const terms = new Set(
        (context.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((term) => !citationStopWords.has(term)),
    );
    if (!terms.size) return null;
    let best: { sentence: string; score: number } | null = null;
    for (const sentence of sentences) {
        const words = new Set(sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
        const overlap = [...terms].filter((term) => words.has(term)).length;
        const score = overlap / Math.sqrt(Math.max(words.size, 1));
        if (score > (best?.score ?? 0)) best = { sentence, score };
    }
    return best && best.score > 0 ? best.sentence : null;
}

/** Flag extraction output with visible OCR noise or severe text corruption. */
export function extractionWarning(text: string, ocr = false) {
    if (ocr) return 'OCR text · verify names, numbers, and punctuation against the original.';
    const sample = text.trim();
    if (!sample) return null;
    const damaged = (sample.match(/[�\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) ?? []).length;
    if (damaged / sample.length > 0.005) return 'Text extraction looks damaged · verify this passage against the original.';
    const words = sample.match(/[\p{L}\p{N}]+/gu) ?? [];
    const isolated = words.filter((word) => word.length === 1 && !/^[aAiI]$/.test(word)).length;
    if (words.length > 35 && isolated / words.length > 0.28)
        return 'Text formatting looks irregular · verify this passage against the original.';
    return null;
}
