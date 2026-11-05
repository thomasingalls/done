import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  artifact,
  frozenAssets,
  frozenHtml,
  assertEntry,
  deferRegistration,
  startOpening,
  finishUnlock,
  targetSnapshot,
  metadataBundle,
  frozenReaderBundle,
  inertObserver,
} from './artifacts';
import {
  pairedEditors,
  add,
  openSaved,
  credentials,
  restoreAuthenticator,
} from '../packaged-account/devices';
import { startService, startApplication, stopProcess, origin } from '../packaged-account/server';
import {
  slot,
  position,
  idle,
  lock,
  exportWriting,
  observer,
  acceptedRows,
} from '../inbound-native/fixtures';
import { slotPermitName } from '../../src/crdt/nativeCoordination';
import { openMenuSection } from '../geometry/openApp';
async function plainMarker(page: Page, slot: string) {
  return page.evaluate(
    (slot) =>
      new Promise<unknown>((accept, reject) => {
        const request = indexedDB.open('done.custody');
        request.onupgradeneeded = () => {
          request.transaction!.abort();
          reject(Error('Expected custody'));
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('entries', 'readonly'),
            read = tx.objectStore('entries').get([slot, 'application-upgrade']);
          tx.oncomplete = () => {
            db.close();
            accept(read.result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    slot,
  );
}
const leases = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    const current = await navigator.locks.query();
    return {
      held: (current.held ?? []).filter((x) => x.name?.startsWith(name)),
      pending: (current.pending ?? []).filter((x) => x.name?.startsWith(name)),
    };
  }, name);
for (const oldName of ['old-page', 'old-worker'] as const)
  test(`frozen ${oldName} active queued and cold owners preserve pending writing across the binary floor`, async ({
    browserName: _browserName,
  }, info) => {
    const root = process.env['INBOUND_COMPAT_ROOT'];
    if (!root) throw Error('Expected declared frozen compatibility root');
    const old = artifact(root, oldName),
      current = artifact(root, 'current-writer-1'),
      oldIdentity = JSON.parse(
        readFileSync(resolve(root, `426-${oldName}-identity.json`), 'utf8'),
      ) as { source: string },
      state = info.outputPath('service'),
      service = await startService(state, old.build, true, true),
      profile = info.outputPath('profile');
    let context: BrowserContext | undefined,
      peer: BrowserContext | undefined,
      opening: Page | undefined;
    const evidence: Record<string, unknown> = { oldName };
    const step = (name: string) => {
      evidence['stage'] = name;
      console.log('frozen-boundary', oldName, name);
    };
    try {
      context = await chromium.launchPersistentContext(profile, {
        baseURL: origin,
        headless: true,
        viewport: { width: 1280, height: 900 },
      });
      const browser = context.browser()!;
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(15000);
      step('old-pair');
      let a = context.pages()[0] ?? (await context.newPage());
      const pair = await pairedEditors(a, browser, true);
      peer = pair.other;
      await assertEntry(a, old);
      await idle(a);
      await idle(pair.second);
      const identity = await slot(a, false),
        name = slotPermitName(identity.slotId),
        oldCredentials = await credentials(pair.first.auth),
        legacy = await plainMarker(a, identity.slotId),
        initial = await leases(a, name);
      evidence['oldActiveLeases'] = initial;
      expect(initial.held.some((x) => x.name === name)).toBe(true);
      if (oldName === 'old-page')
        expect(initial.held.filter((x) => x.name === name).map((x) => x.mode)).toEqual([
          'exclusive',
        ]);
      else
        expect(initial.held.filter((x) => x.name === name && x.mode === 'shared')).toHaveLength(2);
      const before = await position(a),
        committedBefore = acceptedRows(state)
          .map((x) => x.key)
          .sort(),
        pending = `FROZEN ${oldName} pending local writing`;
      await a.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        dispatchEvent(new Event('offline'));
      });
      await add(a, pending);
      await openMenuSection(a, 'Sync');
      await expect(
        a.locator('.sync-details').getByText('Sending: offline', { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await a.waitForTimeout(2500);
      expect(await position(a)).toBe(before);
      expect(
        acceptedRows(state)
          .map((x) => x.key)
          .sort(),
      ).toEqual(committedBefore);
      evidence['unuploadedWriting'] = {
        acceptedBefore: committedBefore.length,
        acceptedAfter: acceptedRows(state).length,
        position: before,
      };
      step('pending-writing-admitted');
      const expectedOld = await exportWriting(a, info.outputPath('old-pending.zip'));
      expect(expectedOld.some((x) => x.content.includes(pending))).toBe(true);
      const c = await context.newPage();
      await restoreAuthenticator(c, oldCredentials);
      await c.goto(origin + '/accounts');
      await assertEntry(c, old);
      step('old-stale-loaded');
      // Existing clients retain old cached resources; new registrations wait through this control.
      await a.evaluate(async () => {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      });
      await frozenAssets(context, [old, current]);
      await stopProcess(service.app);
      service.app = await startApplication(current.build);
      step('new-gateway');
      const excluded = await context.newPage();
      opening = excluded;
      await deferRegistration(excluded);
      await frozenHtml(excluded, current);
      await restoreAuthenticator(excluded, oldCredentials);
      await excluded.goto(origin + '/accounts');
      await assertEntry(excluded, current);
      await startOpening(excluded);
      await expect(
        excluded.getByText('Account setup is open in another tab. Continue there or close it.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 15000 });
      evidence['activeExclusion'] = await excluded.getByRole('alert').allTextContents();
      expect(await plainMarker(a, identity.slotId)).toEqual(legacy);
      await expect(excluded.locator('.shell')).toHaveCount(0);
      await excluded.close();
      await a.close();
      step('old-owner-closed');
      let b = await context.newPage();
      opening = b;
      await deferRegistration(b);
      await frozenHtml(b, current);
      let auth = await restoreAuthenticator(b, oldCredentials);
      await b.goto(origin + '/accounts');
      await assertEntry(b, current);
      await startOpening(b);
      await finishUnlock(b, pair.first.code);
      await expect(b.locator('.shell')).toContainText(pending, { timeout: 15000 });
      step('new-writing-open');
      // Add a real peer backlog after the old scheduling lane has stopped.
      const markers = Array.from(
        { length: 8 },
        (_, i) => `FROZEN ${oldName} peer writing ${i + 1}`,
      );
      let next = await position(pair.second);
      await b.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        dispatchEvent(new Event('offline'));
      });
      for (const marker of markers) {
        await add(pair.second, marker);
        await expect.poll(() => position(pair.second), { timeout: 20000 }).toBe(next + 1);
        await idle(pair.second);
        next++;
      }
      await b.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
        dispatchEvent(new Event('online'));
      });
      for (const marker of markers)
        await expect(b.locator('.shell')).toContainText(marker, { timeout: 15000 });
      await expect(pair.second.locator('.shell')).toContainText(pending, { timeout: 15000 });
      await idle(b);
      const expected = await exportWriting(b, info.outputPath('upgraded.zip'));
      expect(await exportWriting(pair.second, info.outputPath('peer.zip'))).toEqual(expected);
      await c.evaluate(await frozenReaderBundle(oldIdentity.source));
      await c.evaluate(
        ({ slot, code }) => {
          Reflect.set(globalThis, 'frozenOldOpeningResult', null);
          void (
            Reflect.get(globalThis, 'FrozenOldReader') as {
              probe(slot: string, code: string): Promise<unknown>;
            }
          )
            .probe(slot, code)
            .then((result) => Reflect.set(globalThis, 'frozenOldOpeningResult', result));
        },
        { slot: identity.slotId, code: pair.first.code },
      );
      await expect
        .poll(
          async () =>
            (await leases(b, name)).pending.filter((x) => x.name === name && x.mode === 'exclusive')
              .length,
          { timeout: 15000 },
        )
        .toBe(1);
      expect(await c.evaluate(() => Reflect.get(globalThis, 'frozenOldOpeningResult'))).toBeNull();
      evidence['oldQueuedNativeReader'] = await leases(b, name);
      await lock(b);
      await expect
        .poll(() => c.evaluate(() => Reflect.get(globalThis, 'frozenOldOpeningResult')), {
          timeout: 15000,
        })
        .toMatchObject({ accepted: false });
      evidence['oldQueuedRefusal'] = await c.evaluate(() =>
        Reflect.get(globalThis, 'frozenOldOpeningResult'),
      );
      await expect(c.locator('.shell')).toHaveCount(0);
      await c.close();
      const watch = await inertObserver(context);
      await watch.evaluate(await observer());
      const native = await watch.evaluate(
        async ({ slot, code }) =>
          (
            Reflect.get(
              globalThis,
              'nativeReceiptObserver',
            ) as typeof import('../inbound-native/inspect')
          ).inspectNativeReceipts(slot, code, false),
        { slot: identity.slotId, code: pair.first.code },
      );
      expect(native.floor).toBe(1);
      expect(native.receipts.some((x) => x.kind === 'page')).toBe(true);
      evidence['native'] = native;
      const prior = await targetSnapshot(watch, identity.slotId),
        savedCurrent = await credentials(auth);
      await b.close();
      const d = await context.newPage();
      await deferRegistration(d);
      await frozenHtml(d, old);
      await restoreAuthenticator(d, oldCredentials);
      await d.goto(origin + '/accounts');
      await assertEntry(d, old);
      await expect
        .poll(
          async () =>
            (await d.getByLabel('Unlock code', { exact: true }).isVisible()) ||
            (await d.getByRole('button', { name: /^Unlock Device owner/ }).isVisible()) ||
            (await d.getByRole('alert').allTextContents()).some((x) => x.trim()),
          { timeout: 15000 },
        )
        .toBe(true);
      const canUnlock =
        (await d.getByLabel('Unlock code', { exact: true }).isVisible()) ||
        (await d.getByRole('button', { name: /^Unlock Device owner/ }).isVisible());
      if (canUnlock) {
        await startOpening(d);
        await expect
          .poll(
            async () =>
              (await d.getByLabel('Unlock code', { exact: true }).isVisible()) ||
              (await d.getByRole('alert').allTextContents()).some((x) => x.trim()),
            { timeout: 15000 },
          )
          .toBe(true);
        if (await d.getByLabel('Unlock code', { exact: true }).isVisible())
          await finishUnlock(d, pair.first.code);
        await expect
          .poll(async () => (await d.getByRole('alert').allTextContents()).some((x) => x.trim()), {
            timeout: 15000,
          })
          .toBe(true);
      }
      await expect(d.locator('.shell')).toHaveCount(0);
      await expect
        .poll(async () => (await d.getByRole('alert').allTextContents()).some((x) => x.trim()), {
          timeout: 15000,
        })
        .toBe(true);
      expect((await d.getByRole('alert').allTextContents()).join('\n')).not.toContain(
        'Account setup is open in another tab.',
      );
      evidence['coldOldSurface'] = (await d.locator('body').innerText()).slice(0, 2500);
      await d.close();
      expect(await targetSnapshot(watch, identity.slotId)).toBe(prior);
      await watch.evaluate(
        await metadataBundle(resolve('test/inbound-compat/marker.ts'), 'CurrentMarkerProbe'),
      );
      const marked = await watch.evaluate(
        async ({ slot, code }) =>
          (
            Reflect.get(globalThis, 'CurrentMarkerProbe') as typeof import('./marker')
          ).authenticatedMarker(slot, code),
        { slot: identity.slotId, code: pair.first.code },
      );
      await watch.evaluate(
        await metadataBundle(
          resolve(oldIdentity.source, 'src/crdt/promotionRecord.ts'),
          'FrozenOldMarker',
        ),
      );
      const parser = await watch.evaluate(
        ({ legacy, marked }) => {
          const old = Reflect.get(
            globalThis,
            'FrozenOldMarker',
          ) as typeof import('../../src/crdt/promotionRecord');
          old.parseStoredPromotion(legacy);
          try {
            old.parseStoredPromotion(marked);
            return { legacy: true, marked: true };
          } catch (error) {
            return { legacy: true, marked: false, errorClass: (error as Error).name };
          }
        },
        { legacy, marked },
      );
      expect(parser).toMatchObject({ legacy: true, marked: false });
      evidence['oldParser'] = parser;
      b = await context.newPage();
      opening = b;
      await deferRegistration(b);
      await frozenHtml(b, current);
      auth = await restoreAuthenticator(b, savedCurrent);
      await b.goto(origin + '/');
      await openSaved(b, pair.first.code);
      await b.evaluate(() => Reflect.get(globalThis, 'releaseFrozenRegistration')());
      await expect
        .poll(
          () =>
            b.evaluate(async () =>
              (await navigator.serviceWorker.getRegistrations()).some(
                (r) => r.active?.state === 'activated',
              ),
            ),
          { timeout: 15000 },
        )
        .toBe(true);
      await context.unrouteAll({ behavior: 'wait' });
      await b.unrouteAll({ behavior: 'wait' });
      await b.goto(origin + '/');
      await openSaved(b, pair.first.code);
      await assertEntry(b, current);
      await add(b, 'CURRENT UNDO AFTER FROZEN READER');
      await openMenuSection(b, 'Data');
      await b.getByRole('button', { name: 'Undo', exact: true }).click();
      expect(await exportWriting(b, info.outputPath('undo.zip'))).toEqual(expected);
      await lock(b);
      const coldAuth = await credentials(auth);
      await watch.close();
      await context.close();
      context = undefined;
      peer = undefined;
      context = await chromium.launchPersistentContext(profile, {
        baseURL: origin,
        headless: true,
        viewport: { width: 1280, height: 900 },
      });
      a = context.pages()[0] ?? (await context.newPage());
      await restoreAuthenticator(a, coldAuth);
      await context.setOffline(true);
      await a.goto(origin + '/');
      await openSaved(a, pair.first.code);
      expect(await exportWriting(a, info.outputPath('disk-cold.zip'))).toEqual(expected);
      expect((await slot(a, false)).floor).toBe(1);
      evidence['diskColdExact'] = true;
      await lock(a);
    } catch (error) {
      if (opening && !opening.isClosed()) {
        evidence['openingSurface'] = (await opening.locator('body').innerText()).slice(0, 3500);
        evidence['openingLocks'] = await opening.evaluate(() => navigator.locks.query());
        evidence['openingPath'] = new URL(opening.url()).pathname;
      }
      throw error;
    } finally {
      await info.attach('frozen-reader-compatibility', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
      await peer?.close().catch(() => {});
      await context?.close().catch(() => {});
      await Promise.all([stopProcess(service.app), stopProcess(service.backend)]);
    }
  });
