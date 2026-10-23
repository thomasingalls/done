import { test, expect } from '@playwright/test';
import { openApp, openMenuSection } from '../geometry/openApp';
import { authenticator } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

// One browser context is intentional: both tabs share the same custody and setup stores.
for (const unlockOther of [false, true])
  test(`sync protection with a second ${unlockOther ? 'reopened' : 'retired'} Local tab preserves the factor across setup reload`, async ({
    page,
    context,
  }, info) => {
    const service = await startService(
      info.outputPath('service'),
      process.env['PASSKEY_TEST_BUILD'],
      true,
      true,
    );
    const other = await context.newPage();
    const writing = 'Two tabs must retain this protected Local writing';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openApp(page);
      const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
      await input.fill(writing);
      await input.press('Enter');
      await openApp(other);
      await expect(other.locator('.shell')).toContainText(writing);
      await authenticator(page);
      await openMenuSection(page, 'Sync');
      await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
      await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const code = (await page.getByLabel('Generated unlock code').textContent())!;
      await page.getByRole('button', { name: 'I saved my unlock code' }).click();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Confirm and protect', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Protection is enabled' })).toBeVisible();
      await expect(other.locator('.shell')).toHaveCount(0);
      if (unlockOther) {
        await other.reload();
        await other.getByLabel('Unlock code', { exact: true }).fill(code);
        await other.getByRole('button', { name: 'Unlock', exact: true }).click();
        await expect(other.locator('.shell')).toContainText(writing);
      }
      await page.getByRole('button', { name: 'Continue to sync setup', exact: true }).click();
      await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
      await page.bringToFront();
      await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Try your new passkey', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
      if (unlockOther) {
        await expect(page.getByRole('status')).toContainText('close other tabs using this list');
        // The writer barrier must remain held until the other editor closes.
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const locks = await navigator.locks.query();
              return locks.pending?.some(
                (pending) =>
                  pending.mode === 'exclusive' &&
                  locks.held?.some((held) => held.mode === 'shared' && held.name === pending.name),
              );
            }),
          )
          .toBe(true);
        await other.close();
      }
      await expect(
        page.getByRole('heading', { name: 'Save your recovery code', exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Check your saved copy', exact: true }),
      ).toBeVisible();
      if (!other.isClosed()) await other.close();
      await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.locator('.shell')).toContainText(writing);
      await page.reload();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.locator('.shell')).toContainText(writing);
      expect(errors).toEqual([]);
    } finally {
      if (!other.isClosed()) await other.close();
      await stopService(service);
    }
  });
