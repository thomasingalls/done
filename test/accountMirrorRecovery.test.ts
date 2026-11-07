// @vitest-environment node
import { expect, it } from 'vitest';
import { copyAccountMirrorRecovery } from '../src/crdt/accountMirrorRecovery';
import { replayRecovery } from '../src/crdt/admissionDocument';
import { createDoc, encodeState, applyUpdate, sameDocState } from '../src/crdt/yjs';
import type { JournalRecovery } from '../src/crdt/custody';

it('copies exact content identities and bytes while leaving verified ledger metadata at its owner', () => {
  const source: JournalRecovery = {
    records: [
      { kind: 'state', gen: 2, seq: 10, bytes: Uint8Array.of(1) },
      { kind: 'outbound', gen: 2, seq: 11, bytes: new Uint8Array(1024 * 1024) },
      { kind: 'update', gen: 2, seq: 12, bytes: Uint8Array.of(2) },
      { kind: 'heads', gen: 2, seq: 13, bytes: Uint8Array.of(3) },
    ],
    journal: [{ key: 'exact-key', generation: 2, bytes: Uint8Array.of(4) }],
  };
  const result = copyAccountMirrorRecovery(source);
  expect(result.records.map(({ kind, gen, seq }) => ({ kind, gen, seq }))).toEqual([
    { kind: 'state', gen: 2, seq: 10 },
    { kind: 'update', gen: 2, seq: 12 },
  ]);
  expect(result.journal[0]).toEqual(source.journal[0]);
  result.records[0]!.bytes.fill(0);
  result.journal[0]!.bytes.fill(0);
  expect(source.records[0]!.bytes).toEqual(Uint8Array.of(1));
  expect(source.journal[0]!.bytes).toEqual(Uint8Array.of(4));
  expect(source.records).toHaveLength(4);
});

it('retains unresolved structs and deletion sets, not merely currently readable text', () => {
  const donor = createDoc(),
    full = createDoc(),
    projected = createDoc();
  try {
    const text = donor.getText('master');
    text.insert(0, 'abc');
    const missingBasis = encodeState(donor);
    const updates: Uint8Array<ArrayBuffer>[] = [];
    donor.on('update', (bytes) => updates.push(new Uint8Array(bytes)));
    text.insert(3, 'tail');
    text.delete(1, 1);
    const raw: JournalRecovery = {
      records: [
        { kind: 'update', gen: 1, seq: 2, bytes: updates[0]! },
        { kind: 'outbound', gen: 1, seq: 3, bytes: Uint8Array.of(99) },
      ],
      journal: [{ key: 'exact-journal', generation: 1, bytes: updates[1]! }],
    };
    replayRecovery(full, raw);
    replayRecovery(projected, copyAccountMirrorRecovery(raw));
    expect(sameDocState(full, projected)).toBe(true);
    applyUpdate(full, missingBasis);
    applyUpdate(projected, missingBasis);
    expect(sameDocState(full, projected)).toBe(true);
    expect(projected.getText('master').toString()).toBe('actail');
  } finally {
    donor.destroy();
    full.destroy();
    projected.destroy();
  }
});

it('does not transfer hidden fields or a private proof-like extension', () => {
  const record = { kind: 'update' as const, gen: 1, seq: 1, bytes: Uint8Array.of(0, 0) };
  const read = () => {
    throw Error('A private extension must not be walked');
  };
  Object.defineProperty(record, 'proof', { enumerable: true, get: read });
  expect(
    Object.keys(copyAccountMirrorRecovery({ records: [record], journal: [] }).records[0]!),
  ).toEqual(['kind', 'gen', 'seq', 'bytes']);
});
