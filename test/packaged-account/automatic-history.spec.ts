import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createdAccount } from '../device-enrollment/helpers';
import { openMenuSection } from '../geometry/openApp';
import { add, openSaved, pairedEditors } from './devices';
import { startService, stopService } from './server';

let app: string;
test.beforeAll(async ({ browserName }, info) => {
  expect(browserName).toBe('chromium');
  app = info.outputPath('automatic-history-app');
  let hits = 0;
  await build({
    configFile: resolve('vite.config.ts'),
    mode: 'test',
    logLevel: 'error',
    define: { 'import.meta.env.VITE_ACCOUNT_HISTORY_AUTO': JSON.stringify('1') },
    plugins: [
      {
        name: 'automatic-history-growth-only',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/src/account/automaticHistoryMaintenance.ts')) return;
          const needle = 'SERVICE_HISTORY_MIN_RECORDS = 1024;';
          expect(code.split(needle)).toHaveLength(2);
          hits++;
          return code
            .replace(needle, 'SERVICE_HISTORY_MIN_RECORDS = 1;')
            .replace(
              'const value = options.observe(),',
              'const value = (globalThis as any).__historyObservation = options.observe(),',
            )
            .replace(
              'history = answer;',
              'history = answer; (globalThis as any).__historyAnswer = answer;',
            )
            .replace(
              '} catch (cause) {',
              '} catch (cause) { (globalThis as any).__historyFailure = String(cause);',
            );
        },
      },
    ],
    build: { outDir: app, emptyOutDir: true },
  });
  expect(hits).toBe(1);
});
const panel = (page: Page) =>
  page.getByRole('region', { name: 'History maintenance', exact: true });
async function inspect(page: Page) {
  await openMenuSection(page, 'Data');
  await page.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: 'Check history', exact: true }),
  ).toBeEnabled();
}
const count = (db: DatabaseSync, admitted: boolean) =>
  Number(
    db
      .prepare(
        `SELECT count(*) AS n FROM history_checkpoint_records WHERE admission IS ${admitted ? 'NOT ' : ''}NULL`,
      )
      .get()!['n'],
  );

test('experimental scoped owner creates once, coordinates manual work, prunes two snapshots and reopens offline', async ({
  page,
}, info) => {
  const state = info.outputPath('service'),
    service = await startService(state, app, true, true);
  const actions: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/account/history/v1/checkpoint'))
      actions.push(r.postDataJSON().action as string);
  });
  const db = new DatabaseSync(resolve(state, 'account.sqlite'), { readOnly: true });
  try {
    const first = await createdAccount(page);
    await add(page, 'Automatic service snapshot writing');
    try {
      await expect.poll(() => count(db, true), { timeout: 45000 }).toBe(1);
    } catch (cause) {
      console.log(
        'Automatic diagnostic',
        await page.evaluate(() => {
          const x = window as unknown as {
            __historyObservation: unknown;
            __historyAnswer: unknown;
            __historyFailure: unknown;
          };
          return {
            observation: x.__historyObservation,
            answer: x.__historyAnswer,
            failure: x.__historyFailure,
          };
        }),
        actions,
      );
      throw cause;
    }
    expect(actions).toContain('publish');
    expect(actions).toContain('admit');
    expect(actions).not.toContain('prune');
    await add(page, 'Manual second snapshot writing');
    await inspect(page);
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    await panel(page).getByRole('button', { name: 'Create history snapshot', exact: true }).click();
    await expect(panel(page)).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
    await expect.poll(() => actions.includes('prune'), { timeout: 45000 }).toBe(true);
    expect(count(db, true)).toBe(2);
    expect(actions).not.toContain('discard');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.context().setOffline(true);
    await page.goto('/');
    await openSaved(page, first.code);
    await expect(page.locator('.shell')).toContainText('Automatic service snapshot writing');
    await expect(page.locator('.shell')).toContainText('Manual second snapshot writing');
    expect(actions.filter((v) => v === 'publish')).toHaveLength(2);
  } finally {
    db.close();
    await page.context().setOffline(false);
    await stopService(service);
  }
});

test('a multi-device proposal waits, then the independent native peer admits it automatically', async ({
  page,
  browser,
}, info) => {
  const state = info.outputPath('service'),
    service = await startService(state, app, true, true);
  const db = new DatabaseSync(resolve(state, 'account.sqlite'), { readOnly: true });
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async (second) => {
        const hidden = () => {
          const state = { hidden: true };
          Object.defineProperty(window, '__historyVisibility', { value: state });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => (state.hidden ? 'hidden' : 'visible'),
          });
        };
        await second.addInitScript(hidden);
        await second.evaluate(hidden);
      },
    });
    await expect.poll(() => count(db, false), { timeout: 45000 }).toBe(1);
    // A producer cannot admit while the independent peer is hidden.
    expect(count(db, true)).toBe(0);
    await pair.second.evaluate(() => {
      (
        window as unknown as { __historyVisibility: { hidden: boolean } }
      ).__historyVisibility.hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => count(db, true), { timeout: 45000 }).toBeGreaterThanOrEqual(1);
    const row = db
      .prepare(
        'SELECT checkpoint,admission FROM history_checkpoint_records WHERE admission IS NOT NULL ORDER BY sequence LIMIT 1',
      )
      .get()!;
    const producer = JSON.parse(row['checkpoint'] as string).manifest.producer;
    const admitting = JSON.parse(row['admission'] as string).admittingCredential;
    expect(admitting).not.toBe(producer);
    await add(page, 'Two-way writing after automatic admission');
    await expect(pair.second.locator('.shell')).toContainText(
      'Two-way writing after automatic admission',
      { timeout: 15000 },
    );
    await add(pair.second, 'Peer writing after automatic admission');
    await expect(page.locator('.shell')).toContainText('Peer writing after automatic admission', {
      timeout: 15000,
    });
  } finally {
    db.close();
    await pair?.other.close();
    await stopService(service);
  }
});
