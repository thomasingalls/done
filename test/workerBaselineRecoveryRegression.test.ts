// @vitest-environment node
import { expect, it } from 'vitest';
import {
  createAccountRecoveryStream,
  readAccountRecoveryStream,
  RECOVERY_PAGE_BYTES,
  type RecoveryPage,
} from '../src/crdt/accountWorkerRecoveryStream';
import type { JournalRecovery } from '../src/crdt/custody';
import { parseStoredRecord } from '../src/crdt/contentRecord';
import { workerMessageBytes } from '../src/crdt/workerChannel';

const record = (kind: 'state' | 'update', seq: number, gen = 2) => ({
  kind,
  gen,
  seq,
  bytes: new Uint8Array([7, 8]),
});

it('streams a leading authenticated baseline snapshot across bounded pages without changing its zero sequence', async () => {
  const source: JournalRecovery = {
    records: [
      { ...record('state', 0), bytes: new Uint8Array(400000).fill(7) },
      record('update', 19),
    ],
    journal: [{ key: 'baseline-tail-journal', generation: 2, bytes: new Uint8Array([9]) }],
  };
  const expected = structuredClone(source);
  const stream = createAccountRecoveryStream(source);
  const receivedPages: RecoveryPage[] = [];
  try {
    const got = await readAccountRecoveryStream(
      stream.counts,
      async () => {
        const page = structuredClone(stream.next());
        expect(workerMessageBytes(page)).toBeLessThanOrEqual(RECOVERY_PAGE_BYTES);
        receivedPages.push(page);
        return page;
      },
      () => {},
    );
    expect(got).toEqual(expected);
    expect(got.records[0]!.seq).toBe(0);
    expect(receivedPages.length).toBeGreaterThan(1);
    expect(
      receivedPages.every((p) => p.parts.every((part) => part.bytes.every((v) => v === 0))),
    ).toBe(true);
    for (const row of [...got.records, ...got.journal]) row.bytes.fill(0);
  } finally {
    stream.close();
  }
  expect(
    [...source.records, ...source.journal].every((row) => row.bytes.every((v) => v === 0)),
  ).toBe(true);
});

it('preserves a snapshot-only reduced recovery without manufacturing a positive sequence', async () => {
  const source: JournalRecovery = { records: [record('state', 0)], journal: [] };
  const expected = structuredClone(source);
  const stream = createAccountRecoveryStream(source);
  try {
    const got = await readAccountRecoveryStream(
      stream.counts,
      async () => structuredClone(stream.next()),
      () => {},
    );
    expect(got).toEqual(expected);
    got.records[0]!.bytes.fill(0);
  } finally {
    stream.close();
  }
});

it.each([
  { name: 'an update at sequence zero', records: [record('update', 0)] },
  { name: 'a later state at sequence zero', records: [record('update', 1), record('state', 0)] },
  { name: 'a second zero-sequence snapshot', records: [record('state', 0), record('state', 0)] },
  { name: 'a negative sequence', records: [record('state', -1)] },
  { name: 'a fractional sequence', records: [record('state', 0.5)] },
  { name: 'a zero generation', records: [record('state', 0, 0)] },
])('still refuses $name and erases received pages', async ({ records }) => {
  const stream = createAccountRecoveryStream({ records, journal: [] });
  const pages: RecoveryPage[] = [];
  try {
    await expect(
      readAccountRecoveryStream(
        stream.counts,
        async () => {
          const page = structuredClone(stream.next());
          pages.push(page);
          return page;
        },
        () => {},
      ),
    ).rejects.toThrow('Worker recovery stream changed');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.parts.every((part) => part.bytes.every((v) => v === 0)))).toBe(
      true,
    );
  } finally {
    stream.close();
  }
});

it('keeps sequence zero invalid for native stored ciphertext records', () => {
  const stored = {
    v: 1,
    kind: 'state',
    gen: 2,
    seq: 1,
    nonce: new Uint8Array(12),
    ct: new Uint8Array(16),
  };
  expect(parseStoredRecord(stored).seq).toBe(1);
  expect(() => parseStoredRecord({ ...stored, seq: 0 })).toThrow();
});
