import { expect, type Page } from '@playwright/test';
import type { Plugin } from 'vite';
import { add } from '../packaged-account/devices';

/** Test-bundle pauses and an explicit negative control; no product hooks or authority substitution. */
export function historyHandoffProbe(): Plugin {
  const hits = new Set<string>();
  const insert = (code: string, at: string, extra: string) => {
    if (code.split(at).length !== 2) throw Error('History handoff control moved: ' + at);
    return code.replace(at, extra);
  };
  return {
    name: 'history-handoff-controls',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/crdt/admissionQueue.ts')) {
        hits.add('promotion');
        const at =
          "        if (!updates || !finish) throw Error('Remote preparation omitted its durable handoff');";
        return insert(
          code,
          at,
          at +
            '\n        if (globalThis.__historyBeforeApply) await globalThis.__historyBeforeApply(updates.length);',
        );
      }
      if (id.endsWith('/src/crdt/historyReceiveFence.ts')) {
        hits.add('drain');
        return insert(
          code,
          '    await whenDurable();',
          `
          if (globalThis.__historyWaiting) globalThis.__historyWaiting();
          await whenDurable();
          if (globalThis.__historyAfterDrain) await globalThis.__historyAfterDrain();`,
        );
      }
      if (id.endsWith('/src/crdt/accountReceive.ts')) {
        hits.add('guard');
        const at = 'if (pendingPromotions) throw new HistoryReceivePending();';
        return insert(
          code,
          at,
          'globalThis.__historyPending?.push(pendingPromotions);\n' +
            (process.env['HISTORY_HANDOFF_CONTROL'] === 'omit-pending-check' ? '' : at),
        );
      }
      return undefined;
    },
    buildEnd(error) {
      if (!error && hits.size !== 3) throw Error('Missing history handoff control');
    },
  };
}
interface Hooks {
  __historyBeforeApply?: (count: number) => Promise<void> | void;
  __historyAfterDrain?: () => Promise<void>;
  __historyWaiting?: () => void;
  __historyReleaseApply?: () => void;
  __historyReleaseDrain?: () => void;
  __historyHit?: number;
  __historyDrainHit?: boolean;
  __historyWaits?: number;
  __historyPending?: number[];
  __retentionOwner: {
    workspace: {
      status: { state: string };
      command(c: { kind: 'undo' | 'redo' }): { accepted: Promise<unknown> };
    };
  };
}
export async function historyDuringReceive(first: Page, second: Page) {
  const panel = second.getByRole('region', { name: 'History maintenance', exact: true });
  const check = panel.getByRole('button', { name: 'Check history', exact: true });
  for (const mode of ['empty', 'content', 'late'] as const) {
    await second.evaluate((mode) => {
      const g = globalThis as unknown as Hooks;
      delete g.__historyHit;
      g.__historyDrainHit = false;
      g.__historyWaits = 0;
      g.__historyPending = [];
      g.__historyWaiting = () => {
        g.__historyWaits!++;
      };
      if (mode === 'late')
        g.__historyAfterDrain = () =>
          new Promise<void>((resolve) => {
            g.__historyDrainHit = true;
            g.__historyReleaseDrain = () => {
              delete g.__historyAfterDrain;
              resolve();
            };
          });
      g.__historyBeforeApply = (count) => {
        if ((mode === 'content') !== count > 0) return;
        return new Promise<void>((resolve) => {
          g.__historyHit = count;
          g.__historyReleaseApply = () => {
            delete g.__historyBeforeApply;
            resolve();
          };
        });
      };
    }, mode);
    if (mode === 'late') {
      await check.click();
      await second.waitForFunction(() => (globalThis as unknown as Hooks).__historyDrainHit);
    }
    if (mode === 'content') await add(first, 'Remote writing during history inspection');
    await second.evaluate(() => globalThis.dispatchEvent(new Event('online')));
    await second.waitForFunction(() => (globalThis as unknown as Hooks).__historyHit !== undefined);
    if (mode === 'content') {
      await expect(second.locator('.shell')).not.toContainText(
        'Remote writing during history inspection',
      );
      await add(second, 'Local writing while history waits');
    }
    if (mode === 'late') {
      await second.evaluate(() => (globalThis as unknown as Hooks).__historyReleaseDrain!());
      await expect
        .poll(() => second.evaluate(() => (globalThis as unknown as Hooks).__historyWaits))
        .toBe(2);
      expect(
        await second.evaluate(() => (globalThis as unknown as Hooks).__historyPending),
      ).toEqual([1]);
    } else {
      await check.click();
      await second.waitForFunction(() => (globalThis as unknown as Hooks).__historyWaits! >= 1);
      expect(
        await second.evaluate(() => (globalThis as unknown as Hooks).__historyPending),
      ).toEqual([]);
    }
    await expect(check).toBeDisabled();
    await second.evaluate(() => (globalThis as unknown as Hooks).__historyReleaseApply!());
    await expect(check).toBeEnabled();
    await expect(panel).toContainText('Verified snapshot 1 is saved.');
    expect(
      await second.evaluate(
        () => (globalThis as unknown as Hooks).__retentionOwner.workspace.status.state,
      ),
    ).toBe('active');
    expect(
      (await second.evaluate(() => (globalThis as unknown as Hooks).__historyPending))!.at(-1),
    ).toBe(0);
    if (mode === 'content') {
      await expect(second.locator('.shell')).toContainText(
        'Remote writing during history inspection',
      );
      await second.evaluate(
        () =>
          (globalThis as unknown as Hooks).__retentionOwner.workspace.command({ kind: 'undo' })
            .accepted,
      );
      await expect(second.locator('.shell')).not.toContainText('Local writing while history waits');
      await expect(second.locator('.shell')).toContainText(
        'Remote writing during history inspection',
      );
      await second.evaluate(
        () =>
          (globalThis as unknown as Hooks).__retentionOwner.workspace.command({ kind: 'redo' })
            .accepted,
      );
      await expect(first.locator('.shell')).toContainText('Local writing while history waits');
    }
    console.log('History receive ordering passed:', mode);
    await second.evaluate(() => {
      const g = globalThis as unknown as Hooks;
      delete g.__historyWaiting;
      delete g.__historyPending;
    });
  }
}
