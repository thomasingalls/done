import { test, expect, type Page } from '@playwright/test';
import { createdAccount } from '../device-enrollment/helpers';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService } from './server';

const panel = (p: Page) => p.getByRole('region', { name: 'History maintenance', exact: true });
async function inspect(p: Page) {
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await panel(p).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel(p).getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
}

test('sole device creates repeated native snapshots, retries lost publication and keeps editing', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    const first = await createdAccount(page);
    await add(page, 'History single device writing');
    await inspect(page);
    await expect(panel(page)).toContainText('No verified history snapshot yet.');
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    await add(page, 'Writing after first snapshot');
    let lost = false;
    await page.route('**/account/history/v1/checkpoint', async (route) => {
      if (!lost && route.request().postDataJSON().action === 'publish') {
        await route.fetch();
        lost = true;
        await route.abort();
      } else await route.continue();
    });
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    expect(lost).toBe(true);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, first.code);
    await inspect(page);
    await panel(page).getByRole('button', { name: 'Resume history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
    await add(page, 'Writing after interrupted history');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, first.code);
    await expect(page.locator('.shell')).toContainText('Writing after interrupted history');
  } finally {
    await stopService(service);
  }
});

test('two native device owners independently admit snapshots and keep two-way delivery', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    const timings: { path: string; status: number; elapsed: number }[] = [];
    const started = Date.now();
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/account/'))
        timings.push({ path, status: response.status(), elapsed: Date.now() - started });
    });

    await add(second, 'Second device before snapshot');
    await expect(page.locator('.shell')).toContainText('Second device before snapshot', {
      timeout: 15000,
    });
    await inspect(page);
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
    );
    await inspect(second);
    await panel(second).getByRole('button', { name: 'Verify history snapshot' }).click();
    await expect(panel(second)).toContainText('Verified snapshot 1 is saved.');
    await add(page, 'First device after maintenance');
    await expect(second.locator('.shell')).toContainText('First device after maintenance', {
      timeout: 15000,
    });
    await add(second, 'Second device after maintenance');
    await expect(page.locator('.shell')).toContainText('Second device after maintenance', {
      timeout: 15000,
    });
    // Reconcile the producer's retained exact proposal after the peer's successful admission.
    await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Resume history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    await panel(second).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(second)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
    );
    await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
    const verificationStarted = Date.now();
    await panel(page).getByRole('button', { name: 'Verify history snapshot' }).click();
    try {
      await expect(panel(page)).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
    } catch (cause) {
      console.log('History request timings:', timings.slice(-25));
      throw cause;
    }
    await info.attach('history-verification-timing', {
      contentType: 'application/json',
      body: JSON.stringify({
        elapsedMs: Date.now() - verificationStarted,
        requests: timings.slice(-25),
      }),
    });
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
