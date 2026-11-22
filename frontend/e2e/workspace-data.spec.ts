import { expect, test } from '@playwright/test';

test('restores a previous workspace and distinguishes saved data from API failure', async ({ page }) => {
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('atlas-last-workspace:u1', 'w2');
    });
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/api/, '');
        const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (path === '/me') return json({ id: 'u1', email: 'researcher@example.com', mode: 'ai', max_file_bytes: 10485760 });
        if (path === '/workspaces') return json([
            { id: 'w1', name: 'Workspace One', role: 'manager' },
            { id: 'w2', name: 'Workspace Two', role: 'manager' },
        ]);
        if (path === '/gmail/status') return json({ connected: false, configured: false });
        if (path.endsWith('/drive/status')) return json({ connected: false, configured: false });
        if (path.endsWith('/sources/health')) return json({ checks: [] });
        if (path.endsWith('/sources')) return json([]);
        if (path.endsWith('/documents')) return json([]);
        if (path.endsWith('/agents/sources')) return json({ documents: [], providers: [] });
        if (path.endsWith('/agents/a1/runs')) return json([]);
        if (path === '/workspaces/w1/conversations') return json({ detail: 'Unavailable' }, 503);
        if (path === '/workspaces/w2/conversations') return json([
            { id: 'c1', title: 'Existing workspace research', updated: 1700000000 },
        ]);
        if (path === '/workspaces/w1/agents') return json({ detail: 'Unavailable' }, 503);
        if (path === '/workspaces/w2/agents') return json([
            { id: 'a1', name: 'Coastal Research', instructions: 'Cite evidence', output_format: 'detailed_notes', source_config: { include_documents: true } },
            { id: 'a2', name: 'Archive Review', instructions: 'Summarize records', output_format: 'detailed_notes', source_config: { include_documents: true } },
        ]);
        return json([]);
    });

    await page.goto('/');
    const switcher = page.getByRole('button', { name: 'Switch workspace' });
    await expect(switcher).toContainText('Workspace Two');
    await expect(switcher).toContainText('2 workspaces');
    await expect(page.getByRole('region', { name: 'Recent chats' }).getByRole('button', { name: /Existing workspace research/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Agent Studio' }).click();
    await expect(page.getByText('Workspace: Workspace Two')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coastal Research' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Archive Review' })).toBeVisible();

    const agentInput = page.getByRole('searchbox', { name: 'Search agents' });
    await agentInput.focus();
    expect(await agentInput.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    expect(await agentInput.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');

    await switcher.click();
    await page.getByRole('dialog', { name: 'Your workspaces' }).getByRole('button', { name: /Workspace One/ }).click();
    await expect(switcher).toContainText('Workspace One');
    await expect(page.getByRole('heading', { name: 'Couldn’t load research agents' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Build your first research agent' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Recent chats' }).getByText('Could not load chats.')).toBeVisible();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText('Couldn’t load conversations.')).toBeVisible();

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Ask Atlas' }).click();
    const askInput = page.getByRole('textbox', { name: 'Your question' });
    await askInput.focus();
    expect(await askInput.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    expect(await askInput.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
});
