// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { membershipPageFixture } from './inbound-page/membership-fixtures';
import { replacementPageFixture } from './inbound-page/replacement-fixtures';
import { historyPage } from './inbound-page/history-fixtures';
import {
  mixedPublisher,
  partitionSignedPage,
  interleave,
  hex,
} from './inbound-page/mixed-fixtures';
import { eraseMembershipReading } from '../src/crdt/membershipReading';
import { replayHandoffStream } from '../src/crdt/handoffHistory';
import { openReplacementSource } from '../src/crdt/replacementSource';
import { openReplacementCheckpoint } from '../src/crdt/replacementCheckpoint';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { membershipEventEpoch } from '../src/crdt/accountMembership';
import { Y, sameDocState } from '../src/crdt/yjs';
import { A, B, packet } from './account-inbound/fixtures';
const choices = fc.array(fc.integer({ min: 0, max: 23 }), { minLength: 16, maxLength: 16 });
const life = { assertCurrent() {}, now: () => 90000 };
const options = {
  numRuns: 6,
  seed: 407,
  examples: [
    [Array.from({ length: 16 }, (_, i) => (i % 3 === 0 ? 9 : i % 3))],
    [Array(16).fill(3)],
  ],
};
it('mixed saved membership streams preserve every signed entry, native suffix record and canonical state', async () => {
  const f = await membershipPageFixture(),
    expected = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(expected, f.initial);
    for (const source of [f.producer, f.candidate])
      for (const update of source.updates) Y.applyUpdate(expected, update);
    await fc.assert(
      fc.asyncProperty(choices, async (plan) => {
        const reading = structuredClone(f.reading),
          all = [];
        for (const source of [f.producer, f.candidate]) {
          const chunks = mixedPublisher(
            f,
            source,
            plan.slice(source === f.producer ? 0 : 8, source === f.producer ? 8 : 16),
          );
          const id = decodeInboundPageRecord(source.raw).publisher;
          reading.streams.find((s) => s.publisher === id)!.events = chunks.map((c) => hex(c.raw));
          all.push(...chunks);
        }
        const replay = await f.replay(reading, life);
        try {
          expect(sameDocState(replay.doc, expected)).toBe(true);
          expect(replay.contexts.map((c) => c.prefix.position)).toEqual([9, 9]);
          expect(replay.records.map((r) => hex(r.record))).toEqual(all.map((c) => hex(c.raw)));
          expect(replay.records.flatMap((r) => r.updates).map(hex)).toEqual(
            all.flatMap((c) => c.updates).map(hex),
          );
          for (const c of all) expect(membershipEventEpoch(c.raw)).toBe(f.history.current.tip);
        } finally {
          eraseMembershipReading(replay);
          for (const c of all) for (const u of c.updates) u.fill(0);
        }
      }),
      options,
    );
  } finally {
    expected.destroy();
    f.cleanup();
  }
});
it('two handoff publishers retain mixed receipt originals and reach the complete independent document', async () => {
  const a = historyPage(0, 8, A),
    b = historyPage(0, 8, B),
    expected = new Y.Doc({ gc: false });
  try {
    for (const f of [a, b]) Y.applyUpdate(expected, f.snapshot);
    await fc.assert(
      fc.asyncProperty(choices, async (plan) => {
        const doc = new Y.Doc({ gc: false });
        try {
          for (const [owner, f] of [a, b].entries()) {
            const chunks = partitionSignedPage(
              f.record,
              f.entries,
              f.entries.flatMap((e) => e.updates),
              plan.slice(owner * 8, owner * 8 + 8),
              (index) => packet(f.entries[index]!, 8),
            );
            const out = await replayHandoffStream(
              doc,
              f.context,
              chunks.map((c) => hex(c.raw)),
              undefined,
              life,
            );
            try {
              expect(out.context.prefix.position).toBe(8);
              expect(out.context.prefix.link).toBe(f.entries[7]!.link);
              expect(out.records.map((r) => hex(r.record))).toEqual(chunks.map((c) => hex(c.raw)));
              expect(out.records.flatMap((r) => r.updates).map(hex)).toEqual(
                chunks.flatMap((c) => c.updates).map(hex),
              );
            } finally {
              for (const r of out.records) {
                r.record.fill(0);
                for (const u of r.updates) u.fill(0);
              }
              for (const c of chunks) for (const u of c.updates) u.fill(0);
            }
          }
          expect(sameDocState(doc, expected)).toBe(true);
        } finally {
          doc.destroy();
        }
      }),
      { ...options, seed: 408 },
    );
  } finally {
    expected.destroy();
  }
});
it('replacement replay mixes both accepted publishers through the exact cut and independently opened checkpoint', async () => {
  const f = await replacementPageFixture(),
    expected = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(expected, Y.encodeStateAsUpdate(f.f.root));
    for (const s of f.streams) for (const e of s.entries) Y.applyUpdate(expected, e.update);
    await fc.assert(
      fc.asyncProperty(
        choices,
        fc.array(fc.boolean(), { minLength: 16, maxLength: 16 }),
        async (plan, order) => {
          type Stream = {
            publisher: string;
            entries: { position: number; link: string; update: Uint8Array<ArrayBuffer> }[];
          };
          type Chunk = ReturnType<typeof partitionSignedPage>[number] & { publisher: string };
          const streams: Chunk[][] = f.streams.map((s: Stream, i: number) =>
            partitionSignedPage(
              decodeInboundPageRecord(f.raws[i]!),
              s.entries,
              s.entries.map((e) => e.update),
              plan.slice(i * 8, i * 8 + 8),
              (index) => f.packet(s, [s.entries[index]!]),
            ).map((c) => ({ ...c, publisher: s.publisher })),
          );
          const chunks = interleave(streams[0]!, streams[1]!, order),
            source = await openReplacementSource({ ...f.input, lifetime: life });
          try {
            for (const c of chunks) {
              const saved = await source.appendStored(c.publisher, c.raw);
              expect(saved).toEqual(c.raw);
              saved.fill(0);
            }
            expect(source.pending()).toEqual([]);
            const checkpoint = await source.checkpoint(f.f.root, f.f.sign),
              opened = await openReplacementCheckpoint(checkpoint, f.f.key2, f.parent);
            try {
              expect(sameDocState(opened, expected)).toBe(true);
            } finally {
              opened.destroy();
            }
          } finally {
            source.dispose();
            for (const c of chunks) for (const u of c.updates) u.fill(0);
          }
        },
      ),
      {
        numRuns: 6,
        seed: 409,
        examples: [
          [
            Array.from({ length: 16 }, (_, i) => (i % 3 === 0 ? 9 : i % 3)),
            Array.from({ length: 16 }, (_, i) => i % 2 === 0),
          ],
        ],
      },
    );
  } finally {
    expected.destroy();
    f.cleanup();
  }
});
