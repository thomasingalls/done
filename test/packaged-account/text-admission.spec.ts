import { test, expect, type Page } from '@playwright/test';
import { pairedEditors, openSaved } from './devices';
import { startService, stopService } from './server';

const goals = (page: Page) => page.locator('.goals .cm-content');
const append = async (page: Page, text: string) => {
  await goals(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
  await expect(goals(page)).toContainText(text.trim());
};

test('Account text undo spans received edits and journal-only offline reopening', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    await append(page, '\nFirst text transaction');
    await expect(goals(second)).toContainText('First text transaction', { timeout: 15000 });
    await append(second, '\nSecond text transaction');
    await expect(goals(page)).toContainText('Second text transaction', { timeout: 15000 });
    await goals(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(goals(page)).not.toContainText('First text transaction');
    await expect(goals(page)).toContainText('Second text transaction');
    await expect(goals(second)).not.toContainText('First text transaction', { timeout: 15000 });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(goals(second)).toContainText('First text transaction', { timeout: 15000 });
    await pair.other.setOffline(true);
    await append(second, '\nRetained offline text');
    await append(page, '\nWriting while peer away');
    await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await second.goto('/');
    await openSaved(second, pair.next.code, true);
    await expect(goals(second)).toContainText('Retained offline text');
    await pair.other.setOffline(false);
    await expect(goals(second)).toContainText('Writing while peer away', { timeout: 20000 });
    await expect(goals(page)).toContainText('Retained offline text', { timeout: 20000 });
    await goals(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(goals(page)).not.toContainText('Writing while peer away');
    await expect(goals(page)).toContainText('Retained offline text');
    await expect(goals(second)).not.toContainText('Writing while peer away', { timeout: 15000 });
    for (const [p, code, joined] of [
      [page, pair.first.code, false],
      [second, pair.next.code, true],
    ] as const) {
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.context().setOffline(true);
      await p.goto('/');
      await openSaved(p, code, joined);
      await expect(goals(p)).toContainText('Retained offline text');
      await expect(goals(p)).not.toContainText('Writing while peer away');
    }
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
