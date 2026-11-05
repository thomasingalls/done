/** Full app/Worker/Joined opening. Native storage observations do not authenticate the marker. */
import { test, expect, type Page } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { pairedEditors, add, openSaved } from '../packaged-account/devices';
import { startService, stopService } from '../packaged-account/server';
import { openMenuSection } from '../geometry/openApp';
import { slotPermitName } from '../../src/crdt/nativeCoordination';
async function markers(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('done.custody');
      request.onupgradeneeded = () => {
        request.transaction!.abort();
        reject(Error('Expected existing authenticated custody'));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('entries', 'readonly');
        const request = tx.objectStore('entries').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
      return rows
        .filter((x): x is Record<string, unknown> => {
          if (!x || typeof x !== 'object' || !('kind' in x)) return false;
          return ['local-promotion', 'certified-account-device'].includes(String(x.kind));
        })
        .map((x) => ({
          kind: x['kind'],
          slotId:
            typeof x['slotId'] === 'string'
              ? x['slotId']
              : (x['source'] as { slotId: string }).slotId,
          version: x['v'],
          phase: x['phase'] ?? x['stage'],
          inboundReceiptVersion: x['inboundReceiptVersion'] ?? null,
        }));
    } finally {
      db.close();
    }
  });
}
async function nativeOwnership(page: Page, slotId: string) {
  const workers = page.workers().map((w) => new URL(w.url()).pathname);
  const locks = await page.evaluate(async () => (await navigator.locks.query()).held ?? []);
  expect(
    workers.some((path) =>
      /\/assets\/(?:accountOwner|enrollmentOwner|firstDeviceOwner)\.worker-[^/]+\.js$/.test(path),
    ),
  ).toBe(true);
  const name = slotPermitName(slotId);
  const slotLocks = locks.filter((lock) => lock.name === name);
  expect(slotLocks).toHaveLength(2);
  expect(slotLocks.every((lock) => lock.mode === 'shared')).toBe(true);
  expect(locks.filter((lock) => lock.name === name + '/worker-supervisor')).toEqual([
    expect.objectContaining({ mode: 'exclusive' }),
  ]);
  return { workers, slotLockModes: slotLocks.map((lock) => lock.mode) };
}
test('genuine Worker original and Joined owners acknowledge the floor and keep it through membership, writing and cold opening', async ({
  page,
  browser,
}, info) => {
  const build = process.env['INBOUND_FLOOR_BUILD'];
  if (!build || !isAbsolute(build) || !existsSync(build + '/index.html'))
    throw Error('Harness requires the declared disposable range-writer build');
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), build, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const observed: Record<string, unknown> = {};
  try {
    pair = await pairedEditors(page, browser, true);
    for (const [name, p, kind] of [
      ['original', page, 'local-promotion'],
      ['joined', pair.second, 'certified-account-device'],
    ] as const) {
      const current = await markers(p);
      expect(current).toHaveLength(1);
      expect(current[0]).toMatchObject({ kind, inboundReceiptVersion: 1 });
      observed[name] = {
        markers: current,
        ownership: await nativeOwnership(p, current[0]!.slotId),
      };
    }
    await add(page, 'Floor original writing survives');
    await expect(pair.second.locator('.shell')).toContainText('Floor original writing survives');
    await add(pair.second, 'Floor joined writing survives');
    await expect(page.locator('.shell')).toContainText('Floor joined writing survives');
    for (const [p, code, joined] of [
      [page, pair.first.code, false],
      [pair.second, pair.next.code, true],
    ] as const) {
      await openMenuSection(p, 'Account');
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await openSaved(p, code, joined);
      await expect(p.locator('.shell')).toContainText('Floor original writing survives');
      await expect(p.locator('.shell')).toContainText('Floor joined writing survives');
      const current = (await markers(p))[0]!;
      expect(current).toMatchObject({ inboundReceiptVersion: 1 });
      await nativeOwnership(p, current.slotId);
    }
    observed['coldBoth'] = 'exact expected writing and authenticated floor';
  } finally {
    await info.attach('floor-worker-observations', {
      body: JSON.stringify(observed),
      contentType: 'application/json',
    });
    await pair?.other.close();
    await stopService(service);
  }
});
