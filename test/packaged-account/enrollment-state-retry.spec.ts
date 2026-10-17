import { test, expect } from '@playwright/test';
import { pairedEditors } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';
import {
  decodeInboundBatchPages,
  encodeInboundBatchPages,
} from '../../account-protocol/inboundBatch';

for (const mode of [
  'recover-original',
  'recover-joined',
  'older-server',
  'exhausted',
  'bad-page',
  'retire',
] as const)
  test(`bounded history state retry: ${mode}`, async ({ page, browser }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    const extra = await browser.newContext(),
      candidate = await extra.newPage();
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let attempts = 0,
      keys = 0,
      batches = 0;
    const bodies: Buffer[] = [];
    const pages = [page, candidate];
    try {
      pair = await pairedEditors(page, browser, true);
      pages.push(pair.second);
      const goals = page.locator('.goals .cm-content');
      await goals.click();
      await page.keyboard.press('ControlOrMeta+End');
      let expected = '';
      for (let i = 0; i < 8; i++) {
        const text = ` state retry ${i};`;
        expected += text;
        await page.keyboard.insertText(text);
        await expect(pair.second.locator('.goals .cm-content')).toHaveText(expected);
      }
      const joined = mode === 'recover-joined',
        approver = joined ? pair.second : page;
      const saved = joined ? pair.next : pair.first;
      await approver.getByRole('button', { name: 'Devices', exact: true }).click();
      await approver.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await unlock(approver, saved.code);
      await pending(
        candidate,
        await approver.getByLabel('Device invitation link').inputValue(),
        saved.auth,
      );
      const code = await compared(approver, candidate),
        resume = approver.url();
      approver.on('request', (request) => {
        if (
          new URL(request.url()).pathname === '/account/membership/v2/transfer' &&
          request.postDataJSON().action === 'deliver'
        )
          keys++;
      });
      const target =
        mode === 'older-server'
          ? '**/account/delivery/read-v2'
          : '**/account/delivery/read-v2-batch';
      if (mode === 'older-server')
        await approver.route('**/account/delivery/read-v2-batch', async (route) => {
          batches++;
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: '{"ok":false,"refusal":"not-found"}',
          });
        });
      await approver.route(target, async (route) => {
        const number = ++attempts;
        bodies.push(route.request().postDataBuffer()!);
        if (number === 1 || mode === 'exhausted') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: '{"v":1,"kind":"unknown","reason":"state-changed"}',
          });
          return;
        }
        const response = await route.fetch();
        if (number === 2) {
          await held;
          if (mode === 'bad-page') {
            const returned = decodeInboundBatchPages(new Uint8Array(await response.body()));
            const page = JSON.parse(new TextDecoder().decode(returned[0]!)) as unknown[];
            const signature = page[6] as string;
            page[6] = (signature[0] === '0' ? '1' : '0') + signature.slice(1);
            returned[0] = new TextEncoder().encode(JSON.stringify(page));
            await route.fulfill({ response, body: Buffer.from(encodeInboundBatchPages(returned)) });
            return;
          }
        }
        await route.fulfill({ response });
      });
      await approver.getByLabel('Code on the new device').fill(code);
      await approver.getByRole('button', { name: 'Compare and approve', exact: true }).click();
      if (mode === 'exhausted') {
        await expect(approver.getByRole('alert')).toBeVisible();
        expect(attempts).toBe(5);
        for (const body of bodies) expect(body.equals(bodies[0]!)).toBe(true);
      } else {
        await expect.poll(() => attempts).toBe(2);
        expect(bodies[1]!.equals(bodies[0]!)).toBe(true);
        await expect(
          approver.getByText(/^Checking synced changes: 0 of \d+ checked…$/),
        ).toBeVisible();
        expect(keys).toBe(0);
        await expect(
          candidate.getByRole('button', { name: 'Open your writing', exact: true }),
        ).toHaveCount(0);
        if (mode === 'retire') {
          await approver.getByRole('link', { name: 'Close and return to accounts' }).click();
          await expect(approver.getByRole('progressbar')).toHaveCount(0);
        }
        release();
        if (mode === 'bad-page') {
          await expect(approver.getByRole('alert')).toBeVisible();
          expect(attempts).toBe(2);
        }
      }
      if (mode === 'exhausted' || mode === 'bad-page' || mode === 'retire') {
        await approver.unrouteAll({ behavior: 'wait' });
        expect(keys).toBe(0);
        await expect(
          candidate.getByRole('button', { name: 'Open your writing', exact: true }),
        ).toHaveCount(0);
        await approver.goto(resume);
        await unlock(approver, saved.code);
        await expect(approver.getByLabel('Code on the new device')).toHaveCount(0);
      }
      await expect(approver.getByText('The device is connected.', { exact: false })).toBeVisible({
        timeout: 30000,
      });
      await expect(
        candidate.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      if (mode === 'older-server') expect(batches).toBe(1);
      await candidate.getByRole('button', { name: 'Open your writing', exact: true }).click();
      await expect(candidate.locator('.goals .cm-content')).toHaveText(expected);
    } finally {
      release();
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
