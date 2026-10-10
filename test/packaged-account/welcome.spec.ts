import { test, expect } from '@playwright/test';
import { startService, stopService } from './server';

test('the mobile welcome action starts and resumes the existing account ceremony', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bpreview\b|\bdevelopment\b/i);
    await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
    const attempt = page.url();
    expect(new URL(attempt).pathname).toMatch(/^\/setup\/account-[a-f0-9]{32}\/intro$/);
    await page.getByLabel('Your name', { exact: true }).fill('Mobile workspace');
    await page.goBack();
    // The approved ceremony Back destination is the chooser, regardless of entry point.
    await expect(
      page.getByRole('heading', { name: 'Choose an account', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue setup for new account', exact: true }).click();
    await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Mobile workspace');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
    await expect(page).toHaveURL(attempt);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(attempt);
    await page.goto('/accounts');
    await expect(
      page.getByRole('button', { name: 'Continue setup for new account', exact: true }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connect devices', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bpreview\b|\bdevelopment\b/i);
    await page.context().setOffline(true);
    await expect(page.getByRole('status')).toContainText(
      'Offline. Saved workspaces remain available',
    );
    await page.context().setOffline(false);
    await expect(page.locator('.account-offline-note')).toHaveCount(0);
  } finally {
    await stopService(service);
  }
});

test('welcome reports an occupied setup owner and allows retry after it closes', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Create a workspace', exact: true }),
    ).toBeEnabled();
    await page.evaluate(
      () =>
        new Promise<void>((ready) => {
          void navigator.locks.request(
            'done.first-device-setup.v1',
            () =>
              new Promise<void>((release) => {
                Object.assign(window, { releaseSetupLock: release });
                ready();
              }),
          );
        }),
    );
    await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('An account is open in another tab.');
    await expect(
      page.getByRole('button', { name: 'Create a workspace', exact: true }),
    ).toBeEnabled();
    await page.evaluate(async () => {
      (window as unknown as { releaseSetupLock: () => void }).releaseSetupLock();
      await navigator.locks.request('done.first-device-setup.v1', () => {});
    });
    await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
  } finally {
    await stopService(service);
  }
});

test('the empty Local entry offers the same working account action', async ({ page }, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.goto('/local/fresh');
    await page.getByRole('button', { name: 'Create a workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
    await page.getByRole('button', { name: 'Open local-only workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Create a local-only workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Save your device-lock code', exact: true }),
    ).toBeVisible();
  } finally {
    await stopService(service);
  }
});
