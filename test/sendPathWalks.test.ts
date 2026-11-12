// @vitest-environment node
/** Phase 554, F1 and F1b. A send-only ledger continuation walks no whole retained graph; a receipt
 * turn that captured anything still checks for escaped parsers and erases what it does not keep.
 * Walks are observed by a tripwire getter on one retained object that only a whole-graph traversal
 * enumerates, so these cases do not depend on the profiling counters. */
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/crdt/verificationOwnership', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/verificationOwnership')>();
  return { ...actual, eraseUnretained: vi.fn(actual.eraseUnretained) };
});
import { readFileSync } from 'node:fs';
import { sendHistory } from './sendPathFixture';
import { appendPageFixture } from './inbound-page/append-fixtures';
import { createInboundReceiptTurn, type InboundReceiptTurn } from '../src/crdt/accountInbound';
import {
  accountLedgerIndexUsage,
  extendAccountLedger,
  indexVerifiedLedger,
  sameAccountLedger,
  type AccountLedgerView,
} from '../src/crdt/incrementalAccountLedger';
import { verifyInboundLedger, createInboundCoverage } from '../src/crdt/inboundLedger';
import { ownedByteCapacity, eraseUnretained } from '../src/crdt/verificationOwnership';
import type { OpenedRecord } from '../src/crdt/contentRecord';

const POSITIONS = 1024;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) f();
});
/** Counts traversals that enumerate `target`. Each whole-graph walk keeps a seen set, so it
 * enumerates a shared object once; the ledger continuation only reads named fields of it. */
function tripwire(target: object) {
  let hits = 0;
  Object.defineProperty(target, 'tripwire', {
    enumerable: true,
    configurable: true,
    get() {
      hits++;
      if (process.env['SEND_PATH_TRIPWIRE_STACK']) console.log(new Error('tripwire').stack);
      return undefined;
    },
  });
  return () => hits;
}
/** One early source index: shared by every later view, read by name, never spread. */
const sourceIndex = (view: AccountLedgerView) => view.indexes!.sources.values().next().value!;
const bytesOf = (value: unknown, out = new Set<Uint8Array>(), seen = new Set<object>()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (value instanceof Uint8Array) out.add(value);
  else if (value instanceof Map)
    for (const [k, v] of value) {
      bytesOf(k, out, seen);
      bytesOf(v, out, seen);
    }
  else if (value instanceof Set) for (const v of value) bytesOf(v, out, seen);
  else for (const v of Object.values(value)) bytesOf(v, out, seen);
  return out;
};

it(
  'a send-only continuation on a 1,024-position history walks no retained graph (F1)',
  { timeout: 120000 },
  async () => {
    const f = await sendHistory(POSITIONS);
    cleanups.push(f.cleanup);
    let view = await f.view();
    // The walk is real work at this size: report it, then require that it is gone from the path.
    let objects = 0;
    const began = performance.now(),
      owned = ownedByteCapacity([f.rows, view], (n) => (objects = n)),
      walkMs = performance.now() - began;
    console.log(
      JSON.stringify({ positions: POSITIONS, rows: f.rows.length, owned, objects, walkMs }),
    );
    expect(owned).toBeGreaterThan(1024 * 1024);
    const hits = tripwire(sourceIndex(view));
    // Capture, position, attempt, envelope and acceptance: the five ledger changes of a sent position.
    for (const step of f.next()) {
      const turn = createInboundReceiptTurn();
      try {
        const before = hits(),
          next = await f.extend(view, step, turn);
        expect(hits() - before, 'continuation and its index recheck').toBe(0);
        turn.complete(next.view);
        view = next.view;
      } finally {
        turn.dispose();
      }
    }
    expect(view.indexes).toBeDefined();
    expect(view.delivery.acceptedThrough).toBe(POSITIONS + 1);
    // Same verified result as the complete reference check of the same rows.
    expect(sameAccountLedger(view, await f.view())).toBe(true);
    // Ownership is still reported on request, and it is still the whole retained graph.
    expect(accountLedgerIndexUsage(view, f.rows, f.memo.ownedBytes(), 'shared').ownedBytes).toBe(
      ownedByteCapacity([f.rows, view]) + f.memo.ownedBytes(),
    );
  },
);

it(
  'a complete check builds its indexes without walking the retained graph (F1)',
  { timeout: 60000 },
  async () => {
    const f = await sendHistory(256);
    cleanups.push(f.cleanup);
    const view = await f.view(),
      hits = tripwire(view.census.delivery.spool.positions[0]!.source);
    const { indexes: _, ...complete } = view;
    const counter = {
      v: 2 as const,
      spool: view.indexes!.witness,
      store_id: '02'.repeat(16),
      intent: '04'.repeat(16),
      active_gen: 1,
      next_seq: f.rows.at(-1)!.seq + 1,
      reserved: { 1: f.rows.at(-1)!.seq },
      mac: new Uint8Array(32),
    };
    const rebuilt = await indexVerifiedLedger(
      complete,
      f.rows,
      f.route,
      counter,
      crypto.subtle,
      f.memo.ownedBytes(),
      'shared',
    );
    expect(rebuilt).toBeDefined();
    expect(hits()).toBe(0);
  },
);

it('the live owner gates its continuation on row bounds, not on a retained-graph walk (F1)', () => {
  // accountReceive's validate callback is not runnable outside a native owner; its one gate call
  // must be the bounds check. The same call shape is exercised by the fixture above.
  const source = readFileSync(new URL('../src/crdt/accountReceive.ts', import.meta.url), 'utf8');
  expect(/accountLedgerIndexUsage\s*\(/.test(source), 'reporting call on the owner path').toBe(
    false,
  );
  expect(/accountLedgerIndexBounds\(result, records, memo\.ownedBytes\(\)/.test(source)).toBe(true);
});

it(
  'a turn that captured nothing completes and disposes without walking a 1,024-position result (F1b)',
  { timeout: 120000 },
  async () => {
    const f = await sendHistory(POSITIONS);
    cleanups.push(f.cleanup);
    const view = await f.view(),
      [capture] = f.next(),
      turn = createInboundReceiptTurn();
    try {
      const { view: next } = await f.extend(view, capture!, turn);
      const probe = {},
        hits = tripwire(probe),
        adopted = { ...next, probe };
      turn.complete(adopted);
      expect(hits(), 'complete').toBe(0);
      const retained = checksum(next);
      turn.dispose();
      expect(hits(), 'dispose').toBe(0);
      // Nothing was erased: every retained buffer still holds its bytes.
      expect(checksum(next)).toEqual(retained);
    } finally {
      turn.dispose();
    }
  },
);

/** One real dense receipt continuation; returns its turn before completion. */
async function receiptTurn() {
  const f = await appendPageFixture();
  cleanups.push(f.cleanup);
  const coverage = createInboundCoverage();
  cleanups.push(coverage.clear);
  const previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw),
    turn = createInboundReceiptTurn();
  const next = await extendAccountLedger(
    previous,
    f.rows,
    records,
    f.route,
    await f.counter(records),
    f.base,
    f.signer,
    crypto.subtle,
    { memo: f.memo, current() {} },
    undefined,
    turn,
  );
  expect(next).toBeDefined();
  const inbound = await verifyInboundLedger(
    next!.census,
    records,
    f.base,
    f.lifetime,
    { memo: f.memo, coverage },
    { state: previous.inbound, after: f.rows.at(-1)!.seq },
    turn,
  );
  // The captured row's parser view, owned by the turn.
  const parser = turn.inspect(records.at(-1)!, f.base)!;
  expect(parser).toBeDefined();
  return { turn, parser, result: { ...next!, inbound } as AccountLedgerView };
}
const owned = (parser: object, kept: unknown) => {
  const keep = new Set([...bytesOf(kept)].map((b) => b.buffer));
  return [...bytesOf(parser)].filter((b) => b.length && !keep.has(b.buffer));
};
const erased = (buffers: Uint8Array[]) => buffers.every((b) => b.every((x) => x === 0));
/** Order-sensitive checksum of every retained buffer: unchanged bytes keep it equal. */
const checksum = (value: unknown) => {
  let h = 0,
    n = 0;
  for (const b of bytesOf(value)) {
    n++;
    for (let i = 0; i < b.length; i++) h = (Math.imul(h, 31) + b[i]!) | 0;
  }
  return { buffers: n, h };
};

it(
  'a receipt turn walks and erases exactly when it captured something (F1b)',
  { timeout: 60000 },
  async () => {
    const erase = vi.mocked(eraseUnretained);
    // The same adopted receipt result, completed by a turn that captured nothing: no walk, no erasure.
    {
      const { turn, result } = await receiptTurn();
      const empty = createInboundReceiptTurn(),
        probe = {},
        hits = tripwire(probe),
        adopted = { ...result, probe };
      erase.mockClear();
      empty.complete(adopted);
      empty.dispose();
      expect(hits(), 'empty turn').toBe(0);
      expect(erase).not.toHaveBeenCalled();
      turn.dispose();
    }
    // A row, its parsers and a verified output: complete checks for escaped parsers, and dispose
    // erases what the adopted view does not keep.
    {
      const { turn, result } = await receiptTurn();
      const probe = {},
        hits = tripwire(probe),
        adopted = { ...result, probe };
      turn.complete(adopted);
      expect(hits(), 'complete still checks for escaped parsers').toBe(1);
      const kept = checksum(result);
      erase.mockClear();
      turn.dispose();
      expect(hits(), 'dispose still walks what it keeps').toBe(2);
      const calls = erase.mock.calls.filter(([, retained]) => retained === adopted);
      expect(calls).toHaveLength(1);
      expect(bytesOf(calls[0]![0]).size, 'captured syntax and outputs to erase').toBeGreaterThan(0);
      expect(checksum(result)).toEqual(kept);
    }
    // The same turn refuses an escaped parser, and the refusal erases everything it owned.
    {
      const { turn, parser, result } = await receiptTurn();
      const mine = owned(parser, undefined);
      expect(mine.length).toBeGreaterThan(0);
      expect(erased(mine)).toBe(false);
      expect(() => turn.complete({ ...result, leaked: parser })).toThrow();
      expect(erased(mine)).toBe(true);
    }
    // A captured row with its parsers and no verified output: completion refuses and still erases.
    {
      const f = await appendPageFixture();
      cleanups.push(f.cleanup);
      const records = f.add(f.rows, f.f.producer.raw),
        turn: InboundReceiptTurn = createInboundReceiptTurn();
      const parser = turn.inspect(records.at(-1)! as OpenedRecord, f.base)!;
      expect(parser).toBeDefined();
      const mine = owned(parser, undefined);
      expect(mine.length).toBeGreaterThan(0);
      expect(() => turn.complete({})).toThrow();
      expect(erased(mine)).toBe(true);
    }
  },
);
