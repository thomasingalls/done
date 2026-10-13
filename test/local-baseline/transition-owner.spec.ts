import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from '../packaged-account/server';
import type { BaselineShadowResult } from '../../src/crdt/localBaselineShadow';

type Probe = {
  checkLocalBaseline(): Promise<BaselineShadowResult>;
  installLocalBaseline?(): Promise<{ kind: string }>;
  workspace: { whenDurable(): Promise<void> };
};
const check = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.checkLocalBaseline(),
  );
const durable = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.workspace.whenDurable(),
  );
const panel = (p: Page) => p.getByRole('region', { name: 'History maintenance', exact: true });
async function inspect(p: Page) {
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await panel(p).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel(p).getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
}

test(
  process.env['ACCOUNT_BASELINE_INSTALL'] === '1'
    ? 'anchored original/joined owners survive checkpoint and membership transitions and cold reopen'
    : 'real original/joined owners shadow checkpoint and membership transitions, then cold-open full history',
  async ({ page, browser }, info) => {
    const outDir = info.outputPath('build');
    let hits = 0;
    await build({
      logLevel: 'error',
      build: { outDir },
      define: {
        'import.meta.env.VITE_ACCOUNT_BASELINE_SHADOW': JSON.stringify('1'),
        ...(process.env['ACCOUNT_BASELINE_INSTALL'] === '1'
          ? { 'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1') }
          : {}),
      },
      plugins: [
        {
          name: 'private-baseline-test-handle',
          enforce: 'pre',
          transform(code, id) {
            if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
            const anchor = '  clearAccountTransition(result.accountId);';
            if (code.split(anchor).length !== 2) throw Error('Baseline test handle anchor changed');
            hits++;
            return code.replace(anchor, anchor + '\n  globalThis.__baselineOwner = result;');
          },
        },
      ],
    });
    expect(hits).toBe(1);
    const service = await startService(info.outputPath('service'), resolve(outDir), true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const thirdContext = await browser.newContext(),
      third = await thirdContext.newPage();
    try {
      pair = await pairedEditors(page, browser, true);
      const second = pair.second;
      for (const p of [page, second]) {
        await durable(p);
        await expect
          .poll(
            async () => {
              const r = await check(p);
              console.log(p === page ? 'original shadow' : 'joined shadow', r);
              return r.kind;
            },
            { timeout: 15000 },
          )
          .toBe('matched');
        expect(await check(p)).toMatchObject({ kind: 'matched', mode: 'continued' });
        if (process.env['ACCOUNT_BASELINE_INSTALL'] === '1') {
          expect(
            await p.evaluate(() =>
              (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner
                .installLocalBaseline!(),
            ),
          ).toEqual({ kind: 'installed' });
        }
      }
      await add(page, 'Retained baseline original writing');
      await expect(second.locator('.shell')).toContainText('Retained baseline original writing');
      await add(second, 'Retained baseline joined writing');
      await expect(page.locator('.shell')).toContainText('Retained baseline joined writing');
      for (const p of [page, second]) {
        await durable(p);
        expect(await check(p)).toMatchObject({ kind: 'matched', mode: 'continued' });
      }
      await inspect(page);
      await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
      await expect(panel(page)).toContainText(
        'Snapshot saved. Verify it from another approved device.',
      );
      await inspect(second);
      await panel(second).getByRole('button', { name: 'Verify history snapshot' }).click();
      await expect(panel(second)).toContainText('Verified snapshot 1 is saved.');
      for (const p of [page, second]) {
        await expect
          .poll(async () => await check(p), { timeout: 20000 })
          .toMatchObject({ kind: 'matched', mode: 'continued', historySequence: 1 });
      }
      // The joined owner starts another admission; the original owner remains open across it.
      await second.getByRole('button', { name: 'Devices', exact: true }).click();
      await second.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await unlock(second, pair.next.code);
      const link = await second.getByLabel('Device invitation link').inputValue();
      await pending(third, link, pair.next.auth);
      await compared(second, third);
      await expect
        .poll(() => check(page), { timeout: 20000 })
        .toMatchObject({
          kind: 'matched',
          mode: 'continued',
          authorityEpoch: 4,
        });
      // Cancellation is another authenticated epoch, not permission to reset the retained cut.
      await third.getByRole('button', { name: 'Cancel connection', exact: true }).click();
      await expect(
        third.getByRole('status').filter({ hasText: 'The connection was cancelled.' }),
      ).toBeVisible();
      await expect
        .poll(async () => await check(page), { timeout: 20000 })
        .toMatchObject({ kind: 'matched', mode: 'continued', authorityEpoch: 5 });
      await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await page.goto('/');
      await openSaved(page, pair.first.code);
      await expect(page.locator('.shell')).toContainText('Retained baseline joined writing');
      await expect.poll(async () => (await check(page)).kind).toBe('matched');
      expect(await check(page)).toMatchObject({ kind: 'matched', mode: 'continued' });
      // Both cold owners reauthenticate the installed anchor when enabled; full history remains the reference.
      await second.goto('/');
      await openSaved(second, pair.next.code, true);
      await expect(second.locator('.shell')).toContainText('Retained baseline original writing');
      await expect.poll(async () => (await check(second)).kind).toBe('matched');
    } catch (e) {
      console.log('Native shadow journey failed:', e instanceof Error ? e.message : 'unknown');
      throw e;
    } finally {
      await stopService(service);
      await thirdContext.close();
      await pair?.other.close();
    }
  },
);
