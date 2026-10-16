import { test, expect } from '@playwright/test';
import { credentials, restoreAuthenticator, add, pairedEditors, openSaved } from './devices';
import { startService, stopService } from './server';
import { pending, compared, unlock, createdAccount } from '../device-enrollment/helpers';
import { DatabaseSync } from 'node:sqlite';

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
    const pair = await pairedEditors(page, browser, true, {
      beforeInvite: async () => {
        const accepted = page.waitForResponse(
          (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
          { timeout: 15000 },
        );
        await add(page, 'Uploaded before the first invitation');
        await accepted;
      },
    });
    prior = pair;
    const database = new DatabaseSync(info.outputPath('service/account.sqlite'), {
      readOnly: true,
    });
    try {
      const row = database.prepare('SELECT checkpoint FROM content_checkpoints').get() as {
        checkpoint: string;
      };
      expect(
        JSON.parse(row.checkpoint).heads.some((h: { position: number }) => h.position > 0),
      ).toBe(true);
    } finally {
      database.close();
    }
    await expect(pair.second.locator('.shell')).toContainText(
      'Uploaded before the first invitation',
    );
    const recovery = pair.first.recovery;
    const passkeys = await credentials(pair.first.auth);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();

    await next.goto('/');
    const nextAuth = await restoreAuthenticator(next, passkeys);
    let assertionCount = 0;
    nextAuth.cdp.on('WebAuthn.credentialAsserted', () => assertionCount++);
    await expect(next.locator('.shell')).toBeVisible();
    await next.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(next.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await next.getByRole('button', { name: 'Use another account', exact: true }).click();
    await next
      .getByRole('button', { name: 'Recover with a saved recovery code', exact: true })
      .click();
    await next.getByRole('button', { name: 'Use account passkey', exact: true }).click();
    await next.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await next.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(next.getByLabel('Recovery code', { exact: true })).toHaveValue(recovery);
    await next.getByRole('button', { name: 'Continue with recovery code', exact: true }).click();
    const code = (await next.getByLabel('Generated unlock code').textContent())!;
    await next.getByRole('button', { name: 'I saved my unlock code' }).click();
    await next.goBack();
    await expect(next.getByLabel('Generated unlock code')).toHaveText(code);
    await next.getByRole('button', { name: 'I saved my unlock code' }).click();
    await next.getByLabel('Unlock code', { exact: true }).fill(code);
    await next.getByRole('button', { name: 'Confirm unlock code', exact: true }).click();
    await expect(
      next.getByRole('heading', {
        name: 'Recover on this device and disconnect the previous devices',
      }),
    ).toBeVisible();
    expect(assertionCount).toBe(1);

    // A reload follows the slot URL into authenticated resume, never replays a URL transition.
    await next.reload();
    await next.getByLabel('Unlock code', { exact: true }).fill(code);
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
    await next.getByLabel('Unlock code', { exact: true }).fill(code);
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
      await next.getByLabel('Unlock code', { exact: true }).fill(code);
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
    // The replacement holds only generation two and starts before any history checkpoint.
    // Keep one edit out of the delivery ledger so only the newly admitted snapshot can recover it.
    let attempted = false;
    await third.route('**/account/delivery/submit', async (route) => {
      attempted = true;
      await route.abort();
    });
    await add(third, 'Retained only by the replacement history snapshot');
    await expect.poll(() => attempted).toBe(true);
    await third.getByRole('button', { name: 'History maintenance', exact: true }).click();
    const proposal = third.getByRole('region', { name: 'History maintenance', exact: true });
    await proposal.getByRole('button', { name: 'Check history', exact: true }).click();
    await proposal.getByRole('button', { name: 'Create history snapshot', exact: true }).click();
    await expect(proposal).toContainText(
      'Snapshot saved. Verify it from another approved device.',
      { timeout: 15000 },
    );
    await next.getByRole('button', { name: 'History maintenance', exact: true }).click();
    const verification = next.getByRole('region', { name: 'History maintenance', exact: true });
    await verification.getByRole('button', { name: 'Check history', exact: true }).click();
    await verification
      .getByRole('button', { name: 'Verify history snapshot', exact: true })
      .click();
    await expect(verification).toContainText('Verified snapshot 1 is saved.', { timeout: 15000 });
    await expect(next.locator('.shell')).toContainText(
      'Retained only by the replacement history snapshot',
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
    const secondCode = (await page.getByLabel('Generated unlock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my unlock code' }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(secondCode);
    await page.getByRole('button', { name: 'Confirm unlock code', exact: true }).click();
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
      'Retained only by the replacement history snapshot',
    );
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

test('a never-paired account recovers and admits its next device without an original handoff checkpoint', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const replacement = await browser.newContext();
  const later = await browser.newContext();
  const next = await replacement.newPage();
  const joining = await later.newPage();
  try {
    const first = await createdAccount(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const uploaded = page.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
      { timeout: 15000 },
    );
    await add(page, 'Uploaded without pairing');
    await uploaded;
    await page.context().setOffline(true);
    await add(page, 'Offline writing before pairing');
    const saved = await credentials(first.auth);
    const firstContext = page.context();
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.close();
    const reopened = await firstContext.newPage();
    await restoreAuthenticator(reopened, saved);
    await reopened.goto('/');
    await openSaved(reopened, first.code);
    await expect(reopened.locator('.shell')).toContainText('Offline writing before pairing');
    const resumed = reopened.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
      { timeout: 15000 },
    );
    await firstContext.setOffline(false);
    await resumed;
    // This edit must reach the server only inside the admitted history snapshot.
    const db = new DatabaseSync(info.outputPath('service/account.sqlite'), { readOnly: true });
    const count = () =>
      Number(db.prepare('SELECT count(*) AS n FROM delivery_decisions').get()!['n']);
    const acceptedBefore = count();
    let blocked = 0;
    await reopened.route('**/account/delivery/submit', async (route) => {
      blocked++;
      await route.abort();
    });
    try {
      await add(reopened, 'Saved only in the history snapshot');
      await expect.poll(() => blocked).toBeGreaterThan(0);
      await reopened.getByRole('button', { name: 'History maintenance', exact: true }).click();
      const history = reopened.getByRole('region', { name: 'History maintenance', exact: true });
      await history.getByRole('button', { name: 'Check history', exact: true }).click();
      await history.getByRole('button', { name: 'Create history snapshot', exact: true }).click();
      await expect(history).toContainText('Verified snapshot 1 is saved.', { timeout: 15000 });
      await history.getByRole('button', { name: 'Create history snapshot', exact: true }).click();
      await expect(history).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
      await history.getByRole('button', { name: 'Prune covered history', exact: true }).click();
      await expect(history).toContainText('Covered service history removed.', { timeout: 15000 });
      expect(
        Number(
          db
            .prepare(
              "SELECT count(*) AS n FROM delivery_decisions WHERE substr(CAST(submission AS TEXT),1,1)='{'",
            )
            .get()!['n'],
        ),
      ).toBeGreaterThan(0);
      expect(count()).toBe(acceptedBefore);
    } finally {
      db.close();
    }
    await reopened.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await next.goto('/accounts');
    const auth = await restoreAuthenticator(next, saved);
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
    await expect(next.locator('.shell')).toBeVisible({ timeout: 30000 });
    await expect(next.locator('.shell')).toContainText('Uploaded without pairing');
    await expect(next.locator('.shell')).toContainText('Offline writing before pairing');
    await expect(next.locator('.shell')).toContainText('Saved only in the history snapshot');
    const sent = next.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.ok(),
    );
    await add(next, 'Writing after first-device-only recovery');
    await sent;
    // This owner holds only generation two. Its recovery intent must establish the older
    // snapshot and handoff coverage before it can produce a new current-key snapshot.
    await next.getByRole('button', { name: 'History maintenance', exact: true }).click();
    const history = next.getByRole('region', { name: 'History maintenance', exact: true });
    await history.getByRole('button', { name: 'Check history', exact: true }).click();
    await history.getByRole('button', { name: 'Create history snapshot', exact: true }).click();
    await expect(history).toContainText('Verified snapshot 3 is saved.', { timeout: 15000 });
    await next.getByRole('button', { name: 'Devices', exact: true }).click();
    await next.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(next, code);
    await pending(joining, await next.getByLabel('Device invitation link').inputValue(), auth);
    const comparison = await compared(next, joining);
    await next.getByLabel('Code on the new device').fill(comparison);
    await next.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await joining
      .getByRole('button', { name: 'Open your writing', exact: true })
      .click({ timeout: 20000 });
    await expect(joining.locator('.shell')).toContainText(
      'Writing after first-device-only recovery',
    );
    await expect(joining.locator('.shell')).toContainText('Saved only in the history snapshot');
  } finally {
    try {
      await Promise.allSettled([later.close(), replacement.close()]);
    } finally {
      await stopService(service);
    }
  }
});
