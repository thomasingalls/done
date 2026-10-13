// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { advanceSelfReceive, advanceSelfReceiveCooperatively } from '../src/crdt/accountSyncState';
import { emptyInbound, verifyInboundCoverage } from '../src/crdt/inboundLedger';
import { applyDecision, emptyDelivery, type DeliveryCensus } from '../src/crdt/deliveryRecord';
import { makeSourceCapsule } from '../src/crdt/sourceCapture';
import * as captures from '../src/crdt/sourceCapture';
import { verifyPositionResponse } from '../account-protocol/positionDecision';
import { verifyInboundPage } from '../src/crdt/accountInbound';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { Y } from '../src/crdt/yjs';
import { A, B, entry, packet, ZERO, type FixtureEntry } from './account-inbound/fixtures';
import { context, live } from './account-inbound-codecs/oracle';

async function fixture(actions = [false, false, true]) {
  const base = context(),
    route = {
      workspace: base.authority.workspace,
      credential: A,
      principal: A,
      epoch: 1,
      generation: 1,
    };
  const census: DeliveryCensus = {
    spool: { sources: new Map(), positions: [], attempts: 0, sourceRecords: [], events: [] },
    entries: [],
    ledger: [],
  };
  const delivery = emptyDelivery(),
    rows: OpenedRecord[] = [],
    entries: FixtureEntry[] = [];
  const doc = new Y.Doc();
  let previous = ZERO;
  try {
    for (const remove of actions) {
      let update!: Uint8Array<ArrayBuffer>;
      const capture = (bytes: Uint8Array) => {
        update = new Uint8Array(bytes);
      };
      doc.on('update', capture);
      const text = doc.getText('master');
      if (remove && text.length) text.delete(0, 1);
      else text.insert(text.length, 'x');
      doc.off('update', capture);
      const position = entries.length + 1;
      const source = makeSourceCapsule(route, [{ actor: A, kind: 'human', bytes: update }]);
      const id = JSON.parse(new TextDecoder().decode(source))[2] as string;
      const e = entry({ publisher: A, updates: [update] }, position, previous);
      census.spool.sources.set(id, source);
      census.spool.positions.push({
        position,
        source: { id, index: 0, hash: createHash('sha256').update(source).digest('hex') },
        attempts: [],
        wire: e.envelope,
      });
      const proof = await verifyPositionResponse(
        e.proof,
        {
          workspace: route.workspace,
          credential: A,
          position,
          epoch: 1,
          digest: e.digest,
          previous,
          parent: ZERO,
        },
        base.authority,
      );
      expect(proof.kind).toBe('accepted');
      if (proof.kind === 'unknown') throw Error('Fixture proof');
      applyDecision(delivery, proof);
      delivery.responses.set(position, [e.proof]);
      rows.push({ kind: 'update', seq: position, gen: 1, bytes: update });
      entries.push(e);
      previous = e.link;
    }
    return { census, delivery, route, rows, entries };
  } finally {
    doc.destroy();
  }
}

it('derives contiguous own progress from signed decisions without changing peer progress or durable rows', async () => {
  const f = await fixture(),
    own = emptyInbound(),
    peer = emptyInbound();
  own.peers = new Map([[B, peer]]);
  const before = structuredClone(f);
  advanceSelfReceive(f.census, f.delivery, own, f.route, (u) => verifyInboundCoverage(f.rows, u));
  expect(own.prefix).toEqual({ position: 3, link: f.entries[2]!.link, observedThrough: 3 });
  expect(own.retained.get(2)!.envelope).toEqual(f.entries[1]!.envelope);
  expect(own.peers.get(B)).toBe(peer);
  expect(peer.prefix.position).toBe(0);
  expect(f).toEqual(before);
  const reopened = emptyInbound();
  advanceSelfReceive(f.census, f.delivery, reopened, f.route, (u) =>
    verifyInboundCoverage(f.rows, u),
  );
  expect(reopened.prefix).toEqual(own.prefix);
  const outstanding = packet(f.entries[0]!, 3);
  const duplicate = await verifyInboundPage(
    { ...context(), prefix: own.prefix, retained: own.retained.get(1)! },
    outstanding.request,
    outstanding.page,
    live,
  );
  expect(duplicate.kind).toBe('duplicate');
});

it('retains old self receipts and refuses inconsistent heads, missing decisions and missing content', async () => {
  const f = await fixture(),
    first = f.entries[0]!;
  const own = emptyInbound({ position: 1, link: first.link, observedThrough: 1 });
  const retained = { previous: ZERO, envelope: first.envelope, proof: first.proof };
  own.retained.set(1, retained);
  advanceSelfReceive(f.census, f.delivery, own, f.route, (u) => verifyInboundCoverage(f.rows, u));
  expect(own.retained.get(1)).toBe(retained);
  expect(() =>
    advanceSelfReceive(
      f.census,
      f.delivery,
      emptyInbound({ position: 1, link: ZERO, observedThrough: 1 }),
      f.route,
      () => {},
    ),
  ).toThrow('head differs');
  expect(() =>
    advanceSelfReceive(f.census, f.delivery, emptyInbound(), f.route, (u) =>
      verifyInboundCoverage(f.rows.slice(0, 2), u),
    ),
  ).toThrow('coverage');
  f.delivery.responses.delete(2);
  expect(() => advanceSelfReceive(f.census, f.delivery, emptyInbound(), f.route, () => {})).toThrow(
    'missing its decision',
  );
});

it('unknown acceptance never advances; a conflict blocks without erasing accepted progress', async () => {
  const f = await fixture();
  const own = emptyInbound();
  advanceSelfReceive(f.census, emptyDelivery(), own, f.route, () => {
    throw Error('No accepted sources');
  });
  expect(own.prefix.position).toBe(0);
  f.delivery.conflict = true;
  advanceSelfReceive(f.census, f.delivery, own, f.route, (u) => verifyInboundCoverage(f.rows, u));
  expect(own.conflict).toBe(true);
  expect(own.prefix.position).toBe(3);
});

it('generated insert/delete histories give the same progress after exact compaction and cold reconstruction', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), async (actions) => {
      const f = await fixture(actions);
      const merged: OpenedRecord[] = [
        {
          kind: 'state',
          seq: 100,
          gen: 1,
          bytes: new Uint8Array(Y.mergeUpdates(f.rows.map((r) => r.bytes))),
        },
      ];
      for (const rows of [f.rows, merged]) {
        const own = emptyInbound();
        advanceSelfReceive(f.census, f.delivery, own, f.route, (u) =>
          verifyInboundCoverage(rows, u),
        );
        expect(own.prefix.position).toBe(actions.length);
        expect(own.prefix.link).toBe(f.entries.at(-1)!.link);
      }
    }),
    { seed: 10102026, numRuns: 35 },
  );
});

it('cooperative self coverage matches the reference and erases owned originals on interruption or refusal', async () => {
  const f = await fixture(),
    expected = emptyInbound(),
    actual = emptyInbound();
  advanceSelfReceive(f.census, f.delivery, expected, f.route, (u) =>
    verifyInboundCoverage(f.rows, u),
  );
  let checked = 0;
  await advanceSelfReceiveCooperatively(
    f.census,
    f.delivery,
    actual,
    f.route,
    (u) => {
      expect(u).toHaveLength(1);
      checked++;
      verifyInboundCoverage(f.rows, u);
    },
    async () => {},
  );
  expect(actual).toEqual(expected);
  expect(checked).toBe(3);
  for (const failure of ['interrupt', 'coverage']) {
    const borrowed: Uint8Array[] = [];
    await expect(
      advanceSelfReceiveCooperatively(
        f.census,
        f.delivery,
        emptyInbound(),
        f.route,
        (u) => {
          borrowed.push(...u);
          verifyInboundCoverage(failure === 'coverage' ? [] : f.rows, u);
        },
        async () => {
          if (failure === 'interrupt' && borrowed.length) throw Error('cancelled');
        },
      ),
    ).rejects.toThrow(failure === 'interrupt' ? 'cancelled' : 'coverage');
    expect(borrowed.length).toBeGreaterThan(0);
    expect(borrowed.every((b) => b.every((x) => x === 0))).toBe(true);
  }
  const reopened = emptyInbound();
  await advanceSelfReceiveCooperatively(
    f.census,
    f.delivery,
    reopened,
    f.route,
    (u) => verifyInboundCoverage(f.rows, u),
    async () => {},
  );
  expect(reopened).toEqual(expected);
});

it('can retire during self projection before coverage and erases its suspended decoded capsules', async () => {
  const f = await fixture(),
    before = structuredClone(f),
    actual = emptyInbound();
  const capsules: captures.SourceCapsule[] = [];
  const decode = captures.decodeSourceCapsule;
  const spy = vi.spyOn(captures, 'decodeSourceCapsule').mockImplementation((...args) => {
    const capsule = decode(...args);
    capsules.push(capsule);
    return capsule;
  });
  const check = vi.fn();
  try {
    await expect(
      advanceSelfReceiveCooperatively(f.census, f.delivery, actual, f.route, check, async () => {
        if (capsules.length === 1) throw Error('retired during projection');
      }),
    ).rejects.toThrow('retired during projection');
    expect(capsules).toHaveLength(1);
    expect(check).not.toHaveBeenCalled();
    expect(actual.prefix.position).toBe(0);
    expect(capsules[0]!.sources.every((s) => s.bytes.every((b) => b === 0))).toBe(true);
    expect(f).toEqual(before);
  } finally {
    spy.mockRestore();
  }
  const retried = emptyInbound();
  await advanceSelfReceiveCooperatively(
    f.census,
    f.delivery,
    retried,
    f.route,
    (u) => verifyInboundCoverage(f.rows, u),
    async () => {},
  );
  expect(retried.prefix.position).toBe(3);
});
