import { expect, type Page } from '@playwright/test';
const factors = new WeakMap<Page, string>();
export const unlockApp = async (page: Page) => {
  const startup = page.locator('.local-startup');
  await expect(startup).toHaveAttribute('data-state', /fresh|unlock-required/);
  if ((await startup.getAttribute('data-state')) === 'fresh') {
    await page.getByRole('button', { name: 'Create Local workspace' }).click();
    const code = (await page.getByLabel('Generated device-lock code').textContent())!;
    factors.set(page, code);
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and create' }).click();
  } else {
    const code = factors.get(page);
    if (!code) throw Error('This test has not retained its unlock factor.');
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  }
  await expect(page.locator('.shell[data-local-workspace]')).toBeVisible();
};
export const openApp = async (page: Page) => {
  await page.goto('/');
  await unlockApp(page);
};
export const reloadApp = async (page: Page) => {
  await page.reload();
  await unlockApp(page);
};
