import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResearchScope } from '../lib/query-routing.ts';

test('research scope preserves the selected sources without interpreting prompt text', () => {
    assert.deepEqual(
        normalizeResearchScope({
            includeDocuments: false,
            includeGmail: true,
            providers: ['calendar', 'drive'],
        }),
        { includeDocuments: false, includeGmail: true, providers: ['calendar', 'drive'] },
    );
});

test('research scope removes duplicate and unsupported providers', () => {
    assert.deepEqual(
        normalizeResearchScope({
            includeDocuments: true,
            includeGmail: false,
            providers: ['github', 'github', 'unsupported'],
        }),
        { includeDocuments: true, includeGmail: false, providers: ['github'] },
    );
});
