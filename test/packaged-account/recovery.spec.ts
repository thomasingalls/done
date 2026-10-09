import { test, expect } from '@playwright/test';
import { credentials, restoreAuthenticator, add, pairedEditors } from './devices';
import { startService, stopService } from './server';

test('packaged recovery resumes from the chooser and opens accepted writing with the existing passkey', async ({
  page,
  browser,
}, info) => {
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const replacement = await browser.newContext();
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
  } finally {
    await prior?.other.close();
    await replacement.close();
    await stopService(service);
  }
});
