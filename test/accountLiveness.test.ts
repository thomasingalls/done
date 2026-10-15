// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import { createInboundCoverage } from '../src/crdt/inboundLedger';
import { Y, hasPendingUpdates } from '../src/crdt/yjs';
import { verifyInboundCoverage, verifyInboundLedger } from '../src/crdt/inboundLedger';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { emptySpoolWitness, type OpenedRecord } from '../src/crdt/contentRecord';
import { extendSpoolWitness, verifySpoolWitness } from '../src/crdt/spoolRecord';
import { B, sources } from './account-inbound/fixtures';
import { context, eventWire, live } from './account-inbound-codecs/oracle';

const source = sources(),
  originals = source.entries.flatMap((e) => e.updates);
const row = (
  bytes: Uint8Array<ArrayBuffer>,
  seq: number,
  kind: OpenedRecord['kind'] = 'update',
): OpenedRecord => ({ gen: 1, seq, bytes, kind });
// A unit adapter for verifyInboundLedger's entries input, not a forged full owner/census.
const events = source.entries
  .filter((e) => e.publisher === B)
  .map((e, i) => {
    const record = row(eventWire(e), 100 + i, 'heads');
    return { record, event: decodeInboundRecord(record.bytes) };
  });
const census = { entries: events, installations: [] } as unknown as Parameters<
  typeof verifyInboundLedger
>[0];

it('unchanged event witness does not authorize missing content, including pending originals', async () => {
  const pending = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(pending, source.baseline);
    Y.applyUpdate(pending, source.entries[2]!.updates[0]!);
    expect(hasPendingUpdates(pending)).toBe(true);
    expect(pending.getText('master').toString()).toBe('base');
    const records = [row(source.baseline, 1), row(source.entries[2]!.updates[0]!, 2)];
    expect(() => verifyInboundCoverage(records, source.entries[2]!.updates)).not.toThrow();
    expect(() => verifyInboundCoverage(records.slice(0, 1), source.entries[2]!.updates)).toThrow(
      /coverage/,
    );
  } finally {
    pending.destroy();
  }
  const records = [source.baseline, ...originals].map((b, i) => row(b, i + 1));
  const good = await verifyInboundLedger(census, records, context(B), live);
  expect(good.prefix.position).toBe(2);
  const bytes = events.map((e) => e.record.bytes);
  let witness = emptySpoolWitness();
  for (const b of bytes) witness = await extendSpoolWitness(witness, b, crypto.subtle);
  // This validator intentionally only reads event bytes and the witness fields.
  const spool = { events: bytes } as Parameters<typeof verifySpoolWitness>[0];
  const counter = { v: 2, spool: witness } as Parameters<typeof verifySpoolWitness>[1];
  await verifySpoolWitness(spool, counter, crypto.subtle);
  const missing = records.filter((r) => r.bytes !== source.entries[2]!.updates[0]);
  await verifySpoolWitness(spool, counter, crypto.subtle);
  await expect(verifyInboundLedger(census, missing, context(B), live)).rejects.toThrow(/coverage/);
  if (process.env['ACCOUNT_REPORT_DIR'])
    writeFileSync(
      join(process.env['ACCOUNT_REPORT_DIR'], 'witness-control.json'),
      JSON.stringify(
        {
          sameWitnessPasses: true,
          missingContentRefused: true,
          invisiblePendingOriginalRefusedWhenMissing: true,
          witness,
        },
        null,
        2,
      ),
    );
});

it('generated delivery permutations, duplicate originals and complete snapshots preserve coverage; witness-only cache control fails', async () => {
  const histories: unknown[] = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.shuffledSubarray([0, 1, 2, 3, 4], { minLength: 5, maxLength: 5 }),
      fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 8 }),
      fc.boolean(),
      async (order, duplicates, compact) => {
        const all = [source.baseline, ...originals],
          doc = new Y.Doc({ gc: false });
        try {
          const records = [...order, ...duplicates].map((n, i) => row(all[n]!, i + 1));
          for (const record of records) Y.applyUpdate(doc, record.bytes);
          expect(doc.getText('master').toString()).toBe(source.expected);
          expect(hasPendingUpdates(doc)).toBe(false);
          const retained = compact
            ? [row(new Uint8Array(Y.encodeStateAsUpdate(doc)), 20, 'state')]
            : records;
          expect(
            (await verifyInboundLedger(census, retained, context(B), live)).prefix.position,
          ).toBe(2);
          // Removing every carrier of B's inserted Y, or the only complete snapshot, is a real loss.
          const lost = compact
            ? []
            : retained.filter((r) => r.bytes !== source.entries[2]!.updates[0]);
          await expect(verifyInboundLedger(census, lost, context(B), live)).rejects.toThrow(
            /coverage/,
          );
          const actual = createVerifiedRecords<Awaited<ReturnType<typeof verifyInboundLedger>>>();
          const reuse = { memo: createVerificationMemo(), coverage: createInboundCoverage() };
          const verify = (r: OpenedRecord[]) =>
            verifyInboundLedger(census, r, context(B), live, reuse);
          const expected = await verifyInboundLedger(census, retained, context(B), live);
          expect(await verify(retained)).toEqual(expected);
          expect(await verify(retained)).toEqual(expected);
          await actual.verify(retained, 'same witness', verify, live.assertCurrent);
          await expect(
            actual.verify(lost, 'same witness', verify, live.assertCurrent),
          ).rejects.toThrow(/coverage/);
          expect(() => actual.read(retained)).toThrow();
          actual.clear();
          expect(await verify(retained)).toEqual(expected);
          const wrong = context(B);
          wrong.authority.head = 'ff'.repeat(32);
          await expect(verifyInboundLedger(census, retained, wrong, live, reuse)).rejects.toThrow();
          const changed = structuredClone(census);
          changed.entries[0]!.record.bytes[20]! ^= 1;
          await expect(
            verifyInboundLedger(changed, retained, context(B), live, reuse),
          ).rejects.toThrow();
          reuse.memo.clear();
          reuse.coverage.clear();
          // Candidate optimization fault: actually verify the first view, then reuse it solely by
          // event identity. Its second call incorrectly accepts the independently rejected lost set.
          const cached = new Map<string, Awaited<ReturnType<typeof verifyInboundLedger>>>();
          const witnessOnly = async (input: OpenedRecord[]) => {
            const identity = events
              .map((e) => Buffer.from(e.record.bytes).toString('hex'))
              .join(':');
            if (!cached.has(identity))
              cached.set(identity, await verifyInboundLedger(census, input, context(B), live));
            return cached.get(identity)!;
          };
          await witnessOnly(retained);
          expect((await witnessOnly(lost)).prefix.position).toBe(2);
          histories.push({
            order,
            duplicates,
            compact,
            missingContentRefused: true,
            naiveCacheAccepts: true,
          });
        } finally {
          doc.destroy();
        }
      },
    ),
    { seed: 120907, numRuns: 40, endOnFailure: true },
  );
  if (process.env['ACCOUNT_REPORT_DIR'])
    writeFileSync(
      join(process.env['ACCOUNT_REPORT_DIR'], 'coverage-histories.json'),
      JSON.stringify({ result, histories }, null, 2),
    );
  expect(result.failed).toBe(false);
});
