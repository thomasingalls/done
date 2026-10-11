// Disposable signed service ledger. Run serially; JSONL on stdout, no production state.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ready, mutate, ZERO, link, lp } from '../../test/account-service-delivery/fixtures.mjs';
import { query, read } from '../../test/account-service-inbound/oracle.mjs';
import {
  read as snapshot,
  verifyCurrentWorkspaceAuthority,
  census,
} from '../../account-service/delivery.ts';
import { DatabaseSync } from 'node:sqlite';
const digest = (b) => createHash('sha256').update(b).digest('hex');
const cleanups = [];
const t = { after: (fn) => cleanups.push(fn) };
try {
  for (const depth of [0, 128, 512, 1024, 3072]) {
    const x = await ready(t);
    const issuer = x.authority.owner.decideSubmission({ decideSubmission: (_input, i) => i }, {});
    const db = new DatabaseSync(x.f.path);
    const s = snapshot(db, x.workspace);
    const auth = await verifyCurrentWorkspaceAuthority(s, issuer);
    let previous = ZERO,
      commitment = ZERO;
    db.exec('BEGIN IMMEDIATE');
    for (let n = 1; n <= depth; n++) {
      const w = x.make(n, 'signed benchmark position ' + n);
      previous = link(w.subject, previous);
      const response = issuer.issue(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey, {
        kind: 'accepted',
        head: {
          workspace: x.workspace,
          credential: x.credential,
          position: n,
          epoch: 1,
          link: previous,
          final: false,
          signature: '00'.repeat(64),
        },
        leaf: { epoch: 1, digest: w.subject.digest },
      });
      commitment = digest(
        lp(
          'done/service-delivery-chain/v1',
          commitment,
          String(n),
          digest(w.bytes),
          digest(response),
        ),
      );
      db.prepare('INSERT INTO delivery_decisions VALUES (?,?,?,?,?,?,?,?)').run(
        s.account.id,
        n,
        n,
        w.subject.digest,
        1,
        'accepted',
        w.bytes,
        response,
      );
    }
    if (depth)
      db.prepare('UPDATE promotions SET delivery_witness=? WHERE account_id=?').run(
        JSON.stringify(
          issuer.witness(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey, auth.scope, {
            events: depth,
            hash: commitment,
          }),
        ),
        s.account.id,
      );
    db.exec('COMMIT');
    const start = performance.now();
    const verified = await census(snapshot(db, x.workspace), auth);
    assert.equal(verified.through, depth);
    console.log(
      JSON.stringify({ depth, kind: 'seed-reference-census', ms: performance.now() - start }),
    );
    db.close();
    for (let i = 0; i < 6; i++) {
      const q = query(x, depth ? Math.floor(depth / 2) : 0);
      const begin = performance.now();
      const r = await read(x, q);
      assert.equal(r.kind, 'decision', JSON.stringify(r));
      console.log(
        JSON.stringify({
          depth,
          kind: i ? 'warm-read' : 'cold-read',
          sample: i,
          ms: performance.now() - begin,
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      const w = x.make(depth + i + 1, 'next signed position');
      const begin = performance.now();
      const r = await x.call(w);
      assert.equal(r.kind, 'decision', JSON.stringify(r));
      console.log(
        JSON.stringify({ depth, kind: 'submit', sample: i, ms: performance.now() - begin }),
      );
    }
    while (cleanups.length) await cleanups.shift()();
  }
} finally {
  while (cleanups.length) await cleanups.shift()();
}
