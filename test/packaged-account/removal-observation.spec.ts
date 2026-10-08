import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

test('live survivors retain rotation and removed devices reopen as writable detached copies', async ({
  page,
  browser,
}, info) => {
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
    // Both live old writers are retired by authenticated discovery, including proof-only terminal discovery.
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await expect(pair.second.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    console.log('Both observations retired their old editor');
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await third.goto('/');
    await openSaved(third, next.code, true);
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
