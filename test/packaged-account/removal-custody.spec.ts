import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService } from './server';

for (const actor of ['promotion', 'joined'] as const) {
  test(`${actor} retains exact removal through a lost commit reply and cold-reopens its successor key`, async ({
    page,
    browser,
  }, info) => {
    page.setDefaultTimeout(15000);
    const bundle = await build({
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
    const result = Array.isArray(bundle) ? bundle[0]! : bundle;
    if (!('output' in result)) throw Error('Unexpected bundle');
    const chunk = result.output.find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw Error('Missing probe');
    const service = await startService(info.outputPath('service'), undefined, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    try {
      pair = await pairedEditors(page, browser, true);
      pair.second.setDefaultTimeout(15000);
      console.log(actor, 'paired');
      for (const p of [page, pair.second]) {
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        await p.goto('/');
        await p.evaluate(chunk.code);
      }
      const firstSlot = await page.evaluate(() => window.MembershipCustody.accountSlot());
      const nextSlot = await pair.second.evaluate(() => window.MembershipCustody.accountSlot());
      const target =
        actor === 'promotion'
          ? await pair.second.evaluate(
              ({ slot, code }) => window.MembershipCustody.participant('joined', slot, code),
              { slot: nextSlot, code: pair.next.code },
            )
          : await page.evaluate(
              ({ slot, code }) => window.MembershipCustody.participant('promotion', slot, code),
              { slot: firstSlot, code: pair.first.code },
            );
      const active = actor === 'promotion' ? page : pair.second;
      const args = {
        actor,
        slot: actor === 'promotion' ? firstSlot : nextSlot,
        code: actor === 'promotion' ? pair.first.code : pair.next.code,
        target,
      };
      const journalKey = await active.evaluate(
        ({ actor, slot, code }) => window.MembershipCustody.journalOnly(actor, slot, code),
        args,
      );
      expect(await active.evaluate((key) => localStorage.getItem(key) !== null, journalKey)).toBe(
        true,
      );
      const pending = await active.evaluate(
        ({ actor, slot, code, target }) =>
          window.MembershipCustody.removal(actor, slot, code, target, true),
        args,
      );
      expect(pending.result).toBe('pending');
      expect(pending.after.progress?.rotation).not.toBeNull();
      expect(pending.after.progress?.outcome).toBeNull();
      await active.reload();
      await active.evaluate(chunk.code);
      const resumed = await active.evaluate(
        ({ actor, slot, code, target }) =>
          window.MembershipCustody.removal(actor, slot, code, target),
        args,
      );
      expect(resumed.before).toEqual(pending.after);
      expect(resumed.result).toBe('applying');
      expect(resumed.after.progress?.rotation).toEqual(pending.after.progress?.rotation);
      expect(resumed.previousHash).toBe(pending.previousHash);
      expect(resumed.keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        await active.evaluate(
          ({ actor, slot, code }) =>
            window.MembershipCustody.interruptedRotationSave(actor, slot, code),
          args,
        ),
      ).toBe(true);
      await active.reload();
      await active.evaluate(chunk.code);
      const cold = await active.evaluate(
        ({ actor, slot, code, target }) =>
          window.MembershipCustody.removal(actor, slot, code, target),
        args,
      );
      expect(cold.after).toEqual(resumed.after);
      expect(cold.keyHash).toBe(resumed.keyHash);
      expect(
        await active.evaluate(
          ({ actor, slot, code }) =>
            window.MembershipCustody.activateRemoval(actor, slot, code, true),
          args,
        ),
      ).toEqual({ generation: 0, head: 'interrupted' });
      await active.reload();
      await active.evaluate(chunk.code);
      const activated = await active.evaluate(
        ({ actor, slot, code }) => window.MembershipCustody.activateRemoval(actor, slot, code),
        args,
      );
      console.log(actor, 'activated');
      expect(activated).toEqual({ generation: 2, head: resumed.after.successor!.head });
      expect(await active.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
      await active.goto('/');
      await openSaved(active, args.code, actor === 'joined');
      await add(active, 'Writing after local generation activation');
      await active.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await active.goto('/');
      await openSaved(active, args.code, actor === 'joined');
      await expect(active.locator('.shell')).toContainText(
        'Writing after local generation activation',
      );
    } finally {
      await pair?.other.close();
      await stopService(service);
    }
  });
}
