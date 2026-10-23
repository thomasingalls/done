import { openMenuSection } from '../geometry/openApp';
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
    test.setTimeout(300000);
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
    let fourth: Awaited<ReturnType<typeof browser.newContext>> | undefined;
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
        await openMenuSection(p, 'Account');
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
      await openMenuSection(source, 'Account');
      await source.getByRole('button', { name: 'Devices', exact: true }).click();
      await source.getByRole('button', { name: 'Connect another device', exact: true }).click();
      await source.evaluate(chunk.code);
      const journal = await source.evaluate(
        ({ kind, slot, code }) => window.MembershipCustody.journalOnly(kind, slot, code),
        { kind, slot, code },
      );
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
      await source.route('**/account/delivery/read-v2*', async (route) => {
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
      const resume = replacement.url();
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
      await replacement.goto(resume);
      await unlock(replacement, fresh.code);
      await replacement.evaluate((kind) => {
        const put = IDBObjectStore.prototype.put,
          add = IDBObjectStore.prototype.add;
        let tripped = false;
        const intercept = (
          store: IDBObjectStore,
          value: { active_gen?: number; next_seq?: number; gen?: number; kind?: string },
          key?: IDBValidKey,
        ) => {
          const hit =
            kind === 'promotion'
              ? store.name === 'meta' &&
                key === 'counter' &&
                value.active_gen === 2 &&
                value.next_seq === 1
              : store.name === 'content' && value.gen === 2 && value.kind === 'update';
          if (!tripped && hit) {
            tripped = true;
            sessionStorage.setItem('replacement-initial-abort', kind);
            store.transaction.abort();
          }
        };
        IDBObjectStore.prototype.put = function (value, key) {
          intercept(this, value, key);
          return put.call(this, value, key);
        };
        IDBObjectStore.prototype.add = function (value, key) {
          intercept(this, value, key);
          return add.call(this, value, key);
        };
      }, kind);
      await replacement.getByRole('button', { name: 'Open your writing', exact: true }).click();
      await expect
        .poll(
          () => replacement.evaluate(() => sessionStorage.getItem('replacement-initial-abort')),
          { timeout: 15000 },
        )
        .toBe(kind);
      await expect(replacement.getByRole('alert')).toBeVisible();
      await replacement.reload();
      await unlock(replacement, fresh.code);
      await expect(replacement.locator('.shell')).toContainText(
        'Accepted writing from the device that will be removed',
        { timeout: 30000 },
      );
      await expect(replacement.locator('.shell')).toContainText(
        'Current generation writing for the replacement',
      );
      await openSaved(source, code, kind === 'joined');
      await add(replacement, 'Replacement writes under its first current key');
      await expect(source.locator('.shell')).toContainText(
        'Replacement writes under its first current key',
        { timeout: 30000 },
      );
      await add(source, 'Survivor replies to the replacement');
      await expect(replacement.locator('.shell')).toContainText(
        'Survivor replies to the replacement',
        { timeout: 30000 },
      );
      await openMenuSection(replacement, 'Account');
      await replacement.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await replacement.goto('/');
      await openSaved(replacement, fresh.code, true);
      await expect(replacement.locator('.shell')).toContainText(
        'Replacement writes under its first current key',
      );
      await expect(replacement.locator('.shell')).toContainText(
        'Survivor replies to the replacement',
      );
      if (kind === 'promotion') {
        // The replacement has never held generation one. It now owns the next rotation and invitation.
        await openMenuSection(replacement, 'Account');
        await replacement.getByRole('button', { name: 'Devices', exact: true }).click();
        await expect(
          replacement.getByRole('button', { name: 'Remove device', exact: true }),
        ).toHaveCount(1);
        await replacement.getByRole('button', { name: 'Remove device', exact: true }).click();
        let lostRemoval = false;
        const removalBodies: string[] = [];
        await replacement.route('**/account/membership/v2/removal/commit', async (route) => {
          removalBodies.push(route.request().postData()!);
          const reply = await route.fetch();
          if (!lostRemoval && reply.status() === 200) {
            lostRemoval = true;
            await route.abort('failed');
          } else await route.fulfill({ response: reply });
        });
        await replacement.getByRole('button', { name: 'Confirm removal', exact: true }).click();
        await expect.poll(() => lostRemoval, { timeout: 20000 }).toBe(true);
        await expect(replacement.locator('.shell')).toHaveCount(0, { timeout: 30000 });
        await replacement.goto('/');
        await openSaved(replacement, fresh.code, true);
        expect(removalBodies.length).toBeGreaterThanOrEqual(2);
        expect(new Set(removalBodies).size).toBe(1);
        await add(replacement, 'Replacement writing after the next removal');
        // Allow the healthy-stream repair poll if the removal hint raced a reconnect.
        await expect(source.locator('.shell')).toHaveCount(0, { timeout: 70000 });
        await source.goto('/');
        await openSaved(source, code);
        await openMenuSection(source, 'Sync');
        await expect(source.getByText('Removed from account.', { exact: false })).toBeVisible();
        await expect(source.locator('.shell')).not.toContainText(
          'Replacement writing after the next removal',
        );
        await add(source, 'Detached survivor keeps its own writing');
        await openMenuSection(replacement, 'Account');
        await replacement.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        await replacement.goto('/');
        await openSaved(replacement, fresh.code, true);
        await expect(replacement.locator('.shell')).toContainText(
          'Replacement writing after the next removal',
        );
        await openMenuSection(replacement, 'Account');
        await replacement.getByRole('button', { name: 'Devices', exact: true }).click();
        await expect(replacement.locator('.account-device-list li')).toHaveCount(1);
        await replacement
          .getByRole('button', { name: 'Connect another device', exact: true })
          .click();
        await unlock(replacement, fresh.code);
        fourth = await browser.newContext();
        const newcomer = await fourth.newPage();
        newcomer.setDefaultTimeout(15000);
        const last = await pending(
          newcomer,
          await replacement.getByLabel('Device invitation link').inputValue(),
          fresh.auth,
        );
        const codeToCompare = await compared(replacement, newcomer);
        await replacement.getByLabel('Code on the new device').fill(codeToCompare);
        await replacement.getByRole('button', { name: 'Compare and approve', exact: true }).click();
        await expect(
          newcomer.getByRole('button', { name: 'Open your writing', exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await newcomer.getByRole('button', { name: 'Open your writing', exact: true }).click();
        await expect(newcomer.locator('.shell')).toContainText(
          'Replacement writing after the next removal',
          { timeout: 30000 },
        );
        await expect(newcomer.locator('.shell')).toContainText(
          'Accepted writing from the device that will be removed',
        );
        await expect(newcomer.locator('.shell')).not.toContainText(
          'Detached survivor keeps its own writing',
        );
        await replacement.goto('/');
        await openSaved(replacement, fresh.code, true);
        await add(newcomer, 'Fourth device starts directly in generation three');
        await expect(replacement.locator('.shell')).toContainText(
          'Fourth device starts directly in generation three',
          { timeout: 30000 },
        );
        await add(replacement, 'Third-generation reply from the replacement');
        await expect(newcomer.locator('.shell')).toContainText(
          'Third-generation reply from the replacement',
          { timeout: 30000 },
        );
        for (const [p, code] of [
          [replacement, fresh.code],
          [newcomer, last.code],
        ] as const) {
          await openMenuSection(p, 'Account');
          await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
          await p.goto('/');
          await openSaved(p, code, true);
          await expect(p.locator('.shell')).toContainText(
            'Fourth device starts directly in generation three',
          );
          await expect(p.locator('.shell')).toContainText(
            'Third-generation reply from the replacement',
          );
        }
      }
    } finally {
      try {
        await Promise.allSettled([joining.close(), pair?.other.close(), fourth?.close()]);
      } finally {
        await stopService(service);
      }
    }
  });
