import test from 'node:test';
import assert from 'node:assert/strict';
import { branchHistory } from '../lib/branching.ts';

const messages = [
    { role: 'user', content: 'message 1' },
    { role: 'assistant', content: 'answer 1' },
    { role: 'user', content: 'message 2' },
    { role: 'assistant', content: 'answer 2' },
    { role: 'user', content: 'message 3' },
    { role: 'assistant', content: 'answer 3' },
];

test('branching from message 2 retains message 2 and its answer, not message 3', () => {
    assert.deepEqual(branchHistory(messages, 2, 'branch').map((m) => m.content),
        ['message 1', 'answer 1', 'message 2', 'answer 2']);
});

test('branching from message 1 retains the first turn only', () => {
    assert.deepEqual(branchHistory(messages, 0, 'branch').map((m) => m.content),
        ['message 1', 'answer 1']);
});

test('editing message 2 retains only earlier turns for resubmission', () => {
    for (const mode of ['edit', 'regenerate']) {
        assert.deepEqual(branchHistory(messages, 2, mode).map((m) => m.content),
            ['message 1', 'answer 1']);
    }
});

test('branching pending user prompt includes selected prompt', () => {
    assert.equal(branchHistory(messages.slice(0, 3), 2, 'branch').at(-1).content, 'message 2');
});

test('rejects assistant message index and invalid indices', () => {
    assert.throws(() => branchHistory(messages, 1, 'branch'), RangeError);
    assert.throws(() => branchHistory(messages, 99, 'branch'), RangeError);
});
