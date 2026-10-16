import { test } from '../release-validation/browser-fixture';
import { expect } from '@playwright/test';
import { openApp } from './openApp';

test('macOS Firefox defaults identify the browser and Install checks storage without menu-install guidance', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Firefox/150.0',
    });
    Object.defineProperty(navigator, 'userAgentData', { value: undefined });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0 });
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false });
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        document.documentElement.dataset['storageRequested'] = 'true';
        return true;
      },
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await expect(page.getByLabel('Device name', { exact: true })).toHaveValue('Firefox - macOS');
  const install = page.getByRole('region', { name: 'Install', exact: true });
  await expect(install).not.toContainText('browser’s menu');
  await install.getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-storage-requested', 'true');
  await expect(install.getByRole('status')).toContainText('Persistent local storage is enabled');
  await expect(page.locator('.menu-row').filter({ hasText: 'Local data' })).toContainText(
    'Persistent',
  );
});
