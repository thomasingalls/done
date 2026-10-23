import { openMenuSection } from '../geometry/openApp';
import { test, expect } from '@playwright/test';
import { pairedEditors } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

test('approval history retains its request and progress through an explicit capacity refusal', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const extra = await browser.newContext(),
    candidate = await extra.newPage();
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let first: Buffer | undefined,
    retried = false;
  try {
    pair = await pairedEditors(page, browser, true);
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Devices', exact: true }).click();
    await page.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(page, pair.first.code);
    await pending(
      candidate,
      await page.getByLabel('Device invitation link').inputValue(),
      pair.first.auth,
    );
    const comparison = await compared(page, candidate);
    await page.route('**/account/delivery/read-v2-batch', async (route) => {
      const body = route.request().postDataBuffer()!;
      if (!first) {
        first = body;
        await held;
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ v: 1, kind: 'authorization-refused', refusal: 'capacity' }),
        });
      } else {
        if (!retried) {
          expect(body.equals(first)).toBe(true);
          retried = true;
        }
        await route.continue();
      }
    });
    await page.getByLabel('Code on the new device').fill(comparison);
    await page.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await expect.poll(() => !!first).toBe(true);
    await expect(
      page.getByRole('progressbar', { name: 'Current connection step' }),
    ).toHaveAttribute('value', '0');
    release();
    await expect(page.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    expect(retried).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      candidate.getByRole('button', { name: 'Open your writing', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await candidate.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(candidate.locator('.shell')).toContainText('Keep the first device writing');
  } finally {
    release();
    try {
      await page.unrouteAll({ behavior: 'wait' });
    } finally {
      try {
        await Promise.all([extra.close(), pair?.other.close()]);
      } finally {
        await stopService(service);
      }
    }
  }
});
