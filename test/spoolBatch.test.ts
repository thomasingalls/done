// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import { selectEnvelopeSources } from '../src/crdt/accountEnvelopePreparation';
import {
  encodeSpoolEntry,
  decodeSpoolEntry,
  inspectSpool,
  verifySpool,
  positionSources,
  networkRoute,
  MAX_POSITION_SOURCES,
  MAX_POSITION_BYTES,
  type SpoolEntry,
  type SourceRef,
} from '../src/crdt/spoolRecord';
import {
  encodeSourceCapsule,
  type SourceUpdate,
  type CaptureRoute,
} from '../src/crdt/sourceCapture';
import { hex } from '../src/crdt/custodyCrypto';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { sealNetworkEnvelope } from '../account-protocol/envelope';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
const route: CaptureRoute = {
  workspace: '01'.repeat(16),
  credential: '02'.repeat(16),
  principal: '03'.repeat(16),
  epoch: 1,
  generation: 1,
};
const kg = new Uint8Array(32).fill(9);
const pair = (await crypto.subtle.generateKey('Ed25519', false, [
  'sign',
  'verify',
])) as CryptoKeyPair;
async function sources(history: { system: boolean; length: number }[]) {
  const doc = new Y.Doc({ gc: false }),
    updates: SourceUpdate[] = [],
    rows: OpenedRecord[] = [],
    originals = new Map<string, SourceUpdate>();
  try {
    for (const [i, entry] of history.entries()) {
      let bytes!: Uint8Array<ArrayBuffer>;
      const capture = (b: Uint8Array) => {
        bytes = b.slice();
      };
      doc.on('update', capture);
      doc.getText('body').insert(0, String(i).padEnd(entry.length, 'x'));
      doc.off('update', capture);
      updates.push({
        actor: entry.system ? 'system' : route.principal,
        kind: entry.system ? 'system' : 'human',
        bytes,
      });
    }
    for (let i = 0; i < updates.length; i += 2) {
      const id = (i + 1).toString(16).padStart(32, '0'),
        group = updates.slice(i, i + 2);
      group.forEach((s, index) => originals.set(id + ':' + index, s));
      rows.push({
        kind: 'outbound',
        gen: 1,
        seq: rows.length + 1,
        bytes: encodeSourceCapsule({ ...route, v: 1, id, sources: group }),
      });
    }
    return { rows, originals };
  } finally {
    doc.destroy();
  }
}
const append = (rows: OpenedRecord[], entry: SpoolEntry) =>
  rows.push({
    kind: entry.type === 'envelope' ? 'outbound' : 'heads',
    gen: 1,
    seq: rows.length + 1,
    bytes: encodeSpoolEntry(entry, route),
  });
const allocation = (refs: SourceRef[], position: number): SpoolEntry =>
  refs.length === 1
    ? { type: 'position', position, source: refs[0]! }
    : { type: 'position-batch', position, sources: refs };
it('120 generated source/actor/burn histories batch exact originals in order and keep detached warm verification', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({ system: fc.boolean(), length: fc.integer({ min: 1, max: 100 }) }), {
        minLength: 2,
        maxLength: 40,
      }),
      fc.integer({ min: 0, max: 2 }),
      async (history, burns) => {
        const { rows, originals } = await sources(history),
          selected: string[] = [];
        let attempts = 0,
          position = 0;
        while (true) {
          const state = inspectSpool(rows, route),
            refs = await selectEnvelopeSources(state, route, true, crypto.subtle);
          if (!refs.length) break;
          expect(refs.length).toBeLessThanOrEqual(MAX_POSITION_SOURCES);
          const group = refs.map((s) => originals.get(s.id + ':' + s.index)!);
          expect(new Set(group.map((s) => s.kind)).size).toBe(1);
          expect(group.reduce((n, s) => n + s.bytes.length, 0)).toBeLessThanOrEqual(
            MAX_POSITION_BYTES,
          );
          const entry = allocation(refs, ++position),
            wire = encodeSpoolEntry(entry, route);
          const expected = [
            'done/account-spool/v1',
            1,
            route.workspace,
            route.credential,
            route.principal,
            1,
            1,
            entry.type,
            position,
            refs.length === 1
              ? [refs[0]!.id, refs[0]!.index, refs[0]!.hash]
              : refs.map((s) => [s.id, s.index, s.hash]),
          ];
          expect(new TextDecoder().decode(wire)).toBe(JSON.stringify(expected));
          expect(decodeSpoolEntry(wire, route)).toEqual(entry);
          append(rows, entry);
          for (let n = 0; n <= burns; n++)
            append(rows, { type: 'attempt', position, attempt: ++attempts });
          const envelope = await sealNetworkEnvelope(
            { ...networkRoute(route), seq: position },
            {
              actor_id: group[0]!.actor,
              actor_kind: group[0]!.kind,
              updates: group.map((s) => s.bytes),
            },
            kg,
            pair.privateKey,
            crypto.getRandomValues(new Uint8Array(12)),
          );
          append(rows, { type: 'envelope', position, attempt: attempts, wire: envelope });
          selected.push(...refs.map((s) => s.id + ':' + s.index));
        }
        expect(selected).toEqual([...originals.keys()]);
        const state = inspectSpool([...rows].reverse(), route),
          reuse = { memo: createVerificationMemo(), current() {} };
        expect(
          state.positions.flatMap((p) => positionSources(p).map((s) => s.id + ':' + s.index)),
        ).toEqual(selected);
        await verifySpool(state, route, kg, pair.publicKey, crypto.subtle, reuse);
        await verifySpool(state, route, kg, pair.publicKey, crypto.subtle, reuse);
        const batch = state.positions.find((p) => p.additional?.length);
        if (batch) {
          batch.additional![0]!.hash = 'ff'.repeat(32);
          await expect(
            verifySpool(state, route, kg, pair.publicKey, crypto.subtle, reuse),
          ).rejects.toThrow(/source changed/);
        }
        reuse.memo.clear();
      },
    ),
    { seed: 1209032, numRuns: 120 },
  );
}, 60_000);
it('batch count, bytes, actor boundary, duplicate, order and late-source controls refuse unsafe allocations', async () => {
  const { rows } = await sources(Array.from({ length: 40 }, () => ({ system: false, length: 1 })));
  const state = inspectSpool(rows, route),
    refs = await selectEnvelopeSources(state, route, true, crypto.subtle);
  expect(refs.length).toBe(32);
  expect((await selectEnvelopeSources(state, route, false, crypto.subtle)).length).toBe(1);
  expect(() =>
    encodeSpoolEntry({ type: 'position-batch', position: 1, sources: [refs[0]!] }, route),
  ).toThrow();
  expect(() =>
    encodeSpoolEntry({ type: 'position-batch', position: 1, sources: [...refs, refs[0]!] }, route),
  ).toThrow();
  for (const bad of [
    [refs[0]!, refs[0]!],
    [refs[1]!, refs[0]!],
  ]) {
    const copy = structuredClone(rows);
    append(copy, allocation(bad, 1));
    expect(() => inspectSpool(copy, route)).toThrow(/repeated|order/);
  }
  const late = structuredClone(rows);
  const last = late.pop()!;
  const hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', last.bytes)));
  append(
    late,
    allocation([refs[0]!, { id: (39).toString(16).padStart(32, '0'), index: 0, hash }], 1),
  );
  late.push({ ...last, seq: late.length + 1 });
  expect(() => inspectSpool(late, route)).toThrow(/late/);
  const big = await sources(Array.from({ length: 3 }, () => ({ system: false, length: 40000 })));
  const bigRefs = await selectEnvelopeSources(
    inspectSpool(big.rows, route),
    route,
    true,
    crypto.subtle,
  );
  expect(bigRefs.length).toBe(1);
  const all = [] as SourceRef[];
  for (const r of big.rows) {
    const c = JSON.parse(new TextDecoder().decode(r.bytes));
    const h = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', r.bytes)));
    for (let i = 0; i < c[8].length; i++) all.push({ id: c[2], index: i, hash: h });
  }
  append(big.rows, allocation(all.slice(0, 2), 1));
  expect(() => inspectSpool(big.rows, route)).toThrow(/too large/);
  const mixed = await sources([
    { system: false, length: 1 },
    { system: true, length: 1 },
  ]);
  const c = JSON.parse(new TextDecoder().decode(mixed.rows[0]!.bytes));
  const h = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', mixed.rows[0]!.bytes)));
  expect(
    (await selectEnvelopeSources(inspectSpool(mixed.rows, route), route, true, crypto.subtle))
      .length,
  ).toBe(1);
  append(
    mixed.rows,
    allocation(
      [0, 1].map((index) => ({ id: c[2], index, hash: h })),
      1,
    ),
  );
  expect(() => inspectSpool(mixed.rows, route)).toThrow(/actor/);
});

it('R-01 oversized sources cannot allocate a position or burn another attempt after restart', async () => {
  const { createEnvelopePreparation } = await import('../src/crdt/accountEnvelopePreparation');
  type Context = Parameters<typeof createEnvelopePreparation>[0];
  for (const resumed of [false, true]) {
    const { rows } = await sources([{ system: false, length: 600 * 1024 }]);
    if (resumed) {
      const refs = await selectEnvelopeSources(
        inspectSpool(rows, route),
        route,
        true,
        crypto.subtle,
      );
      append(rows, allocation(refs, 1));
      append(rows, { type: 'attempt', position: 1, attempt: 1 });
    }
    const before = rows.map((r) => hex(r.bytes));
    let writes = 0,
      keyReads = 0;
    const owner = {
      carrier: {
        load: async () => rows.map((r) => ({ ...r, bytes: r.bytes.slice() })),
        spoolWitness: async () => {
          writes++;
          throw Error('Allocation began');
        },
        appendSpool: async () => {
          writes++;
          throw Error('Allocation began');
        },
      },
    };
    const task = { step: <T>(f: () => T) => f(), wait: <T>(f: () => Promise<T>) => f() };
    const context: Context = {
      batchSources: true,
      whenDurable: async () => {},
      checkPublication: async () => {},
      inspect: inspectSpool,
      key: () => {
        keyReads++;
        return kg;
      },
      signer: () => pair.privateKey,
      run: (fn) =>
        fn(task as Parameters<typeof fn>[0], owner as unknown as Parameters<typeof fn>[1], route),
    };
    for (let retry = 0; retry < 2; retry++)
      await expect(createEnvelopePreparation(context).prepareNextEnvelope()).rejects.toMatchObject({
        reason: 'envelope-size',
      });
    expect(writes).toBe(0);
    expect(keyReads).toBe(0);
    expect(rows.map((r) => hex(r.bytes))).toEqual(before);
  }
}, 20000);
