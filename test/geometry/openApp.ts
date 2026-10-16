import { expect, type Page } from '@playwright/test';
const factors = new WeakMap<Page, string>();
export const unlockApp = async (page: Page) => {
  await page.waitForFunction(
    () => document.querySelector('.shell') || document.querySelector('#local-code'),
  );
  if (!(await page.locator('.shell').isVisible())) {
    const code = factors.get(page);
    if (!code) throw Error('This test has not retained its unlock factor.');
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  }
  await expect(page.locator('.shell[data-local-workspace]')).toBeVisible();
};
export const protectApp = async (page: Page) => {
  await page.getByRole('button', { name: 'Add an unlock code', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const code = (await page.getByLabel('Generated unlock code').textContent())!;
  factors.set(page, code);
  await page.getByRole('button', { name: 'I saved my unlock code' }).click();
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and protect' }).click();
  await expect(page.getByRole('heading', { name: 'Protection is enabled' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Today' }).click();
  return code;
};
export const openApp = async (page: Page) => {
  await page.goto('/');
  await unlockApp(page);
};
export const reloadApp = async (page: Page) => {
  await page.reload();
  await unlockApp(page);
};
