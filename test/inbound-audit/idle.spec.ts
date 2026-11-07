import { test, expect, type Page, type Worker } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import {
  pairedEditors,
  add,
  openSaved,
  credentials,
  restoreAuthenticator,
} from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import {
  acceptedRows,
  idle,
  position,
  slot,
  lock,
  observer,
  exportWriting,
} from '../inbound-native/fixtures';
async function actualOwner(page: Page): Promise<Worker> {
  let selected: Worker | undefined;
  await expect
    .poll(
      async () => {
        for (const worker of page.workers())
          if (
            await worker
              .evaluate(() => {
                const control = Reflect.get(globalThis, 'nativeReceiptAuditControl');
                return !!control && !control.closed();
              })
              .catch(() => false)
          ) {
            selected = worker;
            return true;
          }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return selected!;
}
for (const fault of [false, true])
  test(`genuine mixed receipts retain idle-audit closure and exact cold writing ${fault ? 'stale-turn' : 'baseline'}`, async ({
    page,
    browser,
  }, info) => {
    const build = process.env['INBOUND_AUDIT_BUILD'];
    if (!build || !isAbsolute(build) || !existsSync(build + '/index.html'))
      throw Error('Expected declared mixed audit fixture');
    const state = info.outputPath('service'),
      service = await startService(state, build, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const evidence: Record<string, unknown> = { fault },
      events: string[] = [];
    try {
      pair = await pairedEditors(page, browser, true);
      pair.other.on('console', (message) => {
        const text = message.text();
        if (
          text.startsWith('native-receipt-audit:') ||
          text === 'done/account-ledger-reference-mismatch'
        )
          events.push(text);
      });
      const identity = await slot(pair.second, true),
        savedAuth = await credentials(pair.next.auth);
      await idle(page);
      let previous = await position(page),
        known = new Set(acceptedRows(state).map((x) => x.key));
      await lock(pair.second);
      await pair.second.close();
      await pair.other.setOffline(true);
      const markers = Array.from({ length: 8 }, (_, i) => `AUDIT MIX accepted ${i + 1}`);
      for (const marker of markers) {
        await add(page, marker);
        await expect.poll(() => position(page), { timeout: 20000 }).toBe(previous + 1);
        await idle(page);
        const rows = acceptedRows(state),
          fresh = rows.filter((x) => !known.has(x.key));
        expect(fresh).toHaveLength(1);
        expect(fresh[0]!.position).toBe(previous + 1);
        known = new Set(rows.map((x) => x.key));
        previous++;
      }
      const receiver = await pair.other.newPage(),
        retainedAuth = await restoreAuthenticator(receiver, savedAuth);
      await receiver.goto(origin + '/');
      await openSaved(receiver, pair.next.code, true);
      await pair.other.setOffline(false);
      for (const marker of markers)
        await expect(receiver.locator('.shell')).toContainText(marker, { timeout: 15000 });
      await add(page, 'AUDIT MIX later legacy writing');
      await expect.poll(() => position(page), { timeout: 20000 }).toBe(previous + 1);
      await expect(receiver.locator('.shell')).toContainText('AUDIT MIX later legacy writing', {
        timeout: 15000,
      });
      const expected = await exportWriting(receiver, info.outputPath('before.zip'));
      await lock(receiver);
      await receiver.evaluate(await observer());
      const native = await receiver.evaluate(
        async ({ slot, code }) =>
          (
            Reflect.get(
              globalThis,
              'nativeReceiptObserver',
            ) as typeof import('../inbound-native/inspect')
          ).inspectNativeReceipts(slot, code, true),
        { slot: identity.slotId, code: pair.next.code },
      );
      const dense = native.receipts.filter((x) => x.kind === 'page');
      expect(dense.length).toBeGreaterThan(0);
      expect(native.receipts.some((x) => x.kind === 'legacy' && x.seq > dense[0]!.seq)).toBe(true);
      expect(native.readOnlyUnchanged).toBe(true);
      evidence['native'] = native;
      await pair.other.setOffline(true);
      await receiver.goto(origin + '/');
      await openSaved(receiver, pair.next.code, true);
      const worker = await actualOwner(receiver);
      expect(
        await worker.evaluate(() =>
          Reflect.get(globalThis, 'nativeReceiptAuditControl').baseline(),
        ),
      ).toBe(false);
      expect(await exportWriting(receiver, info.outputPath('unarmed.zip'))).toEqual(expected);
      events.length = 0;
      await worker.evaluate((fault) => {
        const control = Reflect.get(globalThis, 'nativeReceiptAuditControl');
        control.stale = fault;
        control.input();
        control.expire();
      }, fault);
      await receiver.waitForTimeout(650);
      expect(events).not.toContain('native-receipt-audit:start');
      expect(
        await worker.evaluate(() => Reflect.get(globalThis, 'nativeReceiptAuditControl').closed()),
      ).toBe(false);
      if (fault) {
        await expect
          .poll(() => events.includes('done/account-ledger-reference-mismatch'), { timeout: 15000 })
          .toBe(true);
        await expect
          .poll(() => events.includes('native-receipt-audit:closed'), { timeout: 15000 })
          .toBe(true);
        expect(events).not.toContain('native-receipt-audit:passed');
      } else {
        await expect
          .poll(() => events.includes('native-receipt-audit:passed'), { timeout: 15000 })
          .toBe(true);
        expect(events).not.toContain('done/account-ledger-reference-mismatch');
        expect(
          await worker.evaluate(() =>
            Reflect.get(globalThis, 'nativeReceiptAuditControl').closed(),
          ),
        ).toBe(false);
        await lock(receiver);
      }
      evidence['auditEvents'] = [...events];
      await receiver.goto(origin + '/');
      await openSaved(receiver, pair.next.code, true);
      expect(await exportWriting(receiver, info.outputPath('cold.zip'))).toEqual(expected);
      expect((await slot(receiver, true)).floor).toBe(1);
      evidence['coldExact'] = true;
      evidence['authenticatorRetained'] = !!retainedAuth.cdp;
      await lock(receiver);
    } finally {
      evidence['allContentFreeEvents'] = events;
      await info.attach('mixed-idle-audit', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
      await pair?.other.close();
      await stopService(service);
    }
  });
