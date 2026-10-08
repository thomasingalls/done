import { test, expect } from '@playwright/test';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

test('joined device invites a third through packaged UI; all three retain and exchange writing', async ({
  page,
  browser,
}, info) => {
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const thirdContext = await browser.newContext(),
    third = await thirdContext.newPage();
  third.setDefaultTimeout(15000);
  const errors: string[] = [];
  const observe = (p: typeof page) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('response', async (r) => {
      const path = new URL(r.url()).pathname;
      if (
        r.status() < 400 ||
        (!path.startsWith('/account/') && !path.startsWith('/__account-setup/'))
      )
        return;
      const body = await r.json().catch(() => ({}));
      console.log(
        'Account refusal:',
        path,
        r.status(),
        body.refusal ?? body.reason ?? 'unavailable',
      );
    });
  };
  observe(page);
  observe(third);
  try {
    pair = await pairedEditors(page, browser, true);
    pair.second.setDefaultTimeout(15000);
    console.log('First two editors open');
    observe(pair.second);
    await add(page, 'Original writing before the third connection');
    await expect(pair.second.locator('.shell')).toContainText(
      'Original writing before the third connection',
      { timeout: 15000 },
    );
    await pair.second.getByRole('button', { name: 'Devices', exact: true }).click();
    console.log('Joined Devices open');
    await expect(pair.second.locator('.account-device-list li')).toHaveCount(2);
    await pair.second.getByRole('button', { name: 'Connect another device', exact: true }).click();
    console.log('Joined invitation unlock route');
    await unlock(pair.second, pair.next.code);
    console.log('Joined invitation unlock submitted');
    const link = await pair.second.getByLabel('Device invitation link').inputValue();
    expect(JSON.parse(atob(new URL(link).searchParams.get('invitation')!)).v).toBe(2);
    const next = await pending(third, link, pair.next.auth);
    const code = await compared(pair.second, third);
    // Closing the joining page must retain its exact comparison and its saved invitation route.
    await third.reload();
    await unlock(third, next.code);
    await expect(third.getByLabel('Comparison code')).toHaveText(code, { timeout: 15000 });
    await pair.second.getByLabel('Code on the new device').fill(code);
    await pair.second.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await expect(third.getByRole('button', { name: 'Open your writing', exact: true })).toBeVisible(
      { timeout: 30000 },
    );
    await expect(pair.second.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await third.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(third.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 20000,
    });
    await expect(third.locator('.shell')).toContainText(
      'Original writing before the third connection',
    );
    await pair.second.getByRole('link', { name: 'Close and return to accounts' }).click();
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await add(third, 'Third device writing reaches both existing devices');
    for (const p of [page, pair.second])
      await expect(p.locator('.shell')).toContainText(
        'Third device writing reaches both existing devices',
        { timeout: 20000 },
      );
    await add(pair.second, 'Joined device writing after approving the third');
    for (const p of [page, third])
      await expect(p.locator('.shell')).toContainText(
        'Joined device writing after approving the third',
        { timeout: 20000 },
      );
    for (const [p, code, joining] of [
      [page, pair.first.code, false],
      [pair.second, pair.next.code, true],
      [third, next.code, true],
    ] as const) {
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await openSaved(p, code, joining);
      await expect(p.locator('.shell')).toContainText(
        'Third device writing reaches both existing devices',
      );
      await expect(p.locator('.shell')).toContainText(
        'Joined device writing after approving the third',
      );
      await p.getByRole('button', { name: 'Devices', exact: true }).click();
      await expect(p.locator('.account-device-list [data-device-state=certified]')).toHaveCount(3);
      await p.screenshot({
        path: info.outputPath(
          'devices-' + (p === page ? 'first' : p === third ? 'third' : 'second') + '.png',
        ),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  } finally {
    for (const p of [page, pair?.second, third])
      if (p && !p.isClosed())
        console.log(
          'Final screen:',
          await p
            .locator('[role=alert], [role=status], [data-enrollment-state]')
            .allTextContents()
            .catch(() => []),
        );
    try {
      await thirdContext.close().catch(() => {});
      await pair?.other.close().catch(() => {});
    } finally {
      await stopService(service);
    }
  }
});
