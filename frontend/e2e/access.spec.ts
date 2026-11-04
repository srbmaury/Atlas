import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, role: 'manager' | 'viewer') {
    let members = [{ id: 'owner', email: 'owner@example.com', role: 'manager', owner: true }];
    let shared = false;
    let memberIds: string[] = [];
    const auditEvents: unknown[] = [];
    const changes: unknown[] = [];
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
        const method = route.request().method();
        const json = (value: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
        if (path === '/me') return json({ id: 'owner', email: 'owner@example.com', mode: 'local_excerpts', max_file_bytes: 10485760 });
        if (path === '/workspaces') return json([{ id: 'w1', name: 'Research', role }]);
        if (path === '/organisations') return json([{ id: 'o1', name: 'Example organisation', role: 'owner' }]);
        if (path === '/workspaces/w1/members' && method === 'PUT') {
            const body = route.request().postDataJSON(); changes.push(body);
            auditEvents.unshift({id:'audit-1',scope_type:'workspace',scope_id:'w1',actor_id:'owner',actor_email:'owner@example.com',target_id:'member',target_email:body.email,action:'member.granted',details:{role:body.role},created:1793790000});
            members = [...members, { id: 'member', email: body.email, role: body.role, owner: false }]; return json({ ok: true });
        }
        if (path === '/workspaces/w1/members') return json(members);
        if (path === '/workspaces/w1/connection-sharing') return json([{ provider: 'gmail', owned: true, shared, member_ids: memberIds }]);
        if (path === '/workspaces/w1/connection-sharing/gmail') { const data = route.request().postDataJSON(); shared = data.shared; memberIds = data.member_ids || []; changes.push(data); return json({ provider: 'gmail', shared, member_ids: memberIds }); }
        if (path === '/organisations/o1/members') return json([{ id: 'owner', email: 'owner@example.com', role: 'owner', owner: true }]);
        if (path === '/workspaces/w1/documents') return json([{ id: 'd1', name: 'notes.md', size: 120, status: 'ready', pages: 1, chunk_count: 1 }]);
        if (path === '/gmail/status' || path.endsWith('/drive/status')) return json({ connected: false, configured: true });
        if (path.endsWith('/audit')) return json({ events: auditEvents, next_cursor: null });
        if (path.endsWith('/sources/health')) return json({ checks: [] });
        return json([]);
    });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    return changes;
}

test('manager adds a member and explicitly shares a connection', async ({ page }) => {
    const changes = await setup(page, 'manager');
    await page.getByRole('button', { name: 'Manage workspaces', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Members & access' })).toBeVisible();
    await dialog.getByLabel('Registered member email').fill('viewer@example.com');
    await dialog.getByLabel('Member role', { exact: true }).selectOption('viewer');
    await dialog.getByRole('button', { name: 'Add or update member' }).click();
    await expect(dialog.getByText('viewer@example.com', { exact: true })).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'Share gmail with this workspace' }).check();
    await expect(dialog.getByRole('checkbox', { name: 'Share gmail with this workspace' })).toBeChecked();
    expect(changes).toEqual([{ email: 'viewer@example.com', role: 'viewer' }, { shared: true, member_ids: [] }]);
    await page.screenshot({ path: 'test-results/access-manager.png', fullPage: true });
    await dialog.getByLabel('Manage access for').selectOption('organisation');
    await expect(dialog.getByLabel('Organisation', { exact: true })).toHaveValue('o1');
    await expect(dialog.getByRole('button', { name: 'Create organisation workspace' })).toBeVisible();
});

test('viewer sees role guidance and has no document or member mutation controls', async ({ page }) => {
    await setup(page, 'viewer');
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add documents', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete notes.md', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reindex notes.md', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Manage workspaces', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Ask a workspace manager to change membership.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add or update member' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Delete workspace Research' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/access-viewer.png', fullPage: true });
});

test('rejected source sharing rolls back and shows the permission error', async ({ page }) => {
    await setup(page, 'manager');
    await page.route('**/api/workspaces/w1/connection-sharing/gmail', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Only the connection owner can manage this credential.' }) }));
    await page.getByRole('button', { name: 'Manage workspaces', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const checkbox = dialog.getByRole('checkbox', { name: 'Share gmail with this workspace' });
    await checkbox.click();
    await expect(dialog.getByRole('alert')).toHaveText('Only the connection owner can manage this credential.');
    await expect(checkbox).not.toBeChecked();
});

test('manager grants a selected member source access and reads security history', async ({ page }) => {
    const changes = await setup(page, 'manager');
    await page.getByRole('button', { name: 'Manage workspaces', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Registered member email').fill('reader@example.com');
    await dialog.getByRole('button', { name: 'Add or update member' }).click();
    const grant = dialog.getByRole('checkbox', { name: 'Allow gmail for reader@example.com' });
    await grant.check();
    await expect(grant).toBeChecked();
    expect(changes).toContainEqual({ shared: false, member_ids: ['member'] });
    await expect(dialog.getByRole('checkbox', { name: 'Share gmail with this workspace' })).not.toBeChecked();
    await expect(dialog.getByRole('region', { name: 'Security history' }).getByText('member · granted')).toBeVisible();
});

test('ownership transfer requires the resource name and selects an existing member', async ({ page }) => {
    await setup(page, 'manager');
    let submitted: unknown;
    await page.route('**/api/workspaces/w1/ownership', async (route) => {
        submitted = route.request().postDataJSON();
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({owner_id:'member'})});
    });
    await page.getByRole('button', { name: 'Manage workspaces', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Registered member email').fill('next-owner@example.com');
    await dialog.getByRole('button', { name: 'Add or update member' }).click();
    await dialog.getByLabel('New owner', { exact: true }).selectOption('member');
    const transfer = dialog.getByRole('button', { name: 'Transfer ownership', exact: true });
    await expect(transfer).toBeDisabled();
    await dialog.getByLabel('Confirm ownership transfer').fill('Research');
    await transfer.click();
    await expect.poll(() => submitted).toEqual({member_id:'member',confirmation:'Research'});
});
