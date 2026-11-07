// @vitest-environment node
import { expect, it } from 'vitest';
import { parseStoredRecord, viewStoredRecord, type StoredRecord } from '../src/crdt/contentRecord';
const record = (): StoredRecord => ({
  v: 1,
  gen: 1,
  seq: 7,
  kind: 'update',
  nonce: new Uint8Array(12).fill(3),
  ct: new Uint8Array(32).fill(5),
});
it('owning and borrowed unverified record readers share every header and byte validation', () => {
  for (const kind of ['update', 'state', 'heads', 'outbound'] as const) {
    const input = record();
    input.kind = kind;
    expect(viewStoredRecord(input)).toEqual(parseStoredRecord(input));
  }
});
it('owning parser remains detached while a scoped ciphertext view deliberately borrows its source', () => {
  const input = record(),
    owned = parseStoredRecord(input),
    view = viewStoredRecord(input);
  input.nonce[0] = 9;
  input.ct[0] = 10;
  expect(owned.nonce[0]).toBe(3);
  expect(owned.ct[0]).toBe(5);
  expect(view.nonce[0]).toBe(9);
  expect(view.ct[0]).toBe(10);
  expect(view.ct).toBe(input.ct);
  expect(owned.ct).not.toBe(input.ct);
});
it('neither reader accepts malformed persisted fields, metadata shape or unsupported record kind', () => {
  const invalid = [
    null,
    {},
    [],
    { ...record(), extra: true },
    { ...record(), v: 2 },
    { ...record(), gen: 0 },
    { ...record(), seq: NaN },
    { ...record(), kind: 'unknown' },
    { ...record(), nonce: new Uint8Array(11) },
    { ...record(), ct: new Uint8Array(15) },
    { ...record(), ct: [1, 2, 3] },
  ];
  for (const input of invalid) {
    expect(() => parseStoredRecord(input)).toThrow();
    expect(() => viewStoredRecord(input)).toThrow();
  }
});
it('borrowed view refuses shared backing; owning parser still returns its original ordinary copy', () => {
  const input = { ...record(), ct: new Uint8Array(new SharedArrayBuffer(32)) };
  expect(() => viewStoredRecord(input)).toThrow();
  expect(parseStoredRecord(input).ct.buffer).toBeInstanceOf(ArrayBuffer);
});
