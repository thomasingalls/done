import { openMenuSection } from '../geometry/openApp';
import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { historyHandoffProbe, historyDuringReceive } from './history-handoff';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { startService, stopService } from '../packaged-account/server';
import type { AdmittedWorkspace } from '../../src/crdt/admittedWorkspace';

type Owner = {
  removeLocalHistory(revision: number): Promise<{ kind: string; revision?: number }>;
  workspace: Pick<AdmittedWorkspace, 'whenDurable' | 'command' | 'status'>;
};
const removal = (p: Page, revision: number) =>
  p.evaluate(async (r) => {
    const owner = (globalThis as unknown as { __retentionOwner: Owner }).__retentionOwner;
    try {
      return await owner.removeLocalHistory(r);
    } catch (e) {
      if (
        e instanceof Error &&
        e.message === 'Receive authority was superseded' &&
        owner.workspace.status.state === 'active'
      )
        return { kind: 'retired-flight' };
      throw e;
    }
  }, revision);
const panel = (p: Page) => p.getByRole('region', { name: 'History maintenance', exact: true });
async function inspect(p: Page) {
  await openMenuSection(p, 'Data');
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await panel(p).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel(p).getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
}
test('reduced original and joined owners exchange/undo writing, refuse an unfinished checkpoint cut, then retain its installation through another cut and cold open', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const outDir = info.outputPath('build');
  let hits = 0;
  await build({
    logLevel: 'error',
    build: { outDir },
    define: {
      'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_RETENTION': JSON.stringify('1'),
    },
    plugins: [
      historyHandoffProbe(),
      {
        name: 'private-retention-checkpoint',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
          const at = '  clearAccountTransition(result.accountId);';
          if (code.split(at).length !== 2) throw Error('Owner test anchor changed');
          hits++;
          return code.replace(at, at + '\n  globalThis.__retentionOwner = result;');
        },
      },
    ],
  });
  expect(hits).toBe(1);
  const service = await startService(info.outputPath('service'), resolve(outDir), true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    for (const p of [page, second])
      await expect
        .poll(() => removal(p, 0), { timeout: 20000 })
        .toMatchObject({ kind: 'removed', revision: 1 });
    await add(page, 'Original writing after actual removal');
    await expect(second.locator('.shell')).toContainText('Original writing after actual removal');
    await add(second, 'Joined writing after actual removal');
    await expect(page.locator('.shell')).toContainText('Joined writing after actual removal');
    for (const kind of ['undo', 'redo'] as const) {
      await second.evaluate(async (kind) => {
        const owner = (globalThis as unknown as { __retentionOwner: Owner }).__retentionOwner;
        await owner.workspace.command({ kind }).accepted;
      }, kind);
      if (kind === 'undo')
        await expect(page.locator('.shell')).not.toContainText(
          'Joined writing after actual removal',
        );
      else
        await expect(page.locator('.shell')).toContainText('Joined writing after actual removal');
    }
    await inspect(page);
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
    );
    expect(await removal(page, 1)).toEqual({ kind: 'skipped', reason: 'durable-attempt' });
    await inspect(second);
    await panel(second).getByRole('button', { name: 'Verify history snapshot' }).click();
    await expect(panel(second)).toContainText('Verified snapshot 1 is saved.');
    await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Resume history snapshot', exact: true }).click();
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    for (const p of [page, second])
      await expect
        .poll(() => removal(p, 1), { timeout: 20000 })
        .toMatchObject({ kind: 'removed', revision: 2 });
    for (const [p, code, joining] of [
      [page, pair.first.code, false],
      [second, pair.next.code, true],
    ] as const) {
      await openMenuSection(p, 'Account');
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await openSaved(p, code, joining);
      await expect(p.locator('.shell')).toContainText('Joined writing after actual removal');
      await inspect(p);
      await expect(panel(p)).toContainText('Verified snapshot 1 is saved.');
      await expect
        .poll(() => removal(p, 1), { timeout: 15000 })
        .toEqual({ kind: 'already-removed' });
    }
    await historyDuringReceive(page, second);
    await add(second, 'Cold reduced checkpoint continues');
    await expect(page.locator('.shell')).toContainText('Cold reduced checkpoint continues');
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
