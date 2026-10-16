import { test, expect, type Page } from '@playwright/test';
import { openApp, protectApp } from '../geometry/openApp';
import { startService, stopService } from './server';

test.beforeEach(({ page }) => page.setDefaultTimeout(15000));

async function confirmRemoval(page: Page) {
  await page.getByRole('button', { name: 'Continue to confirmation' }).click();
  await page.getByLabel('Type REMOVE to confirm').fill('REMOVE');
  await page.getByRole('button', { name: 'Remove local data', exact: true }).click();
}

async function rawTarget(page: Page) {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases())
      .map((db) => db.name!)
      .filter(
        (name) =>
          name === 'done.custody' || name === 'done.slots' || /^done\.[a-f0-9]{32}$/.test(name),
      )
      .sort();
    const rows: unknown[] = [];
    for (const name of names) {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        for (const store of db.objectStoreNames) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const tx = db.transaction(store),
              keys = tx.objectStore(store).getAllKeys(),
              values = tx.objectStore(store).getAll();
            tx.oncomplete = () => resolve([keys.result, values.result]);
            tx.onabort = () => reject(tx.error);
          });
          rows.push([name, store, values]);
        }
      } finally {
        db.close();
      }
    }
    return JSON.stringify(
      {
        rows,
        journal: Object.entries(localStorage)
          .filter(([key]) => key.startsWith('done.pending-update.'))
          .sort(),
      },
      (_key, value) => (value instanceof Uint8Array ? Array.from(value) : value),
    );
  });
}

for (const carrier of ['database', 'journal'] as const)
  test(`legacy-only ${carrier} removal reports a safe refusal with next steps, never unfinished erasure`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    try {
      await page.goto('/remove/local');
      await page.evaluate(async (carrier) => {
        if (carrier === 'journal')
          localStorage.setItem('done.pending-update.done.legacy', 'retained old writing');
        else {
          const db = await new Promise<IDBDatabase>((resolve) => {
            const request = indexedDB.open('done', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('updates');
            request.onsuccess = () => resolve(request.result);
          });
          await new Promise<void>((resolve) => {
            const tx = db.transaction('updates', 'readwrite');
            tx.objectStore('updates').put('retained old writing', 'writing');
            tx.oncomplete = () => resolve();
          });
          db.close();
        }
      }, carrier);
      const names = await page.evaluate(() => indexedDB.databases());
      await confirmRemoval(page);
      await expect(page.getByRole('alert')).toContainText('older version');
      await expect(page.getByRole('alert')).toContainText('has not removed');
      await expect(
        page.getByRole('button', { name: 'Return to workspace', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish removal' })).toHaveCount(0);
      await expect(page.getByText('Removal has started.', { exact: false })).toHaveCount(0);
      expect(await page.evaluate(() => indexedDB.databases())).toEqual(names);
      expect(
        await page.evaluate(async (carrier) => {
          if (carrier === 'journal') return localStorage.getItem('done.pending-update.done.legacy');
          const db = await new Promise<IDBDatabase>((resolve) => {
            const r = indexedDB.open('done');
            r.onsuccess = () => resolve(r.result);
          });
          try {
            return await new Promise((resolve) => {
              const tx = db.transaction('updates'),
                r = tx.objectStore('updates').get('writing');
              tx.oncomplete = () => resolve(r.result);
            });
          } finally {
            db.close();
          }
        }, carrier),
      ).toBe('retained old writing');
    } finally {
      await stopService(service);
    }
  });

test('an absent workspace does not claim removal started or offer Finish removal', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.goto('/remove/local');
    await confirmRemoval(page);
    await expect(page.getByRole('heading', { name: 'Nothing to remove' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish removal' })).toHaveCount(0);
    expect(
      (await page.evaluate(() => indexedDB.databases())).some((db) => db.name === 'done.custody'),
    ).toBe(false);
  } finally {
    await stopService(service);
  }
});

test('failed inspection offers a read retry without authorizing or starting erasure', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.addInitScript(() => {
      const native = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, version) => {
        if (name !== 'done.custody')
          return version === undefined ? native(name) : native(name, version);
        indexedDB.open = native;
        const request = {
          error: new DOMException('Injected read failure', 'UnknownError'),
        } as IDBOpenDBRequest;
        queueMicrotask(() => request.onerror?.call(request, new Event('error')));
        return request;
      };
    });
    await page.goto('/remove/local');
    await expect(page.getByRole('alert')).toContainText('No new removal was started');
    await expect(page.getByRole('button', { name: 'Continue to confirmation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finish removal' })).toHaveCount(0);
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
    await page.getByRole('button', { name: 'Retry check', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue to confirmation' })).toBeVisible();
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  } finally {
    await stopService(service);
  }
});

for (const phase of ['content', 'journal'] as const)
  test(`failed ${phase} deletion retains the remaining carriers and automatically resumes on reopen`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    try {
      await openApp(page);
      await protectApp(page);
      await page.goto('/remove/local');
      await page.evaluate(async (phase) => {
        const name = (await indexedDB.databases()).find((db) =>
          /^done\.[a-f0-9]{32}$/.test(db.name!),
        )!.name!;
        localStorage.setItem(
          'done.pending-update.' + name + '.retained',
          'keep until content is gone',
        );
        if (phase === 'content') {
          const native = indexedDB.deleteDatabase.bind(indexedDB);
          indexedDB.deleteDatabase = () => {
            indexedDB.deleteDatabase = native;
            const request = {
              error: new DOMException('Injected deletion failure', 'UnknownError'),
            } as IDBOpenDBRequest;
            queueMicrotask(() => request.onerror?.call(request, new Event('error')));
            return request;
          };
        } else {
          const native = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (key) {
            if (key.startsWith('done.pending-update.')) {
              Storage.prototype.removeItem = native;
              throw new DOMException('Injected journal failure', 'UnknownError');
            }
            return native.call(this, key);
          };
        }
      }, phase);
      const before = await rawTarget(page);
      await confirmRemoval(page);
      await expect(page.getByRole('alert')).toContainText('Removal could not finish');
      await expect(page.getByRole('button', { name: 'Retry removal', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish removal' })).toHaveCount(0);
      const after = JSON.parse(await rawTarget(page));
      const original = JSON.parse(before);
      expect(after.journal).toEqual(original.journal);
      const kept = (row: unknown[]) => row[0] !== 'done.custody';
      if (phase === 'content') expect(after.rows.filter(kept)).toEqual(original.rows.filter(kept));
      const custody = after.rows.find((row: unknown[]) => row[0] === 'done.custody');
      const values = custody[2][1];
      expect(values).toContainEqual(
        expect.objectContaining({ kind: 'device-data-removal', phase }),
      );
      // Custody and its sealed openers are retained; only the authorized intent is added.
      expect(
        values.filter((value: { kind?: string }) => value?.kind !== 'device-data-removal'),
      ).toEqual(original.rows.find((row: unknown[]) => row[0] === 'done.custody')[2][1]);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith('done.pending-update.')),
        ),
      ).toEqual([]);
      expect(
        (await page.evaluate(() => indexedDB.databases())).some((db) =>
          /^done\.[a-f0-9]{32}$/.test(db.name!),
        ),
      ).toBe(false);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start fresh' })).toBeVisible();
    } finally {
      await stopService(service);
    }
  });

test('a blocked native deletion reports the required tab closure and finishes without another button', async ({
  page,
  context,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let holder: Page | undefined;
  try {
    await openApp(page);
    await protectApp(page);
    await page.goto('/remove/local');
    holder = await context.newPage();
    await holder.goto('/remove/local');
    await holder.evaluate(async () => {
      const name = (await indexedDB.databases()).find((db) =>
        /^done\.[a-f0-9]{32}$/.test(db.name!),
      )!.name!;
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
      });
      db.onversionchange = () => {};
      Object.assign(window, { heldRemovalDatabase: db });
    });
    const before = await rawTarget(page);
    await confirmRemoval(page);
    await expect(page.getByRole('status')).toContainText('Close other tabs');
    expect(
      await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.startsWith('done.pending-update.'))
          .sort(),
      ),
    ).toEqual(JSON.parse(before).journal);
    await expect(page.getByRole('button', { name: /Finish removal|Retry removal/ })).toHaveCount(0);
    await holder.close();
    holder = undefined;
    await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
  } finally {
    await holder?.close();
    await stopService(service);
  }
});
