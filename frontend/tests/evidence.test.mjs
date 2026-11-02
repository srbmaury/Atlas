import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleEvidence, sourceLocation, sourceDisplayName } from '../lib/evidence.ts';
import { parseExtractedText } from '../lib/documentText.ts';

const sources = [
    {
        chunk_id: 'a',
        document_id: 'one',
        name: 'one.md',
        page: 1,
        text: 'first',
        location_type: 'section',
    },
    {
        chunk_id: 'b',
        document_id: 'two',
        name: 'two.md',
        page: 2,
        text: 'second',
        location_type: 'section',
    },
    {
        chunk_id: 'c',
        document_id: 'three',
        name: 'three.md',
        page: 3,
        text: 'third',
        location_type: 'section',
    },
];
test('evidence preserves original citation numbering and avoids uncited passages', () => {
    const found = visibleEvidence({
        mode: 'ai',
        answer: 'Compare [3] and [1]. Repeat [3].',
        sources,
    });
    assert.deepEqual(
        found.map((x) => x.number),
        [1, 3],
    );
    assert.deepEqual(
        found.map((x) => x.source.chunk_id),
        ['a', 'c'],
    );
});
test('evidence remains empty for failed verification or absent answers', () => {
    assert.deepEqual(visibleEvidence(undefined), []);
    assert.deepEqual(visibleEvidence({ mode: 'citation_check_failed', answer: '[1]', sources }), []);
});
test('out-of-range references do not expose evidence', () => {
    assert.deepEqual(visibleEvidence({ mode: 'ai', answer: 'Not supported [99]', sources }), []);
});

test('source metadata does not invent numbered sections for connected records', () => {
    assert.equal(sourceLocation({ ...sources[0], provider: 'github', page: 0 }), 'GitHub');
    assert.equal(sourceLocation({ ...sources[0], page: 0 }), 'Source excerpt');
    assert.equal(sourceLocation({ ...sources[0], location_type: 'page', page: 3 }), 'Page 3');
    assert.equal(sourceLocation({ ...sources[0], provider: 'documents', location_type: 'page', page: 3 }), 'Page 3');
});

test('opaque Slack channel IDs are replaced with a readable source label', () => {
    assert.equal(sourceDisplayName({ ...sources[0], name: '#U0CDTS8H4Q2', provider: 'slack' }), 'Slack message');
    assert.equal(sourceDisplayName({ ...sources[0], name: '#environment', provider: 'slack' }), '#environment');
});

test('extracted document text recovers headings, paragraphs, fact labels, and lists', () => {
    const text =
        'PAKISTAN / IDENTITY\nGetting to know Pakistan\nPakistan follows the Indus from northern mountains to the\nArabian Sea. Islamabad is the capital.\n\nOfficial name Islamic Republic of Pakistan\nCapital Islamabad\n\nCauses include:\n- logging\n- agriculture';
    assert.deepEqual(parseExtractedText(text), [
        { type: 'kicker', text: 'PAKISTAN / IDENTITY' },
        { type: 'heading', text: 'Getting to know Pakistan' },
        { type: 'paragraph', text: 'Pakistan follows the Indus from northern mountains to the Arabian Sea. Islamabad is the capital.' },
        { type: 'field', label: 'Official name', value: 'Islamic Republic of Pakistan' },
        { type: 'field', label: 'Capital', value: 'Islamabad' },
        { type: 'paragraph', text: 'Causes include:' },
        { type: 'list', items: ['logging', 'agriculture'] },
    ]);
});

test('sentence-like section text is not promoted to a heading', () => {
    const blocks = parseExtractedText('THE NATIONAL FLAG\nThe green field and crescent express Islamic heritage. The white\nstripe represents religious minorities.');
    assert.deepEqual(blocks, [
        { type: 'kicker', text: 'THE NATIONAL FLAG' },
        { type: 'paragraph', text: 'The green field and crescent express Islamic heritage. The white stripe represents religious minorities.' },
    ]);
});

test('wrapped fact values stay attached to their label', () => {
    assert.deepEqual(parseExtractedText('Languages Urdu and English; Punjabi, Pashto, Sindhi, Balochi and many other\nlanguages are spoken.'), [
        { type: 'field', label: 'Languages', value: 'Urdu and English; Punjabi, Pashto, Sindhi, Balochi and many other languages are spoken.' },
    ]);
});
