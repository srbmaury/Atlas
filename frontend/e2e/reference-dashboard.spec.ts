import { test, expect } from '@playwright/test';

test('reference research dashboard renders three columns and remains usable on a phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1672, height: 942 });
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
        if (path === '/workspaces/w1/conversations/saved') return reply({
            id: 'saved',
            title: 'Renewable energy growth in Europe',
            updated: Math.floor(Date.now() / 1000),
            messages: [
                { role: 'user', content: 'What drives renewable energy growth in Europe?' },
                { role: 'assistant', content: 'Supportive policy and falling costs both matter. [1]', result: {
                    mode: 'ai',
                    answer: 'Europe’s renewable energy growth is shaped by **policy support**, declining generation costs and energy security. [1]',
                    sources: [{ chunk_id: 'c1', document_id: 'd1', name: 'Europe energy brief.pdf', page: 2, location_type: 'page', text: 'Policy incentives and falling costs supported deployment.' }],
                } },
            ],
        });
        return reply([]);
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your AI Research Workspace' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Research insights' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.atlas-ref-task')).toHaveCount(4);
    await page.getByRole('button', { name: 'Connected Sources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Choose search sources' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Documents' })).toBeChecked();
    await page.getByRole('button', { name: 'Connected Sources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Choose search sources' })).toBeHidden();

    await page.locator('.atlas-ref-research-row').filter({ hasText: 'Renewable energy growth in Europe' }).click();
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

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Your AI Research Workspace' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(page.locator('.atlas-reference-sidebar')).toHaveClass(/open/);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.locator('.atlas-reference-sidebar')).not.toHaveClass(/open/);
    await page.screenshot({ path: testInfo.outputPath('atlas-reference-mobile.png'), fullPage: true, animations: 'disabled' });
});
