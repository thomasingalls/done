import { test, expect } from '@playwright/test';
import { pairedEditors } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';
import {
  decodeInboundBatchPages,
  encodeInboundBatchPages,
} from '../../account-protocol/inboundBatch';

for (const mode of ['advance-and-reopen', 'rejected-reply'] as const)
  test(`device approval explains verified work: ${mode}`, async ({ page, browser }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    const extra = await browser.newContext(),
      candidate = await extra.newPage();
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    let releaseFirst!: () => void, releaseSecond!: () => void, releaseInstallation!: () => void;
    const first = new Promise<void>((resolve) => (releaseFirst = resolve)),
      second = new Promise<void>((resolve) => (releaseSecond = resolve)),
      installation = new Promise<void>((resolve) => (releaseInstallation = resolve));
    let batches = 0,
      firstPages = 0,
      keys = 0;
    const pages = [page, candidate];
    try {
      pair = await pairedEditors(page, browser, true);
      pages.push(pair.second);
      const goals = page.locator('.goals .cm-content');
      await goals.click();
      await page.keyboard.press('ControlOrMeta+End');
      let expected = '';
      for (let i = 0; i < 8; i++) {
        expected += ` progress check ${i};`;
        await page.keyboard.insertText(` progress check ${i};`);
        await expect(pair.second.locator('.goals .cm-content')).toHaveText(expected);
      }
      // Exercise original and joined native source owners without replacing custody or crypto.
      const original = mode === 'advance-and-reopen',
        approver = original ? page : pair.second,
        saved = original ? pair.first : pair.next;
      await approver.getByRole('button', { name: 'Devices', exact: true }).click();
      await approver.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await unlock(approver, saved.code);
      const link = await approver.getByLabel('Device invitation link').inputValue();
      await pending(candidate, link, saved.auth);
      const comparison = await compared(approver, candidate),
        resume = approver.url();
      approver.on('request', (request) => {
        if (
          new URL(request.url()).pathname === '/account/membership/v2/transfer' &&
          request.postDataJSON().action === 'deliver'
        )
          keys++;
      });
      await candidate.route('**/account/membership/v2/transfer', async (route) => {
        if (route.request().postDataJSON().action === 'install') await installation;
        await route.continue();
      });
      await approver.route('**/account/delivery/read-v2-batch', async (route) => {
        const number = ++batches,
          response = await route.fetch(),
          returned = decodeInboundBatchPages(new Uint8Array(await response.body()));
        if (number === 1) {
          firstPages = returned.length;
          await first;
          if (mode === 'rejected-reply') {
            const page = JSON.parse(new TextDecoder().decode(returned[0]!)) as unknown[];
            const signature = page[6] as string;
            page[6] = (signature[0] === '0' ? '1' : '0') + signature.slice(1);
            returned[0] = new TextEncoder().encode(JSON.stringify(page));
            await route.fulfill({ response, body: Buffer.from(encodeInboundBatchPages(returned)) });
            return;
          }
        } else if (number === 2) await second;
        await route.fulfill({ response });
      });
      await approver.getByLabel('Code on the new device').fill(comparison);
      await approver.getByRole('button', { name: 'Compare and approve', exact: true }).click();
      const progress = approver.getByRole('progressbar', { name: 'Current connection step' });
      await expect.poll(() => firstPages).toBeGreaterThan(0);
      await expect(
        approver.getByText(/^Checking synced changes: 0 of \d+ checked…$/),
      ).toBeVisible();
      await expect(progress).toHaveAttribute('value', '0');
      expect(Number(await progress.getAttribute('max'))).toBeGreaterThanOrEqual(8);
      await expect(
        approver.getByText('Keep both devices open until the connection finishes.'),
      ).toBeVisible();
      await approver
        .locator('.enrollment-progress')
        .screenshot({ path: info.outputPath('verified-progress-zero.png') });
      expect(keys).toBe(0);
      await expect(
        candidate.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toHaveCount(0);
      releaseFirst();
      if (mode === 'rejected-reply') {
        await expect(approver.getByRole('alert')).toBeVisible();
        await expect(progress).toHaveCount(0);
        expect(keys).toBe(0);
      } else {
        await expect.poll(() => batches).toBe(2);
        await expect(progress).toHaveAttribute('value', String(firstPages));
        await approver
          .locator('.enrollment-progress')
          .screenshot({ path: info.outputPath('verified-progress-advanced.png') });
        expect(keys).toBe(0);
        // Retire the real owner during the next held read. No stale progress survives navigation.
        await approver.getByRole('link', { name: 'Close and return to accounts' }).click();
        await expect(progress).toHaveCount(0);
        releaseSecond();
      }
      await approver.unrouteAll({ behavior: 'wait' });
      await approver.goto(resume);
      await unlock(approver, saved.code);
      await expect(approver.getByLabel('Code on the new device')).toHaveCount(0);
      await expect(
        approver.getByText(
          'Waiting for the new device to save and confirm access. Keep it open to finish.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        candidate.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toHaveCount(0);
      releaseInstallation();
      await expect(approver.getByText('The device is connected.', { exact: false })).toBeVisible({
        timeout: 30000,
      });
      await expect(approver.getByRole('progressbar')).toHaveCount(0);
      await expect(
        candidate.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await candidate.getByRole('button', { name: 'Open your writing', exact: true }).click();
      await expect(candidate.locator('.goals .cm-content')).toHaveText(expected);
    } finally {
      releaseFirst();
      releaseSecond();
      releaseInstallation();
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
