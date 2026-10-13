// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createBaselineReuse } from '../src/crdt/localBaselineReuse';
import { prepareLocalBaseline, type LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import { verifyCompleteLocalBaseline } from '../src/crdt/localBaselineShadow';
import { inspectInbound } from '../src/crdt/inboundLedger';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { sameAccountLedger } from '../src/crdt/incrementalAccountLedger';
import type { SessionTask } from '../src/crdt/writeSession';
import { makeSourceCapsule } from '../src/crdt/sourceCapture';
import { Y } from '../src/crdt/yjs';
import { WARM_AUDIT_MS, WARM_AUDIT_ROWS } from '../src/crdt/warmContent';
// @ts-expect-error Shared real-crypto Node protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
async function fixture() {
  const f = await memberFixture();
  clean.push(f.clear);
  await f.appendOwn();
  await f.appendPeer();
  const c: LocalBaselineContext = f.ctx,
    rows: OpenedRecord[] = f.rows;
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const auth = {
    sign: async (b: Uint8Array<ArrayBuffer>) =>
      new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (b: Uint8Array<ArrayBuffer>, mac: Uint8Array<ArrayBuffer>) =>
      crypto.subtle.verify('HMAC', key, mac, b),
  };
  const input = async () => {
    const census = inspectInbound(rows, c.route, c.inbound);
    let spool = emptySpoolWitness();
    for (const e of census.delivery.spool.events)
      spool = await extendSpoolWitness(spool, e, crypto.subtle);
    const next = rows.at(-1)!.seq + 1;
    const counter: ContentCounter = {
      v: 2,
      store_id: c.identity.storeId,
      intent: '04'.repeat(16),
      active_gen: 1,
      next_seq: next,
      reserved: { 1: next - 1 },
      spool,
      mac: new Uint8Array(32),
    };
    return { records: rows, counter };
  };
  const first = await input(),
    cut = first.counter.next_seq;
  const held = await prepareLocalBaseline(first, c, auth, null, {
    current: '12'.repeat(32),
    previous: null,
    revision: 1,
  });
  const suffix = async () => ({ ...(await input()), records: rows.filter((r) => r.seq >= cut) });
  const replay = async () =>
    (await verifyCompleteLocalBaseline(await suffix(), c, auth, held, true, true))!;
  const initial = await replay(),
    id = {},
    reuse = await createBaselineReuse(task, initial, c, first.counter, id);
  clean.push(reuse.clear);
  return { f, c, rows, input, suffix, replay, initial, id, reuse };
}
it('unchanged baseline and allocation-only reservations reuse the verified origin', async () => {
  const x = await fixture(),
    a = await x.suffix();
  const verify = vi.spyOn(crypto.subtle, 'verify');
  a.counter.next_seq += 3;
  a.counter.reserved['1']! += 3;
  expect(await x.reuse.advance(task, a.records, x.c, a.counter, x.id)).toBeUndefined();
  expect(x.reuse.hasIdentity(x.id)).toBe(true);
  expect(verify).not.toHaveBeenCalled();
  if (a.counter.v !== 2) throw Error('counter');
  a.counter.spool.hash = 'ab'.repeat(32);
  await expect(x.reuse.advance(task, a.records, x.c, a.counter, x.id)).rejects.toThrow('witness');
});
it('generated own/peer append histories match independent full baseline replay at each step', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }), async (actions) => {
      const x = await fixture();
      for (const own of actions) {
        await (own ? x.f.appendOwn() : x.f.appendPeer());
        const a = await x.suffix(),
          next = await x.reuse.advance(task, a.records, x.c, a.counter, {});
        expect(next).toBeDefined();
        const reference = await x.replay();
        expect(sameAccountLedger(next!.ledger, reference.ledger)).toBe(true);
        expect(next!.records).toEqual(reference.records);
        x.reuse.compare(reference);
        // Projections are detached, including logical prefix and retained proof bytes.
        next!.records.forEach((r) => r.bytes.fill(0));
        next!.ledger.delivery.responses.clear();
        x.reuse.compare(reference);
      }
      x.reuse.clear();
      x.f.clear();
    }),
    { seed: 131026, numRuns: 8 },
  );
});
it('unallocated capsule coverage is checked before the view is installed', async () => {
  const x = await fixture(),
    d = new Y.Doc({ gc: false });
  d.getText('missing').insert(0, 'never durable');
  const bytes = makeSourceCapsule(x.c.route, [
    { actor: x.c.route.principal, kind: 'human', bytes: new Uint8Array(Y.encodeStateAsUpdate(d)) },
  ]);
  d.destroy();
  x.rows.push({ seq: x.rows.at(-1)!.seq + 1, gen: 1, kind: 'outbound', bytes });
  const a = await x.suffix();
  await expect(x.reuse.advance(task, a.records, x.c, a.counter, {})).rejects.toThrow();
  expect(x.reuse.matches(x.c)).toBe(false);
});
it('old-row replacement and checkpoint installation require full replay', async () => {
  const x = await fixture();
  await x.f.appendPeer();
  let a = await x.suffix();
  await x.reuse.advance(task, a.records, x.c, a.counter, {});
  a = structuredClone(a);
  a.records[0]!.bytes[0]! ^= 1;
  expect(await x.reuse.advance(task, a.records, x.c, a.counter, {})).toBeUndefined();
  expect(x.reuse.matches(x.c)).toBe(false);
  const y = await fixture();
  await y.f.appendHistory();
  a = await y.suffix();
  expect(await y.reuse.advance(task, a.records, y.c, a.counter, {})).toBeUndefined();
  expect(y.reuse.matches(y.c)).toBe(false);
});
it('the reference comparison refuses changed retained delivery obligations even with identical rows', async () => {
  const x = await fixture();
  await x.f.appendOwn();
  const a = await x.suffix();
  await x.reuse.advance(task, a.records, x.c, a.counter, {});
  const oracle = await x.replay();
  oracle.ledger.delivery.acceptedThrough--;
  expect(() => x.reuse.compare(oracle)).toThrow('reference mismatch');
});
it('authority replacement, scope changes and closure cannot reuse the old origin', async () => {
  const x = await fixture();
  expect(x.reuse.matches({ ...x.c, inbound: { ...x.c.inbound } })).toBe(false);
  expect(x.reuse.matches({ ...x.c, route: { ...x.c.route, epoch: x.c.route.epoch + 1 } })).toBe(
    false,
  );
  expect(x.reuse.matches({ ...x.c, identity: { ...x.c.identity, slotId: 'other' } })).toBe(false);
  x.reuse.clear();
  expect(x.reuse.matches(x.c)).toBe(false);
});
it('late crypto completion cannot reinstall a cleared view', async () => {
  const x = await fixture();
  await x.f.appendOwn();
  const a = await x.suffix();
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((r) => {
      started = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const original = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementationOnce(async (...args) => {
    started();
    await gate;
    return original(...args);
  });
  const pending = x.reuse.advance(task, a.records, x.c, a.counter, {});
  const refused = expect(pending).rejects.toThrow();
  await ready;
  x.reuse.clear();
  release();
  await refused;
  expect(x.reuse.matches(x.c)).toBe(false);
});
it('the reference audit becomes due by elapsed time independently of rolling disk audits', async () => {
  const x = await fixture();
  expect(x.reuse.due()).toBe(false);
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + WARM_AUDIT_MS + 1);
  expect(x.reuse.due()).toBe(true);
  expect(x.reuse.delay()).toBe(0);
});
it('the reference audit becomes due after 256 appended rows without waiting for idleness', async () => {
  const x = await fixture();
  for (let n = 0; n < WARM_AUDIT_ROWS; n++)
    x.rows.push({
      seq: x.rows.at(-1)!.seq + 1,
      gen: 1,
      kind: 'update',
      bytes: new Uint8Array([0, 0]),
    });
  const a = await x.suffix();
  expect(await x.reuse.advance(task, a.records, x.c, a.counter, {})).toBeDefined();
  expect(x.reuse.due()).toBe(true);
  expect(x.reuse.delay()).toBe(0);
});
