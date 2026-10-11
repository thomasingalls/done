import { Y } from '../../../../src/crdt/yjs';
import { createInboundCoverage, verifyInboundCoverage } from '../../../../src/crdt/inboundLedger';
import type { OpenedRecord } from '../../../../src/crdt/contentRecord';
const time = (f: () => void) => {
  const at = performance.now();
  f();
  return performance.now() - at;
};
const summary = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    p50: s[Math.floor(s.length / 2)],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
    samples: xs.length,
  };
};
export function run() {
  const results = [];
  for (const size of [1024, 128 * 1024, 1024 * 1024]) {
    const doc = new Y.Doc({ gc: false });
    doc.clientID = 101026;
    let first: Uint8Array = new Uint8Array();
    const capture = (u: Uint8Array) => {
      first = u.slice();
    };
    doc.once('update', capture);
    // Distinct prepended items prevent this from becoming a single large Yjs string struct.
    for (let n = 0; n < size / 32; n++)
      doc.getText('t').insert(0, 'abcdefghijklmnopqrstuvwxyz012345');
    doc.getText('t').delete(Math.floor(size / 3), Math.floor(size / 10));
    const snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
    const rows: OpenedRecord[] = [{ kind: 'state', seq: 10, gen: 1, bytes: snapshot }];
    const rebuild: number[] = [],
      miss: number[] = [],
      hit: number[] = [],
      replacement: number[] = [],
      full: number[] = [];
    for (let rep = 0; rep < 9; rep++) {
      const c = createInboundCoverage({ incremental: true });
      const r = time(() => c.prepare(rows));
      const bound = c.bind(rows);
      const m = time(() => bound.check(rows, [first]));
      const h =
        time(() => {
          for (let i = 0; i < 20; i++) bound.check(rows, [first]);
        }) / 20;
      const compacted = [{ ...rows[0]!, seq: 11 }];
      let relation: string = '';
      const x = time(() => {
        relation = c.prepare(compacted);
      });
      if (relation !== 'equivalent') throw Error('Exact replacement did not preserve coverage');
      c.check(compacted, [first]);
      c.clear();
      const f = time(() => verifyInboundCoverage(rows, [first]));
      if (rep) {
        rebuild.push(r);
        miss.push(m);
        hit.push(h);
        replacement.push(x);
        full.push(f);
      }
    }
    results.push({
      textBytes: size,
      structs: size / 32,
      encodedBytes: snapshot.length,
      rebuildMs: summary(rebuild),
      checkMissMs: summary(miss),
      checkPositiveMs: summary(hit),
      equivalentReplacementMs: summary(replacement),
      freshReferenceMs: summary(full),
    });
    doc.destroy();
    snapshot.fill(0);
    first.fill(0);
  }
  return results;
}
