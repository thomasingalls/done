import { test } from '../release-validation/browser-fixture';
import { expect } from '@playwright/test';
import { protectApp, openMenuSection } from '../geometry/openApp';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const releaseRoot = resolve(process.env['LOCAL_STARTUP_PREVIEW_ROOT'] ?? 'dist');

test('packaged precache names real files and serves their exact bytes', async ({ request }) => {
  const worker = await readFile(join(releaseRoot, 'sw.js'), 'utf8');
  const entries = JSON.parse(
    worker.match(/const PRECACHE = ([\s\S]*?);\nconst URLS/)![1]!,
  ) as string[];
  expect(entries).toEqual(expect.arrayContaining(['/', '/index.html', '/local.html']));
  for (const path of entries) {
    const file = join(releaseRoot, path === '/' ? 'index.html' : path.slice(1));
    await access(file); // A preview server's HTML fallback must not disguise a missing asset.
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(await readFile(file));
  }
  expect(entries).toEqual(
    expect.arrayContaining([
      '/manifest.webmanifest',
      '/favicon.svg',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
    ]),
  );
  expect(entries.some((path) => /private|migration|recovery|binding|\.map$/u.test(path))).toBe(
    false,
  );
});

for (const entry of ['/', '/local.html']) {
  test(`packaged ${entry} locks and cold-opens offline with accepted writing`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(page.locator('.shell[data-local-workspace]')).toBeVisible();
    const code = await protectApp(page);
    const compose = page.locator(
      '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
    );
    await expect(compose).toBeVisible();
    await compose.fill('Offline encrypted writing');
    await compose.press('Enter');
    await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Offline encrypted writing',
    );
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
    await expect(page.getByText('Offline encrypted writing')).toHaveCount(0);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
    await context.setOffline(true);
    await page.close();
    const offline = await context.newPage();
    offline.on('pageerror', (error) => errors.push(error.message));
    await offline.goto(entry);
    await expect(offline.locator('.local-startup')).toHaveAttribute(
      'data-state',
      'unlock-required',
    );
    await offline.getByLabel('Unlock code', { exact: true }).fill(code);
    await offline.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(offline.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Offline encrypted writing',
    );
    await offline
      .locator('.day-panel[data-active="true"] .collection[data-section="done"] .compose-field')
      .fill('Written while offline');
    await offline
      .locator('.day-panel[data-active="true"] .collection[data-section="done"] .compose-field')
      .press('Enter');
    await expect(
      offline.locator('.card').filter({ hasText: 'Written while offline' }),
    ).toBeVisible();
    await openMenuSection(offline, 'Account');
    await offline.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(offline.locator('.local-startup')).toHaveAttribute(
      'data-state',
      'unlock-required',
    );
    await offline.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => errors.push(error.message));
    await reopened.goto(entry);
    await reopened.getByLabel('Unlock code', { exact: true }).fill(code);
    await reopened.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(
      reopened.locator('.card').filter({ hasText: 'Written while offline' }),
    ).toBeVisible();
    expect(
      await reopened.evaluate(async () =>
        (await indexedDB.databases()).some((db) => db.name === 'done'),
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
    await reopened.close();
  });
}
