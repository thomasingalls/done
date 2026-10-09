import test from 'node:test';
import assert from 'node:assert/strict';
import { client as c } from './client.mjs';
import { fixture, signed } from '../account-membership/fixtures.mjs';

async function setup(t) {
  const f = fixture(),
    history = await c.verifyEarlyHistory(f.f.base),
    authority = c.historyMembership(history),
    p = c.membershipState(authority),
    key = new Uint8Array(32).fill(47),
    doc = new c.Y.Doc({ gc: false });
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'snapshot-only writing');
  const producer = f.context.existing.id,
    sign = async (bytes) => signed(f.keys.existing, bytes),
    cp = await c.createHistoryCheckpoint(doc, doc, key, authority, producer, p.heads, null, sign),
    admission = await c.admitHistoryCheckpoint(cp, key, authority, producer, doc, sign),
    base = {
      baseline: { kind: 'promotion-genesis', id: 'ab'.repeat(32) },
      authority: history.current,
      checkpointAnchor: authority,
      reader: { id: producer, publicKey: history.signingKey, active: true },
      publisher: { id: producer },
      generation: 1,
      generationKey: key,
    },
    event = {
      baseline: base.baseline.id,
      workspace: p.workspaceId,
      lineage: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      reader: producer,
      checkpoint: cp,
      admission,
    },
    bytes = c.encodeHistoryInstall(event);
  t.after(() => {
    doc.destroy();
    key.fill(0);
  });
  return { f, history, authority, p, key, doc, cp, admission, base, event, bytes, sign, producer };
}
const lifetime = { assertCurrent() {} };
const row = (kind, bytes, seq) => ({ kind, bytes, seq, gen: 1 });

test('installed proof cold-replays with local originals and compaction, without advancing receive cuts', async (t) => {
  const f = await setup(t),
    local = new c.Y.Doc({ gc: false });
  t.after(() => local.destroy());
  local.getText('master').insert(0, 'offline local writing');
  const original = c.Y.encodeStateAsUpdate(local),
    result = await c.verifyHistoryInstall(f.base, f.bytes, undefined, lifetime);
  c.Y.applyUpdate(local, result.update);
  assert(local.getText('master').toString().includes('offline local writing'));
  assert(local.getText('master').toString().includes('snapshot-only writing'));
  const evidence = row('heads', f.bytes, 3),
    census = { entries: [], installations: [{ record: evidence, event: f.event }] },
    records = [row('update', original, 1), row('update', result.update, 2), evidence];
  const state = await c.verifyInboundLedger(census, records, f.base, lifetime);
  assert.deepEqual(state.installedHistory, result.installed);
  assert.equal(state.prefix.position, 0);
  assert.equal(state.prefix.observedThrough, 0);
  await c.verifyInboundLedger(
    census,
    [row('state', c.Y.encodeStateAsUpdate(local), 4), evidence],
    f.base,
    lifetime,
  );
  await assert.rejects(
    c.verifyInboundLedger(census, [records[0], evidence], f.base, lifetime),
    /coverage/,
  );
  result.update.fill(0);
});

test('cold replay authenticates historical eligibility after certification, without accepting cloned brands', async (t) => {
  const f = await setup(t),
    history = await c.verifyCertificationHistory(
      f.f.certification,
      f.f.f.successor,
      f.f.f.base,
      f.f.anchor,
    );
  assert.equal(c.membershipState(c.historyMembershipAt(history, 1)).epoch, 1);
  const later = { ...f.base, history, authority: history.current };
  (await c.verifyHistoryInstall(later, f.bytes, undefined, lifetime)).update.fill(0);
  await assert.rejects(
    c.verifyHistoryInstall({ ...later, history: { ...history } }, f.bytes, undefined, lifetime),
    /Unverified/,
  );
  await assert.rejects(
    c.verifyHistoryInstall(
      { ...f.base, checkpointAnchor: { ...f.authority } },
      f.bytes,
      undefined,
      lifetime,
    ),
    /Unverified/,
  );
});

test('wrong slot, reader, membership head, admission and ciphertext all refuse before installation', async (t) => {
  const f = await setup(t);
  for (const change of [
    (v) => (v.baseline = 'cc'.repeat(32)),
    (v) => (v.reader = 'cc'.repeat(16)),
    (v) => (v.workspace = 'cc'.repeat(16)),
    (v) => (v.lineage = 'cc'.repeat(32)),
    (v) => (v.head = 'cc'.repeat(32)),
    (v) => (v.epoch = 2),
    (v) => (v.admission.signature = 'cc'.repeat(64)),
    (v) => (v.checkpoint.ct = 'cc'.repeat(v.checkpoint.ct.length / 2)),
  ]) {
    const event = structuredClone(f.event);
    change(event);
    await assert.rejects(async () =>
      c.verifyHistoryInstall(f.base, c.encodeHistoryInstall(event), undefined, lifetime),
    );
  }
  await assert.rejects(
    c.verifyHistoryInstall(
      { ...f.base, generationKey: new Uint8Array(32) },
      f.bytes,
      undefined,
      lifetime,
    ),
  );
});

test('duplicate, regression and immediate parent fork refuse; cancellation erases the prepared update', async (t) => {
  const f = await setup(t),
    first = await c.verifyHistoryInstall(f.base, f.bytes, undefined, lifetime);
  first.update.fill(0);
  await assert.rejects(
    c.verifyHistoryInstall(f.base, f.bytes, first.installed, lifetime),
    /regressed/,
  );
  f.doc.getText('master').insert(0, 'new snapshot:');
  const cp = await c.createHistoryCheckpoint(
      f.doc,
      f.doc,
      f.key,
      f.authority,
      f.producer,
      f.p.heads,
      f.cp,
      f.sign,
    ),
    admission = await c.admitHistoryCheckpoint(cp, f.key, f.authority, f.producer, f.doc, f.sign),
    next = c.encodeHistoryInstall({ ...f.event, checkpoint: cp, admission });
  (await c.verifyHistoryInstall(f.base, next, first.installed, lifetime)).update.fill(0);
  await assert.rejects(
    c.verifyHistoryInstall(f.base, next, { ...first.installed, hash: 'dd'.repeat(32) }, lifetime),
    /forked/,
  );
  let checks = 0;
  await assert.rejects(
    c.verifyHistoryInstall(f.base, next, first.installed, {
      assertCurrent() {
        if (++checks === 2) throw Error('owner closed');
      },
    }),
    /owner closed/,
  );
});

test('installation captures the opener and proof before async verification', async (t) => {
  const f = await setup(t),
    pending = c.verifyHistoryInstall(f.base, f.bytes, undefined, lifetime);
  f.key.fill(0);
  f.bytes.fill(0);
  const result = await pending,
    doc = new c.Y.Doc({ gc: false });
  try {
    c.Y.applyUpdate(doc, result.update);
    assert.equal(doc.getText('master').toString(), 'snapshot-only writing');
  } finally {
    result.update.fill(0);
    doc.destroy();
  }
});

test('combined proof and plaintext refuse the native admission bound before publication', async (t) => {
  const f = await setup(t);
  f.doc.getText('master').insert(0, 'x'.repeat(1450 * 1024));
  const cp = await c.createHistoryCheckpoint(
      f.doc,
      f.doc,
      f.key,
      f.authority,
      f.producer,
      f.p.heads,
      null,
      f.sign,
    ),
    admission = await c.admitHistoryCheckpoint(cp, f.key, f.authority, f.producer, f.doc, f.sign),
    bytes = c.encodeHistoryInstall({ ...f.event, checkpoint: cp, admission });
  assert(bytes.length < 4 * 1024 * 1024, 'proof alone fits');
  await assert.rejects(
    c.verifyHistoryInstall(f.base, bytes, undefined, lifetime),
    c.HistoryInstallSizeError,
  );
});
