import { test, expect } from '@playwright/test';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { startService, stopService, startBackend, stopProcess, origin } from './server';

test('packaged session host enrolls both devices, renews after restart and retains offline writing', async ({
  page,
  browser,
  request,
}, info) => {
  const state = info.outputPath('service');
  const service = await startService(state, undefined, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const errors: string[] = [],
    paths: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => paths.push(new URL(r.url()).pathname));
  try {
    pair = await pairedEditors(page, browser, true);
    const config = await request.post('/__account-setup/config', {
      headers: { Origin: origin },
      data: {},
    });
    expect(await config.json()).toMatchObject({ v: 2, networkSessions: true });
    expect(
      (
        await request.post('/__account-setup/access', { headers: { Origin: origin }, data: {} })
      ).status(),
    ).toBe(404);
    await add(page, 'Session transport A to B');
    await expect(pair.second.locator('.shell')).toContainText('Session transport A to B', {
      timeout: 20000,
    });
    await add(pair.second, 'Session transport B to A');
    await expect(page.locator('.shell')).toContainText('Session transport B to A', {
      timeout: 20000,
    });
    await stopProcess(service.backend);
    await add(page, 'Queued across session service restart');
    service.backend = await startBackend(state, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Queued across session service restart',
      { timeout: 20000 },
    );
    const saved = await credentials(pair.next.auth);
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.other.setOffline(true);
    await pair.second.close();
    const reopened = await pair.other.newPage();
    await restoreAuthenticator(reopened, saved);
    await reopened.goto(origin + '/');
    await openSaved(reopened, pair.next.code, true);
    await add(reopened, 'Offline session reopening');
    await pair.other.setOffline(false);
    await expect(page.locator('.shell')).toContainText('Offline session reopening', {
      timeout: 20000,
    });
    expect(paths).toContain('/account/grant/v1/finish');
    expect(paths).not.toContain('/__account-setup/access');
    expect(errors).toEqual([]);
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
