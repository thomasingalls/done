/** Genuine app/Worker admission and cold replay; every assertion/body retained. */
import { test, expect } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  pairedEditors,
  add,
  openSaved,
  credentials,
  restoreAuthenticator,
} from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { openMenuSection } from '../geometry/openApp';
import { slotPermitName } from '../../src/crdt/nativeCoordination';
import { acceptedRows, observer, exportWriting, lock, position, idle, slot } from './fixtures';
for (const direction of ['original-to-joined', 'joined-to-original'] as const)
  test(`dense interior cuts survive expired requests and exact cold replay ${direction}`, async ({
    page,
    browser,
  }, info) => {
    const path = process.env['INBOUND_NATIVE_BUILD'];
    if (!path || !isAbsolute(path) || !existsSync(path + '/index.html'))
      throw Error('Expected declared interior-cut build');
    const state = info.outputPath('service');
    const service = await startService(state, path, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const observations: Record<string, unknown> = { direction };
    try {
      pair = await pairedEditors(page, browser, true);
      const sendsOriginal = direction === 'original-to-joined',
        sender = sendsOriginal ? page : pair.second,
        oldReceiver = sendsOriginal ? pair.second : page,
        context = oldReceiver.context(),
        code = sendsOriginal ? pair.next.code : pair.first.code,
        joined = sendsOriginal,
        auth = await credentials(sendsOriginal ? pair.next.auth : pair.first.auth);
      const identity = await slot(oldReceiver, joined);
      expect(identity.floor).toBe(1);
      await idle(sender);
      let previous = await position(sender);
      await lock(oldReceiver);
      await oldReceiver.close();
      await context.setOffline(true);
      let accepted = new Set(acceptedRows(state).map((x) => x.key));
      const committedPositions: { publisher: string; position: number }[] = [];
      const markers = Array.from({ length: 4 }, (_, i) => `DENSE ${direction} accepted ${i + 1}`);
      for (const marker of markers) {
        await add(sender, marker);
        await expect.poll(() => position(sender), { timeout: 20000 }).toBeGreaterThan(previous);
        await idle(sender);
        const current = await position(sender);
        expect(current).toBe(previous + 1);
        const rows = acceptedRows(state),
          added = rows.filter((x) => !accepted.has(x.key));
        expect(added).toHaveLength(1);
        expect(added[0]!.position).toBe(current);
        committedPositions.push({ publisher: added[0]!.publisher, position: current });
        accepted = new Set(rows.map((x) => x.key));
        previous = current;
      }
      expect(new Set(committedPositions.map((x) => x.publisher)).size).toBe(1);
      observations['committedPositions'] = committedPositions;
      const receiver = await context.newPage();
      const keptAuthenticator = await restoreAuthenticator(receiver, auth);
      await receiver.goto(origin + '/');
      expect(await receiver.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await openSaved(receiver, code, joined);
      for (const marker of markers)
        await expect(receiver.locator('.shell')).not.toContainText(marker);
      await expect(receiver.locator('.shell')).toContainText('Keep the first device writing', {
        timeout: 15000,
      });
      const workerPaths = receiver.workers().map((w) => new URL(w.url()).pathname);
      const locks = await receiver.evaluate(async () => (await navigator.locks.query()).held ?? []);
      observations['workerPaths'] = workerPaths;
      observations['locks'] = locks.map((x) => ({ name: x.name, mode: x.mode }));
      expect(
        workerPaths.some((path) =>
          /\/assets\/(?:accountOwner|enrollmentOwner|firstDeviceOwner|recoveryOwner|localStartup)\.worker-[^/]+\.js$/.test(
            path,
          ),
        ),
      ).toBe(true);
      const permit = slotPermitName(identity.slotId),
        held = locks.filter((x) => x.name === permit);
      expect(held).toHaveLength(2);
      expect(held.every((x) => x.mode === 'shared')).toBe(true);
      expect(locks.filter((x) => x.name === permit + '/worker-supervisor')).toEqual([
        expect.objectContaining({ mode: 'exclusive' }),
      ]);
      await context.setOffline(false);
      for (const marker of markers)
        await expect(receiver.locator('.shell')).toContainText(marker, { timeout: 15000 });
      await expect(
        receiver.locator('.sync-notice').filter({ hasText: 'receive:integrity' }),
      ).toHaveCount(0);
      const expected = await exportWriting(receiver, info.outputPath('before.zip'));
      await add(receiver, 'LOCAL UNDO MUST NOT ERASE RECEIVED WRITING');
      await openMenuSection(receiver, 'Data');
      await receiver.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(receiver.locator('.shell')).not.toContainText(
        'LOCAL UNDO MUST NOT ERASE RECEIVED WRITING',
      );
      expect(await exportWriting(receiver, info.outputPath('undo.zip'))).toEqual(expected);
      await lock(receiver);
      await receiver.evaluate(await observer());
      const inspect = await receiver.evaluate(
        async ({ slotId, code, joined }) => {
          const module = Reflect.get(
            globalThis,
            'nativeReceiptObserver',
          ) as typeof import('./inspect');
          return module.inspectNativeReceipts(slotId, code, joined);
        },
        { slotId: identity.slotId, code, joined },
      );
      expect(inspect.readOnlyUnchanged).toBe(true);
      observations['native'] = inspect;
      // Journal entries are already durable and may await carrier packing on lock.
      // Keep them; unchanged native storage and exact cold exports below prove recovery.
      expect(inspect.floor).toBe(1);
      const dense = inspect.receipts.filter((x) => x.kind === 'page');
      expect(dense.some((x) => x.count === 2)).toBe(true);
      expect(dense.some((x) => x.firstEntry > 0)).toBe(true);
      expect(dense.every((x) => x.count <= 4)).toBe(true);
      await receiver.waitForTimeout(31000);
      expect(Date.now()).toBeGreaterThan(Math.max(...dense.map((x) => x.requestExpires)));
      await context.setOffline(true);
      await receiver.goto(origin + '/');
      await openSaved(receiver, code, joined);
      for (const marker of markers) await expect(receiver.locator('.shell')).toContainText(marker);
      const cold = await exportWriting(receiver, info.outputPath('cold.zip'));
      expect(cold).toEqual(expected);
      expect((await slot(receiver, joined)).floor).toBe(1);
      observations['coldArchiveExact'] = true;
      observations['archiveSha256'] = createHash('sha256')
        .update(JSON.stringify(cold))
        .digest('hex');
      observations['authenticatorRetainedThroughCold'] = !!keptAuthenticator.cdp;
      await lock(receiver);
    } finally {
      await info.attach('native-dense-observations', {
        body: JSON.stringify(observations, null, 2),
        contentType: 'application/json',
      });
      await pair?.other.close();
      await stopService(service);
    }
  });
