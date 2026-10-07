import { test, expect } from '@playwright/test';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { startService, stopService, origin } from './server';
test('both devices cold-open from the cache, retain offline edits and deliver after service restart', async ({
  page,
  browser,
}, info) => {
  const state = info.outputPath('service');
  let service = await startService(state);
  const pair = await pairedEditors(page, browser);
  const firstContext = page.context();
  try {
    const firstCredentials = await credentials(pair.first.auth),
      secondCredentials = await credentials(pair.next.auth);
    for (const p of [page, pair.second])
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await stopService(service);
    await firstContext.setOffline(true);
    await pair.other.setOffline(true);
    await page.close();
    await pair.second.close();
    const a = await firstContext.newPage(),
      b = await pair.other.newPage();
    const errors: string[] = [];
    for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
    const aAuth = await restoreAuthenticator(a, firstCredentials),
      bAuth = await restoreAuthenticator(b, secondCredentials);
    for (const p of [a, b]) {
      await p.goto(origin + '/');
      expect(await p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    }
    await openSaved(a, pair.first.code);
    await openSaved(b, pair.next.code, true);
    for (const p of [a, b])
      await expect(p.locator('.shell')).toContainText('Keep the first device writing');
    await add(a, 'Offline after cold start on A');
    await add(b, 'Offline after cold start on B');
    // A second offline close proves the queued edits came from storage, not the previous document.
    const savedA = await credentials(aAuth),
      savedB = await credentials(bAuth);
    const deepA = a.url(),
      deepB = b.url();
    for (const p of [a, b])
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await a.close();
    await b.close();
    const reopenedA = await firstContext.newPage(),
      reopenedB = await pair.other.newPage();
    await restoreAuthenticator(reopenedA, savedA);
    await restoreAuthenticator(reopenedB, savedB);
    await reopenedA.goto(deepA);
    await reopenedB.goto(deepB);
    await reopenedA.getByLabel('Device-lock code', { exact: true }).fill(pair.first.code);
    await reopenedA.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await reopenedB.getByLabel('Device-lock code', { exact: true }).fill(pair.next.code);
    await reopenedB.getByRole('button', { name: 'Unlock enrollment', exact: true }).click();
    await expect(reopenedA.locator('.shell')).toContainText('Offline after cold start on A');
    await expect(reopenedB.locator('.shell')).toContainText('Offline after cold start on B');
    service = await startService(state);
    await firstContext.setOffline(false);
    await pair.other.setOffline(false);
    for (const p of [reopenedA, reopenedB])
      for (const text of ['Offline after cold start on A', 'Offline after cold start on B'])
        await expect(p.locator('.shell')).toContainText(text, { timeout: 20000 });
    expect(errors).toEqual([]);
  } finally {
    await pair.other.close();
    await stopService(service);
  }
});
