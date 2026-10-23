import { expect } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, openMenuSection } from './openApp';

test('date text, padding and icon all request the picker, as do Enter and Space', async ({
  page,
}) => {
  await openApp(page);
  await openMenuSection(page, 'Account');
  const picker = page.getByLabel('Go to date', { exact: true });
  await page.evaluate(() => {
    Object.assign(window, { pickerCalls: 0 });
    HTMLInputElement.prototype.showPicker = function () {
      (window as unknown as { pickerCalls: number }).pickerCalls++;
    };
  });
  const box = (await picker.boundingBox())!;
  for (const x of [2, box.width * 0.4, box.width - 12])
    await picker.click({ position: { x, y: box.height / 2 } });
  await picker.press('Enter');
  await picker.press('Space');
  expect(
    await page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls),
  ).toBe(5);
});

test('date text requests the real native picker during user activation', async ({ page }) => {
  await openApp(page);
  await openMenuSection(page, 'Account');
  await page.evaluate(() => {
    const native = HTMLInputElement.prototype.showPicker;
    if (!native) throw Error('The tested browser must provide native showPicker');
    HTMLInputElement.prototype.showPicker = function () {
      const observation = { active: navigator.userActivation.isActive, returned: false };
      Object.assign(window, { nativePicker: observation });
      native.call(this);
      observation.returned = true;
    };
  });
  await page.getByLabel('Go to date', { exact: true }).click({ position: { x: 30, y: 15 } });
  expect(
    await page.evaluate(() => (window as unknown as { nativePicker?: unknown }).nativePicker),
  ).toEqual({ active: true, returned: true });
  await page.keyboard.press('Escape');
});

test('a missing or refused picker API retains native date entry and navigation', async ({
  page,
}) => {
  await openApp(page);
  for (const mode of ['missing', 'refused']) {
    await openMenuSection(page, 'Account');
    await page.evaluate((mode) => {
      Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
        configurable: true,
        value:
          mode === 'missing'
            ? undefined
            : function () {
                throw new DOMException('Refused', 'NotAllowedError');
              },
      });
    }, mode);
    const picker = page.getByLabel('Go to date', { exact: true });
    await picker.click({ position: { x: 30, y: 15 } });
    await page.keyboard.press('Escape');
    await openMenuSection(page, 'Account');
    await picker.fill(mode === 'missing' ? '2026-11-05' : '2026-11-06');
    await expect(page.locator('.day-panel[data-active="true"]')).toHaveAttribute(
      'data-date',
      mode === 'missing' ? '2026-11-05' : '2026-11-06',
    );
  }
});
