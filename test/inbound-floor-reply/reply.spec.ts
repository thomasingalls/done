import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { account, pending, compared } from '../device-enrollment/helpers';
import { add, openSaved } from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { exportWriting, lock, slot } from '../inbound-native/fixtures';
import { openMenuSection } from '../geometry/openApp';
async function probe(page: Page, slot: string, code: string) {
  const output = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      rollupOptions: { output: { codeSplitting: false } },
      lib: {
        entry: resolve('test/inbound-floor-reply/inspect.ts'),
        name: 'FloorReplyProbe',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(output) ? output[0]! : output;
  if (!('output' in result)) throw Error('Unexpected probe watch output');
  const chunks = result.output.filter((x) => x.type === 'chunk');
  if (chunks.length !== 1) throw Error('Expected one read-only probe');
  await page.evaluate(chunks[0]!.code + '\nglobalThis.floorReplyProbe=FloorReplyProbe;');
  return page.evaluate(
    ({ slot, code }) =>
      (
        Reflect.get(globalThis, 'floorReplyProbe') as typeof import('./inspect')
      ).inspectInstallation(slot, code),
    { slot, code },
  );
}
test('lost installing floor reply preserves the authenticated floor before copying and retries exactly', async ({
  page,
  browser,
}, info) => {
  const path = process.env['INBOUND_REPLY_BUILD'];
  if (!path || !isAbsolute(path) || !existsSync(path + '/index.html'))
    throw Error('Expected declared reply-loss fixture build');
  const service = await startService(info.outputPath('service'), path, true, true),
    other = await browser.newContext(),
    second = await other.newPage(),
    evidence: Record<string, unknown> = {};
  try {
    const first = await account(page),
      next = await pending(second, first.link, first.auth),
      comparison = await compared(page, second);
    await page.getByLabel('Code on the new device').fill(comparison);
    await page.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    for (const p of [page, second])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      page.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Close and return to accounts' }).click();
    await openSaved(page, first.code);
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('Worker operation could not finish.', {
      timeout: 15000,
    });
    const identity = await slot(second, true),
      saved = await probe(second, identity.slotId, next.code);
    evidence['afterLostReply'] = saved;
    expect(saved).toMatchObject({ phase: 'installing', floor: 1, readingFloor: 1, nativeRows: 0 });
    await openSaved(second, next.code, true);
    await expect(second.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    const expected = await exportWriting(second, info.outputPath('retry.zip'));
    await lock(second);
    const active = await probe(second, identity.slotId, next.code);
    expect(active).toMatchObject({
      phase: 'active',
      floor: 1,
      readingFloor: 1,
      readingDigest: saved.readingDigest,
    });
    expect(active.nativeRows).toBeGreaterThan(0);
    evidence['afterRetry'] = active;
    await second.goto(origin + '/');
    await openSaved(second, next.code, true);
    await add(second, 'LOCAL UNDO AFTER LOST FLOOR REPLY');
    await openMenuSection(second, 'Data');
    await second.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await exportWriting(second, info.outputPath('undo.zip'))).toEqual(expected);
    await expect
      .poll(
        () =>
          second.evaluate(async () =>
            (await navigator.serviceWorker.getRegistrations()).map(
              (r) => r.active?.state ?? 'empty',
            ),
          ),
        { timeout: 15000 },
      )
      .toContain('activated');
    await lock(second);
    await other.setOffline(true);
    await second.goto(origin + '/');
    await openSaved(second, next.code, true);
    expect(await exportWriting(second, info.outputPath('cold.zip'))).toEqual(expected);
    expect((await slot(second, true)).floor).toBe(1);
    evidence['coldExact'] = true;
    await lock(second);
  } finally {
    await info.attach('lost-floor-reply', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    await other.close();
    await stopService(service);
  }
});
