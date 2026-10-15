import { test, expect, type Page } from '@playwright/test';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService, startBackend, stopProcess } from './server';

test('a legacy session host receives both ways across restart without requesting unsupported history', async ({
  page,
  browser,
}, info) => {
  const state = info.outputPath('service');
  const service = await startService(state, process.env['RECEIVER_TEST_BUILD'], true, false);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const history: string[] = [];
  const observe = (p: Page) =>
    p.on('request', (r) => {
      if (new URL(r.url()).pathname === '/account/history/v1/checkpoint') history.push(r.method());
    });
  observe(page);
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async (second) => {
        observe(second);
      },
    });
    await add(page, 'Legacy first device reaches the second');
    await expect(pair.second.locator('.shell')).toContainText(
      'Legacy first device reaches the second',
      { timeout: 20000 },
    );
    await add(pair.second, 'Legacy second device reaches the first');
    await expect(page.locator('.shell')).toContainText('Legacy second device reaches the first', {
      timeout: 20000,
    });
    await stopProcess(service.backend);
    await add(page, 'Legacy writing retained across restart');
    service.backend = await startBackend(state, true, false);
    await expect(pair.second.locator('.shell')).toContainText(
      'Legacy writing retained across restart',
      { timeout: 20000 },
    );
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.context().setOffline(true);
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await add(page, 'Legacy offline writing survives reopening');
    await page.context().setOffline(false);
    await expect(pair.second.locator('.shell')).toContainText(
      'Legacy offline writing survives reopening',
      { timeout: 20000 },
    );
    expect(history).toEqual([]);
  } finally {
    await page.context().setOffline(false);
    await pair?.other.close();
    await stopService(service);
  }
});

const historyPanel = (page: Page) =>
  page.getByRole('region', { name: 'History maintenance', exact: true });
async function inspectHistory(page: Page) {
  await page.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await historyPanel(page).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(
    historyPanel(page).getByRole('button', { name: 'Check history', exact: true }),
  ).toBeEnabled();
}

test('a false capability hint and history outage cannot bypass cold retained history before ordinary receive', async ({
  page,
  browser,
}, info) => {
  const service = await startService(
    info.outputPath('service'),
    process.env['RECEIVER_TEST_BUILD'],
    true,
    true,
  );
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    await page.route('**/account/delivery/submit', (route) => route.abort());
    await add(page, 'This writing arrives only in authenticated history');
    await inspectHistory(page);
    await historyPanel(page)
      .getByRole('button', { name: 'Create history snapshot', exact: true })
      .click();
    await expect(historyPanel(page)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
      { timeout: 15000 },
    );
    await inspectHistory(second);
    await historyPanel(second)
      .getByRole('button', { name: 'Verify history snapshot', exact: true })
      .click();
    await expect(historyPanel(second)).toContainText('Verified snapshot 1 is saved.', {
      timeout: 15000,
    });
    await expect(second.locator('.shell')).toContainText(
      'This writing arrives only in authenticated history',
      { timeout: 20000 },
    );
    await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await second.evaluate(() => localStorage.setItem('done.account-service.membership.v2', '0'));
    await second.route('**/__account-setup/config', async (route) => {
      const response = await route.fetch();
      const value = await response.json();
      delete value.membershipContinuation;
      await route.fulfill({ response, json: value });
    });
    let historyAttempts = 0,
      ordinaryReads = 0;
    await second.route('**/account/history/v1/checkpoint', (route) => {
      historyAttempts++;
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{"ok":false,"refusal":"not-found"}',
      });
    });
    second.on('request', (request) => {
      if (new URL(request.url()).pathname === '/account/delivery/read-v2') ordinaryReads++;
    });
    await second.goto('/');
    await openSaved(second, pair.next.code, true);
    await expect(second.locator('.shell')).toContainText(
      'This writing arrives only in authenticated history',
    );
    await expect.poll(() => historyAttempts, { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await add(second, 'Local writing remains available during history outage');
    await expect(second.locator('.shell')).toContainText(
      'Local writing remains available during history outage',
    );
    await second.evaluate(() => dispatchEvent(new Event('online')));
    await expect.poll(() => historyAttempts, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    expect(ordinaryReads).toBe(0);
    await expect
      .poll(() => second.evaluate(() => localStorage.getItem('done.account-service.membership.v2')))
      .toBe('0');
    // Restore only the transport fault. The false public hint remains, so authenticated
    // retained history must still be checked successfully before delivery may continue.
    await second.unroute('**/account/history/v1/checkpoint');
    await page.unroute('**/account/delivery/submit');
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await add(page, 'Ordinary delivery resumes after authenticated history returns');
    await second.evaluate(() => dispatchEvent(new Event('online')));
    await expect(second.locator('.shell')).toContainText(
      'Ordinary delivery resumes after authenticated history returns',
      { timeout: 20000 },
    );
    expect(ordinaryReads).toBeGreaterThan(0);
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
