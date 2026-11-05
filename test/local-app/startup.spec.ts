import { openMenuSection } from '../geometry/openApp';
import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
import { refuseNativeGenesisContent } from './native-storage-faults';

// Explicit protected startup stays covered for compatible stored workspaces.
// Current automatic first-run and optional protection use the shipped entries in
// packaged.spec.ts and packaged-account/welcome.spec.ts.
const app = (page: Page) => page.locator('.local-startup');
const state = (page: Page, kind: string) =>
  kind === 'ready'
    ? expect(page.locator('.shell[data-local-workspace]')).toBeVisible()
    : expect(app(page)).toHaveAttribute('data-state', kind);
const census = (page: Page) =>
  page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((db) => db.name).sort(),
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
const enroll = async (page: Page) => {
  await state(page, 'fresh');
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const code = (await page.getByLabel('Generated unlock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await expect(page.getByLabel('Generated unlock code')).toHaveCount(0);
  await page.getByLabel('Unlock code', { exact: true }).fill('wrong-code');
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await state(page, 'confirm-code');
  expect((await census(page)).databases).toEqual([]);
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await state(page, 'ready');
  return code;
};
const lock = async (page: Page) => {
  await openMenuSection(page, 'Account');
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await state(page, 'unlock-required');
};

test('confirmation is required; reload and offline unlock use the same identity', async ({
  page,
  context,
}) => {
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/test/local-app/protected-startup.html');
  await state(page, 'fresh');
  expect((await census(page)).databases).toEqual([]);
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const cancelled = await page.getByLabel('Generated unlock code').textContent();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await state(page, 'fresh');
  expect(JSON.stringify(await census(page))).not.toContain(cancelled);
  const code = await enroll(page);
  const created = await census(page);
  expect(created.databases).not.toContain('done');
  expect(created.local).not.toHaveProperty('done.actor');
  expect(created.local).not.toHaveProperty('done.device');
  expect(JSON.stringify(created)).not.toContain(code);
  await lock(page);
  await page.reload();
  await state(page, 'unlock-required');
  await page.getByLabel('Unlock code', { exact: true }).fill('wrong-code');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await state(page, 'unlock-failed');
  expect((await census(page)).databases).toEqual(created.databases);
  await context.setOffline(true);
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await state(page, 'ready');
  expect(sockets.filter((url) => url.includes('/relay'))).toEqual([]);
  await lock(page);
});

test('existing legacy data refuses creation without touching its carriers', async ({ page }) => {
  await page.goto('/test/local-app/protected-startup.html');
  await state(page, 'fresh');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('done', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('updates');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('updates', 'readwrite');
        tx.objectStore('updates').put('retained source sentinel', 1);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
    localStorage.setItem('done.pending-update.done.saved.0', '1:retained-journal');
  });
  const before = await census(page);
  await page.reload();
  await state(page, 'migration-required');
  await expect(page.getByRole('button', { name: 'Create a local-only workspace' })).toHaveCount(0);
  expect(await census(page)).toEqual(before);
  const value = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('done');
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('updates').objectStore('updates').get(1);
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(value).toBe('retained source sentinel');
});

test('verified content opens in the admitted editor and disappears immediately on lock', async ({
  page,
}) => {
  await page.goto('/test/local-app/protected-startup.html');
  const code = await enroll(page);
  await lock(page);
  await page.evaluate(async (code) => {
    const path = '/src/crdt/localGenesis.ts';
    const { listLocalWorkspaces, openLocalWorkspace } = await import(path);
    const [route] = await listLocalWorkspaces('local', code);
    const result = await openLocalWorkspace('local', code, {
      identity: {
        id: route.principal,
        actor: { kind: 'human', name: 'You', color: '#e0662f' },
        device: { id: `local:${route.principal}`, name: 'This device' },
      },
      validateReceive: () => {
        throw Error('No remote input in this fixture');
      },
    });
    if (result.kind !== 'ready') throw Error(result.reason);
    try {
      await result.workspace
        .text({ kind: 'master' })
        .input({ name: 'insert', text: 'Private preview <script>sentinel</script>' }).accepted;
      await result.workspace.whenDurable();
    } finally {
      await result.workspace.close();
    }
  }, code);
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await state(page, 'ready');
  await expect(page.locator('.goals .cm-content')).toHaveText(
    'Private preview <script>sentinel</script>',
  );
  await expect(page.locator('.goals .cm-content script')).toHaveCount(0);
  await expect(page.locator('.goals .cm-content')).toHaveAttribute('contenteditable', 'true');
  await lock(page);
  await expect(page.getByText('Private preview', { exact: false })).toHaveCount(0);
  expect(JSON.stringify(await census(page))).not.toContain('Private preview');
});

test('interrupted creation reopens with the saved factor and original identity', async ({
  page,
}) => {
  await page.goto('/test/local-app/protected-startup.html');
  await state(page, 'fresh');
  const recordAbort = await refuseNativeGenesisContent(page);
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const code = (await page.getByLabel('Generated unlock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await state(page, 'unavailable');
  await recordAbort();
  expect(
    await page.evaluate(
      () => (window as unknown as { startupAbortObserved: boolean }).startupAbortObserved,
    ),
  ).toBe(true);
  const originalClaim = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const request = indexedDB.open('done.custody');
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('entries')
            .objectStore('entries')
            .get(['local', 'local-genesis-v1']);
          read.onsuccess = () => {
            resolve(JSON.stringify(read.result.initial));
            db.close();
          };
        };
      }),
  );
  await page.reload();
  await state(page, 'creation-pending');
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await state(page, 'ready');
  expect(
    await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const request = indexedDB.open('done.custody');
          request.onsuccess = () => {
            const db = request.result;
            const read = db
              .transaction('entries')
              .objectStore('entries')
              .get(['local', 'local-genesis-v1']);
            read.onsuccess = () => {
              resolve(JSON.stringify(read.result.initial));
              db.close();
            };
          };
        }),
    ),
  ).toBe(originalClaim);
  await lock(page);
});
