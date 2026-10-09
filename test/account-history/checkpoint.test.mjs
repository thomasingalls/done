import test from 'node:test';
import assert from 'node:assert/strict';
import { client as c } from './client.mjs';
import { fixture, signed, message } from '../account-membership/fixtures.mjs';
import { checkpointFixture } from '../account-membership/replacement-checkpoint-fixture.mjs';
async function setup(t, two = false) {
  const f = fixture();
  const authority = two
    ? await c.verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor)
    : await c.verifyEarlyMembership(f.f.base);
  const p = c.membershipState(authority),
    doc = new c.Y.Doc({ gc: false }),
    local = new c.Y.Doc({ gc: false });
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'accepted writing');
  c.Y.applyUpdate(local, c.Y.encodeStateAsUpdate(doc));
  const key = new Uint8Array(32).fill(47),
    producer = f.context.existing.id;
  const sign = async (bytes) => signed(f.keys.existing, bytes);
  const create = (previous = null, heads = p.heads) =>
    c.createHistoryCheckpoint(doc, local, key, authority, producer, heads, previous, sign);
  t.after(() => {
    doc.destroy();
    local.destroy();
    key.fill(0);
  });
  return { f, p, authority, doc, local, key, producer, sign, create };
}
test('sole device can propose and admit repeated snapshots with exact ancestry and deletion coverage', async (t) => {
  const f = await setup(t),
    first = await f.create();
  const admission = await c.admitHistoryCheckpoint(
    first,
    f.key,
    f.authority,
    f.producer,
    f.doc,
    f.sign,
  );
  assert.equal(admission.selfAdmitted, 1);
  assert.deepEqual(
    await c.verifyHistoryCheckpointAdmission(admission, first, f.authority),
    admission,
  );
  const { signature: _, ct: _ct, ...body } = first;
  assert.deepEqual(
    Buffer.from(await c.historyCheckpointMessage(first)),
    message('done/history-checkpoint/v1', body),
  );
  f.local.getText('master').delete(0, 8);
  f.local.getText('master').insert(f.local.getText('master').length, ' + journal-only');
  const second = await f.create(first);
  assert.equal(second.manifest.sequence, 2);
  assert.equal(second.manifest.parent, await c.historyCheckpointHash(first));
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.nonce, second.nonce);
  const opened = await c.openHistoryCheckpoint(second, f.key, f.authority);
  try {
    assert.equal(opened.getText('master').toString(), ' writing + journal-only');
  } finally {
    opened.destroy();
  }
  assert(f.key.every((v) => v === 47));
  await assert.rejects(c.openHistoryCheckpoint(second, new Uint8Array(32), f.authority));
  await assert.rejects(c.verifyHistoryCheckpointParent(second, null), /Missing/);
  await assert.rejects(
    c.verifyHistoryCheckpointParent(
      { ...second, manifest: { ...second.manifest, parent: 'ff'.repeat(32) } },
      first,
    ),
    /parent/,
  );
});
test('a second eligible device must admit, with both self-admission flag directions checked', async (t) => {
  const f = await setup(t, true),
    cp = await f.create();
  await assert.rejects(
    c.admitHistoryCheckpoint(cp, f.key, f.authority, f.producer, f.doc, f.sign),
    /admission authority/,
  );
  const other = f.f.context.candidate.id,
    sign = async (bytes) => signed(f.f.keys.new, bytes);
  const admission = await c.admitHistoryCheckpoint(cp, f.key, f.authority, other, f.doc, sign);
  assert.equal(admission.selfAdmitted, 0);
  for (const [credential, key, flag] of [
    [f.producer, f.f.keys.existing, 0],
    [other, f.f.keys.new, 1],
  ]) {
    const changed = { ...admission, admittingCredential: credential, selfAdmitted: flag };
    changed.signature = signed(key, await c.historyCheckpointAdmissionMessage(changed));
    await assert.rejects(c.verifyHistoryCheckpointAdmission(changed, cp, f.authority), /authority/);
  }
  await assert.rejects(c.verifyHistoryCheckpoint(cp, { ...f.authority }), /Unverified/);
});
test('independent accepted replay prevents admitting missing insertions or deletions', async (t) => {
  const f = await setup(t),
    cp = await f.create();
  f.doc.getText('master').insert(0, 'missing insert:');
  await assert.rejects(
    c.admitHistoryCheckpoint(cp, f.key, f.authority, f.producer, f.doc, f.sign),
    /omits/,
  );
  f.doc.getText('master').delete(0, f.doc.getText('master').length);
  await assert.rejects(
    c.admitHistoryCheckpoint(cp, f.key, f.authority, f.producer, f.doc, f.sign),
    /omits/,
  );
  const next = await f.create(cp);
  assert.notEqual(next.manifest.ds, cp.manifest.ds);
});
test('a genuinely signed false coverage claim still fails decryption/replay admission', async (t) => {
  const f = await setup(t),
    cp = await f.create();
  for (const field of ['sv', 'ds']) {
    const changed = structuredClone(cp);
    changed.manifest[field] = cp.manifest[field] === '00' ? '0101' : '00';
    changed.signature = await f.sign(await c.historyCheckpointMessage(changed));
    assert.deepEqual(await c.verifyHistoryCheckpoint(changed, f.authority), changed);
    await assert.rejects(c.openHistoryCheckpoint(changed, f.key, f.authority), /coverage/);
  }
  for (const mutate of [
    (v) => (v.salt = '11'.repeat(16)),
    (v) => (v.nonce = '11'.repeat(12)),
    (v) => (v.manifest.producer = '11'.repeat(16)),
    (v) => (v.manifest.epochHead = '11'.repeat(32)),
  ]) {
    const changed = structuredClone(cp);
    mutate(changed);
    await assert.rejects(c.openHistoryCheckpoint(changed, f.key, f.authority));
  }
});
test('pending dependencies refuse before a checkpoint is signed; inputs freeze before async signing', async (t) => {
  const f = await setup(t),
    source = new c.Y.Doc({ gc: false }),
    pending = new c.Y.Doc({ gc: false });
  t.after(() => {
    source.destroy();
    pending.destroy();
  });
  source.getText('master').insert(0, 'dependency');
  const sv = c.Y.encodeStateVector(source);
  source.getText('master').insert(source.getText('master').length, 'dependent');
  c.Y.applyUpdate(pending, c.Y.encodeStateAsUpdate(source, sv));
  assert(c.hasPendingUpdates(pending));
  let signedCount = 0;
  await assert.rejects(
    c.createHistoryCheckpoint(
      pending,
      f.local,
      f.key,
      f.authority,
      f.producer,
      f.p.heads,
      null,
      async () => {
        signedCount++;
        return '00'.repeat(64);
      },
    ),
    /dependencies/,
  );
  assert.equal(signedCount, 0);
  const creating = f.create();
  f.local.getText('master').insert(0, 'later change');
  const cp = await creating,
    opened = await c.openHistoryCheckpoint(cp, f.key, f.authority);
  try {
    assert.equal(opened.getText('master').toString(), 'accepted writing');
  } finally {
    opened.destroy();
  }
});
test('finalized publishers cannot be omitted or advanced, and ancestry cannot rewind their cuts', async () => {
  const f = await checkpointFixture();
  const { history } = await c.verifyMembershipChain(
    { ...f.x.proofs, continuations: [f.rotation, f.admission] },
    f.x.f.f.base,
  );
  const authority = c.historyMembership(history),
    heads = f.checkpoint.heads;
  assert.deepEqual(c.verifyHistoryHeads(heads, authority), heads);
  await assert.rejects(
    async () =>
      c.verifyHistoryHeads(
        heads.filter((h) => h.credentialId !== f.x.target),
        authority,
      ),
    /omitted/,
  );
  const changed = structuredClone(heads);
  changed.find((h) => h.credentialId === f.x.target).position++;
  await assert.rejects(async () => c.verifyHistoryHeads(changed, authority), /cut/);
});

test('history ancestry and AEAD bind the complete handoff inventory', async (t) => {
  const f = await setup(t, true);
  const sources = [{ epoch: 3, head: f.p.head, kind: 'original', hash: 'ab'.repeat(32) }];
  const first = await c.createHistoryCheckpoint(
    f.doc,
    f.local,
    f.key,
    f.authority,
    f.producer,
    f.p.heads,
    null,
    f.sign,
    sources,
  );
  assert.deepEqual(first.sources, sources);
  await assert.rejects(
    c.createHistoryCheckpoint(
      f.doc,
      f.local,
      f.key,
      f.authority,
      f.producer,
      f.p.heads,
      first,
      f.sign,
    ),
    /omitted.*handoff/,
  );
  const changed = structuredClone(first);
  changed.sources[0].hash = 'cd'.repeat(32);
  changed.signature = await f.sign(await c.historyCheckpointMessage(changed));
  await assert.rejects(c.verifyHistoryCheckpoint(changed, f.authority), /source inventory/);
  changed.manifest.sourcesDigest = await c.historySourcesDigest(changed.sources);
  changed.signature = await f.sign(await c.historyCheckpointMessage(changed));
  await c.verifyHistoryCheckpoint(changed, f.authority);
  await assert.rejects(
    c.openHistoryCheckpoint(changed, f.key, f.authority),
    undefined,
    'even a newly signed inventory cannot substitute the original AEAD binding',
  );
});
