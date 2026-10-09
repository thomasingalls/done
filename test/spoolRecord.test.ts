// @vitest-environment node
import { it, expect, describe } from 'vitest';
import fc from 'fast-check';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import {
  encodeSpoolEntry,
  decodeSpoolEntry,
  inspectSpool,
  verifySpool,
  extendSpoolWitness,
  verifySpoolWitness,
  NET_SEAL_LIMIT,
  networkRoute,
  type SpoolEntry,
} from '../src/crdt/spoolRecord';
import {
  encodeSourceCapsule,
  type CaptureRoute,
  type SourceCapsule,
} from '../src/crdt/sourceCapture';
import { hex, utf8, type Bytes } from '../src/crdt/custodyCrypto';
import { sealNetworkEnvelope } from '../account-protocol/envelope';
import {
  emptySpoolWitness,
  reserveCounter,
  parseCounter,
  counterPayload,
  type ContentIdentity,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { Y } from '../src/crdt/yjs';
const route: CaptureRoute = {
  workspace: '01'.repeat(16),
  credential: '02'.repeat(16),
  principal: '03'.repeat(16),
  epoch: 1,
  generation: 1,
};
const kg = new Uint8Array(32).fill(9),
  pair = (await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify'])) as CryptoKeyPair;
const digest = async (b: Bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
async function fixture(history: { text: string; system: boolean; burns: number }[]) {
  const rows: OpenedRecord[] = [],
    original: Bytes[] = [],
    d = new Y.Doc({ gc: false });
  let local = 0,
    attempts = 0;
  const add = (e: SpoolEntry) =>
    rows.push({
      seq: ++local,
      gen: 1,
      kind: e.type === 'envelope' ? 'outbound' : 'heads',
      bytes: encodeSpoolEntry(e, route),
    });
  try {
    for (const [i, s] of history.entries()) {
      let update!: Bytes;
      const capture = (b: Uint8Array) => (update = new Uint8Array(b));
      d.on('update', capture);
      d.getText('oracle').insert(0, s.text);
      d.off('update', capture);
      original.push(update);
      const capsule: SourceCapsule = {
        ...route,
        v: 1,
        id: (i + 10).toString(16).padStart(32, '0'),
        sources: [
          {
            actor: s.system ? 'system' : route.principal,
            kind: s.system ? 'system' : 'human',
            bytes: update,
          },
        ],
      };
      const bytes = encodeSourceCapsule(capsule);
      rows.push({ seq: ++local, gen: 1, kind: 'outbound', bytes });
      add({
        type: 'position',
        position: i + 1,
        source: { id: capsule.id, index: 0, hash: await digest(bytes) },
      });
      for (let n = 0; n <= s.burns; n++)
        add({ type: 'attempt', position: i + 1, attempt: ++attempts });
      const wire = await sealNetworkEnvelope(
        { ...networkRoute(route), seq: i + 1 },
        {
          actor_id: capsule.sources[0]!.actor,
          actor_kind: capsule.sources[0]!.kind,
          updates: [update],
        },
        kg,
        pair.privateKey,
        crypto.getRandomValues(new Uint8Array(12)),
      );
      add({ type: 'envelope', position: i + 1, attempt: attempts, wire });
    }
  } finally {
    d.destroy();
  }
  return { rows, original, attempts };
}
describe('Account spool ledger conformance', () => {
  it('150 generated real-wire histories retain exact source coverage and reject removed grant events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            text: fc.constantFrom('a', 'é', '🙂', 'abc'),
            system: fc.boolean(),
            burns: fc.integer({ min: 0, max: 2 }),
          }),
          { minLength: 1, maxLength: 7 },
        ),
        async (history) => {
          const { rows, attempts } = await fixture(history),
            state = inspectSpool([...rows].reverse(), route);
          expect(state.attempts).toBe(attempts);
          expect(state.positions.map((p) => p.position)).toEqual(history.map((_, i) => i + 1));
          await verifySpool(state, route, kg, pair.publicKey, crypto.subtle);
          const reuse = { memo: createVerificationMemo(), current() {} };
          await verifySpool(state, route, kg, pair.publicKey, crypto.subtle, reuse);
          await verifySpool(state, route, kg, pair.publicKey, crypto.subtle, reuse);
          const changedSource = structuredClone(state);
          changedSource.sources.get(state.positions[0]!.source.id)![10]! ^= 1;
          await expect(
            verifySpool(changedSource, route, kg, pair.publicKey, crypto.subtle, reuse),
          ).rejects.toThrow();
          const changedWire = structuredClone(state);
          changedWire.positions[0]!.wire![10]! ^= 1;
          await expect(
            verifySpool(changedWire, route, kg, pair.publicKey, crypto.subtle, reuse),
          ).rejects.toThrow();
          let spool = emptySpoolWitness();
          for (const bytes of state.events)
            spool = await extendSpoolWitness(spool, bytes, crypto.subtle);
          const counter: ContentCounter = {
            v: 2,
            spool,
            store_id: '04'.repeat(16),
            intent: '05'.repeat(16),
            active_gen: 1,
            next_seq: rows.length + 1,
            reserved: { 1: rows.length },
            mac: new Uint8Array(32),
          };
          await verifySpoolWitness(state, counter, crypto.subtle);
          await verifySpoolWitness(state, counter, crypto.subtle, reuse);
          await verifySpoolWitness(state, counter, crypto.subtle, reuse);
          const changedEvent = structuredClone(state);
          changedEvent.events[0]![10]! ^= 1;
          await expect(
            verifySpoolWitness(changedEvent, counter, crypto.subtle, reuse),
          ).rejects.toThrow();
          reuse.memo.clear();
          // A legal prefix is no longer evidence that the last committed row never existed.
          const prefix = inspectSpool(rows.slice(0, -1), route);
          await expect(verifySpoolWitness(prefix, counter, crypto.subtle)).rejects.toThrow(
            /incomplete/,
          );
          const missing = inspectSpool(state.sourceRecords, route);
          await expect(verifySpoolWitness(missing, counter, crypto.subtle)).rejects.toThrow(
            /incomplete/,
          );
          await expect(
            verifySpoolWitness(
              state,
              { ...counter, spool: { ...spool, hash: 'f'.repeat(64) } },
              crypto.subtle,
            ),
          ).rejects.toThrow(/commitment/);
          expect(reserveCounter(counter, 2, 1).v).toBe(2);
          expect((reserveCounter(counter, 2, 1) as typeof counter).spool).toEqual(spool);
          const head = rows.filter((r) => r.kind === 'heads')[
            history.length % rows.filter((r) => r.kind === 'heads').length
          ]!;
          expect(() =>
            inspectSpool(
              rows.filter((r) => r !== head),
              route,
            ),
          ).toThrow();
          for (const p of state.positions)
            expect(p.attempts.length).toBe(history[p.position - 1]!.burns + 1);
        },
      ),
      { seed: 9512026, numRuns: 150 },
    );
  }, 30000);
  it('150 generated authority substitutions reject a well-framed entry in the wrong domain', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('workspace', 'credential', 'principal', 'epoch', 'generation'),
        fc.integer({ min: 1, max: 99 }),
        (key, n) => {
          const entry: SpoolEntry = { type: 'attempt', position: n, attempt: n },
            bytes = encodeSpoolEntry(entry, route);
          const wrong = {
            ...route,
            [key]: key === 'epoch' || key === 'generation' ? 2 : '04'.repeat(16),
          };
          expect(() => decodeSpoolEntry(bytes, wrong)).toThrow();
        },
      ),
      { seed: 9512027, numRuns: 150 },
    );
  }, 15000);
  it('rejects gaps, duplicate coverage, missing source indexes and envelope-before-attempt transitions', async () => {
    const { rows } = await fixture([{ text: 'first', system: false, burns: 0 }]);
    const grant = rows.find((r) => r.kind === 'heads')!,
      entry = decodeSpoolEntry(grant.bytes, route);
    if (entry.type !== 'position') throw Error('fixture');
    const modified = (e: SpoolEntry) =>
      rows.map((r) => (r === grant ? { ...r, bytes: encodeSpoolEntry(e, route) } : r));
    expect(() => inspectSpool(modified({ ...entry, position: 2 }), route)).toThrow(/Position/);
    expect(() =>
      inspectSpool(modified({ ...entry, source: { ...entry.source, index: 1 } }), route),
    ).toThrow(/index/);
    expect(() =>
      inspectSpool(
        [
          ...rows,
          {
            seq: 99,
            gen: 1,
            kind: 'heads',
            bytes: encodeSpoolEntry({ ...entry, position: 2 }, route),
          },
        ],
        route,
      ),
    ).toThrow(/repeated/);
    expect(() =>
      inspectSpool(
        rows.filter(
          (r) => r.kind !== 'heads' || decodeSpoolEntry(r.bytes, route).type !== 'attempt',
        ),
        route,
      ),
    ).toThrow(/invocation/);
  });
  it('verifies exact source hash, original actor/update, digest and prepared signature before exposure', async () => {
    const { rows } = await fixture([{ text: 'source', system: true, burns: 1 }]);
    const state = inspectSpool(rows, route);
    state.positions[0]!.source.hash = '00'.repeat(32);
    await expect(verifySpool(state, route, kg, pair.publicKey, crypto.subtle)).rejects.toThrow(
      /source changed/,
    );
    const valid = inspectSpool(rows, route),
      wrong = (await crypto.subtle.generateKey('Ed25519', false, [
        'sign',
        'verify',
      ])) as CryptoKeyPair;
    await expect(verifySpool(valid, route, kg, wrong.publicKey, crypto.subtle)).rejects.toThrow(
      /signature/,
    );
    const other = await sealNetworkEnvelope(
      { ...networkRoute(route), seq: 1 },
      { actor_id: route.principal, actor_kind: 'human', updates: [new Uint8Array([0, 0])] },
      kg,
      pair.privateKey,
      crypto.getRandomValues(new Uint8Array(12)),
    );
    valid.positions[0]!.wire = other;
    await expect(verifySpool(valid, route, kg, pair.publicKey, crypto.subtle)).rejects.toThrow(
      /source differs/,
    );
  });
  it('rejects unknown versions, noncanonical bytes, unsafe positions, exhausted budgets and wrong physical placement', () => {
    const bytes = encodeSpoolEntry({ type: 'attempt', position: 1, attempt: 1 }, route),
      text = new TextDecoder().decode(bytes);
    for (const value of [
      ' ' + text,
      text + ' ',
      text.replace('"done/account-spool/v1",1', '"done/account-spool/v1",2'),
    ])
      expect(() => decodeSpoolEntry(utf8(value), route)).toThrow();
    expect(() =>
      encodeSpoolEntry({ type: 'attempt', position: 1, attempt: NET_SEAL_LIMIT }, route),
    ).toThrow();
    expect(() =>
      encodeSpoolEntry(
        { type: 'attempt', position: Number.MAX_SAFE_INTEGER + 1, attempt: 1 },
        route,
      ),
    ).toThrow();
    expect(() => inspectSpool([{ seq: 1, gen: 1, kind: 'outbound', bytes }], route)).toThrow(
      /misplaced/,
    );
  });
});

it('counter v2 is closed and authenticated separately while v1 bytes stay unchanged', () => {
  const scope: ContentIdentity = {
    slotId: 'slot',
    principalId: route.principal,
    workspaceId: route.workspace,
    storeId: '04'.repeat(16),
    rootId: '06'.repeat(16),
  };
  const v1: ContentCounter = {
    v: 1,
    store_id: scope.storeId,
    intent: '05'.repeat(16),
    active_gen: 1,
    next_seq: 1,
    reserved: { 1: 0 },
    mac: new Uint8Array(32),
  };
  const v2: ContentCounter = { ...v1, v: 2, spool: emptySpoolWitness() };
  expect(parseCounter(v1, scope, v1.intent)).toEqual(v1);
  expect(parseCounter(v2, scope, v1.intent)).toEqual(v2);
  expect(JSON.parse(new TextDecoder().decode(counterPayload(scope, v1)))).toEqual([
    'done/content-counter/v1',
    scope.slotId,
    scope.principalId,
    scope.workspaceId,
    scope.storeId,
    scope.rootId,
    1,
    scope.storeId,
    v1.intent,
    1,
    1,
    [['1', 0]],
  ]);
  expect(hex(counterPayload(scope, v1))).not.toEqual(hex(counterPayload(scope, v2)));
  for (const bad of [
    { ...v1, spool: v2.spool },
    { ...v2, spool: undefined },
    { ...v2, spool: { events: -1, hash: v2.spool.hash } },
    { ...v2, spool: { events: 0, hash: 'f' } },
    { ...v2, spool: { ...v2.spool, extra: 1 } },
  ])
    expect(() => parseCounter(bad, scope, v1.intent)).toThrow();
});
