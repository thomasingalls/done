// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Y, hasPendingUpdates, sameDocState } from '../src/crdt/yjs';
import { verifyPositionResponse, ZERO_REFUSAL } from '../account-protocol/positionDecision';
import { openNetworkEnvelope } from '../account-protocol/envelope';
import { decodeSourceCapsule, makeSourceCapsule } from '../src/crdt/sourceCapture';
import { CandidateReceiver, identity } from './account-inbound/model';
import {
  A,
  B,
  READER,
  authority,
  entry,
  generationKey,
  packet,
  sources,
  type FixtureEntry,
} from './account-inbound/fixtures';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const save = (name: string, value: unknown) => {
  if (process.env['ACCOUNT_REPORT_DIR']) {
    mkdirSync(process.env['ACCOUNT_REPORT_DIR'], { recursive: true });
    writeFileSync(
      join(process.env['ACCOUNT_REPORT_DIR'], name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
const setup = () => {
  const f = sources();
  return { f, r: new CandidateReceiver(f.baseline, f.baselineId, authority(), generationKey) };
};
const deliver = async (r: CandidateReceiver, e: FixtureEntry, through = e.position, nonce = 1) => {
  const p = packet(e, through, nonce),
    kind = await r.prepare(p, p.request);
  if (kind !== 'duplicate') r.commit();
  return kind;
};
function checkOracle(
  r: CandidateReceiver,
  f: ReturnType<typeof sources>,
  accepted: FixtureEntry[],
) {
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, f.baseline);
    for (const e of accepted) for (const u of e.updates) Y.applyUpdate(doc, u);
    expect(sameDocState(r.doc, doc)).toBe(true);
    const ids = accepted.map((e) => identity(e.publisher, e.position));
    expect(
      r.disk.events
        .filter((e) => e.kind === 'received')
        .map((e) => identity(e.publisher, e.position)),
    ).toEqual(ids);
    for (const publisher of [A, B])
      expect(r.cursor[publisher] ?? 0).toBe(
        accepted.filter((e) => e.publisher === publisher).length,
      );
    expect(r.captures).toHaveLength(0);
    for (const e of r.disk.events) {
      const original = accepted.find(
        (v) => identity(v.publisher, v.position) === identity(e.publisher, e.position),
      );
      expect(e.wire).toBe(hex(original!.envelope));
      expect(e.proof).toBe(hex(original!.proof));
    }
  } finally {
    doc.destroy();
  }
}

describe('inbound candidate contract — synthetic authority and atomic model only', () => {
  it('keeps reader authority distinct from publisher authority and begins from held zero links', async () => {
    const { f, r } = setup();
    try {
      expect(r.authority.reader).not.toBe(A);
      await deliver(r, f.entries[0]!);
      await deliver(r, f.entries[2]!);
      checkOracle(r, f, [f.entries[0]!, f.entries[2]!]);
      save('fixtures', {
        scope:
          'Synthetic independently held authority and genesis; no production enrollment or receipt issuance.',
        authority: r.authority,
        baseline: hex(f.baseline),
        baselineId: f.baselineId,
        expected: f.expected,
        entries: f.entries.map((e) => ({
          publisher: e.publisher,
          position: e.position,
          previous: e.previous,
          link: e.link,
          envelope: hex(e.envelope),
          proof: hex(e.proof),
          updates: e.updates.map(hex),
          request: hex(packet(e, 2).request),
          page: hex(packet(e, 2).page),
        })),
      });
    } finally {
      r.dispose();
    }
  });
  it('retains cross-stream pending structs/deletions across commit and restart before their dependency arrives', async () => {
    const { f, r } = setup();
    try {
      for (const e of [f.entries[2]!, f.entries[3]!]) await deliver(r, e, 2);
      expect(r.cursor[B]).toBe(2);
      expect(r.doc.getText('master').toString()).toBe('base');
      expect(hasPendingUpdates(r.doc)).toBe(true);
      expect(r.doc.store.pendingDs).not.toBeNull();
      expect(r.compact()).toBe(false);
      r.restart();
      expect(hasPendingUpdates(r.doc)).toBe(true);
      for (const e of f.entries.slice(0, 2)) await deliver(r, e, 2);
      expect(r.doc.getText('master').toString()).toBe(f.expected);
      expect(hasPendingUpdates(r.doc)).toBe(false);
      const retained = r.disk.events.map((e) => [e.wire, e.proof]);
      expect(r.compact()).toBe(true);
      r.restart();
      expect(r.disk.events.map((e) => [e.wire, e.proof])).toEqual(retained);
      checkOracle(r, f, [f.entries[2]!, f.entries[3]!, f.entries[0]!, f.entries[1]!]);
    } finally {
      r.dispose();
    }
  });
  it('rejects a gap, deduplicates exact entries and retains advertised high-water marks across restart', async () => {
    const { f, r } = setup();
    try {
      await expect(deliver(r, f.entries[1]!)).rejects.toThrow('prefix');
      await deliver(r, f.entries[0]!, 2);
      const before = r.snapshot();
      expect(await deliver(r, f.entries[0]!, 2, 2)).toBe('duplicate');
      expect(r.snapshot()).toBe(before);
      r.restart();
      await expect(deliver(r, f.entries[0]!, 1, 3)).rejects.toThrow('Regressed');
      expect(r.cursor[A]).toBe(1);
    } finally {
      r.dispose();
    }
  });
  it('binds fresh input to the actual pending request; committed evidence remains usable after expiry', async () => {
    const { f, r } = setup();
    try {
      const p = packet(f.entries[0]!),
        other = packet(f.entries[0]!, 1, 2);
      await expect(r.prepare(p, other.request)).rejects.toThrow('binding');
      await expect(r.prepare(p, p.request, 30000)).rejects.toThrow('expiry');
      await r.prepare(p, p.request);
      r.commit();
      r.restart();
      expect(r.cursor[A]).toBe(1);
      // Cold cryptographic evidence has no clock expiry; freshness applies to new network input.
      const e = f.entries[0]!;
      expect(
        (
          await verifyPositionResponse(
            e.proof,
            {
              workspace: r.authority.workspace,
              credential: A,
              position: 1,
              digest: e.digest,
              epoch: 1,
              previous: ZERO_REFUSAL,
              parent: ZERO_REFUSAL,
            },
            r.authority,
          )
        ).kind,
      ).toBe('accepted');
    } finally {
      r.dispose();
    }
  });
  it.each([
    'foreign',
    'retired',
    'reader-retired',
    'epoch',
    'generation',
    'actor',
    'agent',
    'final',
  ] as const)('refuses %s input without changing content or progress', async (mode) => {
    const { f, r } = setup();
    try {
      let e = f.entries[0]!;
      if (mode === 'foreign') delete r.authority.members[A];
      if (mode === 'retired') r.authority.members[A]!.active = false;
      if (mode === 'reader-retired') r.authority.members[READER]!.active = false;
      if (mode === 'epoch') e = entry(e, 1, undefined, { epoch: 2 });
      if (mode === 'generation') e = entry(e, 1, undefined, { generation: 2 });
      if (mode === 'actor') e = entry(e, 1, undefined, { actor: B });
      if (mode === 'agent') e = entry(e, 1, undefined, { actorKind: 'agent' });
      if (mode === 'final') e = entry(e, 1, undefined, { final: true });
      const before = r.snapshot();
      await expect(deliver(r, e)).rejects.toThrow();
      expect(r.snapshot()).toBe(before);
      expect(r.doc.getText('master').toString()).toBe('base');
    } finally {
      r.dispose();
    }
  });
  it('retains a proved conflicting digest without applying it or advancing the receive cursor', async () => {
    const { f, r } = setup();
    try {
      await deliver(r, f.entries[0]!);
      const alternative = entry(f.entries[0]!, 1, undefined, { nonceByte: 99 });
      expect(await deliver(r, alternative)).toBe('conflict');
      expect(r.blocked).toBe(true);
      expect(r.cursor[A]).toBe(1);
      expect(r.disk.events).toHaveLength(2);
      r.restart();
      expect(r.blocked).toBe(true);
      expect(r.doc.getText('master').toString()).toBe('baseX');
      await expect(deliver(r, f.entries[1]!)).rejects.toThrow('Unavailable');
    } finally {
      r.dispose();
    }
  });
  it('retains the exact verified request/page when caller buffers change during crypto', async () => {
    const { f, r } = setup();
    try {
      const p = packet(f.entries[0]!),
        expected = p.request.slice(),
        page = p.page.slice();
      const prepared = r.prepare(p, expected);
      p.request.fill(0);
      p.page.fill(0);
      await prepared;
      r.commit();
      expect(r.disk.events[0]!.request).toBe(hex(expected));
      expect(r.disk.events[0]!.page).toBe(hex(page));
      const duplicate = packet(f.entries[0]!, 1, 2);
      const inFlight = r.prepare(duplicate, duplicate.request);
      r.close();
      await expect(inFlight).rejects.toThrow('Stale validation');
      r.restart();
      checkOracle(r, f, [f.entries[0]!]);
    } finally {
      r.dispose();
    }
  });
  it('leaves malformed or unproved evidence unconsumed and refuses local size/count overflow', async () => {
    const { f, r } = setup();
    try {
      const bad = { ...f.entries[0]!, proof: f.entries[0]!.proof.slice() };
      bad.proof[bad.proof.length - 4] = bad.proof[bad.proof.length - 4]! ^ 1;
      await expect(deliver(r, bad)).rejects.toThrow();
      expect(r.cursor).toEqual({});
      for (const updates of [
        Array.from({ length: 256 }, () => new Uint8Array([0, 0])),
        [new Uint8Array(512 * 1024).fill(1)],
      ]) {
        const oversized = entry({ publisher: A, updates }, 1);
        await expect(deliver(r, oversized)).rejects.toThrow('size');
        expect(r.cursor).toEqual({});
      }
      await deliver(
        r,
        entry(
          { publisher: A, updates: Array.from({ length: 255 }, () => new Uint8Array([0, 0])) },
          1,
        ),
      );
      expect(r.disk.content).toHaveLength(255);
    } finally {
      r.dispose();
    }
  });
  it('commits content and progress together across abort, lost acknowledgement and close before commit', async () => {
    for (const cut of ['before', 'after', 'none'] as const) {
      const { f, r } = setup();
      try {
        const p = packet(f.entries[0]!);
        await r.prepare(p, p.request);
        expect(r.doc.getText('master').toString()).toBe('base');
        expect(r.cursor).toEqual({});
        r.commit(cut);
        if (cut !== 'none') expect(r.doc.getText('master').toString()).toBe('base');
        r.restart();
        checkOracle(r, f, cut === 'before' ? [] : [f.entries[0]!]);
      } finally {
        r.dispose();
      }
    }
    const { f, r } = setup();
    try {
      const p = packet(f.entries[0]!);
      await r.prepare(p, p.request);
      r.close();
      expect(() => r.commit()).toThrow('Stale');
      r.restart();
      checkOracle(r, f, []);
      const inFlight = r.prepare(p, p.request);
      r.close();
      await expect(inFlight).rejects.toThrow('Stale validation');
      r.restart();
      checkOracle(r, f, []);
    } finally {
      r.dispose();
    }
  });
  it('rechecks membership at commit and fails cold open on omitted evidence or a wrong reader fence', async () => {
    const { f, r } = setup();
    try {
      const p = packet(f.entries[0]!);
      await r.prepare(p, p.request);
      r.authority.members[A]!.active = false;
      expect(() => r.commit()).toThrow('Stale');
      r.restart();
      r.authority.members[A]!.active = true;
      await deliver(r, f.entries[0]!);
      const disk = structuredClone(r.disk);
      r.disk.events = [];
      expect(() => r.restart()).toThrow('Unreadable');
      r.disk = structuredClone(disk);
      r.disk.fence = 8;
      expect(() => r.restart()).toThrow('Unreadable');
      r.disk = structuredClone(disk);
      r.disk.baselineId = '00'.repeat(32);
      expect(() => r.restart()).toThrow('Unreadable');
    } finally {
      r.dispose();
    }
  });
  it('300 generated delivery/crash/compaction histories preserve the external receipt and source ledger', async () => {
    const histories: unknown[] = [];
    const action = fc.record({
      index: fc.nat(3),
      cut: fc.constantFrom('none', 'before', 'after'),
      close: fc.boolean(),
      compact: fc.boolean(),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(action, { minLength: 4, maxLength: 24 }), async (history) => {
        const { f, r } = setup(),
          accepted: FixtureEntry[] = [];
        try {
          for (const [n, op] of history.entries()) {
            const e = f.entries[op.index]!,
              prior = accepted.filter((v) => v.publisher === e.publisher).length,
              p = packet(e, 2, n + 1);
            if (e.position > prior + 1)
              await expect(r.prepare(p, p.request)).rejects.toThrow('prefix');
            else {
              const kind = await r.prepare(p, p.request);
              if (e.position <= prior) expect(kind).toBe('duplicate');
              else {
                expect(kind).toBe('received');
                if (op.close) {
                  r.close();
                  expect(() => r.commit()).toThrow('Stale');
                } else {
                  r.commit(op.cut as 'none' | 'before' | 'after');
                  if (op.cut !== 'before') accepted.push(e);
                }
              }
            }
            r.restart();
            if (op.compact) {
              r.compact();
              r.restart();
            }
            checkOracle(r, f, accepted);
          }
          for (const e of f.entries) {
            const already = accepted.includes(e);
            expect(await deliver(r, e, 2, 100)).toBe(already ? 'duplicate' : 'received');
            if (!already) accepted.push(e);
          }
          r.compact();
          r.restart();
          checkOracle(r, f, accepted);
          expect(r.doc.getText('master').toString()).toBe(f.expected);
          expect(hasPendingUpdates(r.doc)).toBe(false);
          histories.push(history);
        } finally {
          r.dispose();
        }
      }),
      { seed: 9142026, numRuns: 300 },
    );
    save('generated', { seed: 9142026, runs: histories.length, histories });
  }, 60_000);
});

describe('effective counterexamples to tempting receive shortcuts', () => {
  it('equal state vectors can hide different deletion coverage in a proposed baseline', () => {
    const f = sources(),
      complete = new Y.Doc(),
      omittedDelete = new Y.Doc();
    try {
      Y.applyUpdate(complete, f.baseline);
      Y.applyUpdate(omittedDelete, f.baseline);
      complete.getText('master').delete(0, 1);
      expect(Y.encodeStateVector(complete)).toEqual(Y.encodeStateVector(omittedDelete));
      expect(Y.equalSnapshots(Y.snapshot(complete), Y.snapshot(omittedDelete))).toBe(false);
      save('control-deletion-coverage', {
        sameStateVector: true,
        complete: complete.getText('master').toString(),
        omittedDeletion: omittedDelete.getText('master').toString(),
      });
    } finally {
      complete.destroy();
      omittedDelete.destroy();
    }
  });
  it('a valid head cannot choose its own prefix, and a complete accepted suffix cannot replace genesis', async () => {
    const { f, r } = setup();
    try {
      const forgedBase = 'ab'.repeat(32),
        e = entry(f.entries[0]!, 1, forgedBase),
        subject = {
          workspace: r.authority.workspace,
          credential: A,
          position: 1,
          digest: e.digest,
          epoch: 1,
          parent: ZERO_REFUSAL,
        };
      expect(
        (await verifyPositionResponse(e.proof, { ...subject, previous: forgedBase }, r.authority))
          .kind,
      ).toBe('accepted');
      expect(
        (await verifyPositionResponse(e.proof, { ...subject, previous: ZERO_REFUSAL }, r.authority))
          .kind,
      ).toBe('unknown');
      await expect(deliver(r, e)).rejects.toThrow('Unproved');
      const empty = new Y.Doc();
      try {
        for (const v of f.entries) for (const u of v.updates) Y.applyUpdate(empty, u);
        expect(hasPendingUpdates(empty)).toBe(true);
        expect(empty.getText('master').toString()).not.toBe(f.expected);
      } finally {
        empty.destroy();
      }
      save('control-baseline', {
        signatureWithAttackerBaseline: 'accepted',
        heldBaseline: 'unknown',
        missingGenesis: 'suffix stays pending',
      });
    } finally {
      r.dispose();
    }
  });
  it('a cursor-first split commit is detected after the content half is lost', async () => {
    const { f, r } = setup();
    try {
      await deliver(r, f.entries[0]!);
      r.disk.content = [];
      expect(r.cursor[A]).toBe(1);
      expect(() => r.restart()).toThrow('Content does not cover');
      save('control-split', {
        received: 1,
        contentRecords: 0,
        oracle: 'cold replay rejects uncovered progress',
      });
    } finally {
      r.dispose();
    }
  });
  it('dropping pending data from a snapshot loses a received deletion when its target arrives later', () => {
    const { f, r } = setup();
    const pending = r.replay(f.entries[3]!.updates),
      restored = new Y.Doc();
    try {
      expect(pending.store.pendingDs).not.toBeNull();
      const incomplete = Y.encodeStateAsUpdate({
        ...pending,
        store: { ...pending.store, pendingStructs: null, pendingDs: null },
      } as typeof pending);
      Y.applyUpdate(restored, incomplete);
      for (const e of f.entries.slice(0, 3)) for (const u of e.updates) Y.applyUpdate(restored, u);
      expect(restored.getText('master').toString()).not.toBe(f.expected);
      save('control-pending', {
        expected: f.expected,
        afterDroppingPendingDeletion: restored.getText('master').toString(),
      });
    } finally {
      pending.destroy();
      restored.destroy();
      r.dispose();
    }
  });
  it('promoting a remote dependency before commit can acknowledge a local edit that disappears on cold replay', () => {
    const { f, r } = setup(),
      live = r.replay(f.entries[0]!.updates),
      cold = r.replay([]);
    try {
      live.clientID = 2000;
      const sv = Y.encodeStateVector(live);
      live.getText('master').insert(5, 'local');
      const admitted = new Uint8Array(Y.encodeStateAsUpdate(live, sv));
      Y.applyUpdate(cold, admitted);
      expect(cold.getText('master').toString()).toBe('base');
      expect(hasPendingUpdates(cold)).toBe(true);
      save('control-early-promotion', {
        beforeKill: live.getText('master').toString(),
        coldWithoutRemoteCommit: cold.getText('master').toString(),
      });
    } finally {
      live.destroy();
      cold.destroy();
      r.dispose();
    }
  });
  it('one global receive cursor skips a different publisher at the same position', () => {
    const { f, r } = setup(),
      doc = r.replay([]);
    let cursor = 0;
    try {
      for (const e of f.entries) {
        if (e.position <= cursor) continue;
        for (const u of e.updates) Y.applyUpdate(doc, u);
        cursor = e.position;
      }
      expect(doc.getText('master').toString()).not.toBe(f.expected);
      save('control-global-cursor', {
        expected: f.expected,
        actual: doc.getText('master').toString(),
        cursor,
      });
    } finally {
      doc.destroy();
      r.dispose();
    }
  });
  it('the raw capture primitive can relabel received bytes, so it cannot serve as authenticated ingress', async () => {
    const { f, r } = setup();
    try {
      const e = f.entries[0]!,
        a = r.authority,
        pub = await crypto.subtle.importKey(
          'raw',
          new Uint8Array(Buffer.from(a.members[A]!.publicKey, 'hex')),
          'Ed25519',
          false,
          ['verify'],
        );
      const body = await openNetworkEnvelope(
        e.envelope,
        { v: 2, workspace_id: a.workspace, credential_id: A, epoch: 1, gen: 1 },
        pub,
        generationKey,
      );
      const route = {
        workspace: a.workspace,
        credential: READER,
        principal: READER,
        epoch: 1,
        generation: 1,
      };
      const relabeled = decodeSourceCapsule(
        makeSourceCapsule(
          route,
          body.updates.map((bytes) => ({ actor: READER, kind: 'human', bytes })),
        ),
        route,
      );
      expect(relabeled.sources[0]!.bytes).toEqual(e.updates[0]);
      expect(relabeled.credential).not.toBe(e.publisher);
      await deliver(r, e);
      expect(r.captures).toHaveLength(0);
      save('control-relabel', {
        originalPublisher: A,
        newCapsulePublisher: relabeled.credential,
        sameUpdate: true,
        correctReceiverCapsules: 0,
      });
    } finally {
      r.dispose();
    }
  });
});
