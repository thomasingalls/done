// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createWarmAuditStart } from '../src/crdt/warmAuditStart';
import { createWarmAuditScheduler } from '../src/crdt/warmAuditScheduler';
import * as inbound from '../src/crdt/inboundLedger';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import { fullHistoryPageFixture } from './inbound-page/full-history-fixtures';
import { appendPageFixture } from './inbound-page/append-fixtures';
import { createBaselineReuse } from '../src/crdt/localBaselineReuse';
import { prepareLocalBaseline } from '../src/crdt/localBaselineReplay';
import { verifyCompleteLocalBaseline } from '../src/crdt/localBaselineShadow';
import { emptySpoolWitness, type OpenedRecord } from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { SessionTask } from '../src/crdt/writeSession';
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0).reverse()) f();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const delay = (p: ReturnType<typeof createWarmAuditStart>, rows: number, positions: number) =>
  Reflect.apply(p.delay, p, [rows, positions]) as number | undefined;
const positions = (c: ReturnType<typeof inbound.inspectInbound>, after = 0) =>
  Reflect.get(inbound, 'inboundPositionsAfter')(c, after) as number;
it('a thousand twenty-four logical positions force an attempt independently of physical rows and fresh input', () => {
  let now = 5000;
  const p = createWarmAuditStart(() => now);
  p.input();
  const release = p.foreground();
  expect(delay(p, 0, 1023)).toBeUndefined();
  expect(delay(p, 0, 1024)).toBe(0);
  release();
  expect(delay(p, 0, 1023)).toBe(1000);
  now += 1000;
  expect(delay(p, 0, 1023)).toBe(0);
  p.close();
});
it('the existing physical ceiling and ordinary quiet rules remain independent', () => {
  const p = createWarmAuditStart(() => 5000);
  p.input();
  expect(delay(p, 1024, 0)).toBe(0);
  expect(delay(p, 1023, 0)).toBe(1000);
  expect(delay(p, 0, 1024)).toBe(0);
  expect(delay(p, 0, 0)).toBe(1000);
  p.close();
});
it('invalid logical pressure cannot force an audit or bypass a closed lifetime', () => {
  const p = createWarmAuditStart(() => 5000);
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => delay(p, 0, value)).toThrow('logical');
  p.close();
  expect(delay(p, 1024, 1024)).toBeUndefined();
});
it('clock rollback does not erase quiet input when logical pressure falls below its ceiling', () => {
  let now = 5000;
  const p = createWarmAuditStart(() => now);
  p.input();
  now = 4000;
  expect(delay(p, 0, 1024)).toBe(0);
  expect(delay(p, 0, 1023)).toBe(1000);
  now = 4999;
  expect(delay(p, 0, 0)).toBe(1);
  p.close();
});
it('the scheduler observes logical pressure and closing clears its forced timer', async () => {
  vi.useFakeTimers();
  let work = 1024,
    attempts = 0;
  const c = new AbortController(),
    owner = Reflect.apply(createWarmAuditScheduler, undefined, [
      {
        signal: c.signal,
        due: () => false,
        delay: () => 300000,
        pendingRows: () => 0,
        pendingPositions: () => work,
        async run(mayStart: () => boolean) {
          expect(mayStart()).toBe(true);
          attempts++;
          work = 0;
          return true;
        },
      },
    ]) as ReturnType<typeof createWarmAuditScheduler>;
  cleanup.push(owner.close);
  owner.input();
  await vi.advanceTimersByTimeAsync(0);
  expect(attempts).toBe(1);
  owner.close();
  work = 1024;
  owner.refresh();
  await vi.advanceTimersByTimeAsync(300001);
  expect(attempts).toBe(1);
});
it('a forced attempt does not turn an interruption into completion', async () => {
  vi.useFakeTimers();
  let work = 1024,
    attempts = 0;
  const owner = Reflect.apply(createWarmAuditScheduler, undefined, [
    {
      signal: new AbortController().signal,
      due: () => false,
      delay: () => 300000,
      pendingRows: () => 0,
      pendingPositions: () => work,
      async run() {
        attempts++;
        work = 0;
        throw new MaintenanceInterrupted();
      },
    },
  ]) as ReturnType<typeof createWarmAuditScheduler>;
  cleanup.push(owner.close);
  await vi.advanceTimersByTimeAsync(0);
  expect(attempts).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(attempts).toBe(1);
  owner.close();
});
it('logical census units include every received position after a physical cutoff', async () => {
  const f = await fullHistoryPageFixture(Array(8).fill(9));
  cleanup.push(f.cleanup);
  const census = inbound.inspectInbound(f.records, f.context.route, f.context.inbound);
  expect(census.entries).toHaveLength(2);
  expect(positions(census)).toBe(8);
  expect(positions(census, census.entries[0]!.record.seq)).toBe(4);
  expect(positions(census, census.entries[1]!.record.seq)).toBe(0);
  for (const n of [-1, NaN, 1.5]) expect(() => positions(census, n)).toThrow();
});
it('two genuinely certified publishers count logical suffixes separately from their physical pages', async () => {
  const f = await appendPageFixture();
  cleanup.push(f.cleanup);
  let rows = f.add(f.rows, f.f.candidate.raw);
  rows = f.add(rows, f.f.producer.raw);
  rows = f.add(rows, f.f.candidate.legacy);
  rows = f.add(rows, f.f.producer.legacy);
  const census = inbound.inspectInbound(rows, f.route, f.base);
  expect(census.entries).toHaveLength(4);
  expect(f.f.candidate.raw[230]).toBe(8);
  expect(f.f.producer.raw[230]).toBe(7);
  expect(positions(census)).toBe(17);
});
it('reduced reuse counts fresh verified positions, excluding its cold seed and exact unchanged reads', async () => {
  const f = await fullHistoryPageFixture(Array(8).fill(9));
  cleanup.push(f.cleanup);
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (f) => f(),
    wait: async (f) => f(),
  };
  const counter = await f.counter();
  if (counter.v !== 2) throw Error('counter');
  const tail = f.records.at(-1)!,
    prefix = f.records.slice(0, -1);
  let witness = emptySpoolWitness();
  for (const r of prefix)
    if (
      r.kind === 'heads' ||
      (r.kind === 'outbound' &&
        !Buffer.from(r.bytes).toString().startsWith('["done/source-capture/v1"'))
    )
      witness = await extendSpoolWitness(witness, r.bytes, crypto.subtle);
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]),
    auth = {
      sign: async (p: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
      verify: (p: Bytes, m: Bytes) => crypto.subtle.verify('HMAC', key, m, p),
    };
  const saved = await prepareLocalBaseline(
      {
        records: prefix,
        counter: { ...counter, next_seq: tail.seq, reserved: { 1: tail.seq - 1 }, spool: witness },
      },
      f.context,
      auth,
      null,
      { current: '12'.repeat(32), previous: null, revision: 1 },
    ),
    initial = await verifyCompleteLocalBaseline(
      { records: [tail], counter },
      f.context,
      auth,
      saved,
      true,
      true,
    );
  if (!initial) throw Error('baseline');
  cleanup.push(() => eraseVerified([saved, initial]));
  const id = {},
    reuse = await createBaselineReuse(task, initial, f.context, counter, id);
  cleanup.push(reuse.clear);
  const pending = () => Reflect.get(reuse, 'pendingPositions')() as number;
  expect(pending()).toBe(0);
  const next = await f.f.appendPeer(),
    last = tail.seq,
    physical: OpenedRecord[] = [
      tail,
      { seq: last + 1, gen: 1, kind: 'update', bytes: next.update },
      { seq: last + 2, gen: 1, kind: 'heads', bytes: next.record },
    ],
    after = {
      ...counter,
      spool: await extendSpoolWitness(counter.spool, next.record, crypto.subtle),
    },
    newId = {};
  const view = await reuse.advance(task, physical, f.context, after, newId);
  expect(view).toBeDefined();
  cleanup.push(() => eraseVerified(view));
  expect(pending()).toBe(1);
  expect(await reuse.advance(task, physical, f.context, after, newId)).toBeUndefined();
  expect(pending()).toBe(1);
  reuse.clear();
  expect(pending()).toBe(0);
});
