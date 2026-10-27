import { expect } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp } from './openApp';

for (const section of ['done', 'scheduled']) {
  test(`${section} quick entry keeps real Chromium composition visible and confirms before submitting`, async ({
    page,
  }) => {
    await openApp(page);
    const collection = page.locator(
      `.day-panel[data-active="true"] .collection[data-section="${section}"]`,
    );
    const field = collection.getByRole('textbox');
    const add = collection.getByRole('button', { name: 'Add', exact: true });
    const cards = collection.locator('.card');
    const cdp = await page.context().newCDPSession(page);
    await field.focus();
    for (const text of ['h', 'hel', 'hello']) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await expect(field).toHaveValue(text);
      await expect(add).toBeEnabled();
    }
    // Chromium supplies the actual preedit/input events above; this explicit
    // key event isolates the app's handling of an IME-owned confirmation key.
    const prevented = await field.evaluate((element) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(cards).toHaveCount(0);
    await expect(field).toHaveValue('hello');
    await cdp.send('Input.insertText', { text: 'hello world' });
    await expect(field).toHaveValue('hello world');
    await add.click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('hello world');
    await expect(field).toHaveValue('');
    await reloadApp(page);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('hello world');
    await cdp.detach();
  });
}
