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
/** Follow the visible disclosure before exercising its existing actions. */
export const openMenuSection = async (
  page: Page,
  name: 'Account' | 'Sync' | 'Data' | 'Install',
) => {
  const menu = page.locator('#menu');
  // Recovery/unlock screens may expose the same lifecycle action outside the writing shell.
  if (!(await menu.count())) return;
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  if (
    (await trigger.isVisible()) &&
    (await page.locator('.shell').getAttribute('data-menu')) !== 'open'
  )
    await trigger.click();
  const section = menu.locator(`details[data-menu-section="${name}"]`);
  // Historical upgrade fixtures intentionally serve predecessors with no disclosures.
  if (!(await section.count())) return;
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
};
export const protectApp = async (page: Page) => {
  await openMenuSection(page, 'Account');
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
