/** Ignore responses from superseded conversation navigation requests. */
let current = 0;
export const chatLoadSequence = {
    next: () => ++current,
    invalidate: () => { current += 1; },
    isCurrent: (sequence: number) => sequence === current,
};
