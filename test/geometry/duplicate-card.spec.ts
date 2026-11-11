import { expect, type Locator } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp, openMenuSection, reloadApp } from './openApp';

const bodyOf = (card: Locator) =>
  card.locator('.cm-content').evaluate((element) => {
    const view = (element as HTMLElement & { cmTile?: { root?: { view?: EditorView } } }).cmTile
      ?.root?.view;
    if (!view) throw Error('No card editor');
    return view.state.doc.toString();
  });

for (const section of ['next', 'done', 'scheduled']) {
  test(`${section} ${section === 'next' ? 'Done for now records progress and schedules the original' : 'Duplicate creates an independent multiline Scheduled card'} with undo and reopen`, async ({
    page,
  }) => {
    await openApp(page);
    const day = page.locator('.day-panel[data-active="true"]');
    const collection = (name: string) => day.locator(`.collection[data-section="${name}"]`);
    const cards = (name: string) => collection(name).locator('.card');
    const body = 'Plan the trip\n- Book trains\n  - Check dates\n\nNotes **stay** here';
    const entry = collection(section === 'done' ? 'done' : 'scheduled').getByRole('textbox');
    await entry.fill(body);
    await entry.press('Enter');
    if (section === 'next')
      await cards('scheduled')
        .getByRole('button', { name: 'Move to Next: Plan the trip', exact: true })
        .click();
    const id = await cards(section).first().getAttribute('data-card');
    const source = day.locator(`.card[data-card="${id}"]`);
    const duplicate = source.getByRole('button', {
      name:
        section === 'next'
          ? 'Done for now: Plan the trip'
          : 'Duplicate to Scheduled: Plan the trip',
      exact: true,
    });
    await expect(duplicate).toBeVisible();
    if (section === 'next')
      await expect(source.getByRole('button', { name: /^Duplicate to Scheduled:/ })).toHaveCount(0);
    if (section === 'done') {
      await expect(source).toHaveAttribute('data-guarded', 'true');
      await expect(source.getByRole('button', { name: /^Move to Scheduled:/ })).toHaveCount(0);
    }
    await duplicate.click();
    const destination = section === 'next' ? 'done' : 'scheduled';
    const copy = day.locator(`.card[data-section="${destination}"]:not([data-card="${id}"])`);
    await expect(copy).toHaveCount(1);
    const copyId = await copy.getAttribute('data-card');
    expect(copyId).not.toBe(id);
    await expect(source).toHaveAttribute('data-card', id!);
    if (section === 'done') await expect(source).toHaveAttribute('data-guarded', 'true');
    if (section === 'next') {
      await expect(cards('next')).toHaveCount(0);
      await expect(source).toHaveAttribute('data-section', 'scheduled');
      await expect(copy.locator('.cm-content')).toBeFocused();
    } else await copy.locator('.card-surface').click();
    await expect.poll(() => bodyOf(copy)).toBe(body);
    await page.keyboard.insertText('independent ');
    if (section === 'next') await expect.poll(() => bodyOf(copy)).toBe(body + 'independent ');
    await copy.locator('.cm-content').press('Enter');
    await expect(copy.locator('.cm-content')).toHaveCount(0);
    await expect(source).not.toContainText('independent');
    await openMenuSection(page, 'Data');
    const undo = page.locator('#menu').getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect(copy).not.toContainText('independent');
    await undo.click();
    await expect(copy).toHaveCount(0);
    await expect(day.locator(`.card[data-card="${id}"]`)).toHaveCount(1);
    if (section === 'next') await expect(source).toHaveAttribute('data-section', 'next');
    await page.locator('#menu').getByRole('button', { name: 'Redo', exact: true }).click();
    await reloadApp(page);
    const coldCopy = day.locator(`.card[data-card="${copyId}"]`);
    await expect(coldCopy).toContainText('Check dates');
    await expect(day.locator(`.card[data-card="${id}"]`)).toContainText('Plan the trip');
    if (section === 'next') {
      await expect(source).toHaveAttribute('data-section', 'scheduled');
      await expect(coldCopy).toHaveAttribute('data-guarded', 'true');
      await coldCopy.getByRole('button', { name: 'Unlock', exact: true }).click();
    } else await coldCopy.locator('.card-surface').click();
    await expect.poll(() => bodyOf(coldCopy)).toBe(body);
  });
}
