import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { metadataBundle } from '../inbound-compat/artifacts';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { lock, exportWriting, slot } from '../inbound-native/fixtures';
import { openMenuSection } from '../geometry/openApp';
type Kind = 'promotion' | 'joined';
type Custody = typeof import('../account-membership/custody-entry');
type Floor = typeof import('./marker');
const install = async (page: Page) => {
  await page.evaluate(
    await metadataBundle(resolve('test/account-membership/custody-entry.ts'), 'MembershipCustody'),
  );
  await page.evaluate(
    await metadataBundle(resolve('test/inbound-lifecycle/marker.ts'), 'MarkerFloor'),
  );
};
const checkFloor = async (page: Page, args: { actor: Kind; slot: string; code: string }) => {
  const value = await page.evaluate(
    ({ actor, slot, code }) =>
      (Reflect.get(globalThis, 'MarkerFloor') as Floor).floor(actor, slot, code),
    { actor: args.actor, slot: args.slot, code: args.code },
  );
  if (process.env['INBOUND_LIFECYCLE_READING_FLOOR'] === '1' && args.actor === 'joined')
    expect(value.reading).toBe(1);
  return value;
};
const buildPath = () => {
  const path = process.env['INBOUND_LIFECYCLE_BUILD'];
  if (!path) throw Error('Expected declared writer-on lifecycle build');
  return path;
};
test('authenticated original and joined floors survive membership and history progress interruptions', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), buildPath(), true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const evidence: unknown[] = [];
  try {
    pair = await pairedEditors(page, browser, true);
    const cases = [
      {
        page,
        actor: 'promotion' as const,
        slot: (await slot(page, false)).slotId,
        code: pair.first.code,
      },
      {
        page: pair.second,
        actor: 'joined' as const,
        slot: (await slot(pair.second, true)).slotId,
        code: pair.next.code,
      },
    ];
    for (const x of cases) {
      await lock(x.page);
      await x.page.goto(origin + '/accounts');
      await install(x.page);
    }
    for (const { page: p, ...args } of cases) {
      const before = await checkFloor(p, args);
      expect(before.floor).toBe(1);
      expect(
        await p.evaluate(
          ({ actor, slot, code }) =>
            (Reflect.get(globalThis, 'MembershipCustody') as Custody).exercise(actor, slot, code),
          args,
        ),
      ).toEqual({ originalPreserved: true, reopened: true });
      expect(await checkFloor(p, args)).toEqual(before);
      expect(
        await p.evaluate(
          ({ actor, slot, code }) =>
            (Reflect.get(globalThis, 'MembershipCustody') as Custody).historyProgress(
              actor,
              slot,
              code,
            ),
          args,
        ),
      ).toEqual({ isolated: true, reopened: true, interrupted: true, staleRefused: true });
      expect(await checkFloor(p, args)).toEqual(before);
      evidence.push({ actor: args.actor, before, after: await checkFloor(p, args) });
    }
    await openSaved(page, pair.first.code);
    await openSaved(pair.second, pair.next.code, true);
    await add(page, 'Original writing after protected custody rewrites');
    await expect(pair.second.locator('.shell')).toContainText(
      'Original writing after protected custody rewrites',
      { timeout: 15000 },
    );
    await add(pair.second, 'Joined writing after protected custody rewrites');
    await expect(page.locator('.shell')).toContainText(
      'Joined writing after protected custody rewrites',
      { timeout: 15000 },
    );
    const expected = await exportWriting(page, info.outputPath('before-cold.zip'));
    expect(await exportWriting(pair.second, info.outputPath('joined-before-cold.zip'))).toEqual(
      expected,
    );
    for (const x of cases) {
      await lock(x.page);
      await x.page.context().setOffline(true);
      await x.page.goto(origin + '/');
      await openSaved(x.page, x.code, x.actor === 'joined');
      expect(await exportWriting(x.page, info.outputPath(x.actor + '-cold.zip'))).toEqual(expected);
      await lock(x.page);
      await install(x.page);
      expect((await checkFloor(x.page, x)).floor).toBe(1);
    }
  } finally {
    await info.attach('authenticated-floor-rewrites', {
      body: JSON.stringify(evidence),
      contentType: 'application/json',
    });
    await pair?.other.close();
    await stopService(service);
  }
});
for (const actor of ['promotion', 'joined'] as const)
  test(`${actor} floor survives lost removal reply rotation interruption activation and cold Undo`, async ({
    page,
    browser,
  }, info) => {
    const service = await startService(info.outputPath('service'), buildPath(), true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const evidence: unknown[] = [];
    try {
      pair = await pairedEditors(page, browser, true);
      const first = (await slot(page, false)).slotId,
        joined = (await slot(pair.second, true)).slotId;
      for (const p of [page, pair.second]) {
        await lock(p);
        await p.goto(origin + '/accounts');
        await install(p);
      }
      const targetPage = actor === 'promotion' ? pair.second : page,
        targetArgs = {
          actor: actor === 'promotion' ? ('joined' as const) : ('promotion' as const),
          slot: actor === 'promotion' ? joined : first,
          code: actor === 'promotion' ? pair.next.code : pair.first.code,
        };
      const target = await targetPage.evaluate(
        ({ actor, slot, code }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).participant(actor, slot, code),
        targetArgs,
      );
      const active = actor === 'promotion' ? page : pair.second,
        args = {
          actor,
          slot: actor === 'promotion' ? first : joined,
          code: actor === 'promotion' ? pair.first.code : pair.next.code,
          target,
        };
      const before = await checkFloor(active, args);
      expect(before.floor).toBe(1);
      const journalKey = await active.evaluate(
        ({ actor, slot, code }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).journalOnly(actor, slot, code),
        args,
      );
      expect(await active.evaluate((key) => localStorage.getItem(key) !== null, journalKey)).toBe(
        true,
      );
      const pending = await active.evaluate(
        ({ actor, slot, code, target }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).removal(
            actor,
            slot,
            code,
            target,
            true,
          ),
        args,
      );
      expect(pending.result).toBe('pending');
      expect(pending.after.progress?.rotation).not.toBeNull();
      expect(pending.after.progress?.outcome).toBeNull();
      expect(await checkFloor(active, args)).toEqual(before);
      await active.reload();
      await install(active);
      const resumed = await active.evaluate(
        ({ actor, slot, code, target }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).removal(
            actor,
            slot,
            code,
            target,
          ),
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
            (Reflect.get(globalThis, 'MembershipCustody') as Custody).interruptedRotationSave(
              actor,
              slot,
              code,
            ),
          args,
        ),
      ).toBe(true);
      expect(await checkFloor(active, args)).toEqual(before);
      await active.reload();
      await install(active);
      const cold = await active.evaluate(
        ({ actor, slot, code, target }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).removal(
            actor,
            slot,
            code,
            target,
          ),
        args,
      );
      expect(cold.after).toEqual(resumed.after);
      expect(cold.keyHash).toBe(resumed.keyHash);
      expect(
        await active.evaluate(
          ({ actor, slot, code }) =>
            (Reflect.get(globalThis, 'MembershipCustody') as Custody).activateRemoval(
              actor,
              slot,
              code,
              true,
            ),
          args,
        ),
      ).toEqual({ generation: 0, head: 'interrupted' });
      expect(await checkFloor(active, args)).toEqual(before);
      await active.reload();
      await install(active);
      const activated = await active.evaluate(
        ({ actor, slot, code }) =>
          (Reflect.get(globalThis, 'MembershipCustody') as Custody).activateRemoval(
            actor,
            slot,
            code,
          ),
        args,
      );
      expect(activated).toEqual({ generation: 2, head: resumed.after.successor!.head });
      expect(await active.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
      expect(await checkFloor(active, args)).toEqual(before);
      evidence.push({ actor, before, activated, after: await checkFloor(active, args) });
      await active.goto(origin + '/');
      await openSaved(active, args.code, actor === 'joined');
      await add(active, 'Writing after marked native generation activation');
      const expected = await exportWriting(active, info.outputPath('before-undo.zip'));
      await add(active, 'Undo after marked native generation activation');
      await openMenuSection(active, 'Data');
      await active.getByRole('button', { name: 'Undo', exact: true }).click();
      expect(await exportWriting(active, info.outputPath('after-undo.zip'))).toEqual(expected);
      await lock(active);
      await active.context().setOffline(true);
      await active.goto(origin + '/');
      await openSaved(active, args.code, actor === 'joined');
      expect(await exportWriting(active, info.outputPath('cold.zip'))).toEqual(expected);
      await lock(active);
      await install(active);
      expect(await checkFloor(active, args)).toEqual(before);
    } finally {
      await info.attach('authenticated-removal-floor', {
        body: JSON.stringify(evidence),
        contentType: 'application/json',
      });
      await pair?.other.close();
      await stopService(service);
    }
  });
