/** Native Worker retirement must finish before a fresh factor can reopen a detached local copy. */
import { test, expect } from '@playwright/test';
import { openMenuSection } from '../geometry/openApp';
import { pairedEditors, credentials, restoreAuthenticator, add, openSaved } from './devices';
import { startService, stopService } from './server';
test('Worker retirement leaves an unlockable detached copy after recovery rather than a permanent closing screen', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const replacement = await browser.newContext();
  const next = await replacement.newPage();
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const first = pair.first,
      saved = await credentials(first.auth);
    for (const p of [page, pair.second]) {
      await openMenuSection(p, 'Account');
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    }
    await next.goto('/accounts');
    await restoreAuthenticator(next, saved);
    await openMenuSection(next, 'Account');
    await next.getByRole('button', { name: 'Use another account', exact: true }).click();
    await next
      .getByRole('button', { name: 'Recover with a saved recovery code', exact: true })
      .click();
    await next.getByRole('button', { name: 'Use account passkey', exact: true }).click();
    await next.getByLabel('Recovery code', { exact: true }).fill(first.recovery);
    await next.getByRole('button', { name: 'Continue with recovery code', exact: true }).click();
    const code = (await next.getByLabel('Generated unlock code').textContent())!;
    await next.getByRole('button', { name: 'I saved my unlock code' }).click();
    await next.getByLabel('Unlock code', { exact: true }).fill(code);
    await next.getByRole('button', { name: 'Confirm unlock code', exact: true }).click();
    await next
      .getByRole('button', {
        name: 'Recover on this device and disconnect the previous devices',
        exact: true,
      })
      .click();
    await expect(next.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 30000,
    });
    await page.goto('/');
    const input = page.getByLabel('Unlock code', { exact: true });
    await expect
      .poll(
        async () =>
          (await input.isVisible()) ||
          (await page.getByRole('button', { name: /^Unlock Device owner/ }).isVisible()),
      )
      .toBe(true);
    if (!(await input.isVisible()))
      await page.getByRole('button', { name: /^Unlock Device owner/ }).click();
    await input.fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(
      page.getByText('This device was removed from the account.', { exact: false }),
    ).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.shell')).toHaveCount(0);
    // Fresh user input constructs a new owner; no passkey/native opening is retained from retirement.
    await input.fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(page.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    await openMenuSection(page, 'Sync');
    await expect(page.getByText('Removed from account.', { exact: false })).toBeVisible();
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/account\/(delivery|notifications)\//.test(r.url()))
        requests.push(new URL(r.url()).pathname);
    });
    await add(page, 'Writing after native retirement');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, first.code);
    await expect(page.locator('.shell')).toContainText('Writing after native retirement');
    expect(requests).toEqual([]);
  } finally {
    await Promise.allSettled([replacement.close(), pair?.other.close()]);
    await stopService(service);
  }
});
