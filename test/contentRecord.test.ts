// @vitest-environment node
import { describe, expect, it } from 'vitest';
import vectors from './vectors/record-format.json';
import { fields, hex, hkdf } from '../src/crdt/custodyCrypto';
import {
  parseStoredRecord,
  recordAAD,
  copyBatch,
  parseCounter,
  parseWitness,
  reserveCounter,
  counterPayload,
  witnessPayload,
  type ContentCounter,
} from '../src/crdt/contentRecord';
import { initializeContentStore } from '../src/crdt/custody';
const unhex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
const scope = {
  slotId: 'slot',
  principalId: 'principal',
  workspaceId: 'workspace',
  storeId: 'ab'.repeat(16),
  rootId: 'cd'.repeat(16),
};
const counter = (): ContentCounter => ({
  v: 1,
  store_id: scope.storeId,
  intent: 'ef'.repeat(16),
  active_gen: 1,
  next_seq: 1,
  reserved: { '1': 0 },
  mac: new Uint8Array(32),
});

describe('selected content record bytes', () => {
  for (const vector of vectors.vectors.filter((v) => 'stored_record' in v.expected))
    it(vector.name, async () => {
      const v = vector.inputs;
      if (!('store_id' in v) || !('seq' in v) || !('kind' in v))
        throw Error('Not a content vector');
      const s = { principalId: v.principal_id, workspaceId: v.workspace_id, storeId: v.store_id };
      const r = parseStoredRecord({
        ...vector.expected.stored_record,
        nonce: unhex(v.nonce),
        ct: unhex(vector.expected.ct),
      });
      const key = await hkdf(
        unhex(v.k_g),
        new Uint8Array(),
        fields('done/store/v1', s.workspaceId, s.storeId),
        { name: 'AES-GCM', length: 256 },
        ['encrypt', 'decrypt'],
      );
      expect(hex(recordAAD(s, r))).toBe(vector.derived.aad);
      const actual = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(s, r), tagLength: 128 },
        key,
        unhex(v.plaintext),
      );
      expect(hex(new Uint8Array(actual))).toBe(vector.expected.ct);
      const opened = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(s, r), tagLength: 128 },
        key,
        r.ct,
      );
      expect(hex(new Uint8Array(opened))).toBe(v.plaintext);
      for (const [s2, r2] of [
        [{ ...s, principalId: s.principalId + 'x' }, r],
        [{ ...s, workspaceId: s.workspaceId + 'x' }, r],
        [{ ...s, storeId: s.storeId + 'x' }, r],
        [s, { ...r, gen: r.gen + 1 }],
        [s, { ...r, seq: r.seq + 1 }],
        [s, { ...r, kind: r.kind === 'state' ? ('update' as const) : ('state' as const) }],
      ] as const)
        await expect(
          crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(s2, r2), tagLength: 128 },
            key,
            r.ct,
          ),
        ).rejects.toThrow();
    });
  it('rejects unknown and partial records and owns cloned bytes', () => {
    const r = {
      v: 1,
      gen: 1,
      seq: 1,
      kind: 'update',
      nonce: new Uint8Array(12),
      ct: new Uint8Array(16),
    };
    for (const changed of [
      null,
      {},
      { ...r, v: 2 },
      { ...r, seq: NaN },
      { ...r, seq: Number.MAX_SAFE_INTEGER + 1 },
      { ...r, kind: 'mystery' },
      { ...r, nonce: new Uint8Array(11) },
      { ...r, ct: new Uint8Array(15) },
      { ...r, extra: 1 },
    ])
      expect(() => parseStoredRecord(changed)).toThrow(
        expect.objectContaining({ code: 'repair-required' }),
      );
    const parsed = parseStoredRecord(r);
    r.ct[0] = 255;
    expect(parsed.ct[0]).toBe(0);
  });
});
describe('allocation and metadata boundaries', () => {
  it('counts abandoned ranges and retains global order across a generation change', () => {
    const first = reserveCounter(counter(), 3, 1),
      abandoned = reserveCounter(first, 2, 1);
    expect([abandoned.next_seq, abandoned.reserved]).toEqual([6, { '1': 5 }]);
    const changed = { ...abandoned, active_gen: 2, reserved: { ...abandoned.reserved, '2': 0 } };
    expect(reserveCounter(changed, 2, 2)).toMatchObject({
      next_seq: 8,
      reserved: { '1': 5, '2': 2 },
    });
    expect(() => reserveCounter(changed, 1, 1)).toThrow(
      expect.objectContaining({ code: 'generation-changed' }),
    );
  });
  it('refuses equality at the per-key ceiling, independently of the global sequence', () => {
    const edge = { ...counter(), next_seq: 2 ** 32 - 1, reserved: { '1': 2 ** 32 - 2 } };
    expect(reserveCounter(edge, 1, 1).reserved['1']).toBe(2 ** 32 - 1);
    expect(() => reserveCounter(edge, 2, 1)).toThrow(
      expect.objectContaining({ code: 'rotation-required' }),
    );
    const rotated = { ...edge, active_gen: 2, reserved: { ...edge.reserved, '2': 0 } };
    expect(reserveCounter(rotated, 10, 2).next_seq).toBe(2 ** 32 + 9);
  });
  it('refuses malformed counters instead of inferring/resetting reservation history', () => {
    const c = counter();
    for (const bad of [
      null,
      {},
      { ...c, v: 2 },
      { ...c, next_seq: 2 },
      { ...c, reserved: {} },
      { ...c, reserved: { '01': 0 } },
      { ...c, reserved: { '1': -1 } },
      { ...c, intent: '00'.repeat(16) },
      { ...c, extra: true },
    ])
      expect(() => parseCounter(bad, scope, c.intent)).toThrow();
    expect(parseCounter(c, scope, c.intent)).toEqual(c);
  });
  it('authenticates scope, intent, every counter field and witness state in stable tuples', () => {
    const c = counter(),
      w = { v: 1 as const, state: 'creating' as const, intent: c.intent, mac: new Uint8Array(32) };
    expect(counterPayload(scope, c)).toEqual(
      counterPayload(
        scope,
        parseCounter(Object.fromEntries(Object.entries(c).reverse()), scope, c.intent),
      ),
    );
    for (const s of [
      { ...scope, slotId: 'x' },
      { ...scope, principalId: 'x' },
      { ...scope, workspaceId: 'x' },
      { ...scope, storeId: 'x' },
      { ...scope, rootId: 'x' },
    ]) {
      expect(counterPayload(s, c)).not.toEqual(counterPayload(scope, c));
      expect(witnessPayload(s, w)).not.toEqual(witnessPayload(scope, w));
    }
    expect(witnessPayload(scope, { ...w, state: 'ready' })).not.toEqual(witnessPayload(scope, w));
    expect(() => parseWitness({ ...w, extra: 1 })).toThrow();
  });
  it('captures bounded byte batches and accepts received updates above the journal limit', () => {
    const input = { kind: 'update' as const, bytes: new Uint8Array(17 * 1024) };
    const copy = copyBatch([input]);
    input.bytes[0] = 255;
    expect(copy[0]!.bytes[0]).toBe(0);
    expect(() => copyBatch([])).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(() => copyBatch(Array(257).fill(input))).toThrow(
      expect.objectContaining({ code: 'batch-too-large' }),
    );
    expect(() =>
      copyBatch([{ kind: 'state', bytes: new Uint8Array(4 * 1024 * 1024 + 1) }]),
    ).toThrow(expect.objectContaining({ code: 'batch-too-large' }));
  });
  it('requires the other-carrier owner before attempting initialization', async () => {
    await expect(
      initializeContentStore(
        { ...scope, resolvePrincipal: () => scope.principalId },
        '',
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });
});
