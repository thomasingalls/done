import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

test('an offline device resumes two missed rotations in order and delivers its old-generation writing', async ({
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
    fourthContext = await browser.newContext();
  const third = await thirdContext.newPage(),
    fourth = await fourthContext.newPage();
  for (const p of [third, fourth]) p.setDefaultTimeout(15000);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const connect = async (owner: Page, code: string, joining: Page) => {
      await owner.getByRole('button', { name: 'Devices', exact: true }).click();
      await owner.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await unlock(owner, code);
      const next = await pending(
        joining,
        await owner.getByLabel('Device invitation link').inputValue(),
        pair!.next.auth,
      );
      await expect
        .poll(
          async () => {
            for (const p of [owner, joining]) {
              if (
                await p
                  .getByText('The account service is busy. Saved progress can be retried.', {
                    exact: true,
                  })
                  .isVisible()
              ) {
                const retry = p.getByRole('button', { name: 'Check again', exact: true });
                if (await retry.isEnabled()) await retry.click();
              }
            }
            return owner.getByLabel('Code on the new device').isVisible();
          },
          { timeout: 45000, intervals: [2000] },
        )
        .toBe(true);
      const comparison = await compared(owner, joining);
      await owner.getByLabel('Code on the new device').fill(comparison);
      await owner.getByRole('button', { name: 'Compare and approve', exact: true }).click();
      await joining
        .getByRole('button', { name: 'Open your writing', exact: true })
        .click({ timeout: 30000 });
      await expect(owner.getByText('The device is connected.', { exact: false })).toBeVisible({
        timeout: 30000,
      });
      await owner.getByRole('link', { name: 'Close and return to accounts' }).click();
      return next;
    };
    const three = await connect(pair.second, pair.next.code, third);
    const four = await connect(third, three.code, fourth);
    await add(fourth, 'Four devices before rotation');
    await expect(page.locator('.shell')).toContainText('Four devices before rotation', {
      timeout: 20000,
    });
    const targets: string[] = [];
    for (const [p, code] of [
      [pair.second, pair.next.code],
      [third, three.code],
    ] as const) {
      await p.goto('/');
      await p.evaluate(chunk.code);
      targets.push(
        await p.evaluate(
          async (code) =>
            window.MembershipCustody.participant(
              'joined',
              await window.MembershipCustody.accountSlot(),
              code,
            ),
          code,
        ),
      );
    }
    await fourthContext.setOffline(true);
    await add(fourth, 'Offline across two membership rotations');
    for (const [i, target] of targets.entries()) {
      await page.getByRole('button', { name: 'Devices', exact: true }).click();
      const row = page
        .locator('.account-device-list li')
        .filter({ hasText: 'Device ' + target.slice(0, 8) });
      await row.getByRole('button', { name: 'Remove device', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
      await expect(
        page.getByText(/^(The device was removed\.|Device removal is saved but not confirmed\.)/),
      ).toBeVisible({ timeout: 25000 });
      await expect(page.locator('.shell')).toHaveCount(0, { timeout: 25000 });
      await page.goto('/');
      await openSaved(page, pair.first.code);
      await page.getByRole('button', { name: 'Devices', exact: true }).click();
      await expect(page.locator('.account-device-list li')).toHaveCount(3 - i);
      await page.getByRole('button', { name: 'Back to writing', exact: true }).click();
      console.log('Repeated UI removal completed', i + 1);
    }
    await fourthContext.setOffline(false);
    await expect(fourth.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await fourth.goto('/');
    await openSaved(fourth, four.code, true);
    await expect(fourth.locator('.shell')).toContainText('Offline across two membership rotations');
    await expect(page.locator('.shell')).toContainText('Offline across two membership rotations', {
      timeout: 20000,
    });
    await add(page, 'Current generation after skipped rotations');
    await expect(fourth.locator('.shell')).toContainText(
      'Current generation after skipped rotations',
      { timeout: 20000 },
    );
    await add(fourth, 'Rejoined survivor sends generation three');
    await expect(page.locator('.shell')).toContainText('Rejoined survivor sends generation three', {
      timeout: 20000,
    });
    await fourth.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await fourth.goto('/');
    await openSaved(fourth, four.code, true);
    await expect(fourth.locator('.shell')).toContainText(
      'Rejoined survivor sends generation three',
    );
  } finally {
    await pair?.other.close();
    await thirdContext.close();
    await fourthContext.close();
    await stopService(service);
  }
});
