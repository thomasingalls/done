// Disposable signed service ledger. Run serially; JSONL on stdout, no production state.
import assert from 'node:assert/strict';
import { createHash, sign, randomBytes } from 'node:crypto';
import { authorityFixture } from '../../test/account-authority/fixtures.mjs';
import { historyExchangeMessage } from '../../account-protocol/historyExchange.ts';
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
    const general = process.argv.includes('--membership');
    const authority = general ? authorityFixture(t) : undefined;
    const x = await ready(
      t,
      general
        ? {
            authority,
            sessions: { pin: authority.pin, operatorKey: authority.key },
            membershipContinuation: true,
            now: () => 1000,
          }
        : {},
    );
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
    if (general)
      for (let i = 0; i < 5; i++) {
        const request = {
          v: 1,
          kind: 'history-checkpoint-request',
          workspaceId: x.workspace,
          lineageId: x.offer.epoch.lineageId,
          epoch: 1,
          head: x.offer.head,
          credentialId: x.credential,
          nonce: randomBytes(32).toString('hex'),
          expiresAt: 61000,
          action: 'read',
          payload: 'catalog',
          signature: '00'.repeat(64),
        };
        request.signature = sign(
          null,
          await historyExchangeMessage(request),
          x.s.privateKey,
        ).toString('hex');
        const begin = performance.now();
        const result = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.page.heads[0].position, depth + 5);
        console.log(
          JSON.stringify({ depth, kind: 'catalog', sample: i, ms: performance.now() - begin }),
        );
      }
    if (x.f.core.deliveryVerificationStatus)
      console.log(
        JSON.stringify({
          depth,
          kind: 'verification-counts',
          ...x.f.core.deliveryVerificationStatus,
        }),
      );
    if (depth === 3072 && process.argv.includes('--audit') && x.f.core.auditDelivery) {
      const begin = performance.now();
      x.f.core.auditDelivery();
      const requests = [];
      while (x.f.core.deliveryVerificationStatus.auditActive) {
        const start = performance.now();
        const response = await read(x, query(x, depth + 5));
        assert.equal(response.kind, 'decision', JSON.stringify(response));
        requests.push(performance.now() - start);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      console.log(
        JSON.stringify({
          depth,
          kind: 'concurrent-audit',
          ms: performance.now() - begin,
          requestMs: requests,
          status: x.f.core.deliveryVerificationStatus,
        }),
      );
    }
    while (cleanups.length) await cleanups.shift()();
  }
} finally {
  while (cleanups.length) await cleanups.shift()();
}
