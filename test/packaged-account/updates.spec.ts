import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { startService, stopService, origin } from './server';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { authenticator } from '../device-enrollment/helpers';
const nextVersion = 'packaged-account-update-b';
function buildNext(path: string) {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { build } from 'vite'; await build({ build: { outDir: process.argv[1] }, define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify('${nextVersion}') } });`,
      path,
    ],
    { stdio: 'pipe', timeout: 30000 },
  );
}
const update = (p: Page) =>
  p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (!r) throw Error('No worker');
    await r.update();
  });
const waiting = (p: Page) =>
  p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state ?? null);
async function sourceUnlock(p: Page, code: string) {
  await p.getByLabel('Device-lock code', { exact: true }).fill(code);
  await p.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
  await expect(p.locator('.shell')).toBeVisible();
}

test('a waiting update preserves both publishers and queued writing through offline activation', async ({
  page,
  browser,
}, info) => {
  const state = info.outputPath('service'),
    build = info.outputPath('next-build');
  buildNext(build);
  let service = await startService(state);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const aContext = page.context();
  try {
    pair = await pairedEditors(page, browser);
    // First installation deliberately does not take over an existing page.
    await page.reload();
    await sourceUnlock(page, pair.first.code);
    await pair.second.reload();
    await pair.second.getByLabel('Device-lock code', { exact: true }).fill(pair.next.code);
    await pair.second.getByRole('button', { name: 'Unlock enrollment', exact: true }).click();
    await expect(pair.second.locator('.shell')).toBeVisible();
    for (const p of [page, pair.second])
      expect(await p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const oldVersion = await page
      .locator('.menu-row')
      .filter({ hasText: 'Version' })
      .locator('.menu-value')
      .textContent();
    // Allow app downloads, but keep original account envelopes queued across the switch.
    for (const context of [aContext, pair.other])
      await context.route('**/account/delivery/**', (route) => route.abort('internetdisconnected'));
    await add(page, 'Queued from A before app update');
    await add(pair.second, 'Queued from B before app update');
    await stopService(service);
    service = await startService(state, build);
    for (const p of [page, pair.second]) {
      await update(p);
      await expect.poll(() => waiting(p)).toBe('installed');
      await expect(p.locator('body')).toContainText('Update ready.');
      expect(
        await p
          .locator('.menu-row')
          .filter({ hasText: 'Version' })
          .locator('.menu-value')
          .textContent(),
      ).toBe(oldVersion);
    }
    await add(page, 'Accepted while app update waits');
    const aKeys = await credentials(pair.first.auth),
      bKeys = await credentials(pair.next.auth);
    for (const p of [page, pair.second])
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.close();
    await pair.second.close();
    await aContext.setOffline(true);
    await pair.other.setOffline(true);
    const a = await aContext.newPage(),
      b = await pair.other.newPage();
    await restoreAuthenticator(a, aKeys);
    await restoreAuthenticator(b, bKeys);
    for (const p of [a, b]) await p.goto(origin + '/');
    await openSaved(a, pair.first.code);
    await openSaved(b, pair.next.code, true);
    for (const p of [a, b]) await expect(p.locator('body')).toContainText(nextVersion);
    await expect(a.locator('.shell')).toContainText('Queued from A before app update');
    await expect(a.locator('.shell')).toContainText('Accepted while app update waits');
    await expect(b.locator('.shell')).toContainText('Queued from B before app update');
    for (const context of [aContext, pair.other]) {
      await context.unroute('**/account/delivery/**');
      await context.setOffline(false);
    }
    for (const p of [a, b])
      for (const text of [
        'Queued from A before app update',
        'Queued from B before app update',
        'Accepted while app update waits',
      ])
        await expect(p.locator('.shell')).toContainText(text, { timeout: 20000 });
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});

test('unfinished registration resumes after an update with the original saved passkey proof', async ({
  page,
  context,
}, info) => {
  const state = info.outputPath('service'),
    build = info.outputPath('next-build');
  buildNext(build);
  let service = await startService(state);
  try {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Resumable setup');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const code = (await page.getByLabel('Generated device-lock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
    const auth = await authenticator(page);
    await expect(page.getByRole('button', { name: 'Create passkey', exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('needs a connection');
    const retained = await credentials(auth);
    expect(retained).toHaveLength(1);
    const route = page.url();
    await context.setOffline(false);
    await stopService(service);
    service = await startService(state, build);
    await update(page);
    await expect.poll(() => waiting(page)).toBe('installed');
    await expect(page.getByText('Update ready.', { exact: false })).toBeVisible();
    await page.close();
    const resumed = await context.newPage();
    const nextAuth = await restoreAuthenticator(resumed, retained);
    await resumed.goto(route);
    await resumed.getByLabel('Device-lock code', { exact: true }).fill(code);
    await resumed.getByRole('button', { name: 'Continue', exact: true }).click();
    await resumed.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    const recovery = (await resumed.getByLabel('Generated recovery code').textContent())!;
    await resumed.getByRole('button', { name: 'I saved my recovery code' }).click();
    await resumed.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await resumed.getByRole('button', { name: 'Finish account setup' }).click();
    await expect(resumed.locator('.shell')).toBeVisible();
    await expect(resumed.locator('body')).toContainText(nextVersion);
    expect((await credentials(nextAuth)).map((x) => x.credentialId)).toEqual(
      retained.map((x) => x.credentialId),
    );
    expect(new URL(resumed.url()).pathname.split('/')[2]).toBe(
      new URL(route).pathname.split('/')[2],
    );
    await add(resumed, 'Writing after resumed account setup');
  } finally {
    await stopService(service);
  }
});
