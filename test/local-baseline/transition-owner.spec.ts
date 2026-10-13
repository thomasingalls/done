import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
// @ts-expect-error Shared native test instrumentation is JavaScript.
import { baselineReadProbe } from './read-probe.mjs';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from '../packaged-account/server';
import type { AdmittedWorkspace } from '../../src/crdt/admittedWorkspace';
import type { BaselineShadowResult } from '../../src/crdt/localBaselineShadow';

type Probe = {
  checkLocalBaseline(): Promise<BaselineShadowResult>;
  installLocalBaseline?(): Promise<{ kind: string }>;
  advanceLocalRetention?(expectedRevision: number): Promise<{ kind: string }>;
  replaceLocalBaseline?(expectedRevision: number): Promise<{ kind: string }>;
  dryRunLocalRetention?(): Promise<{ kind: string; previousRevision?: number; survivors?: number }>;
  workspace: Pick<AdmittedWorkspace, 'whenDurable' | 'command'>;
  dbName: string;
};
const check = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.checkLocalBaseline(),
  );
const plan = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.dryRunLocalRetention!(),
  );
const durable = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.workspace.whenDurable(),
  );
// Exact physical prefix evidence; the test never removes a row to manufacture a reduced read.
const physicalHistory = (page: Page) =>
  page.evaluate(async () => {
    const name = (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner.dbName;
    const db = await new Promise<IDBDatabase>((yes, no) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise<[string, string][]>((yes, no) => {
        const stores = ['content', 'outbound', 'heads'],
          tx = db.transaction(stores, 'readonly');
        const rows: [string, string][] = [];
        for (const name of stores) {
          const store = tx.objectStore(name),
            keys = store.getAllKeys(),
            values = store.getAll();
          values.onsuccess = () =>
            values.result.forEach((v, i) =>
              rows.push([
                name + ':' + keys.result[i],
                JSON.stringify(v, (_k, value) =>
                  value instanceof Uint8Array ? [...value] : value,
                ),
              ]),
            );
        }
        tx.oncomplete = () => yes(rows);
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  });
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
        ...(process.env['ACCOUNT_BASELINE_READ'] === '1'
          ? { 'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify('1') }
          : {}),
        'import.meta.env.VITE_ACCOUNT_BASELINE_SHADOW': JSON.stringify('1'),
        ...(process.env['ACCOUNT_BASELINE_INSTALL'] === '1'
          ? { 'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1') }
          : {}),
      },
      plugins: [
        ...(process.env['ACCOUNT_BASELINE_READ'] === '1' ? [baselineReadProbe()] : []),
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
      const retained = await Promise.all([page, second].map(physicalHistory));
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
          // A matched shadow does not drain a concurrently prepared receive promotion.
          // Wait for this existing benign refusal rather than weakening the owner's fence.
          await expect
            .poll(
              async () => {
                const r = await p.evaluate(() =>
                  (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner
                    .installLocalBaseline!(),
                );
                if (r.kind === 'skipped')
                  expect(r).toEqual({ kind: 'skipped', reason: 'pending-promotion' });
                return r;
              },
              { timeout: 15000 },
            )
            .toEqual({ kind: 'installed' });
          expect(
            await p.evaluate(() =>
              (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner
                .advanceLocalRetention!(1),
            ),
          ).toEqual({ kind: 'replaced' });
        }
      }
      if (process.env['ACCOUNT_BASELINE_READ'] === '1')
        for (const p of [page, second]) {
          await expect
            .poll(() => plan(p), { timeout: 15000 })
            .toMatchObject({ kind: 'planned', previousRevision: 2, survivors: 0 });
        }
      await add(page, 'Retained baseline original writing');
      await expect(second.locator('.shell')).toContainText('Retained baseline original writing');
      await add(second, 'Retained baseline joined writing');
      await expect(page.locator('.shell')).toContainText('Retained baseline joined writing');
      await second.evaluate(async () => {
        await (
          globalThis as unknown as { __baselineOwner: Probe }
        ).__baselineOwner.workspace.command({ kind: 'undo' }).accepted;
      });
      await expect(second.locator('.shell')).not.toContainText('Retained baseline joined writing');
      await expect(second.locator('.shell')).toContainText('Retained baseline original writing');
      await second.evaluate(async () => {
        await (
          globalThis as unknown as { __baselineOwner: Probe }
        ).__baselineOwner.workspace.command({ kind: 'redo' }).accepted;
      });
      await expect(second.locator('.shell')).toContainText('Retained baseline joined writing');
      for (const p of [page, second]) {
        await durable(p);
        expect(await check(p)).toMatchObject({ kind: 'matched', mode: 'continued' });
      }
      await inspect(page);
      await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
      await expect(panel(page)).toContainText(
        'Snapshot saved. Verify it from another approved device.',
      );
      if (process.env['ACCOUNT_BASELINE_INSTALL'] === '1') {
        expect(
          await page.evaluate(() =>
            (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner
              .advanceLocalRetention!(2),
          ),
        ).toEqual({ kind: 'skipped', reason: 'durable-attempt' });
      }
      if (process.env['ACCOUNT_BASELINE_READ'] === '1')
        expect(await plan(page)).toEqual({ kind: 'skipped', reason: 'durable-attempt' });
      await inspect(second);
      await panel(second).getByRole('button', { name: 'Verify history snapshot' }).click();
      await expect(panel(second)).toContainText('Verified snapshot 1 is saved.');
      // The producer still retains its exact attempt after the other device admitted it.
      // Finish through the existing authenticated retry; retention must never clear it itself.
      await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
      await panel(page)
        .getByRole('button', { name: 'Resume history snapshot', exact: true })
        .click();
      await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
      for (const p of [page, second]) {
        await expect
          .poll(async () => await check(p), { timeout: 20000 })
          .toMatchObject({ kind: 'matched', mode: 'continued', historySequence: 1 });
      }
      if (process.env['ACCOUNT_BASELINE_INSTALL'] === '1') {
        for (const p of [page, second]) {
          expect(
            await p.evaluate(() =>
              (globalThis as unknown as { __baselineOwner: Probe }).__baselineOwner
                .advanceLocalRetention!(2),
            ),
          ).toEqual({ kind: 'replaced' });
        }
      }
      if (process.env['ACCOUNT_BASELINE_READ'] === '1')
        for (const p of [page, second]) {
          await expect
            .poll(() => plan(p), { timeout: 15000 })
            .toMatchObject({ kind: 'planned', previousRevision: 3, survivors: 0 });
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
      for (const [index, p] of [page, second].entries()) {
        const after = new Map(await physicalHistory(p));
        for (const [key, value] of retained[index]!) expect(after.get(key)).toBe(value);
      }
      if (process.env['ACCOUNT_BASELINE_READ'] === '1') {
        for (const p of [page, second]) {
          const reads = await p.evaluate(
            () =>
              (
                globalThis as unknown as {
                  baselineReadSamples: { physical: number; logical: number; firstSuffix: number }[];
                }
              ).baselineReadSamples,
          );
          expect(reads.length).toBeGreaterThanOrEqual(2); // cold classification and live recovery
          expect(reads.every((r) => r.logical < r.physical && r.firstSuffix > 1)).toBe(true);
        }
      }
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
