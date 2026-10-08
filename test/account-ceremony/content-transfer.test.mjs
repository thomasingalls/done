import {
  membershipCheckpointRequestMessage,
  verifyMembershipCheckpointRequest,
  verifyMembershipCheckpoint,
  parseMembershipCheckpointRequest,
} from '../../account-protocol/membershipCheckpoint.ts';
import { createServer, request as httpRequest } from 'node:http';
import { createSessionAccountHandler } from '../../account-service/session-host.ts';
import {
  verifyMembershipChain,
  verifyMembershipBootstrapResponse,
  verifyMembershipDiscoveryResponse,
} from '../../account-protocol/membershipLocator.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './development-fixtures.mjs';
import { signed, message, hash } from './exchange-oracle.mjs';
import { commitment, derive } from './oracle.mjs';
import { message as grantMessage, denial } from '../account-sessions/grant-fixtures.mjs';
import { registered } from '../account-core/fixtures.mjs';
import { AuthorizationRefused } from '../../account-service/authorization.ts';
import { ceremonyInvitationMessage } from '../../account-protocol/ceremonyRelay.ts';
import {
  createHash,
  createCipheriv,
  hkdfSync,
  randomBytes,
  generateKeyPairSync,
} from 'node:crypto';
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
import {
  decision,
  mutate,
  query,
  read,
  page,
  link,
} from '../account-successor/service-fixtures.mjs';
import {
  verifyCertificationHistory,
  historyAuthority,
  historyReader,
  historyDevices,
  verifyHistoryDecision,
  createAdmissionPrefixVerifier,
  historyPublisher,
  historyMembership,
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
  let checkpoint = {
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
  if (options.createCheckpoint)
    checkpoint = await options.createCheckpoint({ ...x, certification }, binding);
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
  const request = await prepare();
  const extra = x.candidate();
  extra.input.candidate.head = x.certification.head;
  assert.equal((await x.enroll('begin', extra.input)).refusal, 'connection-in-progress');
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
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
  assert.equal((await call({ ...request, receiptId: fresh() })).refusal, 'request-conflict');
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
  // Verified continuation history can accept an eligible queued epoch-3 payload at epoch 4.
  const count = x.f.rows('delivery_decisions').length;
  assert.equal((await x.deliveryCall(x.make(2, 'stale writer', { epoch: 3 }))).kind, 'decision');
  assert.equal(x.f.rows('delivery_decisions').length, count + 1);
  const saved = x.f.rows('membership_admissions')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_admissions SET boundaries=?').run('[]'));
  assert.equal((await call()).ok, false);
  mutate(x, (db) =>
    db.prepare('UPDATE membership_admissions SET boundaries=?').run(saved.boundaries),
  );
  assert.deepEqual(await call(), result);
});

test('only a proved next-device connection reserves the account; concurrent proof, cancellation and retry preserve one login', async (t) => {
  const authority = authorityFixture(t);
  const x = await checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
  });
  const entries = [x.candidate(), x.candidate()];
  for (const entry of entries) {
    entry.input.candidate.head = x.certification.head;
    entry.input.loginRetryKey = fresh();
  }
  const begun = await Promise.all(entries.map((entry) => x.enroll('begin', entry.input)));
  assert(begun.every((r) => r.stage === 'challenge'));
  const proofs = entries.map((entry, i) => nextProof(x, entry, begun[i].challenge));
  const results = await Promise.all(proofs.map((proof) => x.enroll('finish', proof)));
  assert.equal(results.filter((r) => r.stage === 'prepared').length, 1);
  assert.equal(results.filter((r) => r.refusal === 'connection-in-progress').length, 1);
  assert.equal(x.f.rows('network_sessions').length, 1);
  const winner = results.findIndex((r) => r.stage === 'prepared'),
    loser = 1 - winner;
  assert.equal(
    (await x.enroll('cancel', { retryKey: entries[winner].input.retryKey })).stage,
    'cancelled',
  );
  const resumed = await x.enroll('finish', proofs[loser]);
  assert.equal(resumed.stage, 'prepared', JSON.stringify(resumed));
  assert.equal(resumed.login.stage, 'issued');
  assert.equal(
    (await x.enroll('resume', { retryKey: entries[winner].input.retryKey })).stage,
    'cancelled',
  );
  assert.equal(
    x.f
      .rows('enrollment_preparations')
      .filter((r) => r.stage === 'prepared' && JSON.parse(r.receipt).v === 2).length,
    1,
  );
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
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 17);
  assert.deepEqual(db.prepare('SELECT * FROM membership_ceremonies').all(), []);
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

function continuationExchange(x, admission, entry, approving = 'existing') {
  const c = admission.epoch.preparation.context.candidate;
  const context = {
    ...x.context,
    v: 2,
    epoch: 4,
    head: admission.head,
    certifiedSetDigest: admission.epoch.certifiedSetDigest,
    existing: approving === 'existing' ? x.context.existing : x.context.candidate,
    candidate: { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
    attemptId: 'b1'.repeat(32),
  };
  const keys = { existing: x.keys[approving], new: entry.key };
  const nonces = { existing: 'b2'.repeat(32), new: 'b3'.repeat(32) };
  const seal = (label, body, role) => ({
    ...body,
    signature: signed(keys[role], message(label, body)),
  });
  const commits = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      seal(
        'done/enrollment-ceremony-commitment/v2',
        {
          v: 2,
          kind: 'ceremony-commitment',
          context,
          role,
          commitment: commitment(role, nonces[role]),
        },
        role,
      ),
    ]),
  );
  const contextHash = hash(message('done/enrollment-ceremony-context/v2', context));
  const reveals = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      seal(
        'done/enrollment-ceremony-reveal/v2',
        {
          v: 2,
          kind: 'ceremony-reveal',
          contextHash,
          role,
          existingCommitHash: hash(JSON.stringify(commits.existing)),
          newCommitHash: hash(JSON.stringify(commits.new)),
          nonce: nonces[role],
        },
        role,
      ),
    ]),
  );
  const request = (role, action, payload = null, patch = {}) =>
    seal(
      'done/enrollment-ceremony-relay/v2',
      {
        v: 2,
        kind: 'ceremony-relay',
        workspaceId: x.workspace,
        head: admission.head,
        preparationId: admission.epoch.preparation.context.attemptId,
        credentialId: role === 'existing' ? context.existing.id : context.candidate.id,
        action,
        payload,
        ...patch,
      },
      role,
    );
  const open = derive({
    workspaceId: x.workspace,
    epoch: 4,
    head: admission.head,
    existingCredentialId: context.existing.id,
    newCredentialId: context.candidate.id,
    wPub: c.wPub,
    sPub: c.sPub,
    recoveryStateDigest: context.recoveryStateDigest,
    nonceExisting: nonces.existing,
    nonceNew: nonces.new,
  });
  return {
    context,
    keys,
    commits,
    reveals,
    request,
    contextHash,
    approval: request('existing', 'decide', {
      contextHash,
      transcriptHash: open.transcriptHash,
      outcome: 'approved',
    }),
  };
}
async function continuationFixture(t, options = {}) {
  const authority = authorityFixture(t);
  const x = await checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    ...options,
  });
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  await options.beforeContinuation?.(x);
  const entry = options.nextCandidate?.(x) ?? x.candidate();
  entry.input.candidate.head = x.certification.head;
  const begun = await x.enroll('begin', entry.input);
  const proof = nextProof(x, entry, begun.challenge);
  const prepared = await x.enroll('finish', proof);
  const admissionInput = {
    retryKey: entry.input.retryKey,
    attemptId: prepared.receipt.context.attemptId,
    receiptId: prepared.receipt.receiptId,
  };
  const authorization = await options.beforeMembershipAdmission?.({
    ...x,
    entry,
    prepared,
    admissionInput,
  });
  const admission = await authority.owner.admitMembership(x.f.core, admissionInput, authorization);
  assert.equal(admission.kind, 'membership-admission', JSON.stringify(admission));
  return {
    ...x,
    entry,
    proof,
    admissionInput,
    admission,
    relay: (r, authorize) => authority.owner.relayMembershipCeremony(x.f.core, r, authorize),
    exchange: (role) => continuationExchange(x, admission, entry, role),
  };
}

function membershipCheckpointRead(
  x,
  credential = x.context.candidate.id,
  key = x.keys.new,
  patch = {},
) {
  const body = {
    v: 2,
    kind: 'membership-checkpoint-read',
    pin: x.authority.pin,
    workspaceId: x.workspace,
    lineageId: x.base.request.candidate.lineageId,
    credentialId: credential,
    epoch: 4,
    head: x.admission.head,
    nonce: 'be'.repeat(32),
    expiresAt: 61000,
    ...patch,
  };
  return { ...body, signature: signed(key, message('done/membership-checkpoint-read/v2', body)) };
}

test('continuation admission requires the immutable baseline and rechecks it before changing authority', async (t) => {
  let remove = null;
  const x = await continuationFixture(t, {
    hook(point, op) {
      if (point === 'after-verify' && op === 'admit-membership') remove?.();
    },
    async beforeMembershipAdmission(y) {
      const row = y.f.rows('content_checkpoints')[0],
        original = y.f.rows('promotions');
      const restore = () =>
        mutate(y, (db) =>
          db
            .prepare('INSERT OR REPLACE INTO content_checkpoints VALUES (?,?,?)')
            .run(row.workspace_id, row.checkpoint, row.admission),
        );
      const call = () => y.authority.owner.admitMembership(y.f.core, y.admissionInput);
      mutate(y, (db) => db.exec('DELETE FROM content_checkpoints'));
      assert.equal((await call()).refusal, 'checkpoint-required');
      assert.deepEqual(y.f.rows('promotions'), original);
      restore();
      const bad = structuredClone(y.checkpoint);
      bad.manifest.signature = '00'.repeat(64);
      mutate(y, (db) =>
        db.prepare('UPDATE content_checkpoints SET checkpoint=?').run(JSON.stringify(bad)),
      );
      assert.equal((await call()).ok, false);
      assert.deepEqual(y.f.rows('membership_admissions'), []);
      restore();
      remove = () => {
        remove = null;
        mutate(y, (db) => db.exec('DELETE FROM content_checkpoints'));
      };
      assert.equal((await call()).refusal, 'checkpoint-required');
      assert.deepEqual(y.f.rows('promotions'), original);
      assert.deepEqual(y.f.rows('membership_admissions'), []);
      restore();
    },
  });
  assert.equal(x.admission.kind, 'membership-admission');
});

test('later certified readers authenticate the original baseline without borrowing its earlier admission', async (t) => {
  const x = await continuationFixture(t),
    e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  const call = (request, authorization) =>
    x.authority.owner.readMembershipCheckpoint(x.f.core, request, authorization);
  const prior = x.f.rows('content_checkpoints');
  assert.equal(prior[0].admission, null); // No old receipt is needed or manufactured for this reader.
  assert.deepEqual(await call(membershipCheckpointRead(x)), { ok: true, checkpoint: x.checkpoint });
  assert.equal(
    (await call(membershipCheckpointRead(x, e.context.candidate.id, x.entry.key))).ok,
    false,
  );
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  assert.equal(
    (await call(membershipCheckpointRead(x, e.context.candidate.id, x.entry.key))).ok,
    false,
  );
  const installed = await d.transfer(d.request('new', 'install', d.installation));
  const request = membershipCheckpointRead(x, e.context.candidate.id, x.entry.key, {
    epoch: 5,
    head: installed.certification.head,
  });
  const { signature: _signature, ...body } = request;
  assert.deepEqual(
    Buffer.from(await membershipCheckpointRequestMessage(request)),
    message('done/membership-checkpoint-read/v2', body),
  );
  const { history } = await verifyMembershipChain(
    {
      successor: x.successor,
      certification: x.certification,
      continuations: [x.admission, installed.certification],
    },
    x.base,
  );
  const captured = structuredClone(request);
  const checking = verifyMembershipCheckpointRequest(captured, x.authority.pin, history, 1000);
  captured.head = 'ff'.repeat(32);
  assert.deepEqual(await checking, request);
  const checkpointAuthority = {
    base: x.base,
    successor: x.successor,
    certification: x.certification,
  };
  const result = await call(request);
  assert.deepEqual(
    await verifyMembershipCheckpoint(result.checkpoint, checkpointAuthority, history),
    x.checkpoint,
  );
  assert.deepEqual(
    await verifyMembershipCheckpoint(
      result.checkpoint,
      checkpointAuthority,
      historyPublisher(history, e.context.candidate.id),
    ),
    x.checkpoint,
  );
  await assert.rejects(
    verifyMembershipCheckpoint(result.checkpoint, checkpointAuthority, { ...history }),
  );
  const corrupt = structuredClone(result.checkpoint);
  corrupt.ct = '00'.repeat(32);
  await assert.rejects(verifyMembershipCheckpoint(corrupt, checkpointAuthority, history));
  for (const patch of [
    { head: x.admission.head, epoch: 4 },
    { epoch: 6 },
    { workspaceId: 'ff'.repeat(16) },
    { lineageId: 'ff'.repeat(32) },
    { expiresAt: 1000 },
    { expiresAt: 61001 },
    { pin: { ...x.authority.pin, serviceId: 'ff'.repeat(16) } },
  ]) {
    const bad = membershipCheckpointRead(x, e.context.candidate.id, x.entry.key, {
      epoch: request.epoch,
      head: request.head,
      ...patch,
    });
    await assert.rejects(verifyMembershipCheckpointRequest(bad, x.authority.pin, history, 1000));
    assert.equal((await call(bad)).ok, false);
  }
  await assert.rejects(
    verifyMembershipCheckpointRequest(
      { ...request, signature: '00'.repeat(64) },
      x.authority.pin,
      history,
      1000,
    ),
  );
  assert.throws(() => parseMembershipCheckpointRequest({ ...request, action: 'publish' }));
  assert.throws(() => parseMembershipCheckpointRequest({ ...request, nonce: 'x'.repeat(4097) }));
  assert.deepEqual(x.f.rows('content_checkpoints'), prior);
  const g = await continuationGrants(x),
    scope = {
      kind: 'workspace',
      workspaceId: x.workspace,
      credentialId: e.context.candidate.id,
    };
  const grant = await g.grant(scope, x.entry.key);
  assert.deepEqual(await call(request, x.f.core.grants.authorize(grant.grantToken)), result);
  await assert.rejects(
    call(
      membershipCheckpointRead(x, x.context.existing.id, x.keys.existing, {
        epoch: 5,
        head: request.head,
      }),
      x.f.core.grants.authorize(grant.grantToken),
    ),
    denial('insufficient-scope'),
  );
  x.f.restart();
  g.restart();
  await assert.rejects(
    call(request, x.f.core.grants.authorize(grant.grantToken)),
    denial('grant-required'),
  );
  const resumed = await g.grant(scope, x.entry.key);
  assert.deepEqual(await call(request, x.f.core.grants.authorize(resumed.grantToken)), result);
  const wire = x.make(1, 'third reader history', {
    epoch: 5,
    credential: scope.credentialId,
    signer: x.entry.key,
  });
  assert.equal((await x.deliveryCall(wire)).kind, 'decision');
  mutate(x, (db) =>
    db.prepare('DELETE FROM publisher_decisions WHERE credential_id=?').run(scope.credentialId),
  );
  assert.equal((await call(request, x.f.core.grants.authorize(resumed.grantToken))).ok, false);
  assert.deepEqual(x.f.rows('content_checkpoints'), prior);
});

test('historical checkpoint reads recheck the captured row, login and deadline after verification', async (t) => {
  let at = 1000,
    act = null;
  const x = await continuationFixture(t, {
    now: () => at,
    hook(point, op) {
      if (op === 'membership-checkpoint') act?.(point);
    },
  });
  const request = membershipCheckpointRead(x),
    call = (guard) => x.authority.owner.readMembershipCheckpoint(x.f.core, request, guard);
  const row = x.f.rows('content_checkpoints')[0];
  act = (point) => {
    if (point !== 'after-verify') return;
    act = null;
    mutate(x, (db) => db.exec('DELETE FROM content_checkpoints'));
  };
  assert.equal((await call()).ok, false);
  mutate(x, (db) =>
    db
      .prepare('INSERT INTO content_checkpoints VALUES (?,?,?)')
      .run(row.workspace_id, row.checkpoint, row.admission),
  );
  const g = await continuationGrants(x),
    grant = await g.grant(
      {
        kind: 'workspace',
        workspaceId: x.workspace,
        credentialId: request.credentialId,
      },
      x.keys.new,
    );
  act = (point) => {
    if (point === 'after-verify') g.revoke();
  };
  await assert.rejects(
    call(x.f.core.grants.authorize(grant.grantToken)),
    denial('sign-in-required'),
  );
  act = (point) => {
    if (point === 'before-commit') at = 61000;
  };
  assert.equal((await call()).ok, false);
  assert.deepEqual(x.f.rows('content_checkpoints'), [row]);
});

for (const approving of ['existing', 'new'])
  test(`continuation relay preserves the original ceremony and binds restart/retry to the ${approving} approver`, async (t) => {
    const x = await continuationFixture(t),
      e = x.exchange(approving);
    const original = x.f.rows('content_ceremonies');
    assert.equal((await x.relay(e.request('new', 'read'))).stage, 'waiting');
    assert.equal(
      (await x.relay({ ...e.request('new', 'read'), signature: '00'.repeat(64) })).ok,
      false,
    );
    assert.equal(
      (await x.relay(e.request('existing', 'commit', e.commits.existing))).stage,
      'exchanging',
    );
    assert.equal(
      (await x.relay(e.request('existing', 'reveal', e.reveals.existing))).refusal,
      'commitments-required',
    );
    assert.equal((await x.relay(e.request('new', 'commit', e.commits.new))).ok, true);
    for (const role of ['existing', 'new'])
      assert.equal((await x.relay(e.request(role, 'reveal', e.reveals[role]))).ok, true);
    const result = await x.relay(e.approval);
    assert.equal(result.stage, 'approved', JSON.stringify(result));
    x.f.restart();
    x.authority.restart();
    assert.deepEqual(await x.relay(e.approval), result);
    assert.deepEqual(await x.relay(e.request('new', 'read')), result);
    assert.equal(
      (await x.relay(e.request('new', 'cancel', { contextHash: e.contextHash }))).ok,
      false,
    );
    assert.deepEqual(x.f.rows('content_ceremonies'), original);
    assert.equal(
      (await x.enroll('resume', { retryKey: x.entry.input.retryKey })).stage,
      'admitted',
    );
    assert.equal(
      (await x.enroll('cancel', { retryKey: x.entry.input.retryKey })).stage,
      'admitted',
    );
    assert.equal((await x.enroll('finish', x.proof)).stage, 'admitted');
    assert.deepEqual(
      await x.authority.owner.admitMembership(x.f.core, x.admissionInput),
      x.admission,
    );
    const another = x.candidate();
    another.input.candidate.head = x.admission.head;
    assert.equal((await x.enroll('begin', another.input)).refusal, 'connection-in-progress');
    assert.equal(
      (await x.relay(e.request('new', 'read', null, { head: 'ff'.repeat(32) }))).ok,
      false,
    );
    assert.equal(
      (await x.relay(e.request('new', 'read', null, { preparationId: fresh() }))).ok,
      false,
    );
    assert.equal(
      (await x.authority.owner.relayCeremony(x.f.core, e.request('new', 'read'))).refusal,
      'malformed',
    );
  });

test('continuation commitment/approval aborts, lost replies and final authorization checks retain exact state', async (t) => {
  let fault = null;
  const x = await continuationFixture(t, {
      hook(at, op) {
        if (op === 'membership-ceremony' && at === fault) {
          fault = null;
          throw Error('Interrupted relay');
        }
      },
    }),
    e = x.exchange('new');
  const commit = e.request('existing', 'commit', e.commits.existing);
  fault = 'before-commit';
  assert.equal((await x.relay(commit)).ok, false);
  assert.deepEqual(x.f.rows('membership_ceremonies'), []);
  fault = 'after-commit';
  assert.equal((await x.relay(commit)).ok, false);
  x.f.restart();
  assert.equal((await x.relay(commit)).stage, 'exchanging');
  assert.equal(x.f.rows('membership_ceremonies').length, 1);
  const target = {
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: e.context.candidate.id,
    attemptId: x.admissionInput.attemptId,
    action: 'ceremony',
  };
  const before = x.f.rows('membership_ceremonies');
  await assert.rejects(
    x.relay(e.request('new', 'commit', e.commits.new), (db, actual) => {
      assert.equal(db.isTransaction, true);
      assert.deepEqual(actual, target);
      return () => {
        throw new AuthorizationRefused('session-expired');
      };
    }),
    AuthorizationRefused,
  );
  assert.deepEqual(x.f.rows('membership_ceremonies'), before);
  assert.equal((await x.relay(e.request('new', 'commit', e.commits.new))).ok, true);
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'reveal', e.reveals[role]));
  fault = 'before-commit';
  assert.equal((await x.relay(e.approval)).ok, false);
  assert.equal(x.f.rows('membership_ceremonies')[0].decision, null);
  fault = 'after-commit';
  assert.equal((await x.relay(e.approval)).ok, false);
  x.f.restart();
  assert.equal(
    (await x.relay(e.request('new', 'cancel', { contextHash: e.contextHash }))).ok,
    false,
  );
  assert.equal((await x.relay(e.approval)).stage, 'approved');
});

test('competing certified approvers cannot replace the retained pair; cancellation stays terminal', async (t) => {
  const x = await continuationFixture(t),
    a = x.exchange('existing'),
    b = x.exchange('new');
  const candidates = [a, b];
  const outcomes = await Promise.all(
    candidates.map((e) => x.relay(e.request('existing', 'commit', e.commits.existing))),
  );
  assert.equal(outcomes.filter((r) => r.ok).length, 1);
  const winner = outcomes.findIndex((r) => r.ok),
    e = candidates[winner],
    loser = candidates[1 - winner];
  const original = x.f.rows('membership_ceremonies');
  assert.equal(
    (await x.relay(loser.request('existing', 'commit', loser.commits.existing))).ok,
    false,
  );
  assert.deepEqual(x.f.rows('membership_ceremonies'), original);
  const cancel = e.request('new', 'cancel', { contextHash: e.contextHash });
  assert.equal((await x.relay(cancel)).stage, 'cancelled');
  x.f.restart();
  assert.equal((await x.relay(cancel)).stage, 'cancelled');
  assert.equal((await x.relay(e.request('new', 'commit', e.commits.new))).ok, false);
  assert.equal((await x.relay(e.approval)).ok, false);
  assert.equal(x.f.rows('membership_ceremonies')[0].decision, null);
});

test('continuation relay refuses authority changes, expiry at commit and tampered retained approval', async (t) => {
  let clock = 1000,
    change = false;
  const x = await continuationFixture(t, {
      now: () => clock,
      hook(at, op) {
        if (op === 'membership-ceremony' && at === 'after-verify' && change) {
          change = false;
          mutate(x, (db) =>
            db.prepare('UPDATE promotions SET successor_head=?').run('ef'.repeat(32)),
          );
        }
      },
    }),
    e = x.exchange('existing');
  change = true;
  assert.equal((await x.relay(e.request('existing', 'commit', e.commits.existing))).ok, false);
  assert.deepEqual(x.f.rows('membership_ceremonies'), []);
  mutate(x, (db) => db.prepare('UPDATE promotions SET successor_head=?').run(x.admission.head));
  await x.relay(e.request('existing', 'commit', e.commits.existing));
  const before = x.f.rows('membership_ceremonies');
  const r = await x.relay(e.request('new', 'commit', e.commits.new), () => {
    clock = e.context.expiresAt;
    return () => {};
  });
  assert.equal(r.refusal, 'expired');
  assert.deepEqual(x.f.rows('membership_ceremonies'), before);
  clock = 1000;
  await x.relay(e.request('new', 'commit', e.commits.new));
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'reveal', e.reveals[role]));
  await x.relay(e.approval);
  const saved = x.f.rows('membership_ceremonies')[0];
  mutate(x, (db) =>
    db
      .prepare('UPDATE membership_ceremonies SET decision=?')
      .run(JSON.stringify({ ...e.approval, signature: '00'.repeat(64) })),
  );
  assert.equal((await x.relay(e.request('new', 'read'))).ok, false);
  mutate(x, (db) => db.prepare('UPDATE membership_ceremonies SET decision=?').run(saved.decision));
  clock = e.context.expiresAt + 1;
  assert.equal((await x.relay(e.approval)).stage, 'approved');
});

test('private schema-15 admission needs an explicit offline relay upgrade and keeps prior proof bytes', async (t) => {
  const x = await continuationFixture(t);
  const path = x.f.path + '.offline-v15';
  const source = new DatabaseSync(x.f.path);
  await backup(source, path);
  source.close();
  let db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE membership_transfers; DROP TABLE membership_ceremonies; PRAGMA user_version=15;',
  );
  db.close();
  const sessions = { pin: x.authority.pin, operatorKey: x.authority.key };
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /explicit offline upgrade/,
  );
  const upgraded = new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV15: true,
  });
  upgraded.close();
  db = new DatabaseSync(path);
  assert.deepEqual(
    db.prepare('SELECT * FROM membership_admissions').all(),
    x.f.rows('membership_admissions'),
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM content_ceremonies').all(),
    x.f.rows('content_ceremonies'),
  );
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 17);
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

test('a valid version-2 relay decision cannot replace the original version-1 delivery approval', async (t) => {
  const x = await approved(t);
  const body = {
    v: 2,
    kind: 'ceremony-relay',
    workspaceId: x.workspace,
    head: x.successor.head,
    preparationId: x.prepared.input.attemptId,
    credentialId: x.context.existing.id,
    action: 'decide',
    payload: x.approval.payload,
  };
  const decision = {
    ...body,
    signature: signed(x.keys.existing, message('done/enrollment-ceremony-relay/v2', body)),
  };
  const mixed = await x.signDelivery({ ...x.delivery, decision });
  await assert.rejects(verifyContentDelivery(mixed, x.base, x.successor), /approved ceremony/);
});

async function continuationDelivery(x, e, wrap = { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) }) {
  const sign = (label, body, key) => {
    const { signature: _, ...value } = body;
    return { ...value, signature: signed(key, message(label, value)) };
  };
  const certificate = sign(
    'done/membership-recipient-certificate/v2',
    {
      v: 2,
      workspaceId: x.workspace,
      lineageId: e.context.lineageId,
      parent: x.admission.head,
      epoch: 5,
      generation: 1,
      members: x.admission.epoch.roster.map(({ id, wPub, sPub }) => ({ id, wPub, sPub })),
      recoveryStateDigest: e.context.recoveryStateDigest,
      approver: e.context.existing.id,
    },
    e.keys.existing,
  );
  const sealDelivery = (body) => sign('done/membership-key-delivery/v2', body, e.keys.existing);
  const delivery = sealDelivery({
    v: 2,
    kind: 'membership-key-delivery',
    parent: x.admission.head,
    preparationId: x.admissionInput.attemptId,
    generation: 1,
    transcriptHash: e.approval.payload.transcriptHash,
    existing: e.commits.existing,
    candidate: e.commits.new,
    existingReveal: e.reveals.existing,
    newReveal: e.reveals.new,
    decision: e.approval,
    certificate,
    recovery: x.base.request.recovery,
    wrap,
  });
  const installation = sign(
    'done/membership-key-installed/v2',
    {
      v: 2,
      kind: 'membership-key-installed',
      deliveryHash: hash(JSON.stringify(delivery)),
      credentialId: e.context.candidate.id,
    },
    e.keys.new,
  );
  const request = (role, action, payload = null, patch = {}) =>
    sign(
      'done/membership-key-transfer/v2',
      {
        v: 2,
        workspaceId: x.workspace,
        credentialId: role === 'existing' ? e.context.existing.id : e.context.candidate.id,
        parent: x.admission.head,
        preparationId: x.admissionInput.attemptId,
        action,
        payload,
        ...patch,
      },
      e.keys[role],
    );
  const transfer = (r, authorize) => x.authority.owner.transferMembership(x.f.core, r, authorize);
  const approve = async () => {
    for (const role of ['existing', 'new'])
      assert.equal((await x.relay(e.request(role, 'commit', e.commits[role]))).ok, true);
    for (const role of ['existing', 'new'])
      assert.equal((await x.relay(e.request(role, 'reveal', e.reveals[role]))).ok, true);
    assert.equal((await x.relay(e.approval)).stage, 'approved');
  };
  return { certificate, delivery, installation, sealDelivery, request, transfer, approve };
}
for (const approver of ['existing', 'new'])
  test(`private continuation transfer by ${approver} preserves both ledgers across aborted/lost certification and restart`, async (t) => {
    let fault = null;
    const x = await continuationFixture(t, {
        hook(at, op) {
          if (op === 'membership-transfer' && at === fault) {
            fault = null;
            throw Error('Interrupted transfer');
          }
        },
        beforeContinuation: async (x) => {
          assert.equal(
            (await x.deliveryCall(x.make(1, 'first before joining', { epoch: 3 }))).kind,
            'decision',
          );
          assert.equal(
            (
              await x.deliveryCall(
                x.make(1, 'second before joining', {
                  epoch: 3,
                  credential: x.context.candidate.id,
                  signer: x.keys.new,
                }),
              )
            ).kind,
            'decision',
          );
        },
      }),
      e = x.exchange(approver),
      d = await continuationDelivery(x, e);
    const prior = [
      'workspace_successors',
      'content_ceremonies',
      'content_transfers',
      'content_checkpoints',
      'membership_admissions',
    ].map((table) => [table, x.f.rows(table)]);
    const deliver = d.request('existing', 'deliver', d.delivery),
      install = d.request('new', 'install', d.installation);
    assert.equal((await d.transfer(deliver)).refusal, 'approval-required');
    await d.approve();
    fault = 'before-commit';
    assert.equal((await d.transfer(deliver)).ok, false);
    assert.deepEqual(x.f.rows('membership_transfers'), []);
    fault = 'after-commit';
    assert.equal((await d.transfer(deliver)).ok, false);
    x.f.restart();
    x.authority.restart();
    const delivered = await d.transfer(deliver);
    assert.equal(delivered.ok, true, JSON.stringify(delivered));
    assert.deepEqual(delivered.delivery, d.delivery);
    assert.equal(delivered.certification, null);
    assert.equal(x.f.rows('promotions')[0].successor_head, x.admission.head);
    const boundaries = [
      x.f.rows('promotions')[0].delivery_witness,
      x.f.rows('publisher_witnesses'),
    ];
    fault = 'before-commit';
    assert.equal((await d.transfer(install)).ok, false);
    assert.equal(x.f.rows('membership_transfers')[0].artifact, null);
    assert.deepEqual(
      [x.f.rows('promotions')[0].delivery_witness, x.f.rows('publisher_witnesses')],
      boundaries,
    );
    fault = 'after-commit';
    assert.equal((await d.transfer(install)).ok, false);
    x.f.restart();
    x.authority.restart();
    const installed = await d.transfer(install);
    assert.equal(installed.ok, true, JSON.stringify(installed));
    assert.equal(installed.certification.epoch.epoch, 5);
    assert.deepEqual(await d.transfer(install), installed);
    assert.deepEqual(await d.transfer(d.request('new', 'read')), installed);
    assert.equal(x.f.rows('promotions')[0].successor_head, installed.certification.head);
    for (const m of x.certification.epoch.roster)
      assert.equal(
        installed.certification.epoch.heads.find((h) => h.credentialId === m.id).position,
        1,
      );
    assert.equal(
      installed.certification.epoch.heads.find((h) => h.credentialId === e.context.candidate.id)
        .position,
      0,
    );
    for (const [table, rows] of prior) assert.deepEqual(x.f.rows(table), rows, table);
    assert.deepEqual(
      await x.authority.owner.admitMembership(x.f.core, x.admissionInput),
      x.admission,
    );
    assert.equal(
      (await x.enroll('resume', { retryKey: x.entry.input.retryKey })).stage,
      'admitted',
    );
    assert.equal((await x.relay(e.approval)).stage, 'approved');
    // A queued epoch-3 payload is accepted under the verified current epoch-5 authority.
    assert.equal(
      (await x.deliveryCall(x.make(2, 'queued publisher', { epoch: 3 }))).kind,
      'decision',
    );
  });

test('continuation installation cannot cross final authorization, receipt or current-head boundaries', async (t) => {
  let invalidate = false;
  const x = await continuationFixture(t, {
      hook(at, op) {
        if (invalidate && op === 'membership-transfer' && at === 'after-verify') {
          invalidate = false;
          mutate(x, (db) =>
            db.prepare('UPDATE promotions SET successor_head=?').run('ef'.repeat(32)),
          );
        }
      },
    }),
    e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  const install = d.request('new', 'install', d.installation),
    before = x.f.rows('membership_transfers');
  await assert.rejects(
    d.transfer(install, (db, target) => {
      assert.equal(db.isTransaction, true);
      assert.equal(target.attemptId, x.admissionInput.attemptId);
      assert.equal(target.action, 'transfer');
      return () => {
        throw new AuthorizationRefused('session-expired');
      };
    }),
    AuthorizationRefused,
  );
  assert.deepEqual(x.f.rows('membership_transfers'), before);
  assert.equal(
    (await d.transfer(d.request('existing', 'install', d.installation))).refusal,
    'invalid-proof',
  );
  assert.equal(
    (await d.transfer(d.request('new', 'read', null, { preparationId: fresh() }))).refusal,
    'stale',
  );
  const altered = d.sealDelivery({
    ...d.delivery,
    wrap: { ...d.delivery.wrap, ct: 'ef'.repeat(48) },
  });
  assert.equal(
    (await d.transfer(d.request('existing', 'deliver', altered))).refusal,
    'delivery-conflict',
  );
  invalidate = true;
  assert.equal((await d.transfer(install)).ok, false);
  assert.deepEqual(x.f.rows('membership_transfers'), before);
  mutate(x, (db) => db.prepare('UPDATE promotions SET successor_head=?').run(x.admission.head));
  assert.equal((await d.transfer(install)).ok, true);
});

test('continuation certification verifies frozen publisher witnesses and refuses missing or tampered coverage', async (t) => {
  const x = await continuationFixture(t, {
      beforeContinuation: async (x) => {
        await x.deliveryCall(x.make(1, 'retained first', { epoch: 3 }));
        await x.deliveryCall(
          x.make(1, 'retained second', {
            epoch: 3,
            credential: x.context.candidate.id,
            signer: x.keys.new,
          }),
        );
      },
    }),
    e = x.exchange('existing'),
    d = await continuationDelivery(x, e);
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  const install = d.request('new', 'install', d.installation),
    row = x.f.rows('membership_admissions')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_admissions SET boundaries=?').run('[]'));
  assert.equal((await d.transfer(install)).ok, false);
  assert.equal(x.f.rows('membership_transfers')[0].artifact, null);
  mutate(x, (db) =>
    db.prepare('UPDATE membership_admissions SET boundaries=?').run(row.boundaries),
  );
  const witness = x.f.rows('publisher_witnesses')[0];
  mutate(x, (db) => db.exec('DELETE FROM publisher_witnesses'));
  assert.equal((await d.transfer(install)).ok, false);
  mutate(x, (db) =>
    db
      .prepare('INSERT INTO publisher_witnesses VALUES (?,?,?)')
      .run(witness.account_id, witness.credential_id, witness.witness),
  );
  const result = await d.transfer(install);
  assert.equal(result.ok, true, JSON.stringify(result));
  const stored = x.f.rows('membership_transfers')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_transfers SET boundaries=?').run('[]'));
  assert.equal((await d.transfer(d.request('new', 'read'))).ok, false);
  mutate(x, (db) =>
    db.prepare('UPDATE membership_transfers SET boundaries=?').run(stored.boundaries),
  );
  assert.deepEqual(await d.transfer(install), result);
});

test('schema-16 pending comparison upgrades explicitly without replacing its messages', async (t) => {
  const x = await continuationFixture(t),
    e = x.exchange('existing');
  await x.relay(e.request('existing', 'commit', e.commits.existing));
  const path = x.f.path + '.offline-v16',
    source = new DatabaseSync(x.f.path);
  await backup(source, path);
  source.close();
  let db = new DatabaseSync(path);
  db.exec('DROP TABLE membership_transfers; PRAGMA user_version=16;');
  db.close();
  const sessions = { pin: x.authority.pin, operatorKey: x.authority.key },
    policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /explicit offline upgrade/,
  );
  const upgraded = new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV16: true,
  });
  upgraded.close();
  db = new DatabaseSync(path);
  assert.deepEqual(
    db.prepare('SELECT * FROM membership_ceremonies').all(),
    x.f.rows('membership_ceremonies'),
  );
  assert.deepEqual(db.prepare('SELECT * FROM membership_transfers').all(), []);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 17);
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

test('three publisher ledgers preserve queued payloads, refused parents and live admission/certification cuts through restart', async (t) => {
  const retained = new Map();
  const x = await continuationFixture(t, {
      beforeContinuation: async (x) => {
        for (const [id, signer] of [
          [x.context.existing.id, x.keys.existing],
          [x.context.candidate.id, x.keys.new],
        ]) {
          const w = x.make(1, 'before third-device admission', {
              epoch: 3,
              credential: id,
              signer,
            }),
            r = await x.deliveryCall(w);
          decision(x, r, w, undefined, 3);
          retained.set(id, [{ w, r, epoch: 3 }]);
        }
      },
    }),
    e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  const append = async (id, signer, epoch, position, parent) => {
    const prior = retained.get(id) ?? [],
      previous = prior.reduce((h, v) => link(v.w.subject, h), '00'.repeat(32));
    const w = x.make(position, 'writing across membership', {
        epoch,
        credential: id,
        signer,
        ...(parent ? { parent } : {}),
      }),
      r = await x.deliveryCall(w);
    const issuance = x.f.rows('membership_transfers')[0]?.artifact ? 5 : 4;
    decision(x, r, w, previous, issuance);
    prior.push({ w, r, epoch: issuance });
    retained.set(id, prior);
    return { w, r };
  };
  await append(x.context.existing.id, x.keys.existing, 3, 2);
  await append(x.context.candidate.id, x.keys.new, 4, 2);
  const rejected = x.make(3, 'wrong generation before certification', { epoch: 4, gen: 2 });
  const refusal = decision(x, await x.deliveryCall(rejected), rejected).refusal;
  assert(refusal);
  const tooEarly = x.make(1, 'pending publisher', {
    epoch: 4,
    credential: e.context.candidate.id,
    signer: e.keys.new,
  });
  assert.equal((await x.deliveryCall(tooEarly)).kind, 'unknown');
  const pendingRead = query(
    x,
    0,
    8,
    {
      epoch: 4,
      head: x.admission.head,
      reader: e.context.candidate.id,
      publisher: x.context.existing.id,
    },
    e.keys.new,
  );
  assert.equal((await read(x, pendingRead)).kind, 'unknown');
  await d.approve();
  assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
  const installed = await d.transfer(d.request('new', 'install', d.installation));
  assert.equal(installed.ok, true, JSON.stringify(installed));
  for (const m of x.certification.epoch.roster)
    assert.equal(
      installed.certification.epoch.heads.find((h) => h.credentialId === m.id).position,
      2,
    );
  await append(x.context.existing.id, x.keys.existing, 4, 3, refusal);
  await append(x.context.candidate.id, x.keys.new, 3, 3);
  assert.equal((await x.deliveryCall(tooEarly)).kind, 'unknown');
  await append(e.context.candidate.id, e.keys.new, 5, 1);
  x.f.restart();
  x.authority.restart();
  for (const values of retained.values())
    for (const { w, r } of values) assert.deepEqual(await x.deliveryCall(w), r);
  assert.deepEqual(await d.transfer(d.request('new', 'install', d.installation)), installed);
  assert.deepEqual(
    await x.authority.owner.admitMembership(x.f.core, x.admissionInput),
    x.admission,
  );
  for (const [publisher, values] of retained) {
    const q = query(
      x,
      0,
      8,
      { epoch: 5, head: installed.certification.head, reader: e.context.candidate.id, publisher },
      e.keys.new,
    );
    page(x, await read(x, q), q, values);
  }
  const thirdRead = query(x, 0, 8, {
    epoch: 5,
    head: installed.certification.head,
    publisher: e.context.candidate.id,
  });
  page(x, await read(x, thirdRead), thirdRead, retained.get(e.context.candidate.id));
  const row = x.f.rows('membership_transfers')[0],
    bounds = JSON.parse(row.boundaries);
  const first = bounds.find((b) => b.credentialId === x.context.existing.id);
  assert.equal(first.witness.events, 3); // Includes the refusal beyond the accepted position 2.
  first.witness.events = 2;
  mutate(x, (db) =>
    db.prepare('UPDATE membership_transfers SET boundaries=?').run(JSON.stringify(bounds)),
  );
  assert.equal((await read(x, thirdRead)).kind, 'decision'); // Independent third-publisher ledger remains valid.
  const damaged = query(x, 0, 8, {
    epoch: 5,
    head: installed.certification.head,
    publisher: x.context.existing.id,
  });
  assert.equal((await read(x, damaged)).kind, 'unknown');
  mutate(x, (db) => db.prepare('UPDATE membership_transfers SET boundaries=?').run(row.boundaries));
  page(x, await read(x, damaged), damaged, retained.get(x.context.existing.id));
});

async function continuationGrants(x, account = x.account) {
  const retryKey = fresh(),
    begun = x.f.core.sessions.begin({ accountId: account.result.accountId, retryKey }),
    session = await x.f.core.sessions.finish({
      retryKey,
      attemptId: begun.attemptId,
      response: account.key.assert(begun),
    });
  assert.equal(session.stage, 'issued', JSON.stringify(session));
  const renew = () =>
    x.f.core.sessions.renew({
      sessionId: session.sessionId,
      renewalToken: session.renewalToken,
    });
  let access = renew();
  const begin = (scope) => x.authority.owner.beginGrant(x.f.core, access.accessToken, scope);
  const finish = (challenge, key) =>
    x.f.core.grants.finish(access.accessToken, {
      challengeId: challenge.challengeId,
      signature: signed(key, grantMessage(challenge)),
    });
  const grant = async (scope, key) => {
    const b = await begin(scope);
    assert.equal(b.stage, 'challenge', JSON.stringify(b));
    const g = await finish(b.challenge, key);
    assert.equal(g.stage, 'granted', JSON.stringify(g));
    return g;
  };
  return {
    begin,
    finish,
    grant,
    session,
    restart: () => {
      access = renew();
      assert.equal(access.stage, 'access');
    },
    revoke: () =>
      x.f.core.sessions.revoke({
        sessionId: session.sessionId,
        revokeToken: session.revokeToken,
      }),
  };
}

test('continuation grants distinguish both approvers, pending enrollment and certified content through restart', async (t) => {
  let g, scopes, prior;
  const x = await continuationFixture(t, {
    async beforeMembershipAdmission(y) {
      g = await continuationGrants(y);
      scopes = Object.fromEntries(
        [
          ['first', y.context.existing.id],
          ['second', y.context.candidate.id],
          ['candidate', y.entry.input.candidate.credentialId],
        ].map(([role, credentialId]) => [
          role,
          {
            kind: 'enrollment',
            workspaceId: y.workspace,
            credentialId,
            attemptId: y.admissionInput.attemptId,
          },
        ]),
      );
      prior = {
        first: await g.grant(scopes.first, y.keys.existing),
        second: await g.grant(scopes.second, y.keys.new),
        candidate: await g.grant(scopes.candidate, y.entry.key),
      };
      return y.f.core.grants.authorize(prior.candidate.grantToken);
    },
  });
  const e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  const enrollment = scopes.candidate;
  const workspace = (scope) => ({
    kind: 'workspace',
    workspaceId: scope.workspaceId,
    credentialId: scope.credentialId,
  });
  const guard = (grant) => x.f.core.grants.authorize(grant.grantToken);
  for (const old of Object.values(prior)) {
    assert.throws(
      () => x.f.core.grants.subscription(old.grantToken, old.scope),
      denial('authority-changed'),
    );
  }
  assert.equal((await g.begin(workspace(enrollment))).refusal, 'insufficient-scope');
  assert.equal(
    (await g.begin({ ...enrollment, attemptId: fresh() })).refusal,
    'insufficient-scope',
  );
  assert.equal(
    (await g.begin({ ...enrollment, credentialId: 'ff'.repeat(16) })).refusal,
    'insufficient-scope',
  );
  assert.equal(
    (await g.begin({ ...scopes.first, attemptId: x.prepared.input.attemptId })).refusal,
    'insufficient-scope',
  );
  const stranger = await registered(x.f);
  x.f.seedActive(stranger.result.accountId);
  const other = await continuationGrants(x, stranger);
  assert.equal((await other.begin(enrollment)).refusal, 'wrong-account');
  const proof = await g.begin(enrollment);
  assert.equal((await g.finish(proof.challenge, x.keys.existing)).refusal, 'invalid-proof');
  const candidate = await g.grant(enrollment, x.entry.key),
    second = await g.grant(scopes.second, x.keys.new),
    writer = await g.grant(workspace(scopes.first), x.keys.existing);
  await assert.rejects(
    x.relay(e.request('existing', 'read'), guard(candidate)),
    denial('insufficient-scope'),
  );
  const subscription = x.f.core.grants.subscription(writer.grantToken, writer.scope);
  const wire = x.make(1, 'grant-governed write', { epoch: 4 });
  assert.equal(
    (
      await x.authority.owner.decideSubmission(
        x.f.core,
        {
          workspaceId: x.workspace,
          bytes: wire.bytes,
        },
        guard(writer),
      )
    ).kind,
    'decision',
  );
  subscription.check();
  for (const [role, grant] of [
    ['existing', second],
    ['new', candidate],
  ])
    assert.equal(
      (await x.relay(e.request(role, 'commit', e.commits[role]), guard(grant))).ok,
      true,
    );
  for (const [role, grant] of [
    ['existing', second],
    ['new', candidate],
  ])
    assert.equal(
      (await x.relay(e.request(role, 'reveal', e.reveals[role]), guard(grant))).ok,
      true,
    );
  assert.equal((await x.relay(e.approval, guard(second))).stage, 'approved');
  assert.equal(
    (await d.transfer(d.request('existing', 'deliver', d.delivery), guard(second))).ok,
    true,
  );
  const installedGrant = await g.grant(enrollment, x.entry.key);
  const installed = await d.transfer(
    d.request('new', 'install', d.installation),
    guard(installedGrant),
  );
  assert.equal(installed.certification?.epoch.epoch, 5, JSON.stringify(installed));
  assert.throws(() => subscription.check(), denial('authority-changed'));
  await assert.rejects(
    d.transfer(d.request('new', 'install', d.installation), guard(installedGrant)),
    denial('authority-changed'),
  );
  const retry = await g.grant(enrollment, x.entry.key);
  assert.deepEqual(
    await d.transfer(d.request('new', 'install', d.installation), guard(retry)),
    installed,
  );
  const ready = await g.grant(workspace(enrollment), x.entry.key);
  const request = query(
    x,
    0,
    8,
    {
      reader: enrollment.credentialId,
      publisher: x.credential,
      epoch: 5,
      head: installed.certification.head,
    },
    x.entry.key,
  );
  page(x, await x.authority.owner.readInbound(x.f.core, request, guard(ready)), request, [
    { w: wire, r: await x.deliveryCall(wire), epoch: 4 },
  ]);
  x.f.restart();
  await assert.rejects(
    x.authority.owner.readInbound(x.f.core, request, guard(ready)),
    denial('grant-required'),
  );
  g.restart();
  const resumed = await g.grant(workspace(enrollment), x.entry.key);
  assert.equal(
    (await x.authority.owner.readInbound(x.f.core, request, guard(resumed))).kind,
    'decision',
  );
  g.revoke();
  await assert.rejects(
    x.authority.owner.readInbound(x.f.core, request, guard(resumed)),
    denial('sign-in-required'),
  );
});

test('continuation grant verification refuses changed pointers, receipts and changes before grant publication', async (t) => {
  const x = await continuationFixture(t),
    g = await continuationGrants(x);
  const scope = {
    kind: 'workspace',
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
  };
  const saved = x.f.rows('promotions')[0];
  const begin = g.begin(scope);
  mutate(x, (db) => db.prepare('UPDATE promotions SET successor_head=?').run('aa'.repeat(32)));
  assert.equal((await begin).refusal, 'authority-changed');
  assert.equal((await g.begin(scope)).refusal, 'storage-unavailable');
  mutate(x, (db) => db.prepare('UPDATE promotions SET successor_head=?').run(saved.successor_head));
  const pending = await g.begin(scope);
  const row = x.f.rows('membership_admissions')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_admissions SET artifact=?').run('{}'));
  assert.equal((await g.finish(pending.challenge, x.keys.new)).refusal, 'authority-changed');
  assert.equal((await g.begin(scope)).refusal, 'storage-unavailable');
  mutate(x, (db) => db.prepare('UPDATE membership_admissions SET artifact=?').run(row.artifact));
  assert.equal((await g.grant(scope, x.keys.new)).stage, 'granted');
  const preparation = x.f
    .rows('enrollment_preparations')
    .find((r) => r.id === x.admissionInput.attemptId);
  mutate(x, (db) =>
    db
      .prepare('UPDATE enrollment_preparations SET receipt=? WHERE id=?')
      .run(
        JSON.stringify({ ...JSON.parse(preparation.receipt), receiptId: fresh() }),
        preparation.id,
      ),
  );
  assert.equal(
    (await g.begin({ ...scope, kind: 'enrollment', attemptId: preparation.id })).refusal,
    'storage-unavailable',
  );
});

function membershipLocatorRequests(x) {
  const seal = (label, body, key) => ({ ...body, signature: signed(key, message(label, body)) });
  const invitation = (id = x.context.candidate.id, key = x.keys.new, patch = {}) =>
    seal(
      'done/membership-invitation/v2',
      {
        v: 2,
        workspaceId: x.workspace,
        lineageId: x.context.lineageId,
        credentialId: id,
        epoch: 3,
        head: x.certification.head,
        nonce: 'd1'.repeat(32),
        ...patch,
      },
      key,
    );
  const bootstrap = (invite = invitation()) => ({
    v: 2,
    workspaceId: x.workspace,
    nonce: 'd2'.repeat(32),
    invitation: invite,
  });
  const discovery = (id = x.context.candidate.id, key = x.keys.new, patch = {}) =>
    seal(
      'done/membership-discovery-request/v2',
      {
        v: 2,
        kind: 'membership-discovery-request',
        pin: x.authority.pin,
        workspaceId: x.workspace,
        lineageId: x.context.lineageId,
        credentialId: id,
        epoch: 3,
        head: x.certification.head,
        nonce: 'd3'.repeat(32),
        expiresAt: 61000,
        ...patch,
      },
      key,
    );
  return { invitation, bootstrap, discovery };
}

test('continuation bootstrap permits either certified inviter and rebuilds after a signing-time certification', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x),
    e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  const call = (input) => x.authority.owner.membershipBootstrap(x.f.core, input);
  for (const [id, key] of [
    [x.context.existing.id, x.keys.existing],
    [x.context.candidate.id, x.keys.new],
  ]) {
    const request = q.bootstrap(q.invitation(id, key)),
      result = await call(request);
    assert.equal(
      (await verifyMembershipBootstrapResponse(result, request, x.authority.pin)).history.current
        .tip,
      4,
    );
  }
  const pending = q.bootstrap(
    q.invitation(e.context.candidate.id, e.keys.new, { epoch: 4, head: x.admission.head }),
  );
  assert.equal((await call(pending)).ok, false);
  const request = q.bootstrap();
  assert.equal(
    (await call({ ...request, invitation: { ...request.invitation, signature: '00'.repeat(64) } }))
      .ok,
    false,
  );
  assert.equal((await call({ ...request, v: 1 })).refusal, 'malformed');
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  let count = 0,
    installed;
  const result = await x.authority.owner.membershipBootstrap(
    {
      membershipBootstrap(input, issuer) {
        return x.f.core.membershipBootstrap(input, {
          ...issuer,
          async bootstrap(body) {
            const result = await issuer.bootstrap(body);
            if (++count === 1)
              installed = await d.transfer(d.request('new', 'install', d.installation));
            return result;
          },
        });
      },
    },
    request,
  );
  assert.equal(count, 2);
  assert.equal(
    (await verifyMembershipBootstrapResponse(result, request, x.authority.pin)).history.current
      .head,
    installed.certification.head,
  );
  assert.deepEqual(await call(request), result);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await call(request), result);
  let churn = 0;
  const refused = await x.authority.owner.membershipBootstrap(
    {
      membershipBootstrap(input, issuer) {
        return x.f.core.membershipBootstrap(input, {
          ...issuer,
          async bootstrap(body) {
            const result = await issuer.bootstrap(body);
            churn++;
            mutate(x, (db) => db.exec("UPDATE recovery SET draft=draft || ' '"));
            return result;
          },
        });
      },
    },
    request,
  );
  assert.deepEqual(refused, { ok: false, refusal: 'state-changed' });
  assert.equal(churn, 4);
});

test('continuation discovery keeps publisher coverage and exact network authorization through restart', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x),
    g = await continuationGrants(x);
  const scope = {
    kind: 'workspace',
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
  };
  const grant = await g.grant(scope, x.keys.new);
  const guard = () => x.f.core.grants.authorize(grant.grantToken);
  const request = q.discovery();
  const call = (request, authorization) =>
    x.authority.owner.discoverMembership(x.f.core, request, authorization);
  let result = await call(request, guard());
  assert.equal(
    (await verifyMembershipDiscoveryResponse(result, request, x.base, 1000)).history.current.tip,
    4,
  );
  await assert.rejects(
    call(q.discovery(x.credential, x.keys.existing, { epoch: 1, head: x.offer.head }), guard()),
    denial('insufficient-scope'),
  );
  const original = q.discovery(x.credential, x.keys.existing, { epoch: 1, head: x.offer.head });
  const first = await g.grant({ ...scope, credentialId: x.credential }, x.keys.existing);
  result = await call(original, x.f.core.grants.authorize(first.grantToken));
  assert.equal(
    (await verifyMembershipDiscoveryResponse(result, original, x.base, 1000)).history.current.tip,
    4,
  );
  const wire = x.make(1, 'discovery coverage', {
    epoch: 4,
    credential: scope.credentialId,
    signer: x.keys.new,
  });
  assert.equal((await x.deliveryCall(wire)).kind, 'decision');
  assert.equal((await call(request, guard())).kind, 'membership-discovery');
  const witness = x.f.rows('publisher_witnesses')[0];
  mutate(x, (db) =>
    db.prepare('DELETE FROM publisher_decisions WHERE credential_id=?').run(scope.credentialId),
  );
  assert.equal((await call(request, guard())).ok, false);
  // Historical proof bootstrap cannot claim live ledger coverage; discovery must refuse it.
  assert.equal(
    (await x.authority.owner.membershipBootstrap(x.f.core, q.bootstrap())).kind,
    'membership-bootstrap',
  );
  assert(witness.witness);
  x.f.restart();
  g.restart();
  await assert.rejects(call(original, guard()), denial('grant-required'));
  const resumed = await g.grant({ ...scope, credentialId: x.credential }, x.keys.existing);
  assert.equal(
    (await call(original, x.f.core.grants.authorize(resumed.grantToken))).kind,
    'membership-discovery',
  );
  g.revoke();
  await assert.rejects(
    call(original, x.f.core.grants.authorize(resumed.grantToken)),
    denial('sign-in-required'),
  );
});

test('continuation discovery rechecks session and expiry after asynchronous proof and signing work', async (t) => {
  let at = 1000,
    revoke,
    expire = false;
  const x = await continuationFixture(t, {
      now: () => at,
      hook(point, op) {
        if (point === 'after-verify' && op === 'discover-membership') {
          revoke?.();
          if (expire) at = 61000;
        }
      },
    }),
    q = membershipLocatorRequests(x),
    g = await continuationGrants(x);
  const scope = {
    kind: 'workspace',
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
  };
  const grant = await g.grant(scope, x.keys.new);
  revoke = () => g.revoke();
  await assert.rejects(
    x.authority.owner.discoverMembership(
      x.f.core,
      q.discovery(),
      x.f.core.grants.authorize(grant.grantToken),
    ),
    denial('sign-in-required'),
  );
  revoke = null;
  expire = true;
  assert.equal((await x.authority.owner.discoverMembership(x.f.core, q.discovery())).ok, false);
});

async function membershipHTTP(t, x) {
  const hints = [];
  const notifications = {
    committed: (scope) => hints.push(structuredClone(scope)),
    reconcile() {},
  };
  let core = x.f.core,
    handler = createSessionAccountHandler(core, x.authority.owner, x.authority.pin, notifications);
  const server = createServer((req, res) => {
    if (core !== x.f.core) {
      core = x.f.core;
      handler = createSessionAccountHandler(
        core,
        x.authority.owner,
        x.authority.pin,
        notifications,
      );
    }
    void handler(req, res, () => res.writeHead(404).end());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const post = (path, body, grant, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method: 'POST',
          headers: {
            Host: new URL(x.authority.pin.origin).host,
            Origin: x.authority.pin.origin,
            'Content-Type': 'application/json',
            ...(grant ? { Authorization: 'Bearer ' + grant.grantToken } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (v) => chunks.push(v));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  return { post, hints };
}

test('opt-in HTTP continuation uses exact scoped grants and publishes hints only for committed changes', async (t) => {
  let api, g, enrollment;
  const x = await continuationFixture(t, {
    async beforeMembershipAdmission(y) {
      api = await membershipHTTP(t, y);
      g = await continuationGrants(y);
      enrollment = {
        kind: 'enrollment',
        workspaceId: y.workspace,
        credentialId: y.entry.input.candidate.credentialId,
        attemptId: y.admissionInput.attemptId,
      };
      const grant = await g.grant(enrollment, y.entry.key);
      const result = await api.post('/account/membership/v2/admit', y.admissionInput, grant);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.kind, 'membership-admission');
      assert.equal(api.hints.length, 1);
    },
  });
  const q = membershipLocatorRequests(x),
    e = x.exchange('new'),
    d = await continuationDelivery(x, e);
  const routes = {
    ceremony: '/account/membership/v2/ceremony',
    transfer: '/account/membership/v2/transfer',
    admit: '/account/membership/v2/admit',
    discover: '/account/membership/v2/discover',
    checkpoint: '/account/membership/v2/checkpoint',
  };
  for (const path of Object.values(routes)) {
    assert.equal((await api.post(path, {})).status, 401);
    assert.equal(
      (await api.post(path, {}, { grantToken: fresh() }, { Origin: 'https://other.invalid' }))
        .status,
      403,
    );
  }
  const bootstrap = q.bootstrap();
  const initial = await api.post('/__account-setup/membership/bootstrap', bootstrap);
  assert.equal(initial.status, 200);
  assert.equal(initial.headers['cache-control'], 'no-store');
  assert.equal(
    (await verifyMembershipBootstrapResponse(initial.body, bootstrap, x.authority.pin)).history
      .current.tip,
    4,
  );
  const candidate = await g.grant(enrollment, x.entry.key);
  assert.equal((await api.post(routes.admit, x.admissionInput, candidate)).status, 200);
  assert.equal(api.hints.length, 1); // The committed admission retry is silent.
  assert.equal((await api.post(routes.ceremony, e.request('new', 'read'), candidate)).status, 200);
  assert.equal(api.hints.length, 1);
  assert.equal(
    (await api.post(routes.ceremony, e.request('existing', 'read'), candidate)).status,
    403,
  );
  assert.equal((await api.post(routes.ceremony, 'x'.repeat(16385), candidate)).status, 413);
  assert.equal((await api.post(routes.transfer, 'x'.repeat(65537), candidate)).status, 413);
  const existingScope = { ...enrollment, credentialId: e.context.existing.id };
  const existing = await g.grant(existingScope, e.keys.existing);
  for (const [role, grant] of [
    ['existing', existing],
    ['new', candidate],
  ]) {
    const request = e.request(role, 'commit', e.commits[role]);
    assert.equal((await api.post(routes.ceremony, request, grant)).status, 200);
    const count = api.hints.length;
    assert.equal((await api.post(routes.ceremony, request, grant)).status, 200);
    assert.equal(api.hints.length, count);
  }
  for (const [role, grant] of [
    ['existing', existing],
    ['new', candidate],
  ])
    assert.equal(
      (await api.post(routes.ceremony, e.request(role, 'reveal', e.reveals[role]), grant)).status,
      200,
    );
  assert.equal((await api.post(routes.ceremony, e.approval, existing)).status, 200);
  assert.equal(
    (await api.post(routes.transfer, d.request('existing', 'deliver', d.delivery), candidate))
      .status,
    403,
  );
  const deliver = d.request('existing', 'deliver', d.delivery);
  assert.equal((await api.post(routes.transfer, deliver, existing)).status, 200);
  const count = api.hints.length;
  const deliveryRetry = await g.grant(existingScope, e.keys.existing);
  assert.equal((await api.post(routes.transfer, deliver, deliveryRetry)).status, 200);
  assert.equal(api.hints.length, count);
  const installationGrant = await g.grant(enrollment, x.entry.key);
  const install = d.request('new', 'install', d.installation);
  const installed = await api.post(routes.transfer, install, installationGrant);
  assert.equal(installed.status, 200, JSON.stringify(installed.body));
  assert.equal(api.hints.length, count + 1);
  const retry = await g.grant(enrollment, x.entry.key);
  assert.equal((await api.post(routes.transfer, install, retry)).status, 200);
  assert.equal(api.hints.length, count + 1);
  const workspace = {
    kind: 'workspace',
    workspaceId: x.workspace,
    credentialId: enrollment.credentialId,
  };
  const reader = await g.grant(workspace, x.entry.key);
  const checkpointRead = membershipCheckpointRead(x, enrollment.credentialId, x.entry.key, {
    epoch: 5,
    head: installed.body.certification.head,
  });
  assert.equal((await api.post(routes.checkpoint, checkpointRead, retry)).status, 403);
  assert.equal((await api.post(routes.checkpoint, 'x'.repeat(4097), reader)).status, 413);
  assert.deepEqual((await api.post(routes.checkpoint, checkpointRead, reader)).body, {
    ok: true,
    checkpoint: x.checkpoint,
  });
  const discovery = q.discovery(enrollment.credentialId, x.entry.key, {
    epoch: 5,
    head: installed.body.certification.head,
  });
  assert.equal((await api.post(routes.discover, discovery, retry)).status, 403);
  const result = await api.post(routes.discover, discovery, reader);
  assert.equal(result.status, 200);
  assert.equal(
    (await verifyMembershipDiscoveryResponse(result.body, discovery, x.base, 1000)).history.current
      .tip,
    5,
  );
  assert.equal(api.hints.length, count + 1);
  x.f.restart();
  g.restart();
  const expired = await api.post(routes.discover, discovery, reader);
  assert.equal(expired.status, 401);
  assert.equal(expired.body.refusal, 'grant-required');
  const renewed = await g.grant(workspace, x.entry.key);
  assert.equal((await api.post(routes.discover, discovery, renewed)).status, 200);
});

let membershipReaderClient;
async function readingClient() {
  if (!membershipReaderClient)
    membershipReaderClient = (async () => {
      const built = await build({
        configFile: false,
        logLevel: 'error',
        build: {
          write: false,
          minify: false,
          lib: { entry: resolve('test/account-membership/reader-entry.ts'), formats: ['es'] },
          rolldownOptions: { output: { codeSplitting: false } },
        },
      });
      const code = (Array.isArray(built) ? built[0] : built).output.find(
        (v) => v.type === 'chunk',
      ).code;
      return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    })();
  return membershipReaderClient;
}
async function membershipReadingFixture(t, options = {}) {
  const client = await readingClient(),
    { Y, genesisCoverage, genesisCoverageParts } = client,
    kg = randomBytes(32),
    source = new Y.Doc({ gc: false });
  t.after(() => {
    kg.fill(0);
    source.destroy();
  });
  const principal = '11'.repeat(16),
    workspace = '22'.repeat(16);
  source.getMap('meta').set('schemaVersion', 4);
  source
    .getMap('meta')
    .set('actor:' + principal, { kind: 'human', name: 'Test writer', color: '#334455' });
  source.getText('master').insert(0, 'Original genesis.');
  const salt = randomBytes(16),
    nonce = randomBytes(12),
    key = Buffer.from(hkdfSync('sha256', kg, salt, lp('done/checkpoint/v1', workspace), 32)),
    cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(lp('done/cp/v1', '1', workspace, '1', '1'));
  const original = Y.encodeStateAsUpdate(source);
  const ct = Buffer.concat([cipher.update(original), cipher.final(), cipher.getAuthTag()]);
  key.fill(0);
  const parts = genesisCoverageParts(source);
  const genesis = {
    checkpoint: {
      v: 1,
      salt: salt.toString('hex'),
      nonce: nonce.toString('hex'),
      ct: ct.toString('hex'),
    },
    coverage: {
      derivation: 'yjs-13.6.31-snapshot-v1',
      snapshot: Buffer.from(genesisCoverage(source)).toString('hex'),
      heads: [],
    },
    parts: { sv: Buffer.from(parts.sv).toString('hex'), ds: Buffer.from(parts.ds).toString('hex') },
  };
  // This writing is absent from genesis and from every outbound envelope. Only the catch-up holds it.
  source.getText('master').insert(source.getText('master').length, ' Before sync began.');
  let liveClock = false;
  const x = await continuationFixture(t, {
    nextCandidate: options.nextCandidate,
    now: () => (liveClock ? Date.now() : 1000),
    genesis,
    generationKey: kg,
    createCheckpoint: (x, binding) =>
      client.createContentCheckpoint(
        source,
        kg,
        {
          base: x.base,
          successor: x.successor,
          certification: x.certification,
        },
        binding,
        async (bytes) => signed(x.keys.existing, bytes),
      ),
  });
  const e = x.exchange('new'),
    d = await continuationDelivery(x, e, await options.createWrap?.(kg, e));
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  const installed = await d.transfer(d.request('new', 'install', d.installation));
  const authority = {
    base: x.base,
    proofs: {
      successor: x.successor,
      certification: x.certification,
      continuations: [x.admission, installed.certification],
    },
  };
  liveClock = true;
  let saved = {
      role: 'new',
      content: {
        delivery: d.delivery,
        key: { sequence: 1, ct: 'ef'.repeat(48) },
        installation: d.installation,
        certification: installed.certification,
      },
    },
    current = structuredClone(saved);
  let beforeSave,
    afterSave,
    beforeRead,
    semanticSignatures = 0,
    opened = 0;
  const stop = new AbortController();
  const owner = {
    participant: e.context.candidate,
    load: async () => structuredClone(saved),
    sign: async (bytes) => {
      if (Buffer.from(bytes).includes(Buffer.from('done/cp-admit/v2'))) semanticSignatures++;
      return signed(x.entry.key, bytes);
    },
    withInstalledKey: async (seal, binding, work) => {
      assert.deepEqual(seal, saved.content.key);
      assert.equal(binding, hash(JSON.stringify(saved.content.delivery)));
      opened++;
      const copy = new Uint8Array(kg);
      try {
        return await work(copy);
      } finally {
        copy.fill(0);
      }
    },
  };
  const io = {
    signal: stop.signal,
    save: async () => {
      beforeSave?.(current);
      saved = structuredClone(current);
      afterSave?.(current);
    },
    request: async (path, body) => {
      assert.equal(path, '/account/membership/v2/checkpoint');
      return x.authority.owner.readMembershipCheckpoint(x.f.core, body);
    },
    read: async (bytes) => {
      await beforeRead?.(bytes);
      const response = await x.authority.owner.readInbound(x.f.core, bytes);
      assert.equal(response.kind, 'decision', JSON.stringify(response));
      return response.bytes;
    },
  };
  return {
    x,
    client,
    source,
    kg,
    Y,
    authority,
    owner,
    io,
    stop,
    run: () => client.loadMembershipWriting(current, owner, authority, io),
    restart: () => {
      current = structuredClone(saved);
    },
    setState: (value) => {
      saved = structuredClone(value);
      current = structuredClone(value);
    },
    hooks: (hooks = {}) => {
      ({ beforeSave, afterSave, beforeRead } = hooks);
    },
    get saved() {
      return structuredClone(saved);
    },
    get semanticSignatures() {
      return semanticSignatures;
    },
    get opened() {
      return opened;
    },
  };
}

test('later browser reader preserves pre-sync writing, cold replay and cross-publisher dependencies through interrupted saves', async (t) => {
  const f = await membershipReadingFixture(t),
    { x, Y, source } = f;
  const second = new Y.Doc({ gc: false });
  t.after(() => second.destroy());
  Y.applyUpdate(second, Y.encodeStateAsUpdate(source));
  const initial = Y.encodeStateVector(second);
  second.getText('master').insert(second.getText('master').length, ' Second device.');
  const dependency = Y.encodeStateAsUpdate(second, initial);
  Y.applyUpdate(source, dependency);
  const beforeFirst = Y.encodeStateVector(source);
  source.getText('master').insert(source.getText('master').length, ' First device after second.');
  const dependent = Y.encodeStateAsUpdate(source, beforeFirst);
  assert.equal(
    (await x.deliveryCall(x.make(1, '', { epoch: 4, updates: [dependent] }))).kind,
    'decision',
  );
  f.hooks({
    beforeSave() {
      throw Error('Interrupted before baseline save');
    },
  });
  await assert.rejects(f.run(), /Interrupted before baseline save/);
  assert.equal(f.saved.reading, undefined);
  assert.equal(f.semanticSignatures, 0);
  f.hooks();
  await assert.rejects(f.run(), /did not persist/); // In-memory progress cannot stand in for a committed save.
  f.restart();
  f.hooks({
    afterSave(p) {
      if (p.reading && !p.reading.admission) throw Error('Lost baseline save reply');
    },
  });
  await assert.rejects(f.run(), /Lost baseline save reply/);
  assert.equal(f.semanticSignatures, 0);
  f.restart();
  f.hooks({
    afterSave(p) {
      if (p.reading.admission) throw Error('Lost local admission reply');
    },
  });
  await assert.rejects(f.run(), /Lost local admission reply/);
  assert.equal(f.semanticSignatures, 1);
  const admission = f.saved.reading.admission;
  assert.equal(admission.admittingCredential, f.owner.participant.id);
  assert.equal(admission.decisionParent, f.authority.proofs.continuations.at(-1).head);
  assert.notEqual(admission.decisionParent, x.certification.head);
  f.restart();
  f.hooks({
    beforeSave(p) {
      if (p.reading.streams.some((s) => s.events.length)) throw Error('Interrupted event save');
    },
  });
  await assert.rejects(f.run(), /Interrupted event save/);
  assert.equal(f.saved.reading.streams.flatMap((s) => s.events).length, 0);
  f.restart();
  f.hooks();
  assert.equal((await f.run()).kind, 'loading'); // The first stream's edit is durably pending on the second.
  assert.equal(f.saved.reading.streams.flatMap((s) => s.events).length, 1);
  assert.deepEqual(f.saved.reading.admission, admission);
  assert.equal(f.semanticSignatures, 1);
  x.f.restart();
  x.authority.restart();
  f.restart();
  assert.equal(
    (
      await x.deliveryCall(
        x.make(1, '', {
          epoch: 4,
          credential: x.context.candidate.id,
          signer: x.keys.new,
          updates: [dependency],
        }),
      )
    ).kind,
    'decision',
  );
  const ready = await f.run();
  assert.equal(ready.kind, 'reading');
  assert.match(JSON.stringify(ready.entries), /Before sync began/);
  assert.match(JSON.stringify(ready.entries), /Second device/);
  assert.match(JSON.stringify(ready.entries), /First device after second/);
  const { history } = await f.client.verifyMembershipChain(f.authority.proofs, f.authority.base);
  const replay = await f.client.replayMembershipReading(
    f.saved.reading,
    {
      base: x.base,
      successor: x.successor,
      certification: x.certification,
    },
    history,
    f.owner.participant,
    new Uint8Array(f.kg),
    { assertCurrent() {}, now: () => Number.MAX_SAFE_INTEGER },
  );
  try {
    assert.equal(replay.pending, false);
    assert.equal(replay.doc.getText('master').toString(), source.getText('master').toString());
  } finally {
    f.client.eraseMembershipReading(replay);
  }
  f.restart();
  assert.deepEqual(await f.run(), ready);
});

test('later browser reader refuses substituted custody, publishers, admissions and retained evidence before ready', async (t) => {
  const f = await membershipReadingFixture(t),
    { x, Y } = f;
  const update = new Y.Doc({ gc: false });
  t.after(() => update.destroy());
  update.getText('master').insert(0, 'Remote edit.');
  assert.equal(
    (await x.deliveryCall(x.make(1, '', { epoch: 5, updates: [Y.encodeStateAsUpdate(update)] })))
      .kind,
    'decision',
  );
  assert.equal((await f.run()).kind, 'reading');
  const saved = f.saved;
  for (const edit of [
    (p) => {
      p.content.installation.signature = '00'.repeat(64);
    },
    (p) => {
      p.reading.head = x.admission.head;
    },
    (p) => {
      p.reading.streams.pop();
    },
    (p) => {
      p.reading.streams.reverse();
    },
    (p) => {
      p.reading.admission = x.admission;
    },
    (p) => {
      p.reading.admission.admittingCredential = x.context.candidate.id;
    },
    (p) => {
      p.reading.admission.decisionParent = x.certification.head;
    },
    (p) => {
      p.reading.streams.find((s) => s.events.length).events.pop();
    },
    (p) => {
      p.reading.streams[0].prefix.link = 'ff'.repeat(32);
    },
  ]) {
    const bad = structuredClone(saved);
    edit(bad);
    f.setState(bad);
    await assert.rejects(f.run());
  }
  f.setState(saved);
  const wrong = { ...f.owner, participant: { ...f.owner.participant, id: x.context.candidate.id } };
  await assert.rejects(f.client.loadMembershipWriting(saved, wrong, f.authority, f.io));
  f.hooks({
    beforeRead() {
      f.stop.abort();
    },
  });
  await assert.rejects(f.run());
  assert.deepEqual(f.saved, saved);
});

test('later native slot resumes activation after index interruption and rejects changed retained reading', async (t) => {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext(),
    page = await context.newPage();
  const built = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-membership/activation-entry.ts'),
        name: 'MembershipActivation',
        formats: ['iife'],
      },
    },
  });
  const script = (Array.isArray(built) ? built[0] : built).output.find(
    (v) => v.type === 'chunk',
  ).code;
  await page.route('http://localhost:4999/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Disposable native activation</title>',
    }),
  );
  const open = async () => {
    await page.goto('http://localhost:4999/');
    await page.evaluate(script);
  };
  await open();
  const signing = generateKeyPairSync('ed25519'),
    wrapping = generateKeyPairSync('x25519');
  const material = (p) => ({
    private: p.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex'),
    public: p.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'),
  });
  const pending = await page.evaluate((keys) => window.MembershipActivation.seed(keys), {
    signing: material(signing),
    wrapping: material(wrapping),
  });
  const f = await membershipReadingFixture(t, {
    nextCandidate(x) {
      const entry = x.candidate();
      return {
        ...entry,
        key: signing.privateKey,
        input: {
          ...entry.input,
          candidate: {
            ...entry.input.candidate,
            credentialId: pending.participant.id,
            sPub: pending.participant.sPub,
            wPub: pending.participant.wPub,
          },
        },
      };
    },
    createWrap: (kg, e) =>
      page.evaluate(
        ({ key, recipient, transcript }) =>
          window.MembershipActivation.wrap(key, recipient, transcript),
        {
          key: kg.toString('hex'),
          recipient: pending.participant.wPub,
          transcript: e.approval.payload.transcriptHash,
        },
      ),
  });
  const { x, Y, source } = f;
  const before = Y.encodeStateVector(source);
  source
    .getText('master')
    .insert(source.getText('master').length, ' A native third device can retain this.');
  const nativeAccepted = await x.deliveryCall(
    x.make(1, '', { epoch: 4, updates: [Y.encodeStateAsUpdate(source, before)] }),
  );
  assert.equal(nativeAccepted.kind, 'decision');
  const acceptedHead = JSON.parse(Buffer.from(nativeAccepted.bytes).toString());
  await page.exposeFunction('fixtureCheckpoint', (body) =>
    x.authority.owner.readMembershipCheckpoint(x.f.core, body),
  );
  await page.exposeFunction('fixtureRead', async (bytes) => {
    const result = await x.authority.owner.readInbound(x.f.core, new Uint8Array(bytes));
    assert.equal(result.kind, 'decision');
    return [...result.bytes];
  });
  await page.exposeFunction('fixturePasskey', (challenge) => {
    const assertion = x.account.key.assert({
      options: { challenge: Buffer.from(challenge).toString('base64url') },
    });
    return {
      credentialId: assertion.id,
      ...Object.fromEntries(
        ['authenticatorData', 'clientDataJSON', 'signature'].map((field) => [
          field,
          [...Buffer.from(assertion.response[field], 'base64url')],
        ]),
      ),
    };
  });
  await page.evaluate(
    ({ slotId, code, content }) => window.MembershipActivation.retain(slotId, code, content),
    {
      ...pending,
      content: f.saved.content,
    },
  );
  const authority = { base: f.authority.base, ...f.authority.proofs };
  const entries = await page.evaluate(
    ({ slotId, code, authority }) => window.MembershipActivation.install(slotId, code, authority),
    { ...pending, authority },
  );
  assert.match(JSON.stringify(entries), /Before sync began/);
  assert.match(JSON.stringify(entries), /native third device/);
  await open();
  const state = () =>
    page.evaluate(({ slotId, code }) => window.MembershipActivation.state(slotId, code), pending);
  assert.deepEqual(await state(), { v: 2, phase: 'installing' });
  assert.equal(
    await page.evaluate(
      ({ slotId, code }) => window.MembershipActivation.oldOwnerRefuses(slotId, code),
      pending,
    ),
    true,
  );
  const activate = (interrupt) =>
    page.evaluate(
      ({ slotId, code, pin, interrupt }) =>
        window.MembershipActivation.activate(slotId, code, pin, interrupt),
      { ...pending, pin: x.authority.pin, interrupt },
    );
  assert.deepEqual(await activate(true), { interrupted: true });
  assert.deepEqual(await state(), { v: 2, phase: 'installing' });
  await open();
  const ready = await activate(false);
  assert.deepEqual(ready, {
    v: 2,
    phase: 'active',
    epoch: 5,
    credential: pending.participant.id,
    head: f.authority.proofs.continuations.at(-1).head,
  });
  await open();
  assert.deepEqual(await activate(false), ready);
  await page.evaluate(
    ({ slotId, code }) => window.MembershipActivation.saveJoinedProgress(slotId, code),
    pending,
  );
  await open();
  assert.deepEqual(await activate(false), ready);
  // Exercise a later authority through the actual joined editor/queue/native marker. The service
  // remains fenced at its first continuation; this next signed proof is issued by a test-only stub.
  const parent = membershipState(
    historyMembership((await verifyMembershipChain(f.authority.proofs, f.authority.base)).history),
  );
  const nextPreparation = structuredClone(x.admission.epoch.preparation);
  nextPreparation.context.epoch = parent.epoch;
  nextPreparation.context.certifiedSetDigest = parent.certifiedSetDigest;
  nextPreparation.context.attemptId = randomBytes(32).toString('base64url');
  nextPreparation.receiptId = randomBytes(32).toString('base64url');
  nextPreparation.context.candidate = {
    ...nextPreparation.context.candidate,
    head: parent.head,
    credentialId: 'cf'.repeat(16),
    sPub: material(generateKeyPairSync('ed25519')).public,
    wPub: material(generateKeyPairSync('x25519')).public,
  };
  nextPreparation.signature = '00'.repeat(64);
  const preparation = x.authority.owner.enrollment(
    {
      enrollment(_op, _input, issuer) {
        return issuer.receipt(nextPreparation);
      },
    },
    'finish',
    {},
  );
  const candidate = preparation.context.candidate;
  const next = await x.authority.owner.admitMembership(
    {
      admitMembership(_input, issuer) {
        return issuer.admission({
          v: 2,
          kind: 'membership-admission-epoch',
          workspaceId: parent.workspaceId,
          lineageId: parent.lineageId,
          epoch: parent.epoch + 1,
          parent: parent.head,
          generation: parent.generation,
          acceptancePublicKey: parent.acceptancePublicKey,
          preparation,
          certifiedSetDigest: parent.certifiedSetDigest,
          roster: [
            ...parent.roster,
            {
              id: candidate.credentialId,
              wPub: candidate.wPub,
              sPub: candidate.sPub,
              principalId: parent.principalId,
              state: 'pending',
              capabilities: [],
            },
          ].sort((a, b) => a.id.localeCompare(b.id)),
          heads: [
            ...parent.heads.map((h) =>
              h.credentialId === acceptedHead[4]
                ? { ...h, position: acceptedHead[5], link: acceptedHead[6] }
                : h,
            ),
            { credentialId: candidate.credentialId, position: 0, link: '00'.repeat(32) },
          ].sort((a, b) => a.credentialId.localeCompare(b.credentialId)),
        });
      },
    },
    {},
  );
  const proofs = {
    ...f.authority.proofs,
    continuations: [...f.authority.proofs.continuations, next],
  };
  const installation = () =>
    page.evaluate(
      ({ slotId, code }) => window.MembershipActivation.installation(slotId, code),
      pending,
    );
  const originalInstallation = await installation();
  const openEditor = () =>
    page.evaluate(
      ({ slotId, code, pin, principal }) =>
        window.MembershipActivation.openEditor(slotId, code, pin, principal),
      { ...pending, pin: x.authority.pin, principal: parent.principalId },
    );
  const adopt = (fault) =>
    page.evaluate(({ proofs, fault }) => window.MembershipActivation.adopt(proofs, fault), {
      proofs,
      fault,
    });
  await openEditor();
  await page.evaluate(() =>
    window.MembershipActivation.edit(' Queued before adopting membership.'),
  );
  await assert.rejects(adopt('before-commit'), /Injected membership commit/);
  await page.evaluate(() => window.MembershipActivation.closeEditor());
  assert.deepEqual(await installation(), originalInstallation);
  await open();
  assert.equal((await openEditor()).epoch, 5);
  await assert.rejects(adopt('after-commit'), /Injected membership readback/);
  await page.evaluate(() => window.MembershipActivation.closeEditor());
  const adoptedInstallation = await installation();
  assert.deepEqual({ ...adoptedInstallation, membership: null }, originalInstallation);
  assert.equal(adoptedInstallation.membership.cuts.at(-1).epoch, 6);
  await open();
  assert.equal((await openEditor()).epoch, 6);
  assert.deepEqual(await adopt(null), { epoch: 6, head: next.head });
  await assert.rejects(
    page.evaluate((proofs) => window.MembershipActivation.adopt(proofs), f.authority.proofs),
  );
  const writing = await page.evaluate(() =>
    window.MembershipActivation.edit(' Writing after membership adoption.'),
  );
  assert.match(writing, /Queued before adopting membership/);
  assert.match(writing, /Writing after membership adoption/);
  await page.evaluate(() => window.MembershipActivation.closeEditor());
  await open();
  assert.equal((await activate(false)).epoch, 6);
  // A storage change cannot be hidden by the completed index. Authentication precedes opening.
  await page.evaluate(async (slotId) => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('done.custody');
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite'),
        store = tx.objectStore('entries'),
        key = [slotId, 'application-upgrade'],
        r = store.get(key);
      r.onsuccess = () => {
        const row = r.result;
        row.reading.streams.pop();
        store.put(row, key);
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, pending.slotId);
  await assert.rejects(activate(false), /authentication failed/);
});
