import { test } from '../release-validation/browser-fixture';
/** The Local build has no transport attached; the legacy provider stays covered by its core harnesses. */
import { expect } from '@playwright/test';
import { openApp, reloadApp } from './openApp';

test('Local editing and reload work with no relay or plaintext identity cache', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openApp(page);
  await expect(
    page.getByText('Off. This Local workspace is not connected to a relay.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Relay endpoint' })).toHaveCount(0);
  const compose = page.locator(
    '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
  );
  await compose.fill('Local writing without a relay');
  await compose.press('Enter');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Local writing without a relay',
  );
  await reloadApp(page);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Local writing without a relay',
  );
  expect(sockets).toEqual([]);
  expect(
    await page.evaluate(() => [
      localStorage.getItem('done.actor'),
      localStorage.getItem('done.device'),
    ]),
  ).toEqual([null, null]);
});
