import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors } from './devices';
import { startService, stopService } from './server';

for (const actor of ['promotion', 'joined'] as const) {
  test(`${actor} retains exact removal through a lost commit reply and cold-reopens its successor key`, async ({
    page,
    browser,
  }, info) => {
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
    } finally {
      await pair?.other.close();
      await stopService(service);
    }
  });
}
