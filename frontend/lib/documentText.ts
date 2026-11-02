export type ExtractedTextBlock = { type: 'paragraph' | 'kicker' | 'heading'; text: string } | { type: 'field'; label: string; value: string } | { type: 'list'; items: string[] };

const FIELD_LABELS = [
    'Official name',
    'Capital',
    'Area',
    'Population',
    'Languages',
    'Currency',
    'Government',
    'Divisions',
    'Founded',
    'Headquarters',
    'Industry',
    'Status',
    'Owner',
    'Date',
    'Location',
];

function fieldParts(line: string) {
    const colonField = /^([^:]{2,36}):\s*(\S.*)$/.exec(line);
    if (colonField && !/^https?$/i.test(colonField[1].trim())) return { label: colonField[1].trim(), value: colonField[2].trim() };
    const knownLabel = FIELD_LABELS.find((label) => line.toLowerCase().startsWith(`${label.toLowerCase()} `));
    if (!knownLabel) return null;
    return { label: knownLabel, value: line.slice(knownLabel.length).trim() };
}

function isKicker(line: string) {
    return /^[A-Z0-9][A-Z0-9 /&–—:.-]{2,70}$/.test(line);
}

function isHeading(line: string) {
    return line.length <= 60 && /[A-Z]/.test(line[0] || '') && /[a-z]/.test(line) && !/[.!?]$/.test(line);
}

function listItem(line: string) {
    return /^(?:[-*•]\s+|\d+[.)]\s+)/.test(line);
}

/** Reflow PDF/OCR soft wraps and recover readable headings, fact rows, and lists. */
export function parseExtractedText(text: string): ExtractedTextBlock[] {
    const blocks: ExtractedTextBlock[] = [];
    for (const rawParagraph of text.split(/\n\s*\n+/)) {
        const lines = rawParagraph
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        let paragraph: string[] = [];
        let items: string[] = [];
        let afterKicker = false;
        const flushParagraph = () => {
            if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
            paragraph = [];
        };
        const flushList = () => {
            if (items.length) blocks.push({ type: 'list', items });
            items = [];
        };

        for (const line of lines) {
            const previousBlock = blocks[blocks.length - 1];
            if (previousBlock?.type === 'field' && /^[a-z,;:)]/.test(line) && !/[.!?]$/.test(previousBlock.value)) {
                previousBlock.value += ` ${line}`;
                afterKicker = false;
                continue;
            }
            if (isKicker(line)) {
                flushParagraph();
                flushList();
                blocks.push({ type: 'kicker', text: line });
                afterKicker = true;
                continue;
            }
            if (listItem(line)) {
                flushParagraph();
                items.push(line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, ''));
                afterKicker = false;
                continue;
            }
            flushList();
            const field = fieldParts(line);
            if (field) {
                flushParagraph();
                blocks.push({ type: 'field', ...field });
                afterKicker = false;
                continue;
            }
            if (afterKicker && isHeading(line)) {
                flushParagraph();
                blocks.push({ type: 'heading', text: line });
                afterKicker = false;
                continue;
            }
            paragraph.push(line);
            afterKicker = false;
        }
        flushParagraph();
        flushList();
    }
    return blocks;
}
