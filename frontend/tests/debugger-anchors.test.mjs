import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scenarios } from '../public/debugger/scenarios.js';

const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function checkIds(items, label) {
    const ids = items.map(({ id }) => id);
    assert.ok(
        ids.every((id) => identifier.test(id)),
        `${label}: invalid IDs`,
    );
    assert.equal(new Set(ids).size, ids.length, `${label}: duplicate IDs`);
}

test('every walkthrough step and linked test resolves to one source line', async () => {
    checkIds(scenarios, 'scenarios');
    const files = new Map();
    for (const scenario of scenarios) {
        const variants = scenario.cases || [scenario];
        checkIds(variants, scenario.id);
        for (const { id, steps } of variants) {
            checkIds(steps, id);
            assert.ok(steps[0].screen, `${id}: starts in the UI`);
            for (const step of steps) {
                for (const { path, anchor } of [step, step.test].filter(Boolean)) {
                    if (!files.has(path)) {
                        const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
                        files.set(path, source.split(/\r?\n/));
                    }
                    const matches = files.get(path).filter((line) => line.includes(anchor));
                    assert.equal(matches.length, 1, `${id}/${step.id}: ${path} · ${anchor}`);
                }
            }
        }
    }
});
