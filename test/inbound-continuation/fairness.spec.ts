/** Functional continuation, not an input/peer latency or performance acceptance claim. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  paths,
  prepareSeed,
  cloneSeed,
  launch,
  driver,
  closeDriver,
  origin,
  initialMaster,
} from './fixture';
import { service } from './server.mjs';
import { acceptedRows, observer, slot, exportWriting, lock } from '../inbound-native/fixtures';
import { restoreAuthenticator, openSaved } from '../packaged-account/devices';
const normalized = (entries: { path: string; content: string }[]) =>
  [...entries].sort((a, b) => a.path.localeCompare(b.path));
function assertFairTurns(
  receipts: { publisher: string; position: number; count: number }[],
  before: Map<string, number>,
  through: Map<string, number>,
) {
  const consumed = new Map(before);
  let previous = '',
    streak = 0;
  const turns: { publisher: string; positions: number }[] = [];
  for (const receipt of receipts) {
    if (!through.has(receipt.publisher)) continue;
    for (let i = 0; i < receipt.count; i++) {
      const position = receipt.position + i;
      if (
        position <= (before.get(receipt.publisher) ?? 0) ||
        position > through.get(receipt.publisher)!
      )
        continue;
      expect(position).toBe((consumed.get(receipt.publisher) ?? 0) + 1);
      const otherPending = [...through].some(
        ([p, n]) => p !== receipt.publisher && (consumed.get(p) ?? 0) < n,
      );
      streak = previous === receipt.publisher ? streak + 1 : 1;
      previous = receipt.publisher;
      if (otherPending)
        expect(
          streak,
          'native publisher turn exceeds eight while another remains pending',
        ).toBeLessThanOrEqual(8);
      consumed.set(receipt.publisher, position);
      const last = turns.at(-1);
      if (last?.publisher === receipt.publisher) last.positions++;
      else turns.push({ publisher: receipt.publisher, positions: 1 });
    }
  }
  expect([...consumed].sort()).toEqual([...through].sort());
  return turns;
}
test('prepare fictional three-device native continuation fixture', async ({
  browserName: _browserName,
}, info) => {
  const result = await prepareSeed();
  await info.attach('prepared', { body: JSON.stringify(result), contentType: 'application/json' });
});
for (const { backlog, withheld, fault } of [
  { backlog: true, withheld: false, fault: false },
  { backlog: true, withheld: true, fault: false },
  { backlog: false, withheld: false, fault: false },
  { backlog: false, withheld: true, fault: false },
  { backlog: true, withheld: false, fault: true },
])
  test(
    fault
      ? 'native fairness sensitivity control'
      : `continuous native fairness ${backlog ? 'known-backlog' : 'caught-up'} ${withheld ? 'withheld' : 'normal'}`,
    async ({ browserName: _browserName }, info) => {
      const { root, build: positive } = paths(),
        build = fault ? process.env['INBOUND_CONTINUATION_NEGATIVE_BUILD'] : positive;
      if (!build) throw Error('Expected declared negative-control build');
      const directory = join(root, info.title.replaceAll(/[^a-zA-Z0-9-]/g, '-'));
      const { seed, baseline } = cloneSeed(directory),
        backend = await service(join(directory, 'service'), build);
      const contexts: BrowserContext[] = [],
        pages: Page[] = [],
        deviceIds: string[] = [],
        evidence: Record<string, unknown> = { backlog, withheld, fault };
      let master = initialMaster;
      const expected = () =>
        normalized(baseline.map((e) => (e.path === 'master.md' ? { ...e, content: master } : e)));
      const addToExpected = (role: string, text: string) => {
        const start = master.indexOf(role + ':'),
          end = master.indexOf('\n', start);
        master = master.slice(0, end) + text + master.slice(end);
      };
      const view = (p: Page) => p.evaluate(() => globalThis.nativeContinuation.read());
      const waitAll = async () => {
        for (const p of pages) await expect.poll(() => view(p), { timeout: 30000 }).toBe(master);
      };
      const frontier = () => {
        const result = new Map<string, number>();
        for (const row of acceptedRows(join(directory, 'service')))
          result.set(row.publisher, Math.max(result.get(row.publisher) ?? 0, row.position));
        return result;
      };
      try {
        for (const actor of seed.actors) {
          const context = await launch(join(directory, actor.role));
          contexts.push(context);
          const page = context.pages()[0]!;
          pages.push(page);
          deviceIds.push((await driver(page, actor)).deviceId);
        }
        await pages[0]!.evaluate((text) => globalThis.nativeContinuation.replace(text), master);
        await pages[0]!.evaluate(() => globalThis.nativeContinuation.flush());
        await waitAll();
        for (const p of pages)
          expect(
            normalized(await p.evaluate(() => globalThis.nativeContinuation.entries())),
          ).toEqual(expected());
        for (const p of pages)
          await expect
            .poll(() => p.evaluate(() => globalThis.nativeContinuation.status().send.phase), {
              timeout: 20000,
            })
            .toBe('idle');
        // Successful outbound decisions are not inbound receipts. An idle self publisher may
        // correctly remain suppressed, so the service's own head must not inflate this census.
        const identity = await slot(pages[2]!, true);
        await closeDriver(pages[2]!);
        await pages[2]!.evaluate(await observer());
        const initialNative = await pages[2]!.evaluate(
          ({ slotId, code }) =>
            Reflect.get(globalThis, 'nativeReceiptObserver').inspectNativeReceipts(
              slotId,
              code,
              true,
            ),
          { slotId: identity.slotId, code: seed.actors[2]!.code },
        );
        expect(initialNative.readOnlyUnchanged).toBe(true);
        const nativeHeads = new Map<string, number>();
        for (const row of initialNative.receipts)
          nativeHeads.set(
            row.publisher,
            Math.max(nativeHeads.get(row.publisher) ?? 0, row.position + row.count - 1),
          );
        const stable = frontier();
        // A Joined snapshot can establish a peer prefix before any receipt row exists.
        // The fully verified status includes those cuts; this syntax observer does not.
        expect(nativeHeads.get(deviceIds[2]!) ?? 0).toBe(0);
        evidence['initialNativeHeads'] = [...nativeHeads];
        evidence['initialOwnAcceptedHead'] = stable.get(deviceIds[2]!);
        await pages[2]!.evaluate(
          ({ code, joined }) => globalThis.nativeContinuation.open(code, joined),
          seed.actors[2]!,
        );
        await expect
          .poll(
            async () => {
              const before = [...frontier()].sort(),
                state = (await pages[2]!.evaluate(() =>
                  globalThis.nativeContinuation.inbound(),
                )) as { state: string; receivedThrough: number },
                after = [...frontier()].sort();
              evidence['initialStatusSample'] = { before, after, state };
              return (
                state.state === 'ready' &&
                JSON.stringify(before) === JSON.stringify(after) &&
                state.receivedThrough ===
                  after.reduce(
                    (sum, [pub, n]) =>
                      sum + (pub === deviceIds[2] ? (nativeHeads.get(pub) ?? 0) : n),
                    0,
                  )
              );
            },
            { timeout: 30000 },
          )
          .toBe(true);
        evidence['initialNativeStatus'] = await pages[2]!.evaluate(() =>
          globalThis.nativeContinuation.inbound(),
        );
        backend.withhold(withheld);
        const initial = frontier(),
          before = new Map(deviceIds.slice(0, 2).map((pub) => [pub, initial.get(pub) ?? 0]));
        evidence['initialAcceptedFrontier'] = [...initial];
        let known = new Set(acceptedRows(join(directory, 'service')).map((row) => row.key));
        let prepared: Map<string, number> | undefined;
        if (backlog) {
          await closeDriver(pages[2]!);
          for (let i = 1; i <= 16; i++)
            for (const [index, actor] of ['A', 'B'].entries()) {
              const p = pages[index]!,
                text = ` ${actor}${i}`;
              addToExpected(actor, text);
              await p.evaluate(
                ({ actor, text }) => globalThis.nativeContinuation.insert(actor, text),
                { actor, text },
              );
              await p.evaluate(() => globalThis.nativeContinuation.flush());
              await expect
                .poll(
                  () =>
                    acceptedRows(join(directory, 'service')).filter((row) => !known.has(row.key))
                      .length,
                  { timeout: 20000 },
                )
                .toBe(1);
              const added = acceptedRows(join(directory, 'service')).filter(
                (row) => !known.has(row.key),
              );
              expect(added).toHaveLength(1);
              expect(added[0]!.publisher).toBe(deviceIds[index]);
              known = new Set(acceptedRows(join(directory, 'service')).map((row) => row.key));
            }
          const targets = frontier();
          prepared = new Map(deviceIds.slice(0, 2).map((pub) => [pub, targets.get(pub)!]));
          for (const [pub, n] of prepared) expect(n - (before.get(pub) ?? 0)).toBe(16);
          evidence['preparedBeforeReturn'] = [...prepared];
          await pages[2]!.evaluate(
            ({ code, joined }) => globalThis.nativeContinuation.open(code, joined),
            seed.actors[2]!,
          );
        }
        // Keep actual writing active in BOTH initial conditions; a finite catch-up alone is insufficient.
        const started = Date.now(),
          sparseSeen: number[] = [],
          acceptedDuring: number[] = [],
          seenAtHotPosition: { key: number; hotPosition: number }[] = [];
        const hotPosition = () =>
          Math.max(
            0,
            ...acceptedRows(join(directory, 'service'))
              .filter((row) => row.publisher === deviceIds[0])
              .map((row) => row.position),
          );
        for (let key = 0; key < 90; key++) {
          const text = ` LA${key}`;
          addToExpected('A', text);
          await pages[0]!.evaluate((text) => globalThis.nativeContinuation.insert('A', text), text);
          if ([20, 40, 60].includes(key)) {
            const text = ` LB${key}`;
            addToExpected('B', text);
            await pages[1]!.evaluate(
              (text) => globalThis.nativeContinuation.insert('B', text),
              text,
            );
          }
          const reader = await view(pages[2]!);
          for (const key of [20, 40, 60])
            if (reader.includes(` LB${key}`) && !sparseSeen.includes(key)) {
              sparseSeen.push(key);
              seenAtHotPosition.push({ key, hotPosition: hotPosition() });
            }
          acceptedDuring.push(acceptedRows(join(directory, 'service')).length);
          const due = started + (key + 1) * 500;
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - Date.now())));
        }
        evidence['sparseVisibleBeforeHotStopped'] = [...sparseSeen];
        // The unfair negative may also delay a sparse item. Keep the positive liveness assertion,
        // then require the SAME durable eight-position assertion to discriminate the control.
        if (!fault) expect(sparseSeen.sort((a, b) => a - b)).toEqual([20, 40, 60]);
        for (const seen of seenAtHotPosition)
          expect(
            hotPosition(),
            'the hot publisher must still advance after each sparse item is visible',
          ).toBeGreaterThan(seen.hotPosition);
        evidence['sparseVisibleBeforeHotStopped'] = sparseSeen;
        evidence['seenAtHotPosition'] = seenAtHotPosition;
        evidence['finalHotPosition'] = hotPosition();
        evidence['acceptedCountsDuringHot'] = acceptedDuring;
        await waitAll();
        const final = frontier(),
          through = new Map(deviceIds.slice(0, 2).map((pub) => [pub, final.get(pub)!]));
        for (const [pub, n] of through)
          expect(n - (before.get(pub) ?? 0)).toBeGreaterThan(backlog ? 16 : 0);
        evidence['before'] = [...before];
        evidence['acceptedThrough'] = [...through];
        await closeDriver(pages[2]!);
        await pages[2]!.evaluate(await observer());
        const inspected = await pages[2]!.evaluate(
          async ({ slotId, code }) =>
            Reflect.get(globalThis, 'nativeReceiptObserver').inspectNativeReceipts(
              slotId,
              code,
              true,
            ),
          { slotId: identity.slotId, code: seed.actors[2]!.code },
        );
        expect(inspected.readOnlyUnchanged).toBe(true);
        expect(inspected.floor).toBe(1);
        evidence['native'] = inspected;
        // Only the pre-accepted frontier is known to exist throughout this interval. Future positions
        // cannot be treated as pending before their publication, nor can empty checks be invented.
        if (prepared) {
          if (fault) {
            expect(() => assertFairTurns(inspected.receipts, before, prepared)).toThrow(
              'native publisher turn exceeds eight',
            );
            evidence['starvationControlDetected'] = true;
          } else
            evidence['preparedBacklogTurns'] = assertFairTurns(
              inspected.receipts,
              before,
              prepared,
            );
          expect(
            inspected.receipts.some(
              (r: { count: number; requestLimit: number }) => r.count > 1 && r.requestLimit === 4,
            ),
          ).toBe(true);
        }
        for (const [pub, n] of through) {
          const actual = inspected.receipts
            .filter((r: { publisher: string }) => r.publisher === pub)
            .flatMap((r: { position: number; count: number }) =>
              Array.from({ length: r.count }, (_, i) => r.position + i),
            )
            .filter((p: number) => p > (before.get(pub) ?? 0));
          expect(actual).toEqual(
            Array.from(
              { length: n - (before.get(pub) ?? 0) },
              (_, i) => (before.get(pub) ?? 0) + 1 + i,
            ),
          );
        }
        await pages[2]!.evaluate(
          ({ code, joined }) => globalThis.nativeContinuation.open(code, joined),
          seed.actors[2]!,
        );
        const local = ' C-LOCAL-UNDO';
        await pages[2]!.evaluate((text) => globalThis.nativeContinuation.insert('C', text), local);
        addToExpected('C', local);
        await waitAll();
        await pages[2]!.evaluate(() => globalThis.nativeContinuation.undo());
        master = master.replace(local, '');
        await waitAll();
        for (const p of pages)
          expect(
            normalized(await p.evaluate(() => globalThis.nativeContinuation.entries())),
          ).toEqual(expected());
        evidence['actorScopedUndoExact'] = true;
        evidence['hintProxy'] = backend.counts();
        evidence['deviceIds'] = deviceIds;
        const receiverBatches = backend.counts().batches.filter((b) => b.reader === deviceIds[2]);
        for (const batch of receiverBatches) {
          expect(batch.requests.length).toBeLessThanOrEqual(4);
          expect(batch.requests.reduce((n, r) => n + r.limit, 0)).toBeLessThanOrEqual(32);
          for (const request of batch.requests) expect(request.limit).toBeLessThanOrEqual(8);
        }
        if (backlog)
          expect(
            receiverBatches.some(
              (b) =>
                b.code === 200 &&
                b.requests.some((r, i) =>
                  b.requests
                    .slice(i + 1)
                    .some(
                      (next) =>
                        r.publisher === next.publisher &&
                        r.limit > 1 &&
                        next.limit > 1 &&
                        next.after === r.after + r.limit,
                    ),
                ),
            ),
            'two signed productive requests must actually share a wire batch',
          ).toBe(true);
        const receiverStreams = backend
          .counts()
          .streams.filter((s) => s.publisher === deviceIds[2]);
        expect(receiverStreams.reduce((n, s) => n + s.ready, 0)).toBeGreaterThan(0);
        if (withheld) expect(receiverStreams.reduce((n, s) => n + s.dropped, 0)).toBeGreaterThan(0);
        else expect(backend.counts().dropped).toBe(0);
        for (const p of pages) {
          await closeDriver(p);
          await p.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
          });
        }
        for (const context of contexts) await context.close();
        contexts.length = 0;
        const cold = await launch(join(directory, 'C'));
        contexts.push(cold);
        const page = cold.pages()[0]!;
        await restoreAuthenticator(page, seed.actors[2]!.credentials);
        await cold.setOffline(true);
        await page.goto(origin + '/');
        await openSaved(page, seed.actors[2]!.code, true);
        expect(normalized(await exportWriting(page, join(directory, 'cold.zip')))).toEqual(
          expected(),
        );
        await lock(page);
        evidence['ordinaryProcessColdExact'] = true;
      } finally {
        writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
        await info.attach('native-continuation', {
          body: JSON.stringify(evidence, null, 2),
          contentType: 'application/json',
        });
        for (const context of contexts) await context.close();
        await backend.close();
      }
    },
  );
