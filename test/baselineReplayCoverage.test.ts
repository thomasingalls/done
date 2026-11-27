// @vitest-environment node
// Phase 545: a baseline replay checks every capsule, receipt, carried source and installed history
// against one coverage view instead of rebuilding the document per check. The per-call reference
// (verifyInboundCoverage, as before) stays available here and must give identical outcomes.
import { expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createHash } from 'node:crypto';
// Import the replay first: inboundLedger reaches it again through an import cycle, and a replay
// first loaded inside the mock factory below would bind the unmocked module.
import {
  prepareLocalBaseline,
  replayLocalBaseline,
  type BaselineAuthentication,
  type LocalBaselineContext,
} from '../src/crdt/localBaselineReplay';
import {
  createPassCoverage,
  inspectInbound,
  verifyInboundCoverage,
} from '../src/crdt/inboundLedger';
import {
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  encodeLocalBaseline,
} from '../src/crdt/localBaselineRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { makeSourceCapsule } from '../src/crdt/sourceCapture';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { Y } from '../src/crdt/yjs';
import type { Bytes } from '../src/crdt/custodyCrypto';
// @ts-expect-error Existing independent Node fixtures are JavaScript.
import { memberFixture } from './local-baseline/fixtures.mjs';

const mode = vi.hoisted(() => ({ reference: false, checks: 0 }));
vi.mock('../src/crdt/inboundLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/inboundLedger')>();
  return {
    ...actual,
    // Reference: the replay before this phase, one fresh view per check over the same rows.
    createPassCoverage: (records: readonly OpenedRecord[]) =>
      mode.reference
        ? {
            check(updates: readonly Bytes[]) {
              mode.checks++;
              actual.verifyInboundCoverage(records, updates);
            },
            clear() {},
          }
        : actual.createPassCoverage(records),
  };
});

const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
  'sign',
  'verify',
]);
const auth: BaselineAuthentication = {
  sign: async (p) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
  verify: (p, mac) => crypto.subtle.verify('HMAC', key, mac, p),
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const isCapsule = (r: OpenedRecord) =>
  r.kind === 'outbound' &&
  new TextDecoder().decode(r.bytes).startsWith('["done/source-capture/v1"');
const isContent = (r: OpenedRecord) => r.kind === 'update' || r.kind === 'state';

async function counterFor(records: readonly OpenedRecord[], c: LocalBaselineContext) {
  const census = inspectInbound(records, c.route, c.inbound);
  let spool = emptySpoolWitness();
  for (const e of census.delivery.spool.events)
    spool = await extendSpoolWitness(spool, e, crypto.subtle);
  const next = (records.at(-1)?.seq ?? 0) + 1;
  const counter: ContentCounter = {
    v: 2,
    spool,
    store_id: c.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    mac: new Uint8Array(32),
  };
  return counter;
}
// Canonical, order-independent form of a replay result for exact comparison.
const canon = (v: unknown): unknown => {
  if (v instanceof Uint8Array) return 'hex:' + Buffer.from(v).toString('hex');
  if (v instanceof Map)
    return [
      'map',
      [...v]
        .map(([k, x]) => [canon(k), canon(x)])
        .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
    ];
  if (v instanceof Set) return ['set', [...v].map(canon).sort()];
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'function') return 'function';
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
    );
  return v;
};
const outcome = (e: unknown) => {
  const x = e as {
    constructor?: { name?: string };
    message?: string;
    code?: string;
    reason?: string;
  };
  return { name: x?.constructor?.name, message: x?.message, code: x?.code, reason: x?.reason };
};
const COVERAGE = 'Inbound content coverage is missing';

type Op = 'own' | 'pending' | 'peer' | 'history';
async function scenario(before: readonly Op[], after: readonly Op[]) {
  const f = await memberFixture();
  const c: LocalBaselineContext = f.ctx;
  // Content rows nothing later depends on: removing one from a snapshot leaves no pending struct.
  const independent: number[] = [];
  const apply = async (op: Op) => {
    const start = f.rows.length;
    if (op === 'own') await f.appendOwn();
    else if (op === 'peer') await f.appendPeer();
    else if (op === 'history') await f.appendHistory();
    else {
      const doc = new Y.Doc({ gc: false });
      doc.getText('pending').insert(0, 'an unallocated original ' + f.rows.length);
      const update = new Uint8Array(Y.encodeStateAsUpdate(doc));
      doc.destroy();
      const capsule = makeSourceCapsule(c.route, [
        { actor: c.route.principal, kind: 'human', bytes: update },
      ]);
      f.rows.push({ seq: f.rows.length + 1, gen: 1, kind: 'update', bytes: update });
      f.rows.push({ seq: f.rows.length + 1, gen: 1, kind: 'outbound', bytes: capsule });
    }
    if (op !== 'peer')
      for (const r of (f.rows as OpenedRecord[]).slice(start))
        if (isContent(r)) independent.push(r.seq);
  };
  await apply('own');
  await apply('peer');
  for (const op of before) await apply(op);
  const cut = f.rows.length;
  for (const op of after) await apply(op);
  const rows = f.rows as OpenedRecord[];
  return { f, c, rows, cut, independent };
}
async function compareModes(
  baseline: { payload: Bytes; mac: Bytes },
  anchor: { revision: number; hash: string },
  suffix: { records: OpenedRecord[]; counter: ContentCounter },
  c: LocalBaselineContext,
) {
  const run = async (reference: boolean) => {
    mode.reference = reference;
    mode.checks = 0;
    try {
      const r = await replayLocalBaseline(
        structuredClone(baseline),
        { ...anchor },
        structuredClone(suffix),
        c,
        auth,
      );
      return { ok: canon(r), checks: mode.checks };
    } catch (e) {
      return { error: outcome(e), checks: mode.checks };
    } finally {
      mode.reference = false;
    }
  };
  const reference = await run(true),
    shared = await run(false);
  expect({ ...shared, checks: undefined }).toEqual({ ...reference, checks: undefined });
  return reference;
}
async function resign(payload: Bytes, change: (b: ReturnType<typeof decodeLocalBaseline>) => void) {
  const b = decodeLocalBaseline(payload);
  change(b);
  const next = encodeLocalBaseline(b);
  const mac = await auth.sign(baselineAuthenticationPayload(next));
  return { baseline: { payload: next, mac }, anchor: { revision: b.revision, hash: sha(next) } };
}
const snapshotWithout = (rows: readonly OpenedRecord[], seq: number) => {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const r of rows) if (isContent(r) && r.seq !== seq) Y.applyUpdate(doc, r.bytes);
    return new Uint8Array(Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
};

it('one coverage view per check sequence gives each per-call verdict, through refusal, reuse and erasure', () => {
  let accepted = 0,
    refused = 0,
    malformedRows = 0;
  fc.assert(
    fc.property(
      fc.array(fc.record({ op: fc.nat(4), author: fc.boolean() }), { minLength: 2, maxLength: 16 }),
      fc.array(fc.nat(4), { minLength: 2, maxLength: 16 }),
      fc.array(fc.record({ pick: fc.nat(), tamper: fc.nat(9), size: fc.nat(3) }), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.nat(5),
      (edits, delivered, calls, damage) => {
        const damageRow = damage === 0;
        const a = new Y.Doc({ gc: false }),
          b = new Y.Doc({ gc: false });
        a.clientID = 701;
        b.clientID = 702;
        const updates: Uint8Array<ArrayBuffer>[] = [];
        for (const doc of [a, b])
          doc.on('update', (u: Uint8Array) => updates.push(new Uint8Array(u)));
        try {
          for (const [i, e] of edits.entries()) {
            const doc = e.author ? a : b,
              text = doc.getText('t');
            if (e.op === 0 && text.length) text.delete(0, 1);
            else if (e.op === 1) doc.getMap('m').set('k' + (i % 3), [i, 'x'.repeat(i)]);
            else if (e.op === 2) Y.applyUpdate(doc, Y.encodeStateAsUpdate(e.author ? b : a));
            else text.insert(text.length, 'w' + i);
          }
          // The captured rows: a delivered subset, possibly with a damaged row.
          const records: OpenedRecord[] = updates
            .filter((_, i) => delivered[i % delivered.length]! > 0)
            .map((bytes, i) => ({ seq: i + 1, gen: 1, kind: 'update', bytes: bytes.slice() }));
          if (damageRow && records.length) {
            records[0]!.bytes = records[0]!.bytes.slice(0, 1);
            malformedRows++;
          }
          const original = structuredClone(records);
          const pass = createPassCoverage(records);
          try {
            for (const call of calls) {
              // Each call receives fresh buffers that the caller erases afterwards.
              const batch = Array.from({ length: call.size + 1 }, (_, j) => {
                const u = updates.length
                  ? updates[(call.pick + j) % updates.length]!.slice()
                  : new Uint8Array([0, 0]);
                if (call.tamper === 1 && u.length > 2) u[u.length - 2] = u[u.length - 2]! ^ 1;
                if (call.tamper === 2) return new Uint8Array([255]);
                if (call.tamper === 3)
                  return new Uint8Array(Y.mergeUpdates(updates.length ? updates : [u]));
                return u;
              });
              const copy = batch.map((u) => u.slice());
              let expected: unknown, actual: unknown;
              try {
                verifyInboundCoverage(records, copy);
                expected = 'covered';
              } catch (e) {
                expected = outcome(e);
              }
              try {
                pass.check(batch);
                actual = 'covered';
              } catch (e) {
                actual = outcome(e);
              }
              expect(actual).toEqual(expected);
              for (const u of [...batch, ...copy]) u.fill(0);
              if (expected !== 'covered') {
                refused++;
                // The pass stops at its first refusal, like the replay that owns it.
                expect(() => pass.check([updates[0] ?? new Uint8Array([0, 0])])).toThrow(
                  'Coverage view was invalidated',
                );
                break;
              }
              accepted++;
            }
          } finally {
            pass.clear();
          }
          // Neither path changes the caller's rows.
          expect(records).toEqual(original);
        } finally {
          a.destroy();
          b.destroy();
        }
      },
    ),
    { seed: 545011, numRuns: 150 },
  );
  expect(accepted).toBeGreaterThan(150);
  expect(refused).toBeGreaterThan(40);
  expect(malformedRows).toBeGreaterThan(10);
});

it('generated baseline replays give identical results and refusals with one view and with per-call rebuilds', async () => {
  const seen = {
    ok: 0,
    coverage: 0,
    other: 0,
    carried: 0,
    history: 0,
    suffixCapsules: 0,
    skipped: 0,
    checks: 0,
  };
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom<Op>('own', 'pending', 'peer', 'history'), { maxLength: 4 }),
      fc.array(fc.constantFrom<Op>('own', 'pending', 'peer'), { maxLength: 4 }),
      fc.nat(6),
      fc.nat(),
      async (before, after, tamper, pick) => {
        const { f, c, rows, cut, independent } = await scenario(before, after);
        try {
          let prepared;
          try {
            prepared = await prepareLocalBaseline(
              { records: rows.slice(0, cut), counter: await counterFor(rows.slice(0, cut), c) },
              c,
              auth,
            );
          } catch {
            seen.skipped++;
            return;
          }
          const counter = await counterFor(rows, c);
          let suffix = rows.slice(cut).map((r) => ({ ...r, bytes: r.bytes.slice() }));
          let { baseline, anchor } = prepared;
          const content = suffix.filter(isContent),
            capsules = suffix.filter(isCapsule),
            last = () => Math.max(...rows.map((r) => r.seq), ...suffix.map((r) => r.seq));
          // 1 drop a content row; 2 alter one; 3 duplicate a capsule; 4 reorder a capsule;
          // 5 re-signed snapshot missing one independent original; 6 duplicate an update row.
          if (tamper === 1 && content.length) {
            const victim = content[pick % content.length]!;
            suffix = suffix.filter((r) => r !== victim);
          } else if (tamper === 2 && content.length) {
            const victim = content[pick % content.length]!,
              at = pick % victim.bytes.length;
            victim.bytes[at] = victim.bytes[at]! ^ 1;
          } else if (tamper === 3 && capsules.length) {
            suffix.push({ ...capsules[pick % capsules.length]!, seq: last() + 1 });
          } else if (tamper === 4 && capsules.length) {
            const victim = capsules[pick % capsules.length]!,
              i = suffix.indexOf(victim),
              other = suffix[i + 1] ?? suffix[i - 1];
            if (other && other !== victim) [victim.seq, other.seq] = [other.seq, victim.seq];
          } else if (tamper === 5) {
            const prefixIndependent = independent.filter((s) => s <= cut);
            const seq = prefixIndependent[pick % prefixIndependent.length]!;
            ({ baseline, anchor } = await resign(baseline.payload, (b) => {
              b.snapshot = snapshotWithout(rows.slice(0, cut), seq);
            }));
          } else if (tamper === 6 && content.length) {
            suffix.push({ ...content[pick % content.length]!, seq: last() + 1 });
          }
          const top = Math.max(cut, ...suffix.map((r) => r.seq));
          const result = await compareModes(
            baseline,
            anchor,
            {
              records: suffix,
              counter: { ...counter, next_seq: top + 1, reserved: { 1: top } },
            },
            c,
          );
          seen.checks += result.checks;
          const b = decodeLocalBaseline(prepared.baseline.payload);
          if (b.sources.length) seen.carried++;
          if (b.history) seen.history++;
          if (capsules.length) seen.suffixCapsules++;
          if ('ok' in result) seen.ok++;
          else if (result.error.message === COVERAGE) seen.coverage++;
          else seen.other++;
        } finally {
          f.clear();
        }
      },
    ),
    { seed: 545012, numRuns: 60 },
  );
  // The reference really ran per-call checks (the mock is bound), and every kind of input occurred.
  expect(seen.checks).toBeGreaterThan(150);
  expect(seen.ok).toBeGreaterThan(15);
  expect(seen.coverage).toBeGreaterThan(8);
  expect(seen.carried).toBeGreaterThan(15);
  expect(seen.history).toBeGreaterThan(15);
  expect(seen.suffixCapsules).toBeGreaterThan(20);
  expect(seen.skipped).toBe(0);
}, 240000);

it('a carried source, an installed history and a receipt each refuse identically at their own check', async () => {
  // Carried sources are checked first, then the installed history, then stream receipts.
  // The latest own update before the cut is proved by a receipt check, after both of those.
  const cases: { before: Op[]; remove: 'pending' | 'history' | 'own'; first?: number }[] = [
    { before: ['pending'], remove: 'pending', first: 1 },
    { before: ['history'], remove: 'history', first: 1 },
    { before: ['pending', 'history'], remove: 'history', first: 2 },
    { before: ['own'], remove: 'own' },
  ];
  for (const t of cases) {
    const { f, c, rows, cut } = await scenario(t.before, ['own', 'pending']);
    try {
      const prepared = await prepareLocalBaseline(
        { records: rows.slice(0, cut), counter: await counterFor(rows.slice(0, cut), c) },
        c,
        auth,
      );
      const b = decodeLocalBaseline(prepared.baseline.payload);
      const target =
        t.remove === 'history'
          ? rows.find((r) => r.kind === 'state' && r.seq <= cut)!
          : t.remove === 'pending'
            ? rows.find((r) => r.seq === b.sources[0]!.record.seq - 1)!
            : rows.filter((r) => r.kind === 'update' && r.seq <= cut).at(-1)!;
      const { baseline, anchor } = await resign(prepared.baseline.payload, (x) => {
        x.snapshot = snapshotWithout(rows.slice(0, cut), target.seq);
      });
      const suffix = { records: rows.slice(cut), counter: await counterFor(rows, c) };
      const intact = await compareModes(prepared.baseline, prepared.anchor, suffix, c);
      expect('ok' in intact).toBe(true);
      const result = await compareModes(baseline, anchor, suffix, c);
      expect('error' in result && result.error.message).toBe(COVERAGE);
      if (t.first !== undefined) expect(result.checks).toBe(t.first);
    } finally {
      f.clear();
    }
  }
}, 120000);
