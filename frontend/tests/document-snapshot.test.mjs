import assert from 'node:assert/strict';
import test from 'node:test';
import { sameDocumentSnapshot } from '../lib/documentSnapshot.ts';

const first = { id: 'a', name: 'notes.md', size: 1024, status: 'ready', pages: 1, chunk_count: 3, ocr_pages: [] };
const second = { id: 'b', name: 'report.pdf', size: 8192, status: 'processing', pages: 7, chunk_count: 0 };

test('unchanged document metadata does not trigger a new workspace snapshot', () => {
    assert.equal(sameDocumentSnapshot([first, second], [{ ...first }, { ...second }]), true);
    assert.equal(sameDocumentSnapshot([], []), true);
});

test('indexing, file additions, ordering and OCR updates invalidate the snapshot', () => {
    assert.equal(sameDocumentSnapshot([first, second], [first, { ...second, status: 'ready' }]), false);
    assert.equal(sameDocumentSnapshot([first], [first, second]), false);
    assert.equal(sameDocumentSnapshot([first, second], [second, first]), false);
    assert.equal(sameDocumentSnapshot([first], [{ ...first, ocr_pages: [1] }]), false);
    assert.equal(sameDocumentSnapshot([first], [{ ...first, error: 'Unable to parse' }]), false);
});
