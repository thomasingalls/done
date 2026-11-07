import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { imageArtifact } from './images';
import {
  frozenAssets,
  frozenHtml,
  assertEntry,
  deferRegistration,
  startOpening,
  finishUnlock,
  inertObserver,
} from '../inbound-compat/artifacts';
import {
  pairedEditors,
  credentials,
  restoreAuthenticator,
  add,
  openSaved,
} from '../packaged-account/devices';
import { startService, startApplication, stopProcess, origin } from '../packaged-account/server';
import { slot, lock, idle, position, exportWriting, observer } from '../inbound-native/fixtures';
import { openMenuSection } from '../geometry/openApp';
test('same-tree writer-off image opens a stale dense profile keeps legacy writing and cold Undo', async ({
  browserName: _browserName,
}, info) => {
  const root = process.env['INBOUND_ROLLBACK_ROOT'];
  if (!root) throw Error('Expected declared image evidence root');
  const zero = imageArtifact(root, 0),
    one = imageArtifact(root, 1),
    profile = info.outputPath('profile');
  const service = await startService(info.outputPath('service'), zero.build, true, true);
  let context: BrowserContext | undefined, peer: BrowserContext | undefined;
  const evidence: Record<string, unknown> = { image0: zero.imageId, image1: one.imageId };
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL: origin,
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(15000);
    const a = context.pages()[0] ?? (await context.newPage()),
      pair = await pairedEditors(a, context.browser()!, true);
    peer = pair.other;
    await assertEntry(a, zero);
    await idle(a);
    await idle(pair.second);
    const identity = await slot(a, false);
    expect(identity.floor).toBeUndefined();
    const saved = await credentials(pair.first.auth),
      stale = await context.newPage();
    await deferRegistration(stale);
    await frozenHtml(stale, zero);
    await stale.goto(origin + '/accounts');
    await assertEntry(stale, zero);
    await lock(a);
    await a.close();
    await stale.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    });
    await frozenAssets(context, [zero, one]);
    await stopProcess(service.app);
    service.app = await startApplication(one.build);
    const writer = await context.newPage();
    await deferRegistration(writer);
    await frozenHtml(writer, one);
    const writerAuth = await restoreAuthenticator(writer, saved);
    await writer.goto(origin + '/accounts');
    await startOpening(writer);
    await finishUnlock(writer, pair.first.code);
    await expect(writer.locator('.shell')).toBeVisible({ timeout: 15000 });
    await assertEntry(writer, one);
    expect((await slot(writer, false)).floor).toBe(1);
    await writer.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      dispatchEvent(new Event('offline'));
    });
    let at = await position(pair.second);
    const first = Array.from({ length: 8 }, (_, i) => `IMAGE DENSE BACKLOG ${i + 1}`);
    for (const text of first) {
      await add(pair.second, text);
      await expect.poll(() => position(pair.second), { timeout: 20000 }).toBe(at + 1);
      await idle(pair.second);
      at++;
    }
    await writer.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      dispatchEvent(new Event('online'));
    });
    for (const text of first)
      await expect(writer.locator('.shell')).toContainText(text, { timeout: 15000 });
    await idle(writer);
    const beforeRollback = await exportWriting(writer, info.outputPath('writer-on.zip'));
    expect(await exportWriting(pair.second, info.outputPath('peer-dense.zip'))).toEqual(
      beforeRollback,
    );
    await lock(writer);
    const watch = await inertObserver(context);
    await watch.evaluate(await observer());
    const inspect = () =>
      watch.evaluate(
        async ({ slot, code }) =>
          (
            Reflect.get(
              globalThis,
              'nativeReceiptObserver',
            ) as typeof import('../inbound-native/inspect')
          ).inspectNativeReceipts(slot, code, false),
        { slot: identity.slotId, code: pair.first.code },
      );
    const dense = await inspect();
    expect(dense.floor).toBe(1);
    expect(dense.receipts.some((x) => x.kind === 'page')).toBe(true);
    const through = Math.max(...dense.receipts.map((x) => x.seq)),
      savedWriter = await credentials(writerAuth);
    await writer.close();
    const auth = await restoreAuthenticator(stale, savedWriter);
    await assertEntry(stale, zero);
    await startOpening(stale);
    await finishUnlock(stale, pair.first.code);
    await expect(stale.locator('.shell')).toBeVisible({ timeout: 15000 });
    expect(await exportWriting(stale, info.outputPath('stale-reader.zip'))).toEqual(beforeRollback);
    expect((await slot(stale, false)).floor).toBe(1);
    await stale.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      dispatchEvent(new Event('offline'));
    });
    const later = Array.from({ length: 4 }, (_, i) => `IMAGE READER-ONLY BACKLOG ${i + 1}`);
    for (const text of later) {
      await add(pair.second, text);
      await expect.poll(() => position(pair.second), { timeout: 20000 }).toBe(at + 1);
      await idle(pair.second);
      at++;
    }
    await stale.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      dispatchEvent(new Event('online'));
    });
    for (const text of later)
      await expect(stale.locator('.shell')).toContainText(text, { timeout: 15000 });
    const expected = await exportWriting(stale, info.outputPath('reader-after-fresh.zip'));
    expect(await exportWriting(pair.second, info.outputPath('peer-fresh.zip'))).toEqual(expected);
    await add(stale, 'IMAGE READER-ONLY UNDO');
    await openMenuSection(stale, 'Data');
    await stale.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await exportWriting(stale, info.outputPath('reader-undo.zip'))).toEqual(expected);
    await lock(stale);
    const legacy = await inspect(),
      fresh = legacy.receipts.filter((x) => x.seq > through);
    expect(legacy.floor).toBe(1);
    expect(fresh.length).toBeGreaterThanOrEqual(4);
    expect(fresh.every((x) => x.kind === 'legacy' && x.requestLimit === 1)).toBe(true);
    evidence['denseBeforeRollback'] = dense;
    evidence['legacyAfterRollback'] = legacy;
    evidence['staleExact'] = true;
    await stopProcess(service.app);
    service.app = await startApplication(zero.build);
    await stale.evaluate(() => Reflect.get(globalThis, 'releaseFrozenRegistration')());
    await expect
      .poll(
        () =>
          stale.evaluate(async () =>
            (await navigator.serviceWorker.getRegistrations()).some(
              (r) => r.active?.state === 'activated',
            ),
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    await context.unrouteAll({ behavior: 'wait' });
    await stale.unrouteAll({ behavior: 'wait' });
    await stale.goto(origin + '/');
    await openSaved(stale, pair.first.code);
    await assertEntry(stale, zero);
    expect(await exportWriting(stale, info.outputPath('normal-reader.zip'))).toEqual(expected);
    await lock(stale);
    const coldAuth = await credentials(auth);
    await watch.close();
    await context.close();
    context = undefined;
    peer = undefined;
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL: origin,
      viewport: { width: 1280, height: 900 },
    });
    const cold = context.pages()[0] ?? (await context.newPage());
    await restoreAuthenticator(cold, coldAuth);
    await context.setOffline(true);
    await cold.goto(origin + '/');
    await openSaved(cold, pair.first.code);
    await assertEntry(cold, zero);
    expect(await exportWriting(cold, info.outputPath('offline-disk-reader.zip'))).toEqual(expected);
    expect((await slot(cold, false)).floor).toBe(1);
    evidence['offlineDiskExact'] = true;
    await lock(cold);
  } finally {
    await info.attach('same-tree-image-rollback', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    await peer?.close().catch(() => {});
    await context?.close().catch(() => {});
    await Promise.all([stopProcess(service.app), stopProcess(service.backend)]);
  }
});
