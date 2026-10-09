import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ready as admitted } from '../account-successor/service-fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { recoveryReader } from './read-fixtures.mjs';
import { verifyRecoveryReadPage } from '../../account-protocol/recoveryRead.ts';
import { decodeNetworkEnvelope, openNetworkEnvelope } from '../../account-protocol/envelope.ts';
import { verifyPositionResponse } from '../../account-protocol/positionDecision.ts';
import { unhex, hex } from '../../account-protocol/recovery.ts';
const mutate = (x, fn) => {
  const db = new DatabaseSync(x.f.path);
  try {
    return fn(db);
  } finally {
    db.close();
  }
};
async function ready(t, options = {}) {
  const authority = authorityFixture(t);
  return admitted(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    now: () => 1000,
    ...options,
  });
}
const append = async (x, position, text) => {
  const wire = x.make(position, text),
    result = await x.authority.owner.decideSubmission(x.f.core, {
      workspaceId: x.workspace,
      bytes: wire.bytes,
    });
  assert.equal(result.kind, 'decision', JSON.stringify(result));
  return { wire, result };
};
test('two-factor recovery reads accepted ciphertext in bounded, authenticated pages, including after restart', async (t) => {
  const x = await ready(t);
  await append(x, 1, 'one');
  await append(x, 2, 'two');
  const reader = await recoveryReader(x),
    request = reader.request({ limit: 1 });
  const page = await reader.read(request);
  const checked = await verifyRecoveryReadPage(page, request, x.authority.pin);
  assert.equal(checked.through, 2);
  assert.equal(checked.next, 1);
  const first = checked.entries[0],
    bytes = unhex(first.envelope, first.envelope.length / 2),
    e = decodeNetworkEnvelope(bytes);
  const auth = {
    workspace: x.workspace,
    lineage: x.offer.epoch.lineageId,
    head: x.offer.head,
    tip: 1,
    acceptanceKey: x.offer.epoch.acceptancePublicKey,
  };
  const proof = await verifyPositionResponse(
    unhex(first.proof, first.proof.length / 2),
    {
      workspace: x.workspace,
      credential: x.credential,
      position: 1,
      digest: hex(e.digest),
      epoch: 1,
      parent: '00'.repeat(32),
      previous: '00'.repeat(32),
    },
    auth,
  );
  assert.equal(proof.kind, 'accepted');
  const signing = await crypto.subtle.importKey(
    'raw',
    unhex(x.request.certification.members[0].sPub, 32),
    'Ed25519',
    false,
    ['verify'],
  );
  const opened = await openNetworkEnvelope(
    bytes,
    { v: e.v, workspace_id: x.workspace, credential_id: x.credential, epoch: 1, gen: 1 },
    signing,
    x.generationKey,
  );
  assert.equal(Buffer.from(opened.updates[0]).toString(), 'one');
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await reader.read(request), page);
  const second = reader.request({ after: 1, limit: 1 });
  const next = await verifyRecoveryReadPage(await reader.read(second), second, x.authority.pin);
  assert.equal(next.next, 2);
  assert.equal(next.link, checked.link);
  await assert.rejects(verifyRecoveryReadPage(page, second, x.authority.pin));
  assert.equal(x.f.rows('network_sessions').length, 0);
});

test('passkey alone, forged bootstrap, another candidate signature and unsigned read edits cannot read', async (t) => {
  const x = await ready(t),
    reader = await recoveryReader(x);
  await append(x, 1, 'hidden');
  const valid = reader.request();
  for (const r of [
    { ...valid, signature: '00'.repeat(64) },
    { ...valid, after: 1 },
    { ...valid, publisher: 'ab'.repeat(16) },
    { ...valid, history: 'latest' },
    reader.request({ bootstrap: { ...reader.bootstrap, signature: '00'.repeat(64) } }),
    reader.request({ bootstrap: { ...reader.bootstrap, newSPub: 'ab'.repeat(32) } }),
  ])
    assert.equal((await reader.read(r)).refusal, 'invalid-proof');
  assert.equal(
    (await reader.read(reader.request({ publisher: 'ab'.repeat(16) }))).refusal,
    'unavailable',
  );
  assert.equal((await reader.read(reader.request({ after: 2 }))).refusal, 'request-conflict');
  assert.equal((await reader.read({ ...valid, extra: true })).refusal, 'malformed');
});

test('cancellation, expiry and account changes between verification and the actual read withhold ciphertext', async (t) => {
  for (const mode of ['cancel', 'expire', 'account'])
    await t.test(mode, async (t) => {
      let now = 1000,
        change;
      const x = await ready(t, {
        now: () => now,
        hook: (point, op) => {
          if (point === 'after-verify' && op === 'lost-recovery-read') change?.();
        },
      });
      await append(x, 1, 'withheld');
      const reader = await recoveryReader(x);
      change = () =>
        mode === 'expire'
          ? (now = reader.context.expiresAt)
          : mutate(x, (db) =>
              mode === 'cancel'
                ? db.prepare("UPDATE lost_device_recovery SET state='cancelled'").run()
                : db.prepare("UPDATE accounts SET state='pending'").run(),
            );
      const result = await reader.read(reader.request());
      assert.deepEqual(result, {
        ok: false,
        refusal: mode === 'cancel' ? 'cancelled' : mode === 'expire' ? 'expired' : 'state-changed',
      });
    });
});

test('a competing valid membership head invalidates recovery read; corrupt accepted history cannot be hidden', async (t) => {
  const x = await ready(t),
    reader = await recoveryReader(x);
  await append(x, 1, 'kept');
  const rows = x.f.rows('delivery_decisions');
  mutate(x, (db) => db.prepare('DELETE FROM delivery_decisions').run());
  assert.equal((await reader.read(reader.request())).refusal, 'unavailable');
  mutate(x, (db) => {
    const row = rows[0];
    db.prepare(
      `INSERT INTO delivery_decisions (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
        .map(() => '?')
        .join(',')})`,
    ).run(...Object.values(row));
  });
  const admission = await x.prepare();
  await x.admit(admission.input);
  assert.equal((await reader.read(reader.request())).refusal, 'state-changed');
});

test('byte-bounded pages make forward progress without truncating or skipping accepted writing', async (t) => {
  const x = await ready(t);
  for (let position = 1; position <= 9; position++) await append(x, position, 'x'.repeat(300000));
  const reader = await recoveryReader(x);
  let after = 0,
    pages = 0;
  while (after < 9) {
    const request = reader.request({ after });
    const result = await reader.read(request);
    assert(Buffer.byteLength(JSON.stringify(result)) <= 4 * 1024 * 1024);
    const page = await verifyRecoveryReadPage(result, request, x.authority.pin);
    assert(page.next > after);
    assert.equal(page.through, 9);
    for (const [i, entry] of page.entries.entries())
      assert.equal(
        decodeNetworkEnvelope(unhex(entry.envelope, entry.envelope.length / 2)).seq,
        after + i + 1,
      );
    after = page.next;
    pages++;
  }
  assert(pages > 1);
});
