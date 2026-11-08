import type { Message } from './types';

/** The selected message is included in a normal branch; edit/regenerate replace it. */
export function branchHistory(messages: Message[], index: number, mode: 'branch' | 'edit' | 'regenerate'): Message[] {
    if (!Number.isInteger(index) || index < 0 || messages[index]?.role !== 'user') {
        throw new RangeError('A branch must start from an existing user message.');
    }
    if (mode === 'edit' || mode === 'regenerate') return messages.slice(0, index);
    const nextIsAnswer = messages[index + 1]?.role === 'assistant';
    return messages.slice(0, index + (nextIsAnswer ? 2 : 1));
}
