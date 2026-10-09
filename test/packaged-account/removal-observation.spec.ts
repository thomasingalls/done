import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

test('an offline survivor retains old-generation writing through rotation while the removed device becomes a detached copy', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const built = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-membership/custody-entry.ts'),
        name: 'MembershipCustody',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(built) ? built[0]! : built;
  if (!('output' in result)) throw Error('No probe');
  const chunk = result.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('No probe');
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const thirdContext = await browser.newContext(),
    third = await thirdContext.newPage();
  third.setDefaultTimeout(15000);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    page.on('response', async (r) => {
      if (r.url().includes('/removal/') && r.status() !== 200)
        console.log('Removal refusal', r.status(), await r.json().catch(() => ({})));
    });
    pair = await pairedEditors(page, browser, true);
    pair.second.setDefaultTimeout(15000);
    await pair.second.getByRole('button', { name: 'Devices', exact: true }).click();
    await pair.second.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(pair.second, pair.next.code);
    const link = await pair.second.getByLabel('Device invitation link').inputValue();
    const next = await pending(third, link, pair.next.auth);
    const comparison = await compared(pair.second, third);
    await pair.second.getByLabel('Code on the new device').fill(comparison);
    await pair.second.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await third
      .getByRole('button', { name: 'Open your writing', exact: true })
      .click({ timeout: 30000 });
    await expect(pair.second.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await pair.second.getByRole('link', { name: 'Close and return to accounts' }).click();
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await add(pair.second, 'Writing before this device is removed');
    for (const p of [page, third])
      await expect(p.locator('.shell')).toContainText('Writing before this device is removed', {
        timeout: 20000,
      });
    // Read only a native device identifier before reopening its live editor.
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.goto('/');
    await pair.second.evaluate(chunk.code);
    const target = await pair.second.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'joined',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      pair.next.code,
    );
    await openSaved(pair.second, pair.next.code, true);
    await thirdContext.setOffline(true);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await page.evaluate(chunk.code);
    const slot = await page.evaluate(() => window.MembershipCustody.accountSlot());
    let removal = await page.evaluate(
      ({ slot, code, target }) => window.MembershipCustody.removal('promotion', slot, code, target),
      { slot, code: pair.first.code, target },
    );
    console.log(
      'Removal stage',
      removal.result,
      removal.after.progress?.request.epoch,
      !!removal.after.progress?.preparation,
      !!removal.after.progress?.rotation,
      !!removal.after.successor,
    );
    await expect
      .poll(
        async () => {
          if (removal.result === 'pending')
            removal = await page.evaluate(
              ({ slot, code, target }) =>
                window.MembershipCustody.removal('promotion', slot, code, target),
              { slot, code: pair!.first.code, target },
            );
          return removal.result;
        },
        { timeout: 20000, intervals: [2000] },
      )
      .toBe('applying');
    // This device has not observed the successor: its genuine offline generation-one work remains valid.
    await add(third, 'Offline survivor writing after removal');
    await expect(pair.second.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await thirdContext.setOffline(false);
    // Both old writers retire only after authenticated discovery (terminal proof for the removed one).
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    console.log('Both observations retired their old editor');
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.locator('.shell')).toContainText('Offline survivor writing after removal');
    await expect(page.locator('.shell')).toContainText('Offline survivor writing after removal', {
      timeout: 20000,
    });
    await add(page, 'Survivor generation two travels after passive activation');
    await expect(third.locator('.shell')).toContainText(
      'Survivor generation two travels after passive activation',
      { timeout: 20000 },
    );
    await add(third, 'Passive survivor replies with generation two');
    await expect(page.locator('.shell')).toContainText(
      'Passive survivor replies with generation two',
      { timeout: 20000 },
    );
    for (const [p, code, joining] of [
      [page, pair.first.code, false],
      [third, next.code, true],
    ] as const) {
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await openSaved(p, code, joining);
      await expect(p.locator('.shell')).toContainText(
        'Passive survivor replies with generation two',
      );
      await expect(p.locator('.workspace-status')).toHaveCount(0);
    }
    // A second removal keeps the generation-two opener while its replacement pointer is pending.
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await third.goto('/');
    await third.evaluate(chunk.code);
    const secondTarget = await third.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'joined',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      next.code,
    );
    await openSaved(third, next.code, true);
    await thirdContext.setOffline(true);
    await add(third, 'Second removed device keeps its offline generation-two writing');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await page.evaluate(chunk.code);
    const laterArgs = { slot, code: pair.first.code, target: secondTarget };
    const laterJournal = await page.evaluate(
      ({ slot, code }) => window.MembershipCustody.journalOnly('promotion', slot, code),
      laterArgs,
    );
    let later = await page.evaluate(
      ({ slot, code, target }) =>
        window.MembershipCustody.removal('promotion', slot, code, target, true),
      laterArgs,
    );
    expect(later.result).toBe('pending');
    expect(later.after.previous).toHaveLength(1);
    expect(later.after.previous![0]!.generation).toBe(2);
    await page.reload();
    await page.evaluate(chunk.code);
    await expect
      .poll(
        async () => {
          later = await page.evaluate(
            ({ slot, code, target }) =>
              window.MembershipCustody.removal('promotion', slot, code, target),
            laterArgs,
          );
          return later.result;
        },
        { timeout: 20000, intervals: [2000] },
      )
      .toBe('applying');
    expect(later.after.successor!.epoch.generation).toBe(3);
    expect(
      await page.evaluate(
        ({ slot, code }) => window.MembershipCustody.activateRemoval('promotion', slot, code, true),
        laterArgs,
      ),
    ).toEqual({ generation: 0, head: 'interrupted' });
    await page.reload();
    await page.evaluate(chunk.code);
    expect(
      await page.evaluate(
        ({ slot, code }) => window.MembershipCustody.activateRemoval('promotion', slot, code),
        laterArgs,
      ),
    ).toEqual({ generation: 3, head: later.after.successor!.head });
    expect(await page.evaluate((key) => localStorage.getItem(key), laterJournal)).toBeNull();
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await add(page, 'Generation three survives two rotations');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await expect(page.locator('.shell')).toContainText('Generation three survives two rotations');
    await thirdContext.setOffline(false);
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.getByText('Removed from account.', { exact: false })).toBeVisible();
    await expect(third.locator('.shell')).toContainText(
      'Second removed device keeps its offline generation-two writing',
    );
    await expect(third.locator('.shell')).not.toContainText(
      'Generation three survives two rotations',
    );
    await add(third, 'Detached generation two can still edit');
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.locator('.shell')).toContainText('Detached generation two can still edit');
    const networkWrites: string[] = [];
    pair.second.on('request', (r) => {
      if (r.url().includes('/account/delivery/') || r.url().includes('/notifications/'))
        networkWrites.push(r.url());
    });
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Writing before this device is removed',
    );
    await expect(pair.second.locator('.shell')).not.toContainText(
      'Survivor generation two travels after passive activation',
    );
    await expect(pair.second.getByText('Removed from account.', { exact: false })).toBeVisible();
    await add(pair.second, 'Writing retained only in this detached copy');
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Writing retained only in this detached copy',
    );
    expect(networkWrites).toEqual([]);
    await expect(page.locator('.shell')).not.toContainText(
      'Writing retained only in this detached copy',
    );
  } finally {
    for (const p of [pair?.second, third])
      if (p && !p.isClosed())
        console.log(
          'Secondary messages',
          await p.locator('[role=alert], [role=status]').allTextContents(),
        );
    await pair?.other.close();
    await thirdContext.close();
    await stopService(service);
  }
});
