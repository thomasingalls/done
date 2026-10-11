// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { Y, forkDoc, sameDocState, hasPendingUpdates, prepareDocCoverage } from '../src/crdt/yjs';
import { createInboundCoverage, verifyInboundCoverage } from '../src/crdt/inboundLedger';
import type { OpenedRecord } from '../src/crdt/contentRecord';

const verdict = (fn: () => boolean) => {
  try {
    return fn();
  } catch {
    return false;
  }
};
// Independent prior algorithm, including private fork encoding and complete pending-aware equality.
const reference = (doc: Y.Doc, update: Uint8Array) => {
  const copy = forkDoc(doc, false);
  try {
    Y.applyUpdate(copy, update);
    return sameDocState(doc, copy);
  } finally {
    copy.destroy();
  }
};
const row = (bytes: Uint8Array<ArrayBuffer>, seq = 1): OpenedRecord => ({
  seq,
  gen: 1,
  kind: 'state',
  bytes,
});

it('checks every source independently, survives refusal/malformed input, detaches its baseline and closes', () => {
  const doc = new Y.Doc({ gc: false });
  doc.getText('t').insert(0, 'before');
  const before = Y.encodeStateAsUpdate(doc),
    probe = prepareDocCoverage(doc);
  doc.getText('t').insert(6, ' missing');
  const absent = Y.encodeStateAsUpdate(doc);
  try {
    expect(probe.check(before)).toBe(true);
    expect(probe.check(absent)).toBe(false);
    // Reusing the mutated scratch document would incorrectly accept the second attempt.
    expect(probe.check(absent)).toBe(false);
    expect(() => probe.check(new Uint8Array([255]))).toThrow();
    expect(probe.check(before)).toBe(true);
    expect(probe.check(absent)).toBe(false);
  } finally {
    probe.dispose();
    doc.destroy();
  }
  probe.dispose();
  expect(() => probe.check(before)).toThrow('disposed');
});

it('retains exact pending structs and deletes, and does not cache a negative across arriving dependencies', () => {
  const author = new Y.Doc({ gc: false }),
    target = new Y.Doc({ gc: false });
  const updates: Uint8Array<ArrayBuffer>[] = [];
  author.on('update', (u: Uint8Array) => updates.push(new Uint8Array(u)));
  author.getText('t').insert(0, 'parent');
  author.getText('t').insert(6, ' child');
  author.getText('t').delete(0, 2);
  Y.applyUpdate(target, updates[1]!);
  Y.applyUpdate(target, updates[2]!);
  expect(hasPendingUpdates(target)).toBe(true);
  const probe = prepareDocCoverage(target),
    coverage = createInboundCoverage({ incremental: true });
  try {
    for (const u of updates) expect(probe.check(u)).toBe(reference(target, u));
    const initial = [row(new Uint8Array(Y.encodeStateAsUpdate(target)))];
    expect(() => coverage.check(initial, [updates[0]!])).toThrow('coverage');
    Y.applyUpdate(target, updates[0]!);
    const complete = [row(new Uint8Array(Y.encodeStateAsUpdate(target)), 2)];
    expect(() => coverage.check(complete, updates)).not.toThrow();
    // A separate cold reference independently verifies the full set.
    expect(() => verifyInboundCoverage(complete, updates)).not.toThrow();
  } finally {
    coverage.clear();
    probe.dispose();
    author.destroy();
    target.destroy();
  }
});

it('matches independent full checks through 120 generated mixed-type, GC and partial-delivery histories', () => {
  let accepted = 0,
    refused = 0,
    pending = 0;
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          op: fc.nat(8),
          author: fc.boolean(),
          deliver: fc.boolean(),
          reverse: fc.nat(30),
        }),
        { minLength: 5, maxLength: 28 },
      ),
      fc.boolean(),
      (actions, gc) => {
        const a = new Y.Doc({ gc: false }),
          b = new Y.Doc({ gc: false }),
          content = new Y.Doc({ gc });
        a.clientID = 481;
        b.clientID = 482;
        const updates: Uint8Array<ArrayBuffer>[] = [];
        for (const doc of [a, b])
          doc.on('update', (u: Uint8Array) => updates.push(new Uint8Array(u)));
        try {
          for (const [i, action] of actions.entries()) {
            const doc = action.author ? a : b,
              text = doc.getText('t');
            switch (action.op) {
              case 0:
                if (text.length) text.delete(0, 1);
                break;
              case 1:
                doc.getMap('m').set('json', { nested: [i, null, 'x'.repeat(50)], edge: '\ud800' });
                break;
              case 2:
                doc.getMap('m').set('binary', new Uint8Array([i, 0, 255]));
                break;
              case 3:
                doc.getMap('m').set('legacy', new Y.Array());
                (doc.getMap('m').get('legacy') as Y.Array<unknown>).insert(0, [{ a: i }, null]);
                break;
              case 4:
                doc.getArray('array').insert(0, [String(i), false]);
                break;
              case 5:
                if (text.length) text.format(0, 1, { bold: i % 2 === 0 });
                break;
              case 6:
                Y.applyUpdate(doc, Y.encodeStateAsUpdate(action.author ? b : a));
                break;
              default:
                text.insert(text.length, i % 2 ? 'long text '.repeat(6) : '\ud800x\udfff');
            }
          }
          for (let i = 0; i < updates.length; i++) {
            // Replay a deterministic, possibly incomplete and out-of-order subset.
            if (actions[i % actions.length]!.deliver)
              Y.applyUpdate(
                content,
                updates[(i + actions[i % actions.length]!.reverse) % updates.length]!,
              );
          }
          if (hasPendingUpdates(content)) pending++;
          const before = forkDoc(content, false),
            probe = prepareDocCoverage(content);
          try {
            const candidates = [...updates, Y.encodeStateAsUpdate(content), new Uint8Array([255])];
            if (updates.length) candidates.push(Y.mergeUpdates(updates));
            for (const u of candidates) {
              const saved = u.slice(),
                expected = verdict(() => reference(content, u));
              expect(verdict(() => probe.check(u))).toBe(expected);
              expect(u).toEqual(saved);
              if (expected) accepted++;
              else refused++;
            }
            expect(sameDocState(content, before)).toBe(true);
          } finally {
            probe.dispose();
            before.destroy();
          }
        } finally {
          a.destroy();
          b.destroy();
          content.destroy();
        }
      },
    ),
    { seed: 111026, numRuns: 120 },
  );
  expect(accepted).toBeGreaterThan(100);
  expect(refused).toBeGreaterThan(100);
  expect(pending).toBeGreaterThan(10);
});

it('preserves the normalization fallback across deleted content and split boundaries', () => {
  const source = new Y.Doc({ gc: false }),
    compact = new Y.Doc();
  source.getText('t').insert(0, 'a'.repeat(100));
  const insertion = Y.encodeStateAsUpdate(source);
  source.getText('t').delete(4, 80);
  Y.applyUpdate(compact, Y.encodeStateAsUpdate(source));
  const probe = prepareDocCoverage(compact);
  try {
    for (const update of [
      insertion,
      Y.encodeStateAsUpdate(source),
      new Uint8Array([0, 0]),
      insertion,
    ]) {
      expect(probe.check(update)).toBe(reference(compact, update));
    }
  } finally {
    probe.dispose();
    compact.destroy();
    source.destroy();
  }
});

it('keeps simultaneous baselines isolated, including legacy JSON, binary and long strings', () => {
  const a = new Y.Doc({ gc: false }),
    b = new Y.Doc({ gc: false });
  a.getText('t').insert(0, 'long baseline '.repeat(20) + '\ud800');
  const legacy = a.getArray('legacy');
  legacy.insert(0, [null, null]);
  legacy._start!.content = new Y.ContentJSON([{ value: 'legacy'.repeat(20) }, undefined]);
  a.getMap('m').set('binary', new Uint8Array([0, 3, 255]));
  b.getText('t').insert(0, 'different baseline '.repeat(20));
  const aa = Y.encodeStateAsUpdate(a),
    bb = Y.encodeStateAsUpdate(b),
    pa = prepareDocCoverage(a),
    pb = prepareDocCoverage(b);
  try {
    expect(pa.check(aa)).toBe(reference(a, aa));
    expect(pb.check(bb)).toBe(true);
    expect(pa.check(bb)).toBe(false);
    expect(pb.check(aa)).toBe(false);
    pa.dispose();
    for (let i = 0; i < 4; i++) {
      expect(reference(a, aa)).toBe(true);
      expect(pb.check(bb)).toBe(true);
    }
  } finally {
    pa.dispose();
    pb.dispose();
    a.destroy();
    b.destroy();
  }
});
