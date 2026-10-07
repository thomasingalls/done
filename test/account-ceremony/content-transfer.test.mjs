import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './development-fixtures.mjs';
import { signed } from './exchange-oracle.mjs';
import { ceremonyInvitationMessage } from '../../account-protocol/ceremonyRelay.ts';
import { createHash } from 'node:crypto';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { fresh, lp } from '../account-enrollment/fixtures.mjs';
import { AccountCore } from '../../account-service/core.ts';
import { DatabaseSync, backup } from 'node:sqlite';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
} from '../../account-protocol/membership.ts';
import {
  parseEnrollmentContext,
  parseEnrollmentChallenge,
  verifyEnrollmentChallenge,
  verifyEnrollmentReceipt,
} from '../../account-protocol/enrollment.ts';
import { decision, mutate, query, read, page } from '../account-successor/service-fixtures.mjs';
import {
  verifyCertificationHistory,
  historyAuthority,
  historyReader,
  historyDevices,
  verifyHistoryDecision,
  createAdmissionPrefixVerifier,
  historyPublisher,
} from '../../account-protocol/admissionHistory.ts';
import { envelope } from '../account-transport/oracle.mjs';
import { build } from 'vite';
import { resolve } from 'node:path';
import { manifestMessage, semanticMessage } from '../../account-protocol/admission.ts';
import { digest } from '../../account-protocol/recovery.ts';
import {
  checkpointHeadDigest,
  checkpointRequestMessage,
  checkpointAdmissionBody,
} from '../../account-protocol/contentCheckpoint.ts';
import {
  recipientCertificateMessage,
  contentDeliveryMessage,
  contentDeliveryHash,
  contentInstallationMessage,
  contentTransferMessage,
  verifyContentDelivery,
  verifyCertificationSuccessor,
} from '../../account-protocol/contentDelivery.ts';
async function approved(t, options = {}) {
  const x = await setup(t, { now: () => 1000, ...options });
  for (const role of ['existing', 'new'])
    assert.equal((await x.call(x.request(role, 'commit', x.commits[role]))).ok, true);
  for (const role of ['existing', 'new'])
    assert.equal((await x.call(x.request(role, 'reveal', x.reveals[role]))).ok, true);
  const approval = x.request('existing', 'decide', {
    contextHash: x.contextHash,
    transcriptHash: x.open.transcriptHash,
    outcome: 'approved',
  });
  const cert = {
    members: [x.context.existing, x.context.candidate].sort((a, b) => (a.id < b.id ? -1 : 1)),
    recoveryStateDigest: x.context.recoveryStateDigest,
    approver: x.context.existing.id,
    signature: '00'.repeat(64),
  };
  cert.signature = signed(
    x.keys.existing,
    await recipientCertificateMessage(cert, x.workspace, x.context.lineageId),
  );
  const d = {
    v: 1,
    kind: 'content-key-delivery',
    parent: x.successor.head,
    generation: 1,
    transcriptHash: x.open.transcriptHash,
    existing: x.commits.existing,
    candidate: x.commits.new,
    existingReveal: x.reveals.existing,
    newReveal: x.reveals.new,
    decision: approval,
    certificate: cert,
    recovery:
      x.requestBase?.recovery ??
      x.f.rows('promotions').map((r) => JSON.parse(r.request))[0].recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    signature: '00'.repeat(64),
  };
  const signDelivery = async (d) => ({
    ...d,
    signature: signed(x.keys.existing, await contentDeliveryMessage(d)),
  });
  const delivery = await signDelivery(d);
  const transfer = async (role, action, payload = null) => {
    const r = {
      v: 1,
      workspaceId: x.workspace,
      credentialId: role === 'existing' ? x.context.existing.id : x.context.candidate.id,
      parent: x.successor.head,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = signed(x.keys[role], await contentTransferMessage(r));
    return x.authority.owner.transferContent(x.f.core, r);
  };
  const installation = {
    v: 1,
    kind: 'content-key-installed',
    deliveryHash: await contentDeliveryHash(delivery),
    credentialId: x.context.candidate.id,
    signature: '00'.repeat(64),
  };
  installation.signature = signed(x.keys.new, await contentInstallationMessage(installation));
  return {
    ...x,
    approval,
    delivery,
    installation,
    transfer,
    signDelivery,
    base: {
      pin: x.authority.pin,
      request: JSON.parse(x.f.rows('promotions')[0].request),
      receipt: x.receipt,
    },
  };
}

// The service deliberately cannot inspect the plaintext. Browser tests independently replay
// real encrypted snapshots; this fixture tests signed roles, immutable bytes and commit/retry.
async function checkpointFixture(t, options = {}) {
  const x = await approved(t, options);
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  const { certification } = await x.transfer('new', 'install', x.installation);
  const binding = await x.authority.owner.promotionBinding(x.f.core, {
    retryKey: x.account.retryKey,
    requestDigest: x.receipt.offer.epoch.requestDigest,
  });
  assert.equal(binding.kind, 'promotion-slot-binding');
  const checkpoint = {
    v: 1,
    kind: 'content-checkpoint',
    salt: 'ab'.repeat(16),
    nonce: 'cd'.repeat(12),
    ct: 'ef'.repeat(32),
    manifest: {
      v: 2,
      workspaceId: x.workspace,
      epoch: 3,
      epochHead: certification.head,
      generation: 1,
      checkpointDigest: await digest(new Uint8Array(32).fill(0xef)),
      sv: '00',
      ds: '00',
      headVectorDigest: await checkpointHeadDigest(certification.epoch.heads),
      producer: x.context.existing.id,
      signature: '00'.repeat(64),
    },
    heads: certification.epoch.heads,
    binding,
  };
  checkpoint.manifest.signature = signed(
    x.keys.existing,
    await manifestMessage(checkpoint.manifest),
  );
  const admission = await checkpointAdmissionBody(checkpoint, x.context.candidate.id);
  admission.signature = signed(x.keys.new, await semanticMessage(admission));
  const exchange = async (role, action, payload = null, overrides = {}, key = x.keys[role]) => {
    const r = {
      workspaceId: x.workspace,
      credentialId: x.context[role === 'new' ? 'candidate' : 'existing'].id,
      head: certification.head,
      nonce: 'ac'.repeat(32),
      action,
      payload,
      signature: '00'.repeat(64),
      ...overrides,
    };
    r.signature = signed(key, await checkpointRequestMessage(r));
    return x.authority.owner.exchangeCheckpoint(x.f.core, r);
  };
  return { ...x, certification, checkpoint, admission, exchange };
}

test('bootstrap retries a certification committed while signing without returning the old authority', async (t) => {
  const x = await approved(t);
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  const invitation = {
    v: 1,
    workspaceId: x.workspace,
    credentialId: x.context.existing.id,
    nonce: 'c2'.repeat(32),
    signature: '00'.repeat(64),
  };
  invitation.signature = signed(x.keys.existing, await ceremonyInvitationMessage(invitation));
  const input = { workspaceId: x.workspace, nonce: 'c1'.repeat(32), invitation };
  let signedCount = 0,
    certification;
  const result = await x.authority.owner.ceremonyBootstrap(
    {
      ceremonyBootstrap(input, issuer) {
        return x.f.core.ceremonyBootstrap(input, {
          ...issuer,
          async bootstrap(body) {
            const signature = await issuer.bootstrap(body);
            if (++signedCount === 1) {
              assert.equal(body.certification, null);
              certification = (await x.transfer('new', 'install', x.installation)).certification;
              assert(certification);
            }
            return signature;
          },
        });
      },
    },
    input,
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(signedCount, 2);
  assert.deepEqual(result.certification, certification);
  assert.equal(result.nonce, input.nonce);
  assert.deepEqual(result, await x.authority.owner.ceremonyBootstrap(x.f.core, input));
});

const nextProof = (x, entry, challenge, version = 2) => {
  const context = challenge.context;
  const assertionLabel = context.login
    ? `done/enrollment-and-session-assertion/v${version}`
    : `done/enrollment-preparation-assertion/v${version}`;
  return {
    retryKey: entry.input.retryKey,
    attemptId: context.attemptId,
    response: x.account.key.assert({
      options: {
        challenge: createHash('sha256')
          .update(lp(assertionLabel, JSON.stringify(context)))
          .digest('base64url'),
      },
    }),
    possession: signed(
      entry.key,
      lp(`done/enrollment-preparation-possession/v${version}`, JSON.stringify(context)),
    ),
    ...(entry.input.loginRetryKey ? { loginRetryKey: entry.input.loginRetryKey } : {}),
  };
};

for (const combined of [false, true])
  test(`next-device preparation binds the certified parent and survives a lost reply${combined ? ' with one login' : ''}`, async (t) => {
    const authority = authorityFixture(t);
    let lose = false;
    const x = await checkpointFixture(t, {
      authority,
      ...(combined ? { sessions: { pin: authority.pin, operatorKey: authority.key } } : {}),
      hook(at, op) {
        if (lose && op === 'enrollment-finish' && at === 'after-commit') {
          lose = false;
          throw Error('Lost preparation reply');
        }
      },
    });
    const prior = Object.fromEntries(
      [
        'promotions',
        'workspace_successors',
        'content_ceremonies',
        'content_transfers',
        'content_checkpoints',
      ].map((table) => [table, x.f.rows(table)]),
    );
    const entry = x.candidate();
    assert.equal((await x.enroll('begin', entry.input)).refusal, 'unavailable');
    entry.input.candidate.head = x.certification.head;
    if (combined) entry.input.loginRetryKey = fresh();
    const begun = await x.enroll('begin', entry.input);
    assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
    assert.equal(begun.challenge.v, 2);
    const c = begun.challenge.context;
    assert.equal(c.v, 2);
    assert.equal(c.epoch, 3);
    assert.equal(c.candidate.head, x.certification.head);
    assert.equal(
      c.certifiedSetDigest,
      createHash('sha256').update(JSON.stringify(x.delivery.certificate)).digest('hex'),
    );
    assert.equal(c.recoveryStateDigest, x.context.recoveryStateDigest);
    assert.deepEqual(
      await verifyEnrollmentChallenge(begun.challenge, authority.pin, entry.input.candidate, 1000),
      begun.challenge,
    );
    assert.throws(() => parseEnrollmentChallenge({ ...begun.challenge, v: 1 }));
    assert.throws(() => parseEnrollmentContext({ ...c, v: 1 }));
    assert.throws(() => parseEnrollmentContext({ ...c, epoch: 2 }));
    assert.equal(
      (await x.enroll('finish', nextProof(x, entry, begun.challenge, 1))).refusal,
      'invalid-proof',
    );
    const proof = nextProof(x, entry, begun.challenge);
    lose = true;
    assert.equal((await x.enroll('finish', proof)).ok, false);
    x.f.restart();
    const prepared = await x.enroll('finish', proof);
    assert.equal(prepared.stage, 'prepared', JSON.stringify(prepared));
    assert.equal(prepared.receipt.v, 2);
    assert.deepEqual(
      await verifyEnrollmentReceipt(prepared.receipt, authority.pin, entry.input.candidate),
      prepared.receipt,
    );
    assert.deepEqual(await x.enroll('finish', proof), prepared);
    assert.equal((await x.enroll('resume', { retryKey: entry.input.retryKey })).login, undefined);
    if (combined) {
      assert.equal(prepared.login.stage, 'issued');
      assert.equal(x.f.rows('network_sessions').length, 1);
    }
    // Preparation is not membership, and the v1 consumer cannot reinterpret a v2 receipt.
    assert.equal(
      (
        await x.admit({
          retryKey: entry.input.retryKey,
          attemptId: c.attemptId,
          receiptId: prepared.receipt.receiptId,
        })
      ).refusal,
      'stale',
    );
    for (const [table, rows] of Object.entries(prior))
      assert.deepEqual(x.f.rows(table), rows, table);
  });

test('next-device proof racing account invalidation cannot commit a receipt or login', async (t) => {
  const authority = authorityFixture(t);
  let invalidate = false;
  const x = await checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    hook(at, op) {
      if (invalidate && op === 'enrollment-finish' && at === 'after-verify') {
        invalidate = false;
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      }
    },
  });
  const entry = x.candidate();
  entry.input.candidate.head = x.certification.head;
  entry.input.loginRetryKey = fresh();
  const begun = await x.enroll('begin', entry.input);
  assert.equal(begun.stage, 'challenge');
  invalidate = true;
  const result = await x.enroll('finish', nextProof(x, entry, begun.challenge));
  assert.equal(result.stage, 'stale', JSON.stringify(result));
  assert.equal(
    x.f.rows('enrollment_preparations').find((r) => r.id === begun.challenge.context.attemptId)
      .receipt,
    null,
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
});

test('private continuation admission retains both publisher boundaries, aborts atomically and recovers the exact committed result', async (t) => {
  const authority = authorityFixture(t);
  let fault = null;
  const x = await checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    hook(at, op) {
      if (op === 'admit-membership' && at === fault) {
        fault = null;
        throw Error('Interrupted membership admission');
      }
    },
  });
  const prepare = async () => {
    const entry = x.candidate();
    entry.input.candidate.head = x.certification.head;
    const begun = await x.enroll('begin', entry.input);
    const result = await x.enroll('finish', nextProof(x, entry, begun.challenge));
    assert.equal(result.stage, 'prepared', JSON.stringify(result));
    return {
      retryKey: entry.input.retryKey,
      attemptId: result.receipt.context.attemptId,
      receiptId: result.receipt.receiptId,
    };
  };
  const request = await prepare(),
    competitor = await prepare();
  const originalRecords = [
    'workspace_successors',
    'content_ceremonies',
    'content_transfers',
    'content_checkpoints',
  ].map((table) => [table, x.f.rows(table)]);
  const first = x.make(1, 'first before third admission', { epoch: 3 });
  const second = x.make(1, 'second before third admission', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  const a = await x.deliveryCall(first),
    b = await x.deliveryCall(second);
  assert.equal(a.kind, 'decision');
  assert.equal(b.kind, 'decision');
  const call = (r = request) => authority.owner.admitMembership(x.f.core, r);
  fault = 'before-commit';
  assert.equal((await call()).ok, false);
  assert.deepEqual(x.f.rows('membership_admissions'), []);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.certification.head);
  fault = 'after-commit';
  assert.equal((await call()).ok, false);
  assert.equal(x.f.rows('membership_admissions').length, 1);
  x.f.restart();
  const result = await call();
  assert.equal(result.kind, 'membership-admission', JSON.stringify(result));
  assert.deepEqual(await call(), result);
  assert.equal((await call(competitor)).refusal, 'stale');
  assert.equal(x.f.rows('membership_admissions').length, 1);
  const parent = await verifyMembershipAnchor(x.base, x.successor, x.certification, {
    epoch: 3,
    head: x.certification.head,
  });
  const current = membershipState(await verifyMembershipAdmission(result, parent));
  assert.deepEqual(current.certificate, x.delivery.certificate);
  for (const id of [x.context.existing.id, x.context.candidate.id])
    assert.equal(current.heads.find((h) => h.credentialId === id).position, 1);
  assert.equal(
    current.heads.find(
      (h) => ![x.context.existing.id, x.context.candidate.id].includes(h.credentialId),
    ).position,
    0,
  );
  for (const [table, rows] of originalRecords) assert.deepEqual(x.f.rows(table), rows, table);
  // The unfinished continuation is never exposed through the old epoch-3 delivery owner.
  const count = x.f.rows('delivery_decisions').length;
  assert.equal((await x.deliveryCall(x.make(2, 'stale writer', { epoch: 3 }))).kind, 'unknown');
  assert.equal(x.f.rows('delivery_decisions').length, count);
  const saved = x.f.rows('membership_admissions')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_admissions SET boundaries=?').run('[]'));
  assert.equal((await call()).ok, false);
  mutate(x, (db) =>
    db.prepare('UPDATE membership_admissions SET boundaries=?').run(saved.boundaries),
  );
  assert.deepEqual(await call(), result);
});

test('continuation schema requires explicit offline opt-in and preserves retained session/account rows', async (t) => {
  const authority = authorityFixture(t),
    sessions = { pin: authority.pin, operatorKey: authority.key };
  const x = await checkpointFixture(t, { authority, sessions });
  const names = [
    'accounts',
    'credentials',
    'promotions',
    'workspace_successors',
    'content_transfers',
    'session_custody',
    'network_sessions',
  ];
  const before = names.map((name) => [name, x.f.rows(name)]);
  const policy = { origin: authority.pin.origin, rpId: authority.pin.rpId };
  const path = x.f.path + '.offline-upgrade';
  const source = new DatabaseSync(x.f.path);
  await backup(source, path);
  source.close();
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /explicit offline upgrade/,
  );
  const upgraded = new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV14: true,
  });
  upgraded.close();
  const db = new DatabaseSync(path);
  for (const [name, rows] of before)
    assert.deepEqual(db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(), rows, name);
  assert.deepEqual(db.prepare('SELECT * FROM membership_admissions').all(), []);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 15);
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

test('certified devices publish independent positions and read each other across lost replies and restart', async (t) => {
  let fault = null;
  const x = await checkpointFixture(t, {
    hook(at, op) {
      if (op === 'decide-submission' && at === fault) throw Error('interrupted');
    },
  });
  const own = x.make(1, 'first', { epoch: 3 });
  const peer = x.make(1, 'second', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  const old = x.make(1, 'too early', {
    epoch: 2,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  assert.equal((await x.deliveryCall(old)).kind, 'unknown');
  const ownResult = await x.deliveryCall(own);
  decision(x, ownResult, own, undefined, 3);
  fault = 'before-commit';
  assert.equal((await x.deliveryCall(peer)).kind, 'unknown');
  assert.equal(x.f.rows('publisher_decisions').length, 0);
  fault = 'after-commit';
  assert.equal((await x.deliveryCall(peer)).kind, 'unknown');
  fault = null;
  x.f.restart();
  x.authority.restart();
  const peerResult = await x.deliveryCall(peer);
  decision(x, peerResult, peer, undefined, 3);
  assert.equal(x.f.rows('delivery_decisions').length, 1);
  assert.equal(x.f.rows('publisher_decisions').length, 1);
  assert.deepEqual(await x.deliveryCall(own), ownResult);
  for (const [reader, publisher, w, r, key] of [
    [x.context.candidate.id, x.context.existing.id, own, ownResult, x.keys.new],
    [x.context.existing.id, x.context.candidate.id, peer, peerResult, x.keys.existing],
  ]) {
    const q = query(x, 0, 1, { reader, publisher, head: x.certification.head, epoch: 3 }, key);
    page(x, await read(x, q), q, [{ w, r, epoch: 3 }]);
  }
  const history = await verifyCertificationHistory(x.certification, x.successor, x.base, {
    epoch: 3,
    head: x.certification.head,
  });
  const peerHistory = historyPublisher(history, x.context.candidate.id);
  assert.deepEqual(historyDevices(peerHistory), historyDevices(history));
  assert.equal(historyDevices(history).length, 2);
  assert(historyDevices(history).every((d) => d.state === 'certified'));
  assert.equal(peerHistory.credential, x.context.candidate.id);
  assert.equal(peerHistory.signingKey, x.context.candidate.sPub);
  assert.throws(() => historyAuthority(peerHistory, history.first));
  assert.throws(() => historyPublisher({ ...history }, x.context.candidate.id));
  assert.throws(() => historyPublisher(history, 'ff'.repeat(16)));
  const checked = await verifyHistoryDecision(
    peerResult.bytes,
    { ...peer.subject, previous: '00'.repeat(32), parent: peer.parent },
    peerHistory.current,
    peerHistory,
  );
  assert.equal(checked.kind, 'accepted');
  mutate(x, (db) => db.exec('DELETE FROM publisher_decisions'));
  // A missing peer row disagrees with its witness; it cannot hide behind the first ledger.
  assert.equal((await x.deliveryCall(peer)).kind, 'unknown');
  assert.deepEqual(await x.deliveryCall(own), ownResult);
});

test('checkpoint publication and second-client admission resume exact bytes across commit failures and restart', async (t) => {
  let fault = null;
  const x = await checkpointFixture(t, {
    hook(at, op) {
      if (op === 'content-checkpoint' && at === fault) throw Error('interrupted');
    },
  });
  assert.equal((await x.exchange('new', 'admit', x.admission)).refusal, 'checkpoint-required');
  fault = 'before-commit';
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, false);
  assert.equal(x.f.rows('content_checkpoints').length, 0);
  fault = 'after-commit';
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, false);
  x.f.restart();
  x.authority.restart();
  fault = null;
  assert.deepEqual(
    (await x.exchange('existing', 'publish', x.checkpoint)).checkpoint,
    x.checkpoint,
  );
  const changed = structuredClone(x.checkpoint);
  changed.salt = 'aa'.repeat(16);
  assert.equal((await x.exchange('existing', 'publish', changed)).refusal, 'checkpoint-conflict');
  fault = 'before-commit';
  assert.equal((await x.exchange('new', 'admit', x.admission)).ok, false);
  assert.equal(x.f.rows('content_checkpoints')[0].admission, null);
  fault = 'after-commit';
  assert.equal((await x.exchange('new', 'admit', x.admission)).ok, false);
  x.f.restart();
  x.authority.restart();
  fault = null;
  assert.deepEqual((await x.exchange('new', 'admit', x.admission)).admission, x.admission);
  assert.deepEqual((await x.exchange('existing', 'read')).admission, x.admission);
});

test('checkpoint exchange checks participant role, signing key and current authority without losing an accepted suffix', async (t) => {
  const x = await checkpointFixture(t);
  assert.equal((await x.exchange('new', 'publish', x.checkpoint)).ok, false);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint, {}, x.keys.new)).ok, false);
  assert.equal(
    (await x.exchange('existing', 'publish', x.checkpoint, { head: x.successor.head })).refusal,
    'stale',
  );
  assert.equal(x.f.rows('content_checkpoints').length, 0);
  // The saved zero-head checkpoint predates this legitimate post-capture delivery.
  const suffix = x.make(1, 'later captured writing', { epoch: 3 });
  assert.equal((await x.deliveryCall(suffix)).kind, 'decision');
  const accepted = x.f.rows('delivery_decisions');
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  assert.equal((await x.exchange('existing', 'admit', x.admission)).ok, false);
  assert.equal((await x.exchange('new', 'admit', { ...x.admission, selfAdmitted: 1 })).ok, false);
  assert.equal((await x.exchange('new', 'admit', x.admission)).ok, true);
  assert.deepEqual(x.f.rows('delivery_decisions'), accepted);
});

test('schema ten upgrade preserves the checkpoint, admission and original publisher history', async (t) => {
  const x = await checkpointFixture(t);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  assert.equal((await x.exchange('new', 'admit', x.admission)).ok, true);
  const own = x.make(1, 'before upgrade', { epoch: 3 }),
    accepted = await x.deliveryCall(own);
  decision(x, accepted, own, undefined, 3);
  const checkpoint = x.f.rows('content_checkpoints'),
    history = x.f.rows('delivery_decisions');
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE publisher_decisions; DROP TABLE publisher_witnesses; PRAGMA user_version=10;',
    ),
  );
  const { AccountCore } = await import('../../account-service/core.ts');
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /explicit offline upgrade/);
  new AccountCore(x.f.path, policy, { upgradeFromV10: true }).close();
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(x.f.rows('content_checkpoints'), checkpoint);
  assert.deepEqual(x.f.rows('delivery_decisions'), history);
  assert.deepEqual(await x.deliveryCall(own), accepted);
  const peer = x.make(1, 'after upgrade', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(peer), peer, undefined, 3);
});
test('schema nine requires explicit upgrade and retains certified content access', async (t) => {
  const x = await checkpointFixture(t),
    before = x.f.rows('content_transfers');
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE publisher_decisions; DROP TABLE publisher_witnesses; DROP TABLE content_checkpoints; PRAGMA user_version=9;',
    ),
  );
  const { AccountCore } = await import('../../account-service/core.ts');
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /explicit offline upgrade/);
  new AccountCore(x.f.path, policy, { upgradeFromV9: true }).close();
  x.f.restart();
  assert.deepEqual(x.f.rows('content_transfers'), before);
  assert.deepEqual(x.f.rows('content_checkpoints'), []);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
});
test('approval is required; exact delivery survives lost replies, cannot be replaced, and does not yet certify', async (t) => {
  let lose = false;
  const x = await approved(t, {
    hook(at, op) {
      if (lose && op === 'content-transfer' && at === 'after-commit') {
        lose = false;
        throw Error('lost reply');
      }
    },
  });
  assert.equal((await x.transfer('existing', 'deliver', x.delivery)).refusal, 'approval-required');
  await x.call(x.approval);
  assert.equal((await x.transfer('new', 'deliver', x.delivery)).ok, false);
  lose = true;
  assert.equal((await x.transfer('existing', 'deliver', x.delivery)).ok, false);
  x.f.restart();
  const r = await x.transfer('existing', 'deliver', x.delivery);
  assert.deepEqual(r.delivery, x.delivery);
  assert.equal(r.certification, null);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.successor.head);
  const changed = await x.signDelivery({
    ...x.delivery,
    wrap: { ...x.delivery.wrap, enc: 'aa'.repeat(32) },
  });
  assert.equal((await x.transfer('existing', 'deliver', changed)).refusal, 'delivery-conflict');
  assert.deepEqual((await x.transfer('new', 'read')).delivery, x.delivery);
});
test('installation and certification are atomic, restartable after a lost reply, and preserve all three issuance epochs', async (t) => {
  let fault = null,
    pre,
    preReply;
  const x = await approved(t, {
    beforeAdmit: async (x) => {
      pre = x.make(1, 'epoch one');
      preReply = await x.call(pre);
    },
    hook(at, op) {
      if (op === 'content-transfer' && at === fault) throw Error('interrupted');
    },
  });
  let previous = decision(x, preReply, pre).head.link;
  const mid = x.make(2, 'epoch two', { epoch: 2 }),
    midReply = await x.deliveryCall(mid);
  previous = decision(x, midReply, mid, previous, 2).head.link;
  const queued = x.make(3, 'queued at two', { epoch: 2 });
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  assert.equal((await x.transfer('existing', 'install', x.installation)).ok, false);
  assert.equal(
    (await x.transfer('new', 'install', { ...x.installation, signature: '00'.repeat(64) })).ok,
    false,
  );
  fault = 'before-commit';
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  assert.equal(x.f.rows('content_transfers')[0].artifact, null);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.successor.head);
  fault = 'after-commit';
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  x.f.restart();
  x.authority.restart();
  fault = null;
  const complete = await x.transfer('new', 'install', x.installation);
  assert.equal(complete.ok, true, JSON.stringify(complete));
  const c = await verifyCertificationSuccessor(
    complete.certification,
    x.base,
    x.successor,
    x.delivery,
  );
  assert.equal(c.epoch.epoch, 3);
  assert.equal(x.f.rows('promotions')[0].successor_head, c.head);
  assert.deepEqual(await x.deliveryCall(pre), preReply);
  assert.deepEqual(await x.deliveryCall(mid), midReply);
  previous = decision(x, await x.deliveryCall(queued), queued, previous, 3).head.link;
  const current = x.make(4, 'epoch three', { epoch: 3 });
  const currentReply = await x.deliveryCall(current);
  decision(x, currentReply, current, previous, 3);
  const history = await verifyCertificationHistory(c, x.successor, x.base, {
    epoch: 3,
    head: c.head,
  });
  assert.equal(historyReader(history, x.context.candidate.id, x.context.candidate.sPub), true);
  assert.equal(historyReader(history, x.context.candidate.id, x.context.existing.sPub), false);
  assert.equal(
    historyReader(
      history,
      x.context.candidate.id,
      x.context.candidate.sPub,
      history.authorities[1],
    ),
    false,
  );
  assert.throws(() =>
    historyReader({ ...history }, x.context.candidate.id, x.context.candidate.sPub),
  );
  assert.throws(() => historyAuthority(history, { ...history.current, head: x.successor.head }));
  const prefix = createAdmissionPrefixVerifier(history);
  for (const w of [pre, mid]) await prefix.append(new Uint8Array(envelope(w)));
  assert.deepEqual(prefix.finish(), history.boundary);
  let prior = '00'.repeat(32);
  const accepted = [];
  for (const [w, r, epoch] of [
    [pre, preReply, 1],
    [mid, midReply, 2],
    [queued, await x.deliveryCall(queued), 3],
    [current, currentReply, 3],
  ]) {
    const proof = await verifyHistoryDecision(
      r.bytes,
      { ...w.subject, previous: prior, parent: '00'.repeat(32) },
      history.current,
      history,
    );
    assert.equal(proof.kind, 'accepted');
    prior = proof.head.link;
    accepted.push({ w, r, epoch });
  }
  const q = query(
    x,
    0,
    8,
    {
      reader: x.context.candidate.id,
      head: c.head,
      epoch: 3,
    },
    x.keys.new,
  );
  page(x, await read(x, q), q, accepted);
  assert.equal(
    (
      await read(
        x,
        query(
          x,
          0,
          8,
          {
            reader: x.context.candidate.id,
            head: c.head,
            epoch: 3,
          },
          x.keys.existing,
        ),
      )
    ).kind,
    'unknown',
  );
  // A valid device signature cannot select an earlier head once certification is current.
  assert.equal(
    (
      await read(
        x,
        query(
          x,
          0,
          8,
          {
            reader: x.context.candidate.id,
            head: x.successor.head,
            epoch: 2,
          },
          x.keys.new,
        ),
      )
    ).kind,
    'unknown',
  );
  x.f.restart();
  assert.deepEqual((await x.transfer('existing', 'deliver', x.delivery)).certification, c);
  assert.equal(x.f.rows('content_transfers').length, 1);
});
test('recipient keys, transcript, recovery state and approver are authenticated before delivery', async (t) => {
  const x = await approved(t);
  await x.call(x.approval);
  for (const change of [
    (d) => (d.transcriptHash = 'ff'.repeat(32)),
    (d) => (d.recovery.rPub = 'ff'.repeat(32)),
    (d) => (d.certificate.approver = x.context.candidate.id),
    (d) => (d.certificate.members[0].sPub = 'ff'.repeat(32)),
    (d) => (d.decision.payload.outcome = 'mismatch'),
    (d) => (d.parent = 'ff'.repeat(32)),
  ]) {
    const d = structuredClone(x.delivery);
    change(d);
    const resigned = await x.signDelivery(d);
    await assert.rejects(verifyContentDelivery(resigned, x.base, x.successor));
    assert.equal((await x.transfer('existing', 'deliver', resigned)).ok, false);
  }
  assert.equal(x.f.rows('content_transfers').length, 0);
});
test('a competing authority change during verification cannot commit installation', async (t) => {
  let race = false;
  const x = await approved(t, {
    hook(at, op) {
      if (race && op === 'content-transfer' && at === 'after-verify')
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
    },
  });
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  race = true;
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  assert.equal(x.f.rows('content_transfers')[0].artifact, null);
});
test('schema eight opens only through the explicit offline upgrade, preserving retained attempts', async (t) => {
  const x = await approved(t);
  await x.call(x.approval);
  const before = x.f.rows('content_ceremonies');
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE publisher_decisions; DROP TABLE publisher_witnesses; DROP TABLE content_checkpoints; DROP TABLE content_transfers; PRAGMA user_version=8;',
    ),
  );
  const { AccountCore } = await import('../../account-service/core.ts');
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /explicit offline upgrade/);
  const core = new AccountCore(x.f.path, policy, { upgradeFromV8: true });
  core.close();
  x.f.restart();
  assert.deepEqual(x.f.rows('content_ceremonies'), before);
  assert.deepEqual(x.f.rows('content_transfers'), []);
});

test('certified receiver opens original encrypted Yjs updates and rechecks retained evidence after expiry', async (t) => {
  const built = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('test/account-ceremony/content-read-entry.ts'), formats: ['es'] },
    },
  });
  const code = (Array.isArray(built) ? built[0] : built).output.find(
    (v) => v.type === 'chunk',
  ).code;
  const { Y, verifyCertificationHistory, verifyInboundPage, verifyStoredInbound } = await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
  const x = await approved(t);
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  // Membership admission alone must not grant ciphertext reads to the pending candidate.
  const pending = query(
    x,
    0,
    1,
    {
      reader: x.context.candidate.id,
      head: x.successor.head,
      epoch: 2,
    },
    x.keys.new,
  );
  assert.equal((await read(x, pending)).kind, 'unknown');
  const { certification } = await x.transfer('new', 'install', x.installation);
  const history = await verifyCertificationHistory(certification, x.successor, x.base, {
    epoch: 3,
    head: certification.head,
  });
  const source = new Y.Doc({ gc: false }),
    restored = new Y.Doc({ gc: false });
  t.after(() => {
    source.destroy();
    restored.destroy();
  });
  source.getText('master').insert(0, 'Writing from the first device.');
  const wire = x.make(1, '', { epoch: 3, updates: [Y.encodeStateAsUpdate(source)] });
  assert.equal((await x.deliveryCall(wire)).kind, 'decision');
  const request = query(
    x,
    0,
    1,
    { reader: x.context.candidate.id, head: certification.head, epoch: 3 },
    x.keys.new,
  );
  const response = await read(x, request);
  assert.equal(response.kind, 'decision');
  const context = {
    baseline: { kind: 'promotion-genesis', id: '99'.repeat(32) },
    service: { id: x.authority.pin.serviceId, origin: x.authority.pin.origin },
    authority: history.current,
    history,
    creatingCredential: history.credential,
    reader: { id: x.context.candidate.id, publicKey: x.context.candidate.sPub, active: true },
    publisher: {
      id: history.credential,
      publicKey: history.signingKey,
      principal: history.principal,
      system: true,
      active: true,
    },
    generation: 1,
    generationKey: new Uint8Array(x.generationKey),
    prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
  const lifetime = { assertCurrent() {} };
  const result = await verifyInboundPage(context, request, response.bytes, lifetime);
  assert.equal(result.kind, 'received');
  for (const u of result.updates) Y.applyUpdate(restored, u);
  assert.equal(restored.getText('master').toString(), source.getText('master').toString());
  assert.deepEqual(result.actor, { id: history.principal, kind: 'human' });
  const retained = new Uint8Array(result.record);
  await verifyStoredInbound(context, retained, { ...lifetime, now: () => Number.MAX_SAFE_INTEGER });
  await assert.rejects(
    verifyInboundPage(
      {
        ...context,
        reader: {
          ...context.reader,
          publicKey: history.signingKey,
        },
      },
      request,
      response.bytes,
      lifetime,
    ),
    /authority/,
  );
  await assert.rejects(
    verifyInboundPage({ ...context, history: { ...history } }, request, response.bytes, lifetime),
    /Unverified/,
  );
  await assert.rejects(
    verifyInboundPage(
      { ...context, generationKey: new Uint8Array(32) },
      request,
      response.bytes,
      lifetime,
    ),
  );
  const damaged = new Uint8Array(retained);
  damaged[damaged.length - 3] ^= 1;
  await assert.rejects(verifyStoredInbound(context, damaged, lifetime));
});
