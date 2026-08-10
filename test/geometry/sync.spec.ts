/**
 * Sync, in a real browser (TRD §7.1, PRD principle 3).
 *
 * The unit tests inject the transport, which is right for asserting a state
 * machine and wrong for asserting the two things that only exist in a browser:
 * that the lazily-imported provider actually loads and reaches for a socket,
 * and that a relay which cannot be reached leaves the app entirely usable.
 *
 * The endpoint here refuses connections on purpose. "Offline is the normal
 * state, not a degraded one" is a ranked principle, and this is the test that
 * holds the app to it: no banner, no spinner, no read-only mode, and a card
 * composed while the provider is failing to connect behaves like any other.
 */

import { expect, test, type Page } from '@playwright/test';

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');

/**
 * The store opens asynchronously and the shell is blank until it has, so the
 * trigger is waited for rather than tested for. A menu that never opened is
 * still "visible" to a locator — it is translated off-screen, not hidden — so
 * the assertion is on the shell's state rather than on the panel.
 */
const openMenu = async (page: Page): Promise<void> => {
  const trigger = page.locator('.menu-trigger');
  await trigger.waitFor({ state: 'visible' });
  if ((await page.locator('.shell').getAttribute('data-menu')) !== 'open') await trigger.click();
  await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'open');
};

const relayStatus = (page: Page) => page.locator('.menu-row', { hasText: 'Relay' }).first();

/** Port 1 is reserved and closed: a relay that is definitely not there. */
const UNREACHABLE = 'ws://127.0.0.1:1';

test.describe('sync', () => {
  test('is off, and says the app is complete without it', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await expect(relayStatus(page)).toContainText('Off');
    await expect(page.getByText('No relay configured')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Relay endpoint' })).toHaveValue('');
    // Nothing to pause or forget until there is something configured.
    await expect(page.getByRole('button', { name: 'Forget' })).toHaveCount(0);
  });

  test('keeps the app writable while a configured relay cannot be reached', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await page.getByRole('textbox', { name: 'Relay endpoint' }).fill(UNREACHABLE);
    await page.getByRole('textbox', { name: 'Relay token' }).fill('a-shared-secret');
    await page.getByRole('button', { name: 'Connect' }).click();

    // The provider is loaded and trying; which of the two it is at this instant
    // is a race with the socket, and both are ordinary.
    await expect(relayStatus(page)).toContainText(/Connecting|Offline/);
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // The whole point: writing is unaffected by a relay that is not answering.
    await page.keyboard.press('Escape');
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'closed');
    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
    await compose.click();
    await page.keyboard.insertText('wrote this with the relay down');
    await page.keyboard.press('Enter');
    await expect(activeDay(page).getByText('wrote this with the relay down')).toBeVisible();

    // And the configuration survives a reload, so a device is set up once.
    await page.reload();
    await openMenu(page);
    await expect(page.getByRole('textbox', { name: 'Relay endpoint' })).toHaveValue(UNREACHABLE);
    await expect(activeDay(page).getByText('wrote this with the relay down')).toBeVisible();
  });

  test('keeps a just-created card when reload starts before IndexedDB auto-commits', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await page.getByRole('textbox', { name: 'Relay endpoint' }).fill(UNREACHABLE);
    await page.getByRole('button', { name: 'Connect' }).click();
    await page.reload();

    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
    await compose.fill('survives an immediate offline reload');
    await compose.evaluate((element) => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      window.location.reload();
    });

    await expect(activeDay(page).getByText('survives an immediate offline reload')).toBeVisible();
  });

  test('forgets a relay completely', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await page.getByRole('textbox', { name: 'Relay endpoint' }).fill(UNREACHABLE);
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByRole('button', { name: 'Forget' })).toBeVisible();

    await page.getByRole('button', { name: 'Forget' }).click();
    await expect(relayStatus(page)).toContainText('Off');
    await expect(page.getByRole('textbox', { name: 'Relay endpoint' })).toHaveValue('');

    await page.reload();
    await openMenu(page);
    await expect(relayStatus(page)).toContainText('Off');
    await expect(page.getByRole('textbox', { name: 'Relay endpoint' })).toHaveValue('');
  });
});
