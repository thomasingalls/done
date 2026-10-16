import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, inventory, mutate, proof } from '../account-service-delivery/fixtures.mjs';
import { query, read, pageProof } from './oracle.mjs';

test('restored ledger bytes stay quarantined until a new owner verifies the full prefix', async (t) => {
  const x = await ready(t),
    w = x.make(),
    r = await x.call(w),
    retained = [{ w, r }];
  proof(r, x.offer.epoch.acceptancePublicKey, w.subject);
  const original = inventory(x),
    ordinal = x.f.rows('delivery_decisions').at(-1).ordinal;
  mutate(x, (db) =>
    db.prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?').run(ordinal + 1, ordinal),
  );
  assert.deepEqual(await read(x, query(x)), { kind: 'unknown', reason: 'ledger-integrity' });
  mutate(x, (db) =>
    db.prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?').run(ordinal, ordinal + 1),
  );
  assert.equal(inventory(x), original);
  const next = x.make(2, 'after-restart');
  assert.deepEqual(await read(x, query(x)), { kind: 'unknown', reason: 'ledger-integrity' });
  assert.deepEqual(await x.call(next), { kind: 'unknown', reason: 'ledger-integrity' });
  assert.equal(inventory(x), original);
  x.f.restart();
  x.authority.restart();
  const q = query(x);
  pageProof(await read(x, q), q, x, retained);
  const nextResult = await x.call(next);
  const first = proof(r, x.offer.epoch.acceptancePublicKey, w.subject);
  proof(nextResult, x.offer.epoch.acceptancePublicKey, next.subject, first.head.link);
  retained.push({ w: next, r: nextResult });
  const final = query(x, 0, 2);
  pageProof(await read(x, final), final, x, retained);
});
