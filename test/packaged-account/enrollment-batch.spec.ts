import { test, expect } from '@playwright/test';
import { pairedEditors } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';
import {
  decodeInboundBatchPages,
  encodeInboundBatchPages,
} from '../../account-protocol/inboundBatch';

for (const mode of ['batched', 'older-server', 'substituted-page', 'lost-reply'] as const)
  test(`additional-device snapshot replay: ${mode}`, async ({ page, browser }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    const extra = await browser.newContext(),
      candidate = await extra.newPage();
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    let previousPage: Uint8Array<ArrayBuffer> | undefined;
    const singleLimits: number[] = [];
    let batches = 0,
      singles = 0,
      deliveredKeys = 0,
      injected = false;
    const pages: (typeof page)[] = [page, candidate];
    try {
      pair = await pairedEditors(page, browser, true);
      pages.push(pair.second);
      const goals = page.locator('.goals .cm-content');
      await goals.click();
      await page.keyboard.press('ControlOrMeta+End');
      let expected = '';
      for (let i = 0; i < 8; i++) {
        const value = ` separately delivered batch ${i};`;
        expected += value;
        await page.keyboard.insertText(value);
        await expect(pair.second.locator('.goals .cm-content')).toHaveText(expected);
      }
      // Cover both native source owners: original promotion and an already joined device.
      const original = mode === 'batched',
        approver = original ? page : pair.second;
      const saved = original ? pair.first : pair.next;
      await approver.getByRole('button', { name: 'Devices', exact: true }).click();
      await approver.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await unlock(approver, saved.code);
      const link = await approver.getByLabel('Device invitation link').inputValue();
      await pending(candidate, link, saved.auth);
      const comparison = await compared(approver, candidate);
      approver.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path === '/account/delivery/read-v2') {
          singles++;
          singleLimits.push(request.postDataJSON()[11] as number);
        }
        if (path === '/account/delivery/read-v2-batch') batches++;
        if (
          path === '/account/membership/v2/transfer' &&
          request.postDataJSON().action === 'deliver'
        )
          deliveredKeys++;
      });
      await approver.route('**/account/delivery/read-v2-batch', async (route) => {
        if (mode === 'older-server') {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: '{"ok":false,"refusal":"not-found"}',
          });
        } else if (!injected && (mode === 'substituted-page' || mode === 'lost-reply')) {
          const response = await route.fetch();
          if (mode === 'lost-reply') {
            injected = true;
            await route.abort();
          } else {
            const returned = decodeInboundBatchPages(new Uint8Array(await response.body()));
            // A dense carrier can contain one page. Substitute a preceding genuine reply
            // when no same-carrier pair exists, retaining the exact request-binding fault.
            if (returned.length < 2) {
              if (!previousPage) {
                previousPage = returned[0]!.slice();
                await route.fulfill({ response });
                return;
              }
              returned[0] = previousPage;
            } else {
              [returned[0], returned[1]] = [returned[1]!, returned[0]!];
            }
            injected = true;
            await route.fulfill({ response, body: Buffer.from(encodeInboundBatchPages(returned)) });
          }
        } else await route.continue();
      });
      await approver.getByLabel('Code on the new device').fill(comparison);
      await approver.getByRole('button', { name: 'Compare and approve', exact: true }).click();
      if (mode === 'substituted-page' || mode === 'lost-reply') {
        await expect(approver.getByRole('alert')).toBeVisible();
        expect(injected).toBe(true);
        expect(deliveredKeys).toBe(0);
        await expect(
          candidate.getByRole('button', { name: 'Open your writing', exact: true }),
        ).toHaveCount(0);
        await expect(candidate.locator('.shell')).toHaveCount(0);
        await approver.unrouteAll({ behavior: 'wait' });
        // Durable approval resumes without another code comparison or a replacement key.
        await approver.reload();
        await unlock(approver, saved.code);
        await expect(approver.getByLabel('Code on the new device')).toHaveCount(0);
      }
      await expect(approver.getByText('The device is connected.', { exact: false })).toBeVisible({
        timeout: 30000,
      });
      await expect(
        candidate.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      expect(batches).toBeGreaterThanOrEqual(mode === 'older-server' ? 1 : 2);
      if (mode === 'older-server') {
        expect(batches).toBe(1);
        // The retained 13-position fixture fits pages of 8, 4 and 1 across its publishers.
        expect(singles).toBe(3);
        expect(singleLimits).toContain(8);
        expect(singleLimits.every((limit) => limit >= 1 && limit <= 8)).toBe(true);
      } else expect(singles).toBe(0);
      await candidate.getByRole('button', { name: 'Open your writing', exact: true }).click();
      await expect(candidate.locator('.shell')).toContainText('Keep the first device writing');
      await expect(candidate.locator('.goals .cm-content')).toHaveText(expected);
    } finally {
      try {
        for (const p of pages) if (!p.isClosed()) await p.unrouteAll({ behavior: 'wait' });
      } finally {
        try {
          await Promise.all([extra.close(), pair?.other.close()]);
        } finally {
          await stopService(service);
        }
      }
    }
  });
