import { test, expect } from '@playwright/test';
import { pairedEditors } from './devices';
import { account, pending, compared } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

for (const refusal of ['authority-changed', 'capacity'] as const)
  test(`initial approval resumes after ${refusal} without repeating the saved decision or key wrap`, async ({
    page,
    browser,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    let refused = 0;
    const refusalCount = refusal === 'authority-changed' ? 2 : 3;
    const deliveries: string[] = [];
    let decisions = 0;
    try {
      pair = await pairedEditors(page, browser, true, {
        beforeCompare: async () => {
          page.on('request', (request) => {
            if (
              new URL(request.url()).pathname === '/__account-setup/ceremony/exchange' &&
              request.postDataJSON()?.action === 'decide'
            )
              decisions++;
          });
          await page.route('**/__account-setup/ceremony/transfer', async (route) => {
            const body = route.request().postDataJSON();
            if (body.action === 'deliver') {
              deliveries.push(route.request().postData()!);
              if (refused < refusalCount) {
                refused++;
                await route.fulfill({
                  status: refusal === 'capacity' ? 429 : 409,
                  contentType: 'application/json',
                  body: JSON.stringify({ v: 1, kind: 'authorization-refused', refusal }),
                });
                return;
              }
            }
            await route.continue();
          });
        },
      });
      expect(refused).toBe(refusalCount);
      expect(deliveries.length).toBeGreaterThan(refusalCount);
      expect(new Set(deliveries).size).toBe(1);
      expect(decisions).toBe(1);
      await expect(pair.second.locator('.shell')).toContainText('Keep the first device writing');
    } finally {
      await pair?.other.close();
      await stopService(service);
    }
  });

test('an insufficient enrollment scope remains stopped instead of entering transient retries', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const other = await browser.newContext();
  try {
    const first = await account(page);
    const second = await other.newPage();
    await pending(second, first.link, first.auth);
    const comparison = await compared(page, second);
    let refused = 0;
    await page.route('**/__account-setup/ceremony/transfer', async (route) => {
      refused++;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          v: 1,
          kind: 'authorization-refused',
          refusal: 'insufficient-scope',
        }),
      });
    });
    await page.getByLabel('Code on the new device').fill(comparison);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Account authorization refused: insufficient-scope',
    );
    // Cross a transient retry interval: this refusal must keep polling stopped.
    await page.waitForTimeout(3000);
    expect(refused).toBe(1);
    await expect(second.getByText('Content access is installed and certified.')).toHaveCount(0);
  } finally {
    await other.close();
    await stopService(service);
  }
});
