import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceIntent, previousEvidence, inspectPreviousEvidence } from '../utils/evidenceFollowups.ts';

test('recognizes source-independent evidence follow-ups', () => {
    assert.equal(evidenceIntent('Explain the cited evidence in detail'), 'explain');
    assert.equal(evidenceIntent('Compare the cited evidence across sources'), 'compare');
    assert.equal(evidenceIntent('Write a poem'), null);
});

test('retains retrieved evidence when citation validation fails', () => {
    const source = { name: 'Document', text: 'Grounded passage', provider: 'documents', chunk_id: '1' };
    const prior = previousEvidence([{ role: 'assistant', content: 'No verified citations', result: { sources: [], evidence_sources: [source] } }]);
    assert.equal(prior.verified, false);
    const answer = inspectPreviousEvidence('explain', prior);
    assert.equal(answer.mode, 'evidence_inspection');
    assert.equal(answer.evidence_sources.length, 1);
    assert.match(answer.answer, /not verified/i);
});

test('missing sources do not crash citation follow-up', () => {
    assert.equal(previousEvidence([{ role: 'assistant', content: 'Incomplete', result: {} }]), null);
    assert.equal(inspectPreviousEvidence('compare', null).mode, 'insufficient_evidence');
});
