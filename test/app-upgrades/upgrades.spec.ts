import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const unlock = async (page: Page, code: string) => {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.compose-field').first()).toBeVisible();
};
const write = async (page: Page, text: string) => {
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill(text);
  await compose.press('Enter');
  await expect(page.locator('.card').filter({ hasText: text })).toBeVisible();
};
const lock = async (page: Page) => {
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
};
const ready = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
const waiting = (page: Page) =>
  page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state ?? null,
  );
const update = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw Error('Missing registration');
    await registration.update();
  });
const create = async (page: Page, controlled = true, expectedVersion = 'upgrade-a') => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await write(page, 'Before update');
  await lock(page);
  await ready(page);
  if (controlled) {
    await page.reload(); // First install deliberately does not claim an already loaded page.
    await unlock(page, code);
    if (expectedVersion) await expect(page.locator('body')).toContainText(expectedVersion);
  }
  return code;
};

test.beforeEach(async ({ request }) => {
  await request.post('/__release', { data: { version: 'a' } });
});

test('every cached URL is a real file with exactly matching HTTP bytes', async ({ request }) => {
  const root = join(process.env['APP_UPGRADE_OUTPUT']!, 'a');
  const worker = await readFile(join(root, 'sw.js'), 'utf8');
  const paths = JSON.parse(
    worker.match(/const PRECACHE = ([\s\S]*?);\nconst URLS/)![1]!,
  ) as string[];
  for (const path of paths) {
    const bytes = await readFile(join(root, path === '/' ? 'index.html' : path.slice(1)));
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(bytes);
  }
  expect(paths).toEqual(
    expect.arrayContaining(['/manifest.webmanifest', '/icon-192.png', '/local.html']),
  );
  expect(paths.some((path) => /private|cleanup|recovery|\.map$/u.test(path))).toBe(false);
});

test('first installation closes and reopens offline without taking over its original page', async ({
  page,
  context,
}) => {
  const code = await create(page, false);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBe(null);
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto('/local.html');
  await unlock(offline, code);
  await expect(offline.locator('.card').filter({ hasText: 'Before update' })).toBeVisible();
  await expect(offline.locator('body')).toContainText('upgrade-a');
});

test('the supplied predecessor upgrades into the new policy with its later writing intact', async ({
  page,
  context,
  request,
}) => {
  test.skip(
    process.env['APP_UPGRADE_HAS_PRIOR'] !== '1',
    'Supply APP_UPGRADE_PREDECESSOR_DIR to exercise the actual prior build.',
  );
  await request.post('/__release', { data: { version: 'prior' } });
  const code = await create(page, true, '');
  const beforeCaches = await page.evaluate(() => caches.keys());
  await request.post('/__release', { data: { version: 'b' } });
  await update(page);
  await expect.poll(() => waiting(page)).toBe('installed');
  await write(page, 'Written on the actual predecessor while update waits');
  await lock(page);
  await page.close();
  await context.setOffline(true);
  const next = await context.newPage();
  await next.goto('/');
  await unlock(next, code);
  await expect(next.locator('body')).toContainText('upgrade-b');
  await expect(
    next
      .locator('.card')
      .filter({ hasText: 'Written on the actual predecessor while update waits' }),
  ).toBeVisible();
  // Unscoped predecessor caches are retained, not guessed to belong to this new namespace.
  expect(await next.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(beforeCaches));
});

test('two old tabs retain their release and writing until final close; new release reopens offline', async ({
  page,
  context,
  request,
}) => {
  const code = await create(page);
  const second = await context.newPage();
  await second.goto('/local.html');
  await unlock(second, code);
  await page.evaluate(async () => {
    const other = await caches.open('unrelated-cache');
    await other.put('/unrelated', new Response('retain me'));
  });
  await request.post('/__release', { data: { version: 'b' } });
  await update(page);
  await expect.poll(() => waiting(page)).toBe('installed');
  await expect(page.locator('.app-update-notice')).toContainText('Update ready');
  await write(page, 'Accepted with update waiting');
  await lock(page);
  await page.close();
  await expect.poll(() => waiting(second)).toBe('installed');
  await expect(second.locator('body')).toContainText('upgrade-a');
  await lock(second);
  await second.reload(); // A reload still overlaps the old controlled client.
  await unlock(second, code);
  await expect(
    second.locator('.card').filter({ hasText: 'Accepted with update waiting' }),
  ).toBeVisible();
  await expect(second.locator('body')).toContainText('upgrade-a');
  await expect.poll(() => waiting(second)).toBe('installed');
  await lock(second);
  await second.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await unlock(reopened, code);
  await expect(reopened.locator('body')).toContainText('upgrade-b');
  await expect(
    reopened.locator('.card').filter({ hasText: 'Accepted with update waiting' }),
  ).toBeVisible();
  expect(await reopened.evaluate(async () => (await caches.match('/unrelated'))?.text())).toBe(
    'retain me',
  );
  await write(reopened, 'Offline after upgrade');
  await lock(reopened);
  await reopened.close();
  const again = await context.newPage();
  await again.goto('/local.html');
  await unlock(again, code);
  await expect(again.locator('.card').filter({ hasText: 'Offline after upgrade' })).toBeVisible();
});

for (const fault of ['missing', 'wrong-bytes']) {
  test(`failed ${fault} download keeps old release recoverable and allows a later retry`, async ({
    page,
    context,
    request,
  }) => {
    const code = await create(page);
    await request.post('/__release', { data: { version: 'b', fault } });
    await update(page);
    await expect
      .poll(async () =>
        (await request.get('/__requests'))
          .json()
          .then((rows) =>
            rows.some((row: { path: string }) => row.path === '/manifest.webmanifest'),
          ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.installing === null,
        ),
      )
      .toBe(true);
    expect(await waiting(page)).toBe(null);
    await write(page, `After refused ${fault} download`);
    await lock(page);
    await page.close();
    await context.setOffline(true);
    const old = await context.newPage();
    await old.goto('/');
    await unlock(old, code);
    await expect(old.locator('body')).toContainText('upgrade-a');
    await expect(
      old.locator('.card').filter({ hasText: `After refused ${fault} download` }),
    ).toBeVisible();
    await context.setOffline(false);
    await request.post('/__release', { data: { version: 'b' } });
    await update(old);
    await expect.poll(() => waiting(old)).toBe('installed');
    await lock(old);
    await old.close();
    const next = await context.newPage();
    await next.goto('/');
    await unlock(next, code);
    await expect(next.locator('body')).toContainText('upgrade-b');
  });
}

test('renderer death releases a waiting update and compatible rollback retains writing', async ({
  page,
  context,
  request,
}) => {
  const code = await create(page);
  await request.post('/__release', { data: { version: 'b' } });
  await update(page);
  await expect.poll(() => waiting(page)).toBe('installed');
  await write(page, 'Accepted before renderer death');
  const cdp = await context.newCDPSession(page);
  const crash = page.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => {});
  await crash;
  await page.close();
  const next = await context.newPage();
  await next.goto('/');
  await unlock(next, code);
  await expect(next.locator('body')).toContainText('upgrade-b');
  await expect(
    next.locator('.card').filter({ hasText: 'Accepted before renderer death' }),
  ).toBeVisible();
  await request.post('/__release', { data: { version: 'a' } });
  await update(next);
  await expect.poll(() => waiting(next)).toBe('installed');
  await lock(next);
  await next.close();
  const rollback = await context.newPage();
  await rollback.goto('/');
  await unlock(rollback, code);
  await expect(rollback.locator('body')).toContainText('upgrade-a');
  await expect(
    rollback.locator('.card').filter({ hasText: 'Accepted before renderer death' }),
  ).toBeVisible();
});

test('sensitivity control: immediate activation is detected with an old client alive', async ({
  page,
  request,
}) => {
  await create(page);
  await page.evaluate(async () => {
    (window as unknown as { oldWorker: ServiceWorker | null }).oldWorker =
      (await navigator.serviceWorker.getRegistration())!.active;
  });
  await request.post('/__release', { data: { version: 'b', fault: 'activate-mutant' } });
  await update(page);
  // The losing history must actually activate; a missing update cannot pass this control.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const active = (await navigator.serviceWorker.getRegistration())?.active;
        return (
          active?.state === 'activated' &&
          active !== (window as unknown as { oldWorker: ServiceWorker | null }).oldWorker
        );
      }),
    )
    .toBe(true);
  expect(await waiting(page)).toBe(null);
  // The normal case above requires a waiting worker. This deliberate mutant loses that property.
});
