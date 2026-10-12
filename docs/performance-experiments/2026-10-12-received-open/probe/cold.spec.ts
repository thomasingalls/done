import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { restoreAuthenticator, add, openSaved } from '../../../../test/packaged-account/devices';
import {
  startBackend,
  startApp,
  stopAll,
} from '../../2026-10-12-receive-attribution/probe/runtime.mjs';

const root = process.env.DONE_PERF_ROOT!;
const output = process.env.DONE_PERF_RESULTS!;
mkdirSync(output, { recursive: true });

test('retained Account cold open', async ({ browser, page }) => {
  const fixture = JSON.parse(readFileSync(process.env.DONE_REOPEN_FIXTURE!, 'utf8'));
  const state = join(output, 'state');
  cpSync(fixture.state, state, { recursive: true, errorOnExist: true });
  await startBackend(state, true);
  await startApp(state, true);
  const results: any[] = [];
  try {
    for (let run = 0; run < Number(process.env.COLD_REPEATS ?? 1); run++) {
      console.log('restoring browser', run);
      const context = await browser.newContext({
        storageState: fixture.storage,
        viewport: { width: 1280, height: 900 },
      });
      console.log('browser restored');
      const p = await context.newPage();
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.addInitScript(() => {
        const counts: Record<string, number> = {};
        for (const name of ['decrypt', 'verify', 'digest', 'importKey', 'deriveKey'] as const) {
          const original = SubtleCrypto.prototype[name];
          (SubtleCrypto.prototype as any)[name] = function (...args: any[]) {
            counts[name] = (counts[name] ?? 0) + 1;
            return (original as any).apply(this, args);
          };
        }
        (globalThis as any).__coldNative = () => ({ ...counts });
      });
      await restoreAuthenticator(p, fixture.credentials);
      try {
        console.log('load chooser');
        await p.goto('/');
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload();
        await p.waitForFunction(() => !!navigator.serviceWorker.controller);
        await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
        await p
          .getByRole('button', {
            name: fixture.joined ? /Resume device connection/ : /^Unlock Device owner/,
          })
          .click();
        await p.getByLabel('Device-lock code', { exact: true }).fill(fixture.code);
        console.log('unlock prepared');
        if (process.env.COLD_ONLINE !== '1') await context.setOffline(true);
        const cdp = await context.newCDPSession(p);
        await cdp.send('Performance.enable');
        if (process.env.COLD_PROFILE === '1') {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        // Supplement the polling observer with the first frame after the editor was rendered.
        // Observe before the measured click; no account data enters this timestamp.
        await expect(p.locator('.shell')).toHaveCount(0);
        await p.evaluate(() => {
          (globalThis as any).__coldShellFrame = undefined;
          const observer = new MutationObserver(() => {
            const shell = document.querySelector('.shell');
            if (!shell?.getClientRects().length) return;
            observer.disconnect();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                (globalThis as any).__coldShellFrame = performance.now();
              }),
            );
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
        console.log('starting unlock');
        const start = await p.evaluate(() => performance.now());
        const nativeBefore = await p.evaluate(() => (globalThis as any).__coldNative());
        if (fixture.joined) {
          await p
            .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
            .click();
          const openWriting = p.getByRole('button', { name: 'Open your writing', exact: true });
          await expect(p.locator('.shell').or(openWriting)).toBeVisible({ timeout: 120000 });
          if (await openWriting.isVisible()) await openWriting.click();
        } else
          await p.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
        console.log('unlock clicked');
        await p.locator('.shell').waitFor({ state: 'visible', timeout: 120000 });
        await p.waitForFunction(() => typeof (globalThis as any).__coldShellFrame === 'number');
        const ready = await p.evaluate(() => ({
          shellFrameAt: (globalThis as any).__coldShellFrame,
          now: performance.now(),
          ledger: (globalThis as any).__doneLedgerMetrics?.(),
          milestones: (globalThis as any).__doneOpenMilestones?.(),
          native: (globalThis as any).__coldNative(),
        }));
        if (process.env.COLD_NO_DIAGNOSTICS === '1') {
          expect(ready.ledger).toBeUndefined();
          expect(ready.milestones).toBeUndefined();
        }
        await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
        if (fixture.expectedGoals !== undefined)
          await expect(p.locator('.goals .cm-content')).toHaveText(fixture.expectedGoals);
        if (process.env.COLD_PROFILE === '1') {
          const { profile } = await cdp.send('Profiler.stop');
          writeFileSync(join(output, `cold-${run}.cpuprofile`), JSON.stringify(profile));
        }
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = (await cdp.send('Performance.getMetrics')).metrics.find(
          (m) => m.name === 'JSHeapUsedSize',
        )?.value;
        const downloaded = p.waitForEvent('download');
        await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
        const zip = readFileSync((await (await downloaded).path())!);
        const files: Record<string, string> = {};
        let offset = 0;
        while (zip.readUInt32LE(offset) === 0x04034b50) {
          expect(zip.readUInt16LE(offset + 8)).toBe(0);
          const size = zip.readUInt32LE(offset + 18),
            n = zip.readUInt16LE(offset + 26),
            extra = zip.readUInt16LE(offset + 28);
          const name = zip.toString('utf8', offset + 30, offset + 30 + n),
            at = offset + 30 + n + extra;
          files[name] = zip.toString('utf8', at, at + size);
          offset = at + size;
        }
        const archive = createHash('sha256')
          .update(JSON.stringify(Object.fromEntries(Object.entries(files).sort())))
          .digest('hex');
        if (process.env.EXPECT_ARCHIVE) expect(archive).toBe(process.env.EXPECT_ARCHIVE);
        const first = Date.now();
        await add(p, 'cold first edit sentinel');
        const editMs = Date.now() - first;
        const row = {
          run,
          coldMs: ready.now - start,
          frameColdMs: ready.shellFrameAt - start,
          ready,
          nativeBefore,
          heap,
          archive,
          archiveBytes: Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0),
          editMs,
          errors,
        };
        if (process.env.COLD_RECOVER === '1') {
          await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
          await p.goto('/');
          await openSaved(p, fixture.code, !!fixture.joined);
          await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
          await expect(p.locator('.shell')).toContainText('cold first edit sentinel');
        }
        results.push(row);
        writeFileSync(join(output, 'opens.json'), JSON.stringify(results, null, 2));
        console.log(
          JSON.stringify({
            run,
            coldMs: row.coldMs,
            heap,
            editMs,
            passes: ready.ledger?.work,
            milestones: Object.fromEntries(
              Object.entries(ready.milestones ?? {}).map(([k, v]: [string, any]) => [
                k,
                v.at - start,
              ]),
            ),
            errors,
          }),
        );
      } catch (e) {
        console.log(
          'failed screen',
          await p
            .locator('body')
            .innerText()
            .catch(() => 'unavailable'),
        );
        throw e;
      } finally {
        await context.close();
      }
    }
  } finally {
    await stopAll();
  }
});
