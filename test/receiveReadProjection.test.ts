// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  emptyInbound,
  inboundReadCursors,
  publisherState,
  type InboundState,
} from '../src/crdt/inboundLedger';
import type { InboundContext } from '../src/crdt/accountInbound';
import { createVerifiedRecords, eraseVerified } from '../src/crdt/verifiedRecords';
const base = { publisher: { id: 'self' } } as InboundContext;
const stream = (position: number): InboundState => ({
  ...emptyInbound({ position, link: 'ab'.repeat(32), observedThrough: position + 2 }),
  startingPoint: { position: 1, link: 'cd'.repeat(32) },
});

it('cursor projection never reads retained payloads, installed history or checkpoint cuts', () => {
  const own = stream(12),
    peer = stream(30);
  for (const s of [own, peer])
    for (const key of ['retained', 'installedHistory', 'checkpointCuts', 'retiredThrough'])
      Object.defineProperty(s, key, {
        get() {
          throw Error('Unneeded history was read');
        },
      });
  own.peers = new Map([['peer', peer]]);
  const result = inboundReadCursors(own);
  expect(Object.keys(result).sort()).toEqual(['conflict', 'peers', 'prefix', 'startingPoint']);
  expect(Object.keys(result.peers!.get('peer')!).sort()).toEqual([
    'conflict',
    'prefix',
    'startingPoint',
  ]);
  expect(result.prefix.position).toBe(12);
  expect(result.peers!.get('peer')!.prefix.position).toBe(30);
});

it('copies numeric/link cursor fields and preserves absence, peer order and independent conflicts', () => {
  const own = emptyInbound();
  own.peers = new Map([
    ['b', stream(7)],
    ['a', { ...stream(3), conflict: true }],
  ]);
  const result = inboundReadCursors(own);
  expect(result).not.toHaveProperty('startingPoint');
  expect([...result.peers!.keys()]).toEqual(['b', 'a']);
  expect(result.peers!.get('a')!.conflict).toBe(true);
  result.prefix.position = 99;
  result.peers!.get('b')!.startingPoint!.position = 99;
  result.peers!.clear();
  expect(own.prefix.position).toBe(0);
  expect(own.peers.get('b')!.startingPoint!.position).toBe(1);
  expect(own.peers.size).toBe(2);
});

it('request-only cursors use the same self resolver and still reject an uncertified peer', () => {
  const own = stream(8),
    cursor = inboundReadCursors(own);
  expect(publisherState(cursor, base, 'self').prefix).toEqual(
    publisherState(own, base, 'self').prefix,
  );
  expect(() => publisherState(cursor, base, 'peer')).toThrow('Uncertified inbound publisher');
  expect(() => publisherState(own, base, 'peer')).toThrow('Uncertified inbound publisher');
});

it('150 generated publisher maps preserve every scheduling cursor without retaining receipt fields', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ position: fc.nat(100000), observed: fc.nat(100000), conflict: fc.boolean() }),
        { maxLength: 32 },
      ),
      (values) => {
        const own = stream(5);
        own.peers = new Map(
          values.map((v, i) => [
            String(i),
            {
              ...stream(v.position),
              conflict: v.conflict,
              prefix: {
                position: v.position,
                observedThrough: v.observed,
                link: String(i).padStart(64, '0'),
              },
            },
          ]),
        );
        const result = inboundReadCursors(own);
        expect(
          [...result.peers!].map(([id, s]) => [id, s.prefix, s.startingPoint, s.conflict]),
        ).toEqual([...own.peers].map(([id, s]) => [id, s.prefix, s.startingPoint, s.conflict]));
        expect([...result.peers!.values()].every((s) => !('retained' in s))).toBe(true);
      },
    ),
    { seed: 271027, numRuns: 150 },
  );
});

for (const owned of [false, true])
  describe(`verified read projection ownership=${owned}`, () => {
    it('detaches hints but keeps real retained replay evidence and rejects changed/cleared source records', async () => {
      const records = [
        { kind: 'update' as const, seq: 1, gen: 1, bytes: new Uint8Array([1, 2, 3]) },
      ];
      const cache = createVerifiedRecords<{ inbound: InboundState }>(
        owned ? { ownResults: true } : {},
      );
      const inbound = stream(4);
      inbound.retained.set(1, {
        previous: 'ef'.repeat(32),
        envelope: new Uint8Array([4, 5]),
        proof: new Uint8Array([6, 7]),
      });
      await cache.verify(
        records,
        {},
        async () => ({ inbound }),
        () => {},
      );
      const result = cache.read(records, (v) => inboundReadCursors(v.inbound));
      result.prefix.position = 99;
      eraseVerified(result);
      const retained = cache.read(records, (v) => v.inbound.retained.get(1));
      expect([...retained!.envelope]).toEqual([4, 5]);
      expect([...retained!.proof]).toEqual([6, 7]);
      expect(cache.read(records, (v) => inboundReadCursors(v.inbound)).prefix.position).toBe(4);
      records[0]!.bytes[0] = 9;
      expect(() => cache.read(records, (v) => inboundReadCursors(v.inbound))).toThrow(
        'No verified view',
      );
      cache.clear();
      expect(() => cache.read(records, (v) => inboundReadCursors(v.inbound))).toThrow(
        'No verified view',
      );
    });
  });
