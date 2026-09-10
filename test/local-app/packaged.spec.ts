import { test, expect } from '@playwright/test';

for (const entry of ['/', '/local.html']) {
  test(`packaged ${entry} locks and cold-opens offline with accepted writing`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'fresh');
    await page.getByRole('button', { name: 'Create Local workspace' }).click();
    const code = (await page.getByLabel('Generated device-lock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and create' }).click();
    const compose = page.locator('.day-panel[data-active="true"] .compose-field');
    await expect(compose).toBeVisible();
    await compose.fill('Offline encrypted writing');
    await compose.press('Enter');
    await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Offline encrypted writing',
    );
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
    await expect(page.getByText('Offline encrypted writing')).toHaveCount(0);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Offline encrypted writing',
    );
    expect(
      await page.evaluate(async () =>
        (await indexedDB.databases()).some((db) => db.name === 'done'),
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}
