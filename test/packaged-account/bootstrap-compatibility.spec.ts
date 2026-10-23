import { test, expect, type Page } from '@playwright/test';
import { openApp, protectApp, openMenuSection } from '../geometry/openApp';
import { add } from './devices';
import { startService, stopService } from './server';
import { authenticator } from '../device-enrollment/helpers';
import { openSaved } from './devices';

test.use({ serviceWorkers: 'block' });
async function blank(page: Page) {
  await page.route('**/__compatibility-fixture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Disposable compatibility fixture</title>',
    }),
  );
  await page.goto('/__compatibility-fixture__');
}
async function marker(page: Page, remove = false) {
  await page.evaluate(async (remove) => {
    await navigator.locks.request(
      `done/slot-writer/${JSON.stringify('local')}`,
      { mode: 'exclusive' },
      async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('done.custody');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('entries', 'readwrite');
            if (remove) tx.objectStore('entries').delete(['local', 'application-upgrade']);
            else
              tx.objectStore('entries').put({ v: 999, state: 'ready' }, [
                'local',
                'application-upgrade',
              ]);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      },
    );
  }, remove);
}
const census = (page: Page) =>
  page.evaluate(async () => {
    const encode = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return { buffer: [...new Uint8Array(value)] };
      if (ArrayBuffer.isView(value))
        return {
          type: value.constructor.name,
          bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)],
        };
      if (Array.isArray(value)) return value.map(encode);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, encode(v)]),
        );
      return value;
    };
    const databases = [];
    for (const entry of (await indexedDB.databases()).sort((a, b) =>
      a.name!.localeCompare(b.name!),
    )) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(entry.name!);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        const stores = [];
        for (const name of [...db.objectStoreNames]) {
          stores.push(
            await new Promise((resolve, reject) => {
              const tx = db.transaction(name);
              const store = tx.objectStore(name),
                keys = store.getAllKeys(),
                values = store.getAll();
              tx.oncomplete = () =>
                resolve({ name, keys: encode(keys.result), values: encode(values.result) });
              tx.onabort = () => reject(tx.error);
            }),
          );
        }
        databases.push({ name: db.name, version: db.version, stores });
      } finally {
        db.close();
      }
    }
    return {
      local: Object.fromEntries(
        Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b)),
      ),
      databases,
    };
  });
for (const hosted of [false, true])
  test(`blocked Local bootstrap preserves its complete census with ${hosted ? 'account' : 'Local-only'} discovery`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, false);
    try {
      await openApp(page);
      await add(page, 'Original writing survives the blocked bootstrap');
      await blank(page);
      await marker(page);
      await page.evaluate(() => {
        for (const key of [
          'done.application.local-only',
          'done.account-service.pin.v1',
          'done.account-service.transport.v1',
          'done.account-service.membership.v2',
        ])
          localStorage.removeItem(key);
      });
      if (!hosted)
        await page.route('**/__account-setup/config', (route) =>
          route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
        );
      const before = await census(page);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'This workspace needs a compatible app', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.shell')).toHaveCount(0);
      expect(await census(page)).toEqual(before);
      await blank(page);
      // Only remove this test's synthetic interlock; no format conversion occurred.
      await marker(page, true);
      await page.unroute('**/__account-setup/config');
      await page.goto('/');
      await expect(page.locator('.shell')).toContainText(
        'Original writing survives the blocked bootstrap',
      );
    } finally {
      await stopService(service);
    }
  });

test('a promoted Account can authenticate a public locator without ordinary Local hint-write permission', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await openApp(page);
    const code = await protectApp(page);
    await authenticator(page);
    await openMenuSection(page, 'Sync');
    await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
    await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
    await page.getByRole('button', { name: 'I saved my recovery code' }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await page.getByRole('button', { name: 'Confirm recovery and use passkey' }).click();
    await page.getByRole('button', { name: 'Approve with passkey', exact: true }).click();
    await page.getByRole('button', { name: 'Approve with passkey', exact: true }).click();
    await expect(page.locator('.shell')).toBeVisible();
    await add(page, 'Protected Account writing survives missing public hints');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await blank(page);
    expect(
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('done.custody');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const tx = db.transaction('entries');
            const read = tx.objectStore('entries').count(['local', 'application-upgrade']);
            tx.oncomplete = () => resolve(read.result);
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      }),
    ).toBe(1);
    await page.evaluate(() => {
      for (const key of [
        'done.account-service.pin.v1',
        'done.account-service.transport.v1',
        'done.account-service.membership.v2',
      ])
        localStorage.removeItem(key);
    });
    let historyReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/account/history/v1/checkpoint') historyReads++;
    });
    await page.goto('/');
    await openSaved(page, code);
    await expect(page.locator('.shell')).toContainText(
      'Protected Account writing survives missing public hints',
    );
    // The ordinary Local gate refuses this promoted slot. Public configuration can
    // locate it, but only the unchanged factor/passkey Account owner may open it.
    expect(
      await page.evaluate(() => localStorage.getItem('done.account-service.pin.v1')),
    ).toBeNull();
    await expect.poll(() => historyReads).toBeGreaterThan(0);
  } finally {
    await stopService(service);
  }
});
