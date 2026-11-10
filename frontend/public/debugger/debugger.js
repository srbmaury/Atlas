import { scenarios, walkthroughs } from './scenarios.js';

const repository = 'srbmaury/Atlas';
const api = 'https://api.github.com/repos/' + repository;
const raw = 'https://raw.githubusercontent.com/' + repository;
const commitPattern = /^[0-9a-f]{40}$/;
const knownCommits = new Map([
    ['main', '9e94ad34c946c589c90c222860c0a2a249b2beec'],
    ['feat/atlas-flow-debugger', '560c2d836674c8e510df570cce6f5770ed457149'],
]);
const scenarioFiles = [...new Set(walkthroughs.flatMap(({ steps }) => steps.flatMap(({ path, test }) => (test ? [path, test.path] : [path]))))].sort().map((path) => ({ path, type: 'blob' }));

function savedRevision(ref, resolved) {
    const key = 'atlas-debugger:revision:' + ref;
    try {
        if (resolved) localStorage.setItem(key, JSON.stringify(resolved));
        const cached = JSON.parse(localStorage.getItem(key));
        if (commitPattern.test(cached?.sha) && commitPattern.test(cached?.tree)) return cached;
    } catch {
        // Storage may be disabled.
    }
    return null;
}

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const files = new Map();
const legacyStagedUpload = params.get('scenario') === 'staged-upload';
let scenarioIndex = Math.max(
    0,
    scenarios.findIndex(({ id }) => id === (legacyStagedUpload ? 'upload' : params.get('scenario'))),
);
const currentScenario = () => scenarios[scenarioIndex];
let caseIndex = Math.max(0, currentScenario().cases?.findIndex(({ id }) => id === (legacyStagedUpload ? 'large' : params.get('case'))) ?? 0);
const currentCase = () => currentScenario().cases?.[caseIndex] || currentScenario();
const namedIndex = currentCase().steps.findIndex(({ id }) => id === params.get('step'));
let index = namedIndex >= 0 ? namedIndex : Math.max(0, Math.min(currentCase().steps.length - 1, (Number.parseInt(params.get('step'), 10) || 1) - 1));
const currentStep = () => currentCase().steps[index];
let selectedFile = null;
let returnScroll = null;
let revision = null;
let revisionRequest = null;
let sourceRequest = null;
let treeLoaded = false;
let pinnedCommit = commitPattern.test(params.get('commit')) ? params.get('commit') : null;

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');
const keyword = /^(?:async|await|class|const|def|else|except|export|false|False|for|from|function|if|import|in|let|None|null|return|true|True|try|with|yield)$/;
const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\/\/|#).*|\b[A-Za-z_]\w*\b)/g;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

async function request(url, signal, json = false) {
    const response = await fetch(url, { signal, cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) {
        if (response.status === 403 || response.status === 429) throw new Error('GitHub denied the request or its public API limit was reached.');
        throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    return json ? response.json() : response.text();
}

function stepLink(commit = pinnedCommit) {
    const url = new URL(location.href);
    url.searchParams.set('ref', revision?.ref || $('ref').value.trim() || 'main');
    url.searchParams.set('scenario', currentScenario().id);
    url.searchParams.set('step', currentStep().id);
    if (currentScenario().cases) url.searchParams.set('case', currentCase().id);
    else url.searchParams.delete('case');
    if (commit) url.searchParams.set('commit', commit);
    else url.searchParams.delete('commit');
    return url;
}

function updateLink() {
    history.replaceState(null, '', stepLink());
    $('share').hidden = !revision;
    if (revision) $('share').href = stepLink(revision.sha).href;
}

function stepLayer(step) {
    if (step.screen) return 'Browser · Atlas UI';
    if (step.path.startsWith('frontend/')) return 'Browser · application code';
    if (/\/(worker|ingest)\.py$/.test(step.path)) return 'Worker · indexing';
    if (/\/(uploads|original_storage)\.py$/.test(step.path)) return 'API · file storage';
    if (step.path.endsWith('/connected_synthesis.py')) return 'API · model and citations';
    return 'API · request handling';
}

function renderStep() {
    const scenario = currentCase();
    const step = currentStep();
    $('case-control').hidden = !currentScenario().cases;
    $('case').replaceChildren(
        ...(currentScenario().cases || []).map(({ title }, position) => {
            const option = element('option', title);
            option.value = String(position);
            return option;
        }),
    );
    $('case').value = String(caseIndex);
    $('layer').textContent = stepLayer(step);
    $('open-test').hidden = !step.test;
    $('transition').hidden = !step.transition;
    if (step.transition) {
        $('before').textContent = JSON.stringify(step.transition.before, null, 2);
        $('after').textContent = JSON.stringify(step.transition.after, null, 2);
    }
    $('progress').textContent = `${index + 1} / ${scenario.steps.length}`;
    $('previous').disabled = index === 0;
    $('next').disabled = index === scenario.steps.length - 1;
    $('return-to-step').hidden = selectedFile === null;
    $('screen').hidden = !step.screen;
    $('screen').textContent = step.screen ? 'UI · ' + step.screen : '';
    $('step-title').textContent = step.title;
    $('explanation').textContent = step.detail;
    $('steps').replaceChildren(
        ...scenario.steps.map((entry, position) => {
            const item = element('li');
            const button = element('button', `${position + 1}. ${entry.title}`);
            button.type = 'button';
            if (position === index) button.setAttribute('aria-current', 'step');
            button.addEventListener('click', () => goTo(position));
            item.append(button);
            return item;
        }),
    );
    $('values').replaceChildren(
        ...Object.entries(step.values).flatMap(([label, value]) => {
            const data = element('dd');
            data.append(element('pre', JSON.stringify(value, null, 2)));
            return [element('dt', label[0].toUpperCase() + label.slice(1)), data];
        }),
    );
    updateLink();
    void renderSource();
}

function highlight(line, row) {
    let offset = 0;
    for (const match of line.matchAll(tokens)) {
        row.append(line.slice(offset, match.index));
        const token = match[0];
        const type = keyword.test(token) ? 'keyword' : /^['"]/.test(token) ? 'literal' : /^(?:#|\/\/)/.test(token) ? 'comment' : null;
        row.append(type ? element('span', token, type) : token);
        offset = match.index + token.length;
    }
    row.append(line.slice(offset));
}

async function renderSource() {
    sourceRequest?.abort();
    const step = currentStep();
    const path = selectedFile?.path || step.path;
    const anchor = selectedFile ? selectedFile.anchor : step.anchor;
    const highlightLines = selectedFile ? 1 : step.lines || 6;
    $('filename').textContent = path;
    $('line-range').hidden = true;
    $('next-hint').hidden = true;
    $('code').replaceChildren();
    $('github').hidden = !revision;
    for (const button of $('tree').querySelectorAll('.tree-file')) {
        if (button.dataset.path === path) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
    }
    if (!revision) {
        $('code-status').textContent = 'Waiting for a GitHub revision.';
        return;
    }
    const { sha } = revision;
    const githubUrl = `https://github.com/${repository}/blob/${sha}/${encodedPath(path)}`;
    $('github').href = githubUrl;
    $('code-status').textContent = 'Loading source…';
    const controller = new AbortController();
    sourceRequest = controller;
    try {
        const text = files.get(path) ?? (await request(`${raw}/${sha}/${encodedPath(path)}`, controller.signal));
        if (controller.signal.aborted) return;
        if (text.length > 250_000 || text.includes('\0')) throw new Error('This file is too large or is not plain text.');
        files.set(path, text);
        const lines = text.split(/\r?\n/);
        const matches = anchor ? lines.flatMap((line, position) => (line.includes(anchor) ? [position] : [])) : [];
        const target = matches.length === 1 ? matches[0] : -1;
        const end = Math.min(lines.length, target + highlightLines);
        const content = document.createDocumentFragment();
        for (const [position, line] of lines.entries()) {
            const focused = position === target;
            const active = target >= 0 && position >= target && position < end;
            const row = element('span', undefined, focused ? 'code-line active focused-line' : active ? 'code-line active' : 'code-line');
            const number = element('span', String(position + 1), 'line-number');
            number.setAttribute('aria-hidden', 'true');
            row.append(number);
            if (focused) {
                const start = line.indexOf(anchor);
                highlight(line.slice(0, start), row);
                const mark = element('mark', anchor, 'code-match');
                if (!selectedFile) mark.setAttribute('aria-describedby', 'next-hint-label next-hint-detail');
                row.append(mark);
                highlight(line.slice(start + anchor.length), row);
            } else {
                highlight(line, row);
            }
            content.append(row);
        }
        const code = $('code');
        code.replaceChildren(content);
        code.scrollTop = 0;
        code.scrollLeft = 0;
        $('code-status').textContent = anchor && target === -1 ? `Anchor “${anchor}” matched ${matches.length} lines at this commit. Showing the file without a highlight.` : '';
        if (target >= 0) {
            const firstLine = target + 1;
            $('github').href = githubUrl + '#L' + firstLine + (end > firstLine ? '-L' + end : '');
            $('line-range').textContent = end > firstLine ? `Lines ${firstLine}–${end}` : `Line ${firstLine}`;
            $('line-range').hidden = false;
            if (!selectedFile) {
                const upcoming = currentCase().steps[index + 1];
                $('next-hint-label').textContent = upcoming ? `Next · ${upcoming.title}` : 'End of this walkthrough';
                $('next-hint-detail').textContent = upcoming ? `${stepLayer(upcoming)} — ${upcoming.detail}` : 'Go back to review a step, or choose another scenario.';
                $('next-hint-go').hidden = !upcoming;
                $('next-hint').hidden = false;
            }
            const focus = code.querySelector('.focused-line');
            code.scrollTop = Math.max(0, focus.offsetTop - code.offsetTop - Math.min(64, code.clientHeight / 4));
            const mark = focus.querySelector('.code-match');
            const markLeft = mark.getBoundingClientRect().left - code.getBoundingClientRect().left;
            if (markLeft >= code.clientWidth - 48) code.scrollLeft = markLeft - 72;
        }
        if (!selectedFile && returnScroll) {
            code.scrollTo(returnScroll);
            returnScroll = null;
        }
    } catch (error) {
        if (!controller.signal.aborted) $('code-status').textContent = `Could not open source. ${error.message}`;
    }
}

function goTo(position) {
    if (position < 0 || position >= currentCase().steps.length) return;
    index = position;
    selectedFile = null;
    returnScroll = null;
    renderStep();
}

function openFile(file) {
    if (!selectedFile) returnScroll = { top: $('code').scrollTop, left: $('code').scrollLeft };
    selectedFile = file;
    renderStep();
}

function renderTree(entries) {
    const root = document.createDocumentFragment();
    const folders = new Map([['', root]]);
    function folder(path) {
        if (folders.has(path)) return folders.get(path);
        const parts = path.split('/');
        const name = parts.pop();
        const details = element('details');
        details.append(element('summary', name));
        folder(parts.join('/')).append(details);
        folders.set(path, details);
        return details;
    }
    for (const entry of entries) {
        if (entry.type !== 'blob' || entry.size > 250_000 || !/\.(?:py|tsx?|m?js|css|html|md|ya?ml|json|txt|toml|ini|sh)$|(?:^|\/)(?:Dockerfile|Makefile|\.gitignore)$/i.test(entry.path)) continue;
        const parts = entry.path.split('/');
        const name = parts.pop();
        const button = element('button', name, 'tree-file');
        button.type = 'button';
        button.dataset.path = entry.path;
        if (entry.path === (selectedFile?.path || currentStep().path)) button.setAttribute('aria-current', 'true');
        button.addEventListener('click', () => {
            openFile({ path: entry.path });
        });
        folder(parts.join('/')).append(button);
    }
    $('tree').replaceChildren(root);
}

async function loadTree() {
    if (!revision || treeLoaded || !document.querySelector('.repo').open) return;
    treeLoaded = true;
    const activeRevision = revision;
    const signal = revisionRequest.signal;
    const showScenarioFiles = () => {
        renderTree(scenarioFiles);
        $('tree').prepend(element('p', 'Showing walkthrough files. The full repository tree is unavailable.'));
    };
    if (!activeRevision.tree) {
        showScenarioFiles();
        return;
    }
    $('tree').textContent = 'Loading repository files…';
    try {
        const data = await request(`${api}/git/trees/${activeRevision.tree}?recursive=1`, signal, true);
        if (!signal.aborted) {
            renderTree(data.tree);
            if (data.truncated) $('tree').append(element('p', 'GitHub returned a partial file tree.'));
        }
    } catch {
        if (!signal.aborted) showScenarioFiles();
    }
}

function showRevision(resolved, note) {
    revision = resolved;
    $('revision-status').textContent = `${resolved.ref} · ${resolved.sha.slice(0, 8)} · ${note}`;
    renderStep();
    void loadTree();
}

async function loadRevision() {
    const ref = $('ref').value.trim();
    if (!/^[A-Za-z0-9._/-]{1,150}$/.test(ref)) {
        $('revision-status').textContent = 'Enter a branch, tag, or commit SHA.';
        return;
    }
    revisionRequest?.abort();
    sourceRequest?.abort();
    revisionRequest = new AbortController();
    const { signal } = revisionRequest;
    revision = null;
    treeLoaded = false;
    files.clear();
    $('tree').replaceChildren();
    $('revision-status').textContent = `Resolving ${ref} on GitHub…`;
    renderStep();
    if (pinnedCommit || commitPattern.test(ref.toLowerCase())) {
        const sha = pinnedCommit || ref.toLowerCase();
        showRevision({ ref, sha, tree: null }, 'exact commit');
        return;
    }
    try {
        const data = await request(`${api}/commits/${encodeURIComponent(ref)}`, signal, true);
        if (signal.aborted) return;
        if (!commitPattern.test(data.sha) || !commitPattern.test(data.commit?.tree?.sha)) throw new Error('GitHub did not return a complete commit.');
        const resolved = { ref, sha: data.sha, tree: data.commit.tree.sha };
        savedRevision(ref, resolved);
        showRevision(resolved, 'pinned GitHub revision');
    } catch (error) {
        if (signal.aborted) return;
        const cached = savedRevision(ref);
        const known = knownCommits.get(ref);
        if (cached || known) {
            showRevision({ ref, sha: cached?.sha || known, tree: cached?.tree || null }, 'GitHub lookup unavailable · pinned fallback');
            return;
        }
        $('revision-status').textContent = `Could not resolve ${ref}.`;
        $('code-status').textContent = `${error.message} Use main or paste a full Git commit SHA.`;
    }
}

$('ref').value = params.get('ref') || 'main';
$('scenario').replaceChildren(
    ...scenarios.map(({ title }, position) => {
        const option = element('option', title);
        option.value = String(position);
        return option;
    }),
);
$('scenario').value = String(scenarioIndex);
$('scenario').addEventListener('change', (event) => {
    scenarioIndex = Number(event.target.value);
    caseIndex = 0;
    goTo(0);
});
$('case').addEventListener('change', (event) => {
    caseIndex = Number(event.target.value);
    goTo(0);
});
$('revision-form').addEventListener('submit', (event) => {
    event.preventDefault();
    pinnedCommit = null;
    returnScroll = null;
    void loadRevision();
});
$('previous').addEventListener('click', () => goTo(index - 1));
$('next').addEventListener('click', () => goTo(index + 1));
$('next-hint-go').addEventListener('click', () => {
    goTo(index + 1);
    $('code').focus({ preventScroll: true });
});
$('return-to-step').addEventListener('click', () => {
    selectedFile = null;
    renderStep();
});
$('open-test').addEventListener('click', () => {
    if (currentStep().test) openFile(currentStep().test);
});
$('share').addEventListener('click', async (event) => {
    if (!navigator.clipboard || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try {
        await navigator.clipboard.writeText($('share').href);
        $('share-status').textContent = 'Step link copied.';
    } catch {
        location.href = $('share').href;
    }
});
document.querySelector('.repo').addEventListener('toggle', () => void loadTree());
window.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, select, textarea, pre, [contenteditable]')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goTo(index + (event.key === 'ArrowRight' ? 1 : -1));
});
renderStep();
void loadRevision();
