// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import fc from 'fast-check';
import { appendPageFixture } from './inbound-page/append-fixtures';
import { interleave, mixedPublisher } from './inbound-page/mixed-fixtures';
import {
  inspectInbound,
  verifyInboundLedger,
  createInboundCoverage,
} from '../src/crdt/inboundLedger';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import {
  sameAccountLedger,
  extendAccountLedger,
  indexVerifiedLedger,
} from '../src/crdt/incrementalAccountLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import type { AccountLedgerView } from '../src/crdt/incrementalAccountLedger';
let fixture: Awaited<ReturnType<typeof appendPageFixture>> | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});
async function mixedProperty(seed: number) {
  const f = (fixture = await appendPageFixture());
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 23 }), { minLength: 16, maxLength: 16 }),
      fc.array(fc.boolean(), { minLength: 18, maxLength: 18 }),
      async (choices, order) => {
        const chunks = interleave(
          mixedPublisher(f.f, f.f.producer, choices.slice(0, 8)),
          mixedPublisher(f.f, f.f.candidate, choices.slice(8)),
          order,
        );
        let rows = [...f.rows];
        let previous: AccountLedgerView = await f.indexed();
        const memo = createVerificationMemo(),
          coverage = createInboundCoverage();
        try {
          for (const chunk of chunks) {
            const before = rows;
            rows = [...before];
            for (const bytes of chunk.updates)
              rows.push({ seq: rows.length + 1, gen: 2, kind: 'update', bytes });
            rows.push({ seq: rows.length + 1, gen: 2, kind: 'heads', bytes: chunk.raw });
            const extended = await extendAccountLedger(
              previous,
              before,
              rows,
              f.route,
              await f.counter(rows),
              f.base,
              f.signer,
              crypto.subtle,
              { memo, current() {} },
            );
            const census = extended?.census ?? inspectInbound(rows, f.route, f.base);
            const inbound = await verifyInboundLedger(
              census,
              rows,
              f.base,
              f.lifetime,
              { memo, coverage },
              { state: previous.inbound, after: before.at(-1)!.seq },
            );
            const actual = { ...(extended ?? { census, delivery: emptyDelivery() }), inbound };
            const expected = await f.full(rows);
            expect(sameAccountLedger(actual, expected)).toBe(true);
            for (const [id, state] of [
              [f.base.publisher.id, inbound],
              ...[...inbound.peers!.entries()],
            ] as const) {
              const source = id === f.f.who.id ? f.f.candidate : f.f.producer;
              for (const [position, kept] of state.retained) {
                expect(decodeNetworkEnvelope(kept.envelope).seq).toBe(position);
                expect(kept.envelope).toEqual(
                  new Uint8Array(source.entries[position - 1]!.envelope),
                );
                expect(kept.proof).toEqual(new Uint8Array(source.entries[position - 1]!.proof));
              }
            }
            const indexes = await indexVerifiedLedger(
              actual,
              rows,
              f.route,
              await f.counter(rows),
              crypto.subtle,
              memo.ownedBytes(),
            );
            if (!indexes) throw Error('Bounded mixed fixture index unavailable');
            previous = { ...actual, indexes };
          }
          expect(previous.inbound.prefix.position).toBe(9);
          expect(previous.inbound.peers!.get(f.f.f.input.producer)!.prefix.position).toBe(9);
        } finally {
          coverage.clear();
          memo.clear();
        }
      },
    ),
    {
      numRuns: 4,
      seed,
      examples: [
        [[3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], Array(18).fill(true)],
        [
          [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8],
          Array.from({ length: 18 }, (_, i) => i % 2 === 0),
        ],
      ],
    },
  );
}
it('mixed two-publisher full/continuation property, seed406', () => mixedProperty(406));
it('mixed two-publisher full/continuation property, seed407', () => mixedProperty(407));
it('mixed two-publisher full/continuation property, seed408', () => mixedProperty(408));
