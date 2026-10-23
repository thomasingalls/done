import { openMenuSection } from '../geometry/openApp';
import { test, expect } from '@playwright/test';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService } from './server';

for (const joined of [false, true])
  test(`${joined ? 'joined' : 'original'} Devices removal survives a lost committed reply and restarts from saved custody`, async ({
    page,
    browser,
  }, info) => {
    page.setDefaultTimeout(15000);
    const service = await startService(info.outputPath('service'), undefined, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    try {
      pair = await pairedEditors(page, browser, true);
      pair.second.setDefaultTimeout(15000);
      const actor = joined ? pair.second : page,
        target = joined ? page : pair.second;
      const actorCode = joined ? pair.next.code : pair.first.code,
        targetCode = joined ? pair.first.code : pair.next.code;
      const submitted: string[] = [];
      let lost = false;
      await actor.route('**/account/membership/v2/removal/commit', async (route) => {
        submitted.push(route.request().postData()!);
        if (!lost) {
          const reply = await route.fetch();
          if (reply.status() === 200) {
            lost = true;
            await route.abort('failed');
            return;
          }
          await route.fulfill({ response: reply });
          return;
        }
        await route.continue();
      });
      await openMenuSection(actor, 'Account');
      await actor.getByRole('button', { name: 'Devices', exact: true }).click();
      await expect(actor.getByRole('button', { name: 'Remove device', exact: true })).toHaveCount(
        1,
      );
      await actor.getByRole('button', { name: 'Remove device', exact: true }).click();
      await expect(actor.getByLabel('Confirm device removal')).toContainText(
        'Existing copies on that device cannot be erased',
      );
      await actor.getByRole('button', { name: 'Keep device', exact: true }).click();
      expect(submitted).toEqual([]);
      await actor.getByRole('button', { name: 'Remove device', exact: true }).click();
      await actor.getByRole('button', { name: 'Confirm removal', exact: true }).click();
      await expect.poll(() => lost, { timeout: 20000 }).toBe(true);
      await expect(
        actor.getByText('Device removal is saved but not confirmed.', { exact: false }),
      ).toBeVisible({ timeout: 15000 });
      await expect(actor.locator('.shell')).toHaveCount(0);
      // A page restart discards the presentation notice. Only authenticated native state can resume.
      await actor.goto('/');
      await openSaved(actor, actorCode, joined);
      expect(submitted.length).toBeGreaterThanOrEqual(2);
      expect(new Set(submitted).size).toBe(1);
      await add(actor, 'After removal this writing stays with the survivor');
      await openMenuSection(actor, 'Account');
      await actor.getByRole('button', { name: 'Devices', exact: true }).click();
      await expect(actor.locator('.account-device-list li')).toHaveCount(1);
      await expect(actor.getByRole('button', { name: 'Remove device', exact: true })).toHaveCount(
        0,
      );
      await actor.getByRole('button', { name: 'Back to writing', exact: true }).click();
      await expect(target.locator('.shell')).toHaveCount(0, { timeout: 25000 });
      await target.goto('/');
      await openSaved(target, targetCode, !joined);
      await openMenuSection(target, 'Sync');
      await expect(target.getByText('Removed from account.', { exact: false })).toBeVisible();
      await expect(target.locator('.shell')).not.toContainText(
        'After removal this writing stays with the survivor',
      );
      await add(target, 'A detached copy remains writable');
      for (const [p, code, joining, text] of [
        [actor, actorCode, joined, 'After removal this writing stays with the survivor'],
        [target, targetCode, !joined, 'A detached copy remains writable'],
      ] as const) {
        await openMenuSection(p, 'Account');
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        await p.goto('/');
        await openSaved(p, code, joining);
        await expect(p.locator('.shell')).toContainText(text);
      }
    } finally {
      for (const p of [page, pair?.second])
        if (p && !p.isClosed())
          console.log(
            'Removal UI messages',
            await p.locator('[role=alert], [role=status]').allTextContents(),
          );
      await pair?.other.close();
      await stopService(service);
    }
  });
