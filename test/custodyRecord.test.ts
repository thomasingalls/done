// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { random, sealFactor, utf8 } from '../src/crdt/custodyCrypto';
import {
  authenticateRecord,
  parseRecord,
  recordPayload,
  signRecord,
  type CustodyRecord,
} from '../src/crdt/custodyRecord';
import {
  beginCustodyEnrollment,
  openCustodySession,
  type CustodyCreationOptions,
} from '../src/crdt/custody';

const scope = { slotId: 'slot', principalId: 'principal', workspaceId: 'workspace' };
const make = async () => {
  const root = random(32);
  const r: CustodyRecord = {
    v: 2,
    state: 'creating',
    slot_id: scope.slotId,
    principal_id: scope.principalId,
    workspace_id: scope.workspaceId,
    store_id: '11'.repeat(16),
    root_id: '22'.repeat(16),
    seals: [await sealFactor(scope, utf8('0000000000000000000000000'), root, 'code', 'code')],
    seal_reserved: 0,
    rotation_owed: false,
    creation_intent: {
      id: '33'.repeat(16),
      storeId: '11'.repeat(16),
      rootId: '22'.repeat(16),
      wrappingId: '44'.repeat(16),
      signingId: '55'.repeat(16),
    },
    envelope: null,
    credentials: null,
    mac: new Uint8Array(32),
  };
  return { root, record: await signRecord(root, r) };
};
describe('custody v2 metadata', () => {
  it('authenticates every state, identity, reservation and intent field', async () => {
    const { root, record } = await make();
    await authenticateRecord(root, parseRecord(record, scope));
    const changes: Array<(r: CustodyRecord) => void> = [
      (r) => {
        r.state = 'protected';
      },
      (r) => {
        r.slot_id = 'other';
      },
      (r) => {
        r.principal_id = 'other';
      },
      (r) => {
        r.workspace_id = 'other';
      },
      (r) => {
        r.store_id = 'aa'.repeat(16);
      },
      (r) => {
        r.root_id = 'aa'.repeat(16);
      },
      (r) => {
        r.seal_reserved = 1;
      },
      (r) => {
        r.creation_intent!.id = 'aa'.repeat(16);
      },
      (r) => {
        r.creation_intent!.wrappingId = 'aa'.repeat(16);
      },
      (r) => {
        r.creation_intent!.signingId = 'aa'.repeat(16);
      },
      (r) => {
        r.seals[0].ct[0] = r.seals[0].ct[0]! ^ 1;
      },
      (r) => {
        r.mac[0] = r.mac[0]! ^ 1;
      },
    ];
    for (const change of changes) {
      const changed = structuredClone(record);
      change(changed);
      await expect(authenticateRecord(root, changed)).rejects.toMatchObject({
        code: 'repair-required',
      });
    }
  });
  it('does not authenticate object insertion order or inherited properties', async () => {
    const { root, record } = await make();
    const reordered = Object.fromEntries(Object.entries(record).reverse());
    await authenticateRecord(root, parseRecord(reordered, scope));
    expect(recordPayload(parseRecord(reordered, scope))).toEqual(recordPayload(record));
    expect(() => parseRecord(Object.create(record), scope)).toThrow();
  });
  it('refuses malformed/partial, unknown-version, extra-field and missing-code records', async () => {
    const { record } = await make();
    for (const changed of [
      null,
      {},
      { ...record, v: 3 },
      { ...record, promptless: random(32) },
      { ...record, seals: [] },
      { ...record, state: 'protected' },
      { ...record, seal_reserved: -1 },
      { ...record, seal_reserved: 2 ** 32 },
      { ...record, seal_reserved: 1.5 },
      { ...record, store_id: 'other' },
      { ...record, mac: new Uint8Array(31) },
      { ...record, creation_intent: null },
    ])
      expect(() => parseRecord(changed, scope)).toThrow(
        expect.objectContaining({ code: 'repair-required' }),
      );
    expect(() => parseRecord({ v: 1, key: {} }, scope)).toThrow(
      expect.objectContaining({ code: 'migration-required' }),
    );
    expect(() => parseRecord({ ...record, state: 'migrating' }, scope)).toThrow(
      expect.objectContaining({ code: 'migration-required' }),
    );
  });
});
describe('custody entry-point contract', () => {
  const authority = { ...scope, resolvePrincipal: () => scope.principalId };
  it('requires a carrier checker rather than assuming absent custody proves fresh genesis', () => {
    expect(() => beginCustodyEnrollment(authority, {} as CustodyCreationOptions)).toThrow(
      expect.objectContaining({ code: 'invalid-input' }),
    );
  });
  it('a chosen code cannot confirm enrollment, and cancellation erases redisplay', async () => {
    const ceremony = beginCustodyEnrollment(authority, {
      checkCreation: () => {
        throw Error('must not run');
      },
    });
    const generated = ceremony.displayCode!;
    await expect(
      ceremony.confirm(generated[0] === '0' ? '1'.repeat(25) : '0'.repeat(25)),
    ).rejects.toMatchObject({ code: 'confirmation-required' });
    expect(ceremony.displayCode).toBe(generated);
    ceremony.cancel();
    expect(ceremony.displayCode).toBeNull();
    await expect(ceremony.confirm(generated)).rejects.toMatchObject({ code: 'enrollment-closed' });
  });
  it('refuses missing/invalid factors before touching storage', async () => {
    await expect(openCustodySession(authority, '')).rejects.toMatchObject({
      code: 'confirmation-required',
    });
  });
});
