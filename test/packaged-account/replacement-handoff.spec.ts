import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

for (const kind of ['promotion', 'joined'] as const)
  test(`native ${kind} producer hands a current-key snapshot to a replacement with removed-device and journal writing`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    const built = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: resolve('test/account-membership/custody-entry.ts'),
          name: 'MembershipCustody',
          formats: ['iife'],
        },
      },
    });
    const result = Array.isArray(built) ? built[0]! : built;
    if (!('output' in result)) throw Error('No native probe');
    const chunk = result.output.find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw Error('No native probe');
    const service = await startService(info.outputPath('service'), undefined, true, true);
    const joining = await browser.newContext(),
      replacement = await joining.newPage();
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    try {
      pair = await pairedEditors(page, browser, true);
      pair.second.setDefaultTimeout(15000);
      replacement.setDefaultTimeout(15000);
      const source = kind === 'promotion' ? page : pair.second,
        removed = kind === 'promotion' ? pair.second : page,
        code = kind === 'promotion' ? pair.first.code : pair.next.code,
        removedCode = kind === 'promotion' ? pair.next.code : pair.first.code;
      await add(removed, 'Accepted writing from the device that will be removed');
      await expect(source.locator('.shell')).toContainText(
        'Accepted writing from the device that will be removed',
        { timeout: 30000 },
      );
      for (const p of [page, pair.second]) {
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        await p.goto('/');
        await p.evaluate(chunk.code);
      }
      const slot = await source.evaluate(() => window.MembershipCustody.accountSlot());
      const target = await removed.evaluate(
        async ({ kind, code }) =>
          window.MembershipCustody.participant(
            kind,
            await window.MembershipCustody.accountSlot(),
            code,
          ),
        {
          kind: kind === 'promotion' ? ('joined' as const) : ('promotion' as const),
          code: removedCode,
        },
      );
      await expect
        .poll(
          async () =>
            (
              await source.evaluate(
                ({ kind, slot, code, target }) =>
                  window.MembershipCustody.removal(kind, slot, code, target),
                { kind, slot, code, target },
              )
            ).result,
          { timeout: 45000, intervals: [2000] },
        )
        .toBe('applying');
      await source.evaluate(
        ({ kind, slot, code }) => window.MembershipCustody.activateRemoval(kind, slot, code),
        { kind, slot, code },
      );
      await source.goto('/');
      await openSaved(source, code, kind === 'joined');
      await add(source, 'Current generation writing for the replacement');
      await source.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await source.goto('/');
      await source.evaluate(chunk.code);
      const journal = await source.evaluate(
        ({ kind, slot, code }) => window.MembershipCustody.journalOnly(kind, slot, code),
        { kind, slot, code },
      );
      // The product button remains gated until replacement activation is implemented.
      await source.goto('/connect/unlock?slot=' + slot + '&begin=' + 'ae'.repeat(16));
      await unlock(source, code);
      const fresh = await pending(
        replacement,
        await source.getByLabel('Device invitation link').inputValue(),
        pair.next.auth,
      );
      const comparison = await compared(source, replacement);
      let lost = false;
      const published: string[] = [];
      let staleGrant = false;
      await source.route('**/account/delivery/read-v2', async (route) => {
        if (!staleGrant) {
          staleGrant = true;
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              v: 1,
              kind: 'authorization-refused',
              refusal: 'authority-changed',
            }),
          });
          return;
        }
        await route.continue();
      });
      await source.route('**/account/membership/v3/checkpoint', async (route) => {
        const body = route.request().postDataJSON();
        if (body.action === 'publish') published.push(JSON.stringify(body.payload));
        const reply = await route.fetch();
        if (!lost && body.action === 'publish' && reply.status() === 200) {
          lost = true;
          await route.abort('internetdisconnected');
          return;
        }
        await route.fulfill({ response: reply });
      });
      await source.getByLabel('Code on the new device').fill(comparison);
      await source.getByRole('button', { name: 'Compare and approve', exact: true }).click();
      await expect.poll(() => lost, { timeout: 15000 }).toBe(true);
      // Reload forces a cold read of encrypted approval custody before retrying publication.
      await source.reload();
      await unlock(source, code);
      await expect(source.getByText('The device is connected.', { exact: false })).toBeVisible({
        timeout: 45000,
      });
      await expect(
        replacement.getByRole('button', { name: 'Open your writing', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      expect(published.length).toBeGreaterThanOrEqual(2);
      expect(staleGrant).toBe(true);
      expect(new Set(published).size).toBe(1);
      await source.goto('/');
      await source.evaluate(chunk.code);
      expect(await source.evaluate((key) => localStorage.getItem(key) !== null, journal)).toBe(
        true,
      );
      const original = await source.evaluate(
        ({ kind, slot, code }) => window.MembershipCustody.replacementWriting(kind, slot, code),
        { kind, slot, code },
      );
      await replacement.goto('/');
      await replacement.evaluate(chunk.code);
      const retained = await replacement.evaluate(
        async (code) =>
          window.MembershipCustody.replacementWriting(
            'promotion',
            await window.MembershipCustody.pendingSlot(),
            code,
          ),
        fresh.code,
      );
      expect(retained.hash).toBe(original.hash);
      expect(retained.generation).toBe(2);
      if (!('writing' in retained)) throw Error('Recipient did not replay writing');
      expect(retained.writing).toContain('Accepted writing from the device that will be removed');
      expect(retained.writing).toContain('Current generation writing for the replacement');
      expect(retained.journal).toBe('Journal-only writing must survive rotation');
    } finally {
      try {
        await Promise.allSettled([joining.close(), pair?.other.close()]);
      } finally {
        await stopService(service);
      }
    }
  });
