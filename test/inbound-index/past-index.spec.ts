/** Draft until the previous bounded phase freezes. Genuine accepted rows; no cap changes. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import {
  cloneSeed,
  paths,
  launch,
  driver,
  closeDriver,
  initialMaster,
  origin,
  type Seed,
} from '../inbound-continuation/fixture';
import { service } from '../inbound-continuation/server.mjs';
import { acceptedRows, observer, slot, exportWriting, lock } from '../inbound-native/fixtures';
import { restoreAuthenticator, openSaved } from '../packaged-account/devices';
import { MAX_JOURNAL_UPDATE } from '../../src/crdt/custody';
import { MAX_PENDING_BYTES } from '../../src/crdt/admissionQueue';
import { decodeSubmission } from '../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
const normalized = (entries: { path: string; content: string }[]) =>
  [...entries].sort((a, b) => a.path.localeCompare(b.path));
function wires(directory: string, publisher: string) {
  const db = new DatabaseSync(join(directory, 'account.sqlite'), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT submission FROM delivery_decisions WHERE kind='accepted' UNION ALL SELECT submission FROM publisher_decisions WHERE kind='accepted'",
      )
      .all()
      .flatMap((row) => {
        const submission = decodeSubmission(new Uint8Array(row['submission'] as Uint8Array));
        try {
          const envelope = decodeNetworkEnvelope(submission.envelope);
          return envelope.credential_id === publisher
            ? [{ position: envelope.seq, wireBytes: submission.envelope.length }]
            : [];
        } finally {
          submission.envelope.fill(0);
          submission.signature.fill(0);
        }
      })
      .sort((a, b) => a.position - b.position);
  } finally {
    db.close();
  }
}
test('prepare independently accepted oversized backlog', async ({
  browserName: _browserName,
}, info) => {
  const started = Date.now();
  const remaining = () => Math.max(1, 900000 - (Date.now() - started));
  test.setTimeout(900000); // Existing bounded fixture-preparation recipe ceiling, not the native gate.
  const { root, build } = paths(),
    directory = join(root, 'grown'),
    { seed, baseline } = cloneSeed(directory);
  const backend = await service(join(directory, 'service'), build),
    contexts: BrowserContext[] = [],
    progress: unknown[] = [];
  try {
    const pages: Page[] = [];
    for (const actor of seed.actors) {
      const context = await launch(join(directory, actor.role));
      contexts.push(context);
      const page = context.pages()[0]!;
      pages.push(page);
      await driver(page, actor);
    }
    await pages[0]!.evaluate((text) => globalThis.nativeContinuation.replace(text), initialMaster);
    await pages[0]!.evaluate(() => globalThis.nativeContinuation.flushChecked());
    for (const page of pages)
      await expect
        .poll(() => page.evaluate(() => globalThis.nativeContinuation.read()), { timeout: 30000 })
        .toBe(initialMaster);
    await closeDriver(pages[0]!);
    await contexts[0]!.close();
    const prior = acceptedRows(join(directory, 'service'));
    let master = initialMaster,
      publisher = '',
      version = 0,
      bytes = 0;
    const burst = 64;
    // Valid multibyte text exercises the BYTE ceiling without activating forced paste
    // slicing. The existing planner, journal, pending and protocol limits remain unchanged.
    const filler = '界'.repeat(900);
    expect(filler.length + 64).toBeLessThanOrEqual(1000);
    expect(8 * MAX_JOURNAL_UPDATE).toBeLessThan(MAX_PENDING_BYTES);
    while (bytes <= 8 * 1024 * 1024) {
      for (let n = 0; n < burst; n++) {
        master = `A:\nB:${++version}:${filler}\nC:\n`;
        expect(
          await pages[1]!.evaluate(
            (text) => globalThis.nativeContinuation.replaceSettled(text),
            master,
          ),
        ).toBe(master);
        if ((n + 1) % 8 === 0)
          await pages[1]!.evaluate(() => globalThis.nativeContinuation.flushChecked());
      }
      await pages[1]!.evaluate(() => globalThis.nativeContinuation.flushChecked());
      await expect
        .poll(
          async () => {
            const latest = await pages[2]!.evaluate(() => globalThis.nativeContinuation.read());
            if (latest !== master)
              await pages[1]!.evaluate(() => globalThis.nativeContinuation.flushChecked());
            return latest;
          },
          { timeout: remaining() },
        )
        .toBe(master);
      const added = acceptedRows(join(directory, 'service')).filter(
        (row) => !prior.some((old) => old.key === row.key),
      );
      const publishers = [...new Set(added.map((row) => row.publisher))];
      expect(publishers).toHaveLength(1);
      publisher = publishers[0]!;
      const wire = wires(join(directory, 'service'), publisher);
      bytes = wire.reduce((sum, row) => sum + row.wireBytes, 0);
      const row = {
        version,
        acceptedPositions: wire.length,
        wireBytes: bytes,
        lastPosition: wire.at(-1)!.position,
      };
      progress.push(row);
      writeFileSync(join(directory, 'growth.json'), JSON.stringify(progress, null, 2) + '\n');
    }
    const expected = normalized(
      baseline.map((row) => (row.path === 'master.md' ? { ...row, content: master } : row)),
    );
    for (const page of pages.slice(1))
      expect(
        normalized(await page.evaluate(() => globalThis.nativeContinuation.entries())),
      ).toEqual(expected);
    for (const page of pages.slice(1)) await closeDriver(page);
    for (const context of contexts.slice(1)) await context.close();
    contexts.length = 0;
    writeFileSync(
      join(directory, 'prepared.json'),
      JSON.stringify(
        {
          seed,
          expected,
          master,
          publisher,
          wire: wires(join(directory, 'service'), publisher).filter(
            (row) =>
              row.position >
              Math.max(
                0,
                ...prior.filter((old) => old.publisher === publisher).map((old) => old.position),
              ),
          ),
          progress,
        },
        null,
        2,
      ) + '\n',
    );
    await info.attach('actual-accepted-growth', {
      body: JSON.stringify(progress),
      contentType: 'application/json',
    });
  } finally {
    for (const context of contexts) await context.close();
    await backend.close();
  }
});
test('actual byte-ceiling fallback continues exact native writing and ordinary cold', async ({
  browserName: _browserName,
}, info) => {
  const { root, build } = paths(),
    directory = join(root, 'grown'),
    prepared = JSON.parse(readFileSync(join(directory, 'prepared.json'), 'utf8')) as {
      seed: Seed;
      expected: { path: string; content: string }[];
      master: string;
      publisher: string;
      wire: { position: number; wireBytes: number }[];
    };
  const output = join(directory, 'index-events.jsonl');
  if (existsSync(output)) throw Error('Preserve the previous index attempt');
  const backend = await service(join(directory, 'service'), build),
    contexts: BrowserContext[] = [],
    events: Record<string, any>[] = [],
    evidence: Record<string, unknown> = {};
  let ordinal = 0n;
  const observed = () =>
    events.find(
      (e) =>
        e['site'] === 'actual-index-drop' ||
        e['site'] === 'append-usage-refusal' ||
        (e['site'] === 'append-pre-refusal' && e['physicalBytes'] > 32 * 1024 * 1024),
    );
  try {
    const context = await launch(join(directory, 'A'));
    contexts.push(context);
    const page = context.pages()[0]!;
    page.on('console', (message) => {
      const text = message.text(),
        prefix = 'native-index-observation:';
      if (!text.startsWith(prefix)) return;
      const event = { ...JSON.parse(text.slice(prefix.length)), ordinal: String(++ordinal) };
      events.push(event);
      appendFileSync(output, JSON.stringify(event) + '\n');
    });
    await driver(page, prepared.seed.actors[0]!);
    await expect
      .poll(() => page.evaluate(() => globalThis.nativeContinuation.read()), { timeout: 120000 })
      .toBe(prepared.master);
    expect(
      events.some(
        (e) => e['site'] === 'full-verified' && e['counterV'] === 2 && e['indexed'] === true,
      ),
    ).toBe(true);
    const refused = observed();
    expect(refused, 'actual unchanged index-cap selection must be exposed').toBeTruthy();
    expect(refused!['counterV']).toBe(2);
    const usage = [...events]
      .reverse()
      .find(
        (e) =>
          e['site'] === 'usage' &&
          e['nativeSeq'] === refused!['nativeSeq'] &&
          BigInt(e['ordinal']) < BigInt(refused!['ordinal']),
      );
    if (refused!['site'] !== 'append-pre-refusal')
      expect(usage!['ownedBytes']).toBeGreaterThan(32 * 1024 * 1024);
    expect(
      events.some(
        (e) =>
          e['site'] === 'full-verified' &&
          e['indexed'] === false &&
          e['nativeSeq'] > refused!['nativeSeq'],
      ),
    ).toBe(true);
    expect(normalized(await page.evaluate(() => globalThis.nativeContinuation.entries()))).toEqual(
      prepared.expected,
    );
    const before = prepared.master,
      local = before + 'LOCAL INDEX UNDO';
    await page.evaluate((text) => globalThis.nativeContinuation.replaceSettled(text), local);
    await page.evaluate(() => globalThis.nativeContinuation.undoSettled());
    await expect.poll(() => page.evaluate(() => globalThis.nativeContinuation.read())).toBe(before);
    const identity = await slot(page, false);
    await closeDriver(page);
    await page.evaluate(await observer());
    const native = await page.evaluate(
      ({ slotId, code }) =>
        Reflect.get(globalThis, 'nativeReceiptObserver').inspectNativeReceipts(slotId, code, false),
      { slotId: identity.slotId, code: prepared.seed.actors[0]!.code },
    );
    expect(native.readOnlyUnchanged).toBe(true);
    expect(native.floor).toBe(1);
    const positions = native.receipts
      .filter((r: { publisher: string }) => r.publisher === prepared.publisher)
      .flatMap((r: { position: number; count: number }) =>
        Array.from({ length: r.count }, (_, i) => r.position + i),
      );
    // Initial positions may be covered by the genuine seed's installed checkpoint. Every grown
    // position is still required and compared with independent accepted decisions.
    const first = prepared.wire[0]!.position;
    expect(positions.filter((p: number) => p >= first)).toEqual(
      prepared.wire.map((r) => r.position),
    );
    const crossing = [...native.receipts]
      .reverse()
      .find((r: { seq: number }) => r.seq <= refused!['nativeSeq']);
    expect(crossing).toBeTruthy();
    evidence['firstActualFallback'] = { refusal: refused, usage, receipt: crossing };
    evidence['native'] = native;
    evidence['ordinaryUndoExact'] = true;
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await context.close();
    contexts.length = 0;
    const cold = await launch(join(directory, 'A'));
    contexts.push(cold);
    const reopen = cold.pages()[0]!;
    await restoreAuthenticator(reopen, prepared.seed.actors[0]!.credentials);
    await cold.setOffline(true);
    await reopen.goto(origin + '/');
    await openSaved(reopen, prepared.seed.actors[0]!.code, false);
    expect(normalized(await exportWriting(reopen, join(directory, 'cold.zip')))).toEqual(
      prepared.expected,
    );
    await lock(reopen);
    evidence['ordinaryOfflineProcessColdExact'] = true;
  } finally {
    writeFileSync(join(directory, 'index-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await info.attach('actual-index', {
      body: JSON.stringify(evidence),
      contentType: 'application/json',
    });
    for (const context of contexts) await context.close();
    await backend.close();
  }
});
