import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from '../account-core/fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { prepared, hash } from '../account-admission/core-fixtures.mjs';
import { canonical, prove, inspectChallenge } from '../account-activation/oracle.mjs';
export { canonical, hash, prove };
export const evidence = (name, value) => {
  if (!process.env.ACCOUNT_REPORT_DIR) return;
  mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
  writeFileSync(
    join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
    JSON.stringify(value, null, 2) + '\n',
  );
};
export function database(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => {
          assert.match(name, /^[a-z_]+$/);
          return [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()];
        }),
    );
  } finally {
    db.close();
  }
}
export async function pair(t, options = {}) {
  const f = fixture(t, options, options.Core),
    authority = authorityFixture(t);
  const accounts = [];
  for (let i = 0; i < 2; i++)
    accounts.push(
      await prepared(t, {
        fixture: f,
        authority,
        alg: i === 0 ? -8 : -7,
        scope: {
          principalId: (i ? '12' : '11').repeat(16),
          workspaceId: (i ? '23' : '22').repeat(16),
          lineageId: (i ? '34' : '33').repeat(32),
        },
        signer: (i ? '56' : '55').repeat(16),
      }),
    );
  for (const field of ['accountId', 'credentialId'])
    assert.notEqual(accounts[0].account.result[field], accounts[1].account.result[field]);
  assert.notEqual(accounts[0].account.retryKey, accounts[1].account.retryKey);
  const saved = [{}, {}];
  const p = {
    f,
    authority,
    accounts,
    saved,
    inventory: () => ({ service: database(f.path), authority: database(authority.path) }),
    restart() {
      f.restart();
      authority.restart();
    },
    async offer(i) {
      const x = accounts[i],
        r = await x.begin();
      assert.equal(r.kind, 'promotion-offer', JSON.stringify(r));
      saved[i].offer = r;
      return r;
    },
    async challenge(i) {
      const x = accounts[i],
        s = saved[i];
      if (!s.offer) await p.offer(i);
      s.completion ??= await x.completion(s.offer);
      s.input = {
        retryKey: x.account.retryKey,
        requestDigest: s.offer.epoch.requestDigest,
        completion: s.completion,
      };
      const c = await authority.owner.challengePromotion(f.core, s.input);
      assert.equal(c.kind, 'promotion-activation-challenge', JSON.stringify(c));
      inspectChallenge(c, x, s.offer, s.completion);
      s.challenge = c;
      s.proof = prove(x, s.input, c, { count: 17 + i });
      return c;
    },
    async finish(i) {
      const s = saved[i];
      if (!s.proof) await p.challenge(i);
      const r = await authority.owner.finishPromotion(f.core, s.proof);
      assert.equal(r.kind, 'promotion-receipt', JSON.stringify(r));
      s.receipt = r;
      return r;
    },
    pending(i, j = i, abandon = false) {
      return f.core.pendingPreparation(
        { retryKey: accounts[i].account.retryKey, accountId: accounts[j].account.result.accountId },
        abandon,
      );
    },
  };
  return p;
}
export async function unchanged(p, name, operation) {
  const before = canonical(p.inventory());
  const result = await operation();
  assert.equal(result.ok, false, name + ': expected refusal, got ' + JSON.stringify(result));
  assert.notEqual(
    result.refusal,
    'malformed',
    name + ': a structural error masked the binding test',
  );
  assert.equal(canonical(p.inventory()), before, name + ': changed persisted rows');
  return { name, refusal: result.refusal, stateHash: hash(before) };
}
export function otherRows(p, actor, snapshot = p.inventory()) {
  const x = p.accounts[actor],
    accountId = x.account.result.accountId,
    attemptId = x.account.result.attemptId;
  return {
    authority: snapshot.authority,
    service: Object.fromEntries(
      Object.entries(snapshot.service).map(([table, rows]) => [
        table,
        rows.filter((row) => {
          if (table === 'accounts') return row.id !== accountId;
          if (table === 'ceremonies') return row.attempt_id !== attemptId;
          return row.account_id !== accountId;
        }),
      ]),
    ),
  };
}
export function assertOtherUnchanged(p, actor, before) {
  assert(
    canonical(otherRows(p, actor)) === canonical(otherRows(p, actor, before)),
    'neighbor rows changed',
  );
}
// One fixture lifetime per generated history; do not accumulate hundreds of live DBs
// and retained secret handles until the enclosing property test finally ends.
export async function withPair(options, work) {
  const cleanup = [];
  try {
    return await work(await pair({ after: (fn) => cleanup.push(fn) }, options));
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
}
