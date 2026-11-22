import { test, expect } from '@playwright/test';

test('reference research dashboard renders three columns and remains usable on a phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1672, height: 942 });
    let releaseSavedConversation: (() => void) | undefined;
    const savedConversationGate = new Promise<void>((resolve) => {
        releaseSavedConversation = resolve;
    });
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/api/, '');
        const reply = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        if (path === '/me') return reply({ id: 'u1', email: 'researcher@example.com', display_name: 'Researcher', mode: 'ai', max_file_bytes: 10485760 });
        if (path === '/workspaces') return reply([{ id: 'w1', name: 'Global Economy', role: 'manager' }]);
        if (path === '/workspaces/w1/documents') return reply([{ id: 'd1', name: 'Europe energy brief.pdf', size: 1024, status: 'ready', pages: 5, chunk_count: 8 }]);
        if (path === '/gmail/status') return reply({ connected: false, email: null, configured: false });
        if (path === '/workspaces/w1/drive/status') return reply({ connected: false, account: null, configured: false });
        if (path === '/workspaces/w1/sources') return reply([{ provider: 'github', connected: true, account: 'research-user' }]);
        if (path === '/workspaces/w1/sources/health') return reply({ checks: [] });
        if (path === '/workspaces/w1/agents/sources') return reply({ documents: [], providers: [] });
        if (path === '/workspaces/w1/agents') return reply([]);
        if (path === '/workspaces/w1/conversations') return reply([{ id: 'saved', title: 'Renewable energy growth in Europe', updated: Math.floor(Date.now() / 1000) }]);
        if (path === '/workspaces/w1/conversations/saved') {
            await savedConversationGate;
            return reply({
                id: 'saved',
                title: 'Renewable energy growth in Europe',
                updated: Math.floor(Date.now() / 1000),
                messages: [
                    { role: 'user', content: 'What drives renewable energy growth in Europe?' },
                    {
                        role: 'assistant',
                        content: 'Supportive policy and falling costs both matter. [1]',
                        result: {
                            mode: 'ai',
                            answer: 'Europe’s renewable energy growth is shaped by **policy support**, declining generation costs and energy security. [1]',
                            sources: [
                                {
                                    chunk_id: 'c1',
                                    document_id: 'd1',
                                    name: 'Europe energy brief.pdf',
                                    page: 2,
                                    location_type: 'page',
                                    text: 'Policy incentives and falling costs supported deployment.',
                                },
                            ],
                        },
                    },
                ],
            });
        }
        return reply([]);
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your AI Research Workspace' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Research insights' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.atlas-ref-task')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: 'Answer' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Sources/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Notes' })).toHaveCount(0);
    // Source scope is in the composer header, adjacent to the question rather than the action row.
    const sourceScope = page.locator('.atlas-ref-composer-source');
    await expect(sourceScope.getByRole('button', { name: 'Connected Sources' })).toBeVisible();
    const composerToolbar = await page.locator('.atlas-ref-composer-toolbar').boundingBox();
    const sourceScopeRect = await sourceScope.boundingBox();
    expect(composerToolbar && sourceScopeRect).toBeTruthy();
    expect(sourceScopeRect!.y).toBeGreaterThanOrEqual(composerToolbar!.y);
    expect(sourceScopeRect!.y).toBeLessThan(composerToolbar!.y + composerToolbar!.height);

    // The overview owns an accessible theme toggle (previously only other tabs had it).
    await expect(page.locator('.atlas-ref-hero-theme').getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible();
    const switcher = page.getByRole('button', { name: 'Switch workspace' });
    await expect(switcher).toContainText('Global Economy');
    await expect(switcher).toContainText('1 workspace');
    const homeComposer = page.locator('form.atlas-ref-composer.atlas-question-box');
    await expect(homeComposer).toBeVisible();
    await expect(homeComposer.locator('.atlas-ref-composer-toolbar')).toBeVisible();
    const homeHeaderInset = await homeComposer.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const header = element.querySelector('.atlas-ref-composer-toolbar')!.getBoundingClientRect();
        return { left: Math.round(header.left - card.left), right: Math.round(card.right - header.right) };
    });
    const homeComposerStyle = await homeComposer.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, borderColor: style.borderColor, borderRadius: style.borderRadius, padding: style.padding, shadow: style.boxShadow };
    });
    const homeField = page.getByRole('textbox', { name: 'Ask a research question' });
    await homeField.focus();
    expect(await homeField.evaluate((field) => getComputedStyle(field).outlineStyle)).toBe('none');
    expect(await homeField.evaluate((field) => getComputedStyle(field).boxShadow)).toBe('none');

    // Toggle the insight rail without unmounting it or losing the user's notes.
    const originalCanvasWidth = (await page.locator('.atlas-ref-canvas').boundingBox())!.width;
    await page.getByRole('button', { name: 'Collapse research insights' }).first().click();
    await expect(page.getByRole('complementary', { name: 'Research insights' })).toBeHidden();
    expect((await page.locator('.atlas-ref-canvas').boundingBox())!.width).toBeGreaterThan(originalCanvasWidth);
    await page.getByRole('button', { name: 'Expand research insights' }).click();
    await expect(page.getByRole('complementary', { name: 'Research insights' })).toBeVisible();

    // The design's light-only surfaces should actually switch to dark colors.
    const canvasLocator = page.locator('.atlas-ref-canvas');
    const lightSurface = await canvasLocator.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
    });
    await expect.poll(() => canvasLocator.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightSurface);
    const darkPanelSurface = await page.locator('.atlas-ref-insight').evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(darkPanelSurface).not.toBe('rgb(255, 255, 255)');
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
    });
    await page.getByRole('button', { name: 'More research tools' }).click();
    await page.getByRole('menuitem', { name: 'Quick notes' }).click();
    await expect(page.getByRole('textbox', { name: 'Quick notes' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Quick notes' }).fill('Evidence to revisit');
    await page.getByRole('button', { name: 'Collapse research insights' }).first().click();
    await page.getByRole('button', { name: 'Expand research insights' }).click();
    await expect(page.getByRole('textbox', { name: 'Quick notes' })).toHaveValue('Evidence to revisit');
    await page.getByRole('tab', { name: /Sources/ }).click();
    await page.getByRole('tab', { name: 'Answer' }).click();
    await page.getByRole('button', { name: 'Connected Sources', exact: true }).click();
    const sourceMenu = page.getByRole('dialog', { name: 'Choose search sources' });
    await expect(sourceMenu).toBeVisible();
    const sourceMenuBounds = await sourceMenu.boundingBox();
    expect(sourceMenuBounds).not.toBeNull();
    expect(sourceMenuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(sourceMenuBounds!.x + sourceMenuBounds!.width).toBeLessThanOrEqual(1672);
    await expect(page.locator('.atlas-ref-composer').getByRole('button', { name: 'Research', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Documents' })).toBeChecked();
    await page.getByRole('button', { name: 'Connected Sources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Choose search sources' })).toBeHidden();

    await page.locator('.atlas-ref-research-row').filter({ hasText: 'Renewable energy growth in Europe' }).click();
    await expect(page.locator('.atlas-ref-progress-panel')).toContainText('Opening conversation…');
    releaseSavedConversation?.();
    await expect(page.getByRole('heading', { name: 'Research answer' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open source 1/ }).first()).toBeVisible();

    const sidebar = await page.locator('.atlas-reference-sidebar').boundingBox();
    const canvas = await page.locator('.atlas-ref-canvas').boundingBox();
    const insight = await page.locator('.atlas-ref-insight').boundingBox();
    expect(sidebar && canvas && insight).toBeTruthy();
    expect(sidebar!.width).toBeGreaterThan(220);
    expect(canvas!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 2);
    expect(insight!.x).toBeGreaterThanOrEqual(canvas!.x + canvas!.width - 2);
    await page.screenshot({ path: testInfo.outputPath('atlas-reference-desktop.png'), fullPage: true, animations: 'disabled' });

    await page.getByRole('button', { name: /Analyze a topic/ }).click();
    await expect(page.getByRole('textbox', { name: 'Ask a research question' })).toHaveValue('Analyze the evidence, developments and implications of ');

    // The same native Dialog primitive powers workspace management and global search.
    // Both must be centered; Tailwind's preflight strips the UA dialog margins.
    await page.getByRole('button', { name: 'New or manage workspaces' }).click();
    const workspaceDialog = page.getByRole('dialog', { name: 'Your workspaces' });
    await expect(workspaceDialog).toBeVisible();
    const workspaceRect = await workspaceDialog.boundingBox();
    expect(workspaceRect).not.toBeNull();
    expect(Math.abs(workspaceRect!.x + workspaceRect!.width / 2 - 1672 / 2)).toBeLessThan(8);
    await workspaceDialog.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Ask Atlas' }).click();
    const chatComposer = page.locator('.chat-workspace form.atlas-ref-composer.atlas-question-box');
    await expect(chatComposer).toBeVisible();
    const chatComposerStyle = await chatComposer.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, borderColor: style.borderColor, borderRadius: style.borderRadius, padding: style.padding, shadow: style.boxShadow };
    });
    expect(chatComposerStyle).toEqual(homeComposerStyle);
    const chatHeaderInset = await chatComposer.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const header = element.querySelector('.atlas-ref-composer-toolbar')!.getBoundingClientRect();
        return { left: Math.round(header.left - card.left), right: Math.round(card.right - header.right) };
    });
    expect(chatHeaderInset).toEqual(homeHeaderInset);
    await expect(chatComposer.getByText('Your Docs')).toBeVisible();
    await expect(chatComposer.getByRole('button', { name: 'Send question' })).toBeVisible();
    await expect(page.locator('.chat-workspace .atlas-question-box .atlas-ref-composer-source').getByRole('button', { name: 'Connected Sources' })).toBeVisible();
    const researchInput = page.getByRole('textbox', { name: 'Your question' });
    await researchInput.focus();
    expect(await researchInput.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
    await page.getByRole('button', { name: /Search documents or ask a question/ }).click();
    const searchDialog = page.getByRole('dialog', { name: 'Search & commands' });
    await expect(searchDialog).toBeVisible();
    const searchRect = await searchDialog.boundingBox();
    expect(searchRect).not.toBeNull();
    expect(Math.abs(searchRect!.x + searchRect!.width / 2 - 1672 / 2)).toBeLessThan(8);
    await searchDialog.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Connectors' }).click();
    const availableGrid = page.getByRole('region', { name: 'Available integrations' }).locator('.integrations-grid');
    await expect(availableGrid).toBeVisible();
    const columns = await availableGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
    expect(columns).toBe(4);
    // Click the title—not the previous highlighted action region—to open configuration.
    await page.locator('.integration-tile').filter({ hasText: 'GitHub' }).getByRole('heading', { name: 'GitHub' }).click();
    await expect(page.getByRole('dialog', { name: 'Manage source connection' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Manage source connection' }).getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your AI Research Workspace' })).toBeVisible();

    // Progress must be visible while the server is pending, regardless of the
    // selected inspector view. Hold the POST deliberately to make this deterministic.
    let releaseResearch: (() => void) | undefined;
    const researchGate = new Promise<void>((resolve) => {
        releaseResearch = resolve;
    });
    await page.route('**/api/workspaces/w1/conversations', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await researchGate;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'new-research', title: 'Energy policy', updated: Date.now() / 1000, messages: [] }),
        });
    });
    await page.getByRole('textbox', { name: 'Ask a research question' }).fill('Research European energy policy');
    await page.locator('.atlas-ref-composer').getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.locator('.atlas-ref-progress-inline')).toContainText('Searching your sources');
    await page.getByRole('tab', { name: /Sources/ }).click();
    await expect(page.locator('.atlas-ref-progress-panel')).toContainText('Searching your sources');
    await page.getByRole('button', { name: 'More research tools' }).click();
    await page.getByRole('menuitem', { name: 'Quick notes' }).click();
    await expect(page.locator('.atlas-ref-progress-panel')).toContainText('Searching your sources');
    releaseResearch?.();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Your AI Research Workspace' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(page.locator('.atlas-reference-sidebar')).toHaveClass(/open/);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.locator('.atlas-reference-sidebar')).not.toHaveClass(/open/);
    await page.screenshot({ path: testInfo.outputPath('atlas-reference-mobile.png'), fullPage: true, animations: 'disabled' });
});
