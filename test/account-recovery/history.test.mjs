import { recoveryIntentMessage } from '../../account-protocol/recoveryTransition.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, randomBytes } from 'node:crypto';
import { client as c, sourceFixture } from './source-fixtures.mjs';
import { recoveryReader } from './read-fixtures.mjs';
import { historyExchangeMessage } from '../../account-protocol/historyExchange.ts';
import { mutate } from '../account-successor/service-fixtures.mjs';
const zero = '00'.repeat(32);
async function owner(x) {
  const a = await c.verifyEarlyMembership({
    pin: x.authority.pin,
    request: x.request,
    receipt: x.receipt,
  });
  const p = c.membershipState(a),
    signer = async (bytes) => sign(null, bytes, x.s.privateKey).toString('hex');
  const exchange = async (action, payload) => {
    const r = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      credentialId: x.credential,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: 61000,
      action,
      payload,
      signature: zero.repeat(2),
    };
    r.signature = await signer(await historyExchangeMessage(r));
    const result = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.page;
  };
  return {
    exchange,
    async create(doc, previous = null) {
      const page = await exchange('read', 'latest');
      const cp = await c.createHistoryCheckpoint(
        doc,
        doc,
        x.key,
        a,
        x.credential,
        page.heads,
        previous,
        signer,
      );
      await exchange('publish', cp);
      return {
        cp,
        admit: async () =>
          exchange(
            'admit',
            await c.admitHistoryCheckpoint(cp, x.key, a, x.credential, doc, signer),
          ),
      };
    },
  };
}
async function input(x) {
  const r = await recoveryReader(x);
  return {
    ...x.input,
    prepared: r.verified.prepared,
    begin: r.input,
    bootstrap: r.bootstrap,
    read: r.read,
    sign: async (bytes) =>
      Buffer.from(await crypto.subtle.sign('Ed25519', r.signer, bytes)).toString('hex'),
  };
}
function clone(doc) {
  const next = new c.Y.Doc({ gc: false });
  c.Y.applyUpdate(next, c.Y.encodeStateAsUpdate(doc));
  return next;
}

test('recovery reads the newest admitted snapshot plus suffix, including snapshot-only originals and deletions', async (t) => {
  const x = await sourceFixture(t),
    o = await owner(x),
    doc = clone(x.root);
  t.after(() => doc.destroy());
  doc.getText('master').insert(0, 'accepted before checkpoint\n');
  await x.append(1, [c.Y.encodeStateAsUpdate(doc)]);
  doc.getText('history-only').insert(0, 'original never uploaded separately');
  let cp = null;
  for (let i = 0; i < 3; i++) {
    if (i === 1) doc.getText('master').delete(0, 8);
    const created = await o.create(doc, cp);
    await created.admit();
    cp = created.cp;
  }
  // An already prepared recovery cannot quietly omit newly admitted history.
  await assert.rejects(c.readRecoverySource(x.input));
  const before = c.Y.encodeStateVector(doc);
  doc.getText('master').insert(doc.getText('master').length, 'accepted after checkpoint\n');
  await x.append(2, [c.Y.encodeStateAsUpdate(doc, before)]);
  const fresh = await input(x),
    requests = [];
  x.f.restart();
  x.authority.restart();
  const result = await c.readRecoverySource({
    ...fresh,
    read: async (r) => {
      requests.push(r);
      return fresh.read(r);
    },
  });
  const actual = new c.Y.Doc({ gc: false });
  try {
    c.Y.applyUpdate(actual, result.snapshot);
    assert(c.sameDocState(actual, doc));
    assert.equal(actual.getText('history-only').toString(), 'original never uploaded separately');
    assert.deepEqual(
      requests.filter((r) => !r.history && !r.checkpoint).map((r) => r.after),
      [1],
    );
    assert.equal(result.heads[0].position, 2);
  } finally {
    result.snapshot.fill(0);
    actual.destroy();
  }
});

test('a pending unadmitted history snapshot is not a recovery baseline', async (t) => {
  const x = await sourceFixture(t),
    o = await owner(x),
    doc = clone(x.root);
  t.after(() => doc.destroy());
  doc.getText('pending-only').insert(0, 'not admitted');
  await o.create(doc);
  const result = await c.readRecoverySource(await input(x)),
    actual = new c.Y.Doc({ gc: false });
  try {
    c.Y.applyUpdate(actual, result.snapshot);
    assert(c.sameDocState(actual, x.root));
  } finally {
    actual.destroy();
    result.snapshot.fill(0);
  }
});

test('history changes during replay force recovery to restart; damaged admission cannot become a baseline', async (t) => {
  const x = await sourceFixture(t),
    o = await owner(x),
    doc = clone(x.root);
  t.after(() => doc.destroy());
  doc.getText('history-only').insert(0, 'must not be missed');
  const fresh = await input(x);
  let changed = false;
  await assert.rejects(
    c.readRecoverySource({
      ...fresh,
      read: async (r) => {
        const page = await fresh.read(r);
        if (r.history && !changed) {
          changed = true;
          const p = await o.create(doc);
          await p.admit();
        }
        return page;
      },
    }),
  );
  assert(changed);
  mutate(x, (db) => {
    const row = db.prepare('SELECT admission FROM history_checkpoint_records').get();
    const a = JSON.parse(row.admission);
    a.signature = zero.repeat(2);
    db.prepare('UPDATE history_checkpoint_records SET admission=?').run(JSON.stringify(a));
  });
  await assert.rejects(c.readRecoverySource(await input(x)));
});

test('snapshot-only writing survives recovery commit, lost reply and a second recovery; a late snapshot fences commit', async (t) => {
  let lose = false;
  const x = await sourceFixture(t, {
      hook: (point, op) => {
        if (lose && point === 'after-commit' && op === 'commit-recovery') {
          lose = false;
          throw Error('lost recovery reply');
        }
      },
    }),
    o = await owner(x),
    doc = clone(x.root);
  t.after(() => doc.destroy());
  doc.getText('history-only').insert(0, 'recover this original');
  let saved = await o.create(doc);
  await saved.admit();
  const first = await c.prepareRecoveryCommit(await input(x));
  t.after(() => first.key.fill(0));
  doc
    .getText('history-only')
    .insert(doc.getText('history-only').length, ' and this later original');
  saved = await o.create(doc, saved.cp);
  await saved.admit();
  const commit = (r) => x.authority.owner.commitRecovery(x.f.core, r);
  assert.equal((await commit(first.request)).refusal, 'state-changed');
  assert.equal(x.f.rows('recovery_successors').length, 0);
  const secondInput = await input(x);
  const second = await c.prepareRecoveryCommit(secondInput);
  t.after(() => second.key.fill(0));
  // A correctly re-signed old-client intent cannot omit the archive it was required to replay.
  const omitted = structuredClone(second.request);
  delete omitted.intent.historyCheckpoint;
  omitted.intent.signature = await secondInput.sign(await recoveryIntentMessage(omitted.intent));
  assert.equal((await commit(omitted)).refusal, 'state-changed');
  assert.equal(x.f.rows('recovery_successors').length, 0);
  lose = true;
  assert.equal((await commit(second.request)).ok, false);
  x.f.restart();
  x.authority.restart();
  const committed = await commit(second.request);
  assert.equal(committed.stage, 'committed', JSON.stringify(committed));
  assert.deepEqual(await commit(second.request), committed);
  const reopened = await c.readRecoverySource(await input(x)),
    actual = new c.Y.Doc({ gc: false });
  try {
    c.Y.applyUpdate(actual, reopened.snapshot);
    assert(c.sameDocState(actual, doc));
    assert.equal(reopened.generation, 2);
  } finally {
    actual.destroy();
    reopened.snapshot.fill(0);
  }
});
