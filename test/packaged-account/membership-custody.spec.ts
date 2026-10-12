import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService } from './server';
declare global {
  interface Window {
    MembershipCustody: typeof import('../account-membership/custody-entry');
  }
}

test('original and joined native custody preserve prior setup, interrupted progress and installed keys', async ({
  page,
  browser,
}, info) => {
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const result = await build({
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
  const built = Array.isArray(result) ? result[0]! : result;
  if (!('output' in built)) throw Error('Unexpected watched custody probe build');
  const chunk = built.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('Missing custody probe bundle');
  const script = chunk.code;
  // The current activation reader requires the history endpoint supplied by continuation mode.
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    pair = await pairedEditors(page, browser, true);
    for (const p of [page, pair.second]) {
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await p.evaluate(script);
    }
    const firstSlot = await page.evaluate(() => window.MembershipCustody.accountSlot());
    const secondSlot = await pair.second.evaluate(() => window.MembershipCustody.accountSlot());
    expect(
      await page.evaluate(
        ({ slot, code }) => window.MembershipCustody.exercise('promotion', slot, code),
        { slot: firstSlot, code: pair.first.code },
      ),
    ).toEqual({ originalPreserved: true, reopened: true });
    expect(
      await pair.second.evaluate(
        ({ slot, code }) => window.MembershipCustody.exercise('joined', slot, code),
        { slot: secondSlot, code: pair.next.code },
      ),
    ).toEqual({ originalPreserved: true, reopened: true });
    for (const [p, kind, slot, code] of [
      [page, 'promotion', firstSlot, pair.first.code],
      [pair.second, 'joined', secondSlot, pair.next.code],
    ] as const) {
      expect(
        await p.evaluate(
          ({ kind, slot, code }) => window.MembershipCustody.historyProgress(kind, slot, code),
          { kind, slot, code },
        ),
      ).toEqual({ isolated: true, reopened: true, interrupted: true, staleRefused: true });
    }
    const pending = await pair.second.evaluate(() => window.MembershipCustody.pending());
    const firstWrap = await page.evaluate(
      ({ slot, code, recipient }) =>
        window.MembershipCustody.wrap('promotion', slot, code, recipient),
      { slot: firstSlot, code: pair.first.code, recipient: pending.participant.wPub },
    );
    const secondWrap = await pair.second.evaluate(
      ({ slot, code, recipient }) => window.MembershipCustody.wrap('joined', slot, code, recipient),
      { slot: secondSlot, code: pair.next.code, recipient: pending.participant.wPub },
    );
    const firstDigest = await pair.second.evaluate(
      ({ slot, code, wrap }) => window.MembershipCustody.install(slot, code, wrap, 'first source'),
      { ...pending, wrap: firstWrap },
    );
    const secondDigest = await pair.second.evaluate(
      ({ slot, code, wrap }) => window.MembershipCustody.install(slot, code, wrap, 'joined source'),
      { ...pending, wrap: secondWrap },
    );
    expect(firstDigest).toBe(secondDigest);
    await openSaved(page, pair.first.code);
    await openSaved(pair.second, pair.next.code, true);
    await add(pair.second, 'Writing survives continuation custody preparation');
    await expect(page.locator('.shell')).toContainText(
      'Writing survives continuation custody preparation',
      { timeout: 15000 },
    );
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
