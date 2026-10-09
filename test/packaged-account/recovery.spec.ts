import { test, expect } from '@playwright/test';
import { credentials, restoreAuthenticator, add, pairedEditors, openSaved } from './devices';
import { startService, stopService } from './server';
import { pending, compared, unlock } from '../device-enrollment/helpers';

test('packaged recovery resumes, detaches old devices and supports enrollment, rotation and recovery again', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const replacement = await browser.newContext();
  const subsequent = await browser.newContext();
  const third = await subsequent.newPage();
  const next = await replacement.newPage();
  next.setDefaultTimeout(15000);
  let prior: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    const pair = await pairedEditors(page, browser, true);
    prior = pair;
    const recovery = pair.first.recovery;
    const passkeys = await credentials(pair.first.auth);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();

    await next.goto('/');
    const nextAuth = await restoreAuthenticator(next, passkeys);
    let assertionCount = 0;
    nextAuth.cdp.on('WebAuthn.credentialAsserted', () => assertionCount++);
    await next.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await next.getByRole('button', { name: 'Use another account', exact: true }).click();
    await next
      .getByRole('button', { name: 'Recover with a saved recovery code', exact: true })
      .click();
    await next.getByRole('button', { name: 'Use account passkey', exact: true }).click();
    await next.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await next.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(next.getByLabel('Recovery code', { exact: true })).toHaveValue(recovery);
    await next.getByRole('button', { name: 'Continue with recovery code', exact: true }).click();
    const code = (await next.getByLabel('Generated device-lock code').textContent())!;
    await next.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await next.goBack();
    await expect(next.getByLabel('Generated device-lock code')).toHaveText(code);
    await next.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await next.getByLabel('Device-lock code', { exact: true }).fill(code);
    await next.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
    await expect(
      next.getByRole('heading', {
        name: 'Recover on this device and disconnect the previous devices',
      }),
    ).toBeVisible();
    expect(assertionCount).toBe(1);

    // A reload follows the slot URL into authenticated resume, never replays a URL transition.
    await next.reload();
    await next.getByLabel('Device-lock code', { exact: true }).fill(code);
    await next.getByRole('button', { name: 'Unlock saved recovery', exact: true }).click();
    await next
      .getByRole('button', {
        name: 'Recover on this device and disconnect the previous devices',
        exact: true,
      })
      .click();
    await expect(next.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 30000,
    });
    expect(assertionCount).toBe(2); // Real restart discarded the one-use opening.
    const sent = next.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
    );
    await add(next, 'Writing from the recovered device');
    await sent;
    await next.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await next.getByRole('button', { name: /^Open saved recovery, account/ }).click();
    await next.getByLabel('Device-lock code', { exact: true }).fill(code);
    await next.getByRole('button', { name: 'Unlock saved recovery', exact: true }).click();
    await next.getByRole('button', { name: 'Open recovered writing', exact: true }).click();
    await expect(next.locator('.shell')).toContainText('Writing from the recovered device');
    await next.getByRole('button', { name: 'Devices', exact: true }).click();
    await expect(
      next.getByRole('button', { name: 'Connect another device', exact: true }),
    ).toBeEnabled();
    await next.getByRole('button', { name: 'Back to writing', exact: true }).click();
    await next.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await next.screenshot({ path: info.outputPath('recovery-chooser.png') });
    for (const [old, oldCode, joined] of [
      [page, pair.first.code, false],
      [pair.second, pair.next.code, true],
    ] as const) {
      await old.goto('/');
      await openSaved(old, oldCode, joined);
      await expect(old.locator('.shell')).toHaveCount(0, { timeout: 25000 });
      await expect(
        old.getByText('This device was removed from the account.', { exact: false }),
      ).toBeVisible();
      await old.goto('/');
      await openSaved(old, oldCode, joined);
      await expect(old.getByText('Removed from account.', { exact: false })).toBeVisible();
      await expect(old.locator('.shell')).toContainText('Keep the first device writing');
      await expect(old.locator('.shell')).not.toContainText('Writing from the recovered device');
      const requests: string[] = [];
      old.on('request', (r) => {
        if (/\/account\/(delivery|notifications)\//.test(r.url())) requests.push(r.url());
      });
      await add(old, 'Writing in this detached copy');
      await old.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await old.goto('/');
      await openSaved(old, oldCode, joined);
      await expect(old.locator('.shell')).toContainText('Writing in this detached copy');
      expect(requests).toEqual([]);
      await old.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    }
    const openRecovered = async () => {
      await next.goto('/accounts');
      await next.getByRole('button', { name: /^Open saved recovery, account/ }).click();
      await next.getByLabel('Device-lock code', { exact: true }).fill(code);
      await next.getByRole('button', { name: 'Unlock saved recovery', exact: true }).click();
      await next.getByRole('button', { name: 'Open recovered writing', exact: true }).click();
      await expect(next.locator('.shell')).toBeVisible();
    };
    await openRecovered();
    await next.getByRole('button', { name: 'Devices', exact: true }).click();
    await next.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(next, code);
    await pending(third, await next.getByLabel('Device invitation link').inputValue(), nextAuth);
    const comparison = await compared(next, third);
    await next.getByLabel('Code on the new device').fill(comparison);
    await next.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await third
      .getByRole('button', { name: 'Open your writing', exact: true })
      .click({ timeout: 30000 });
    await expect(third.locator('.shell')).toContainText('Writing from the recovered device');
    await expect(next.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await next.getByRole('link', { name: 'Close and return to accounts' }).click();
    await openRecovered();
    await add(third, 'Writing from a device enrolled after recovery');
    await expect(next.locator('.shell')).toContainText(
      'Writing from a device enrolled after recovery',
      { timeout: 15000 },
    );
    // A subsequent key rotation must keep the existing saved recovery code useful.
    await next.getByRole('button', { name: 'Devices', exact: true }).click();
    await next.getByRole('button', { name: 'Remove device', exact: true }).click();
    await next.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(next.getByText('The device was removed.', { exact: false })).toBeVisible({
      timeout: 20000,
    });
    await openRecovered();
    const rotated = next.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
    );
    await add(next, 'Writing after recovery and rotation');
    await rotated;
    await next.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    // Use the original browser, which still holds its separate detached local slot.
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await page
      .getByRole('button', { name: 'Recover with a saved recovery code', exact: true })
      .click();
    await page.getByRole('button', { name: 'Use account passkey', exact: true }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await page.getByRole('button', { name: 'Continue with recovery code', exact: true }).click();
    const secondCode = (await page.getByLabel('Generated device-lock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(secondCode);
    await page.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Recover on this device and disconnect the previous devices',
        exact: true,
      })
      .click();
    await expect(page.locator('.shell')).toContainText('Writing after recovery and rotation', {
      timeout: 30000,
    });
    await expect(page.locator('.shell')).toContainText(
      'Writing from a device enrolled after recovery',
    );
    await expect(page.locator('.shell')).not.toContainText('Writing in this detached copy');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Unlock Device owner/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Open saved recovery, account/ })).toHaveCount(
      1,
    );
  } finally {
    await subsequent.close();
    await prior?.other.close();
    await replacement.close();
    await stopService(service);
  }
});
