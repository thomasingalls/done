/** Test bundle entry: genuine app verification, with an optional uniquely anchored test-only fault. */
import { appendPageFixture } from './append-fixtures';
import { interleave, mixedPublisher } from './mixed-fixtures';
import { inspectInbound, verifyInboundLedger } from '../../src/crdt/inboundLedger';
import { sameAccountLedger } from '../../src/crdt/incrementalAccountLedger';
import { emptyDelivery } from '../../src/crdt/deliveryRecord';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import type { OpenedRecord } from '../../src/crdt/contentRecord';
export async function staleTurnCase() {
  const f = await appendPageFixture();
  try {
    // Both streams have dense then legacy in one full call; producer starts inside its page.
    const chunks = interleave(
      mixedPublisher(f.f, f.f.producer, Array(8).fill(21)),
      mixedPublisher(f.f, f.f.candidate, Array(8).fill(21)),
      [true, false, true, false],
    );
    let rows = [...f.rows],
      previous = await f.full(rows);
    for (const chunk of chunks) {
      const after = rows.at(-1)!.seq;
      rows = [...rows];
      for (const bytes of chunk.updates)
        rows.push({ seq: rows.length + 1, gen: 2, kind: 'update', bytes });
      rows.push({ seq: rows.length + 1, gen: 2, kind: 'heads', bytes: chunk.raw });
      const census = inspectInbound(rows, f.route, f.base);
      previous = {
        census,
        delivery: emptyDelivery(),
        inbound: await verifyInboundLedger(census, rows, f.base, f.lifetime, undefined, {
          state: previous.inbound,
          after,
        }),
      };
    }
    const full = await f.full(rows);
    const retained = (view: typeof full) =>
      [[f.base.publisher.id, view.inbound], ...[...view.inbound.peers!.entries()]] as const;
    const wrong = (view: typeof full) =>
      retained(view).flatMap(([publisher, s]) =>
        [...s.retained].flatMap(([position, r]) =>
          decodeNetworkEnvelope(r.envelope).seq === position
            ? []
            : [{ publisher, position, envelopePosition: decodeNetworkEnvelope(r.envelope).seq }],
        ),
      );
    return {
      same: sameAccountLedger(full, previous),
      fullWrong: wrong(full),
      incrementalWrong: wrong(previous),
      prefixes: retained(full).map(([id, s]) => [id, s.prefix.position]),
      physical: rows.filter((r: OpenedRecord) => r.kind === 'heads').length,
    };
  } finally {
    f.cleanup();
  }
}
