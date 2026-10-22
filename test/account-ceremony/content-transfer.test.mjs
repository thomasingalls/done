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
  historyExchangeMessage,
  verifyHistoryCheckpointPage,
} from '../../account-protocol/historyExchange.ts';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
  membershipCancellationRequestMessage,
  verifyMembershipCancellation,
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

async function openingHistoryFixture(t) {
  const authority = authorityFixture(t);
  const x = await checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
  });
  const r = {
    v: 1,
    kind: 'history-checkpoint-request',
    workspaceId: x.workspace,
    lineageId: x.context.lineageId,
    epoch: 3,
    head: x.certification.head,
    credentialId: x.context.candidate.id,
    nonce: 'be'.repeat(32),
    expiresAt: 61000,
    action: 'read',
    payload: 'latest',
    signature: '00'.repeat(64),
  };
  r.signature = signed(x.keys.new, await historyExchangeMessage(r));
  return { x, r };
}

test('history read retries a concurrent upload before capturing the new device empty stream', async (t) => {
  const { x, r } = await openingHistoryFixture(t);
  const wire = x.make(1, 'concurrent writer', { epoch: 3 });
  let appended = false;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  // The initial SQLite snapshot is already captured when cryptographic verification starts.
  // Complete a genuine signed upload during that await, before any later publisher capture.
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (!appended) {
      appended = true;
      decision(x, await x.deliveryCall(wire), wire, undefined, 3);
    }
    return verify(...args);
  });
  const response = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
  assert(appended);
  assert.equal(response.ok, true, JSON.stringify(response));
  const page = await verifyHistoryCheckpointPage(response.page, r, x.authority.pin);
  assert.equal(page.checkpoint, null);
  assert.equal(page.heads.find((h) => h.credentialId === x.context.existing.id).position, 1);
  assert.equal(page.heads.find((h) => h.credentialId === x.context.candidate.id).position, 0);
});

test('history read stops after four changing snapshots without returning a mixed page', async (t) => {
  const { x, r } = await openingHistoryFixture(t);
  let armed = false,
    appends = 0,
    previous = '00'.repeat(32);
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (armed) {
      armed = false;
      const wire = x.make(++appends, 'concurrent writer', { epoch: 3 });
      previous = decision(x, await x.deliveryCall(wire), wire, previous, 3).head.link;
    }
    return verify(...args);
  });
  const response = await x.authority.owner.exchangeHistoryCheckpoint(
    {
      exchangeHistoryCheckpoint(input, issuer) {
        return x.f.core.exchangeHistoryCheckpoint(input, {
          ...issuer,
          check(...args) {
            issuer.check(...args);
            // Each initial authority verification has captured a new SQLite snapshot.
            armed = true;
          },
        });
      },
    },
    r,
  );
  assert.deepEqual(response, { ok: false, refusal: 'state-changed' });
  assert.equal(appends, 4);
  assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
});

for (const fault of ['authority', 'old-row'])
  test(`history read still refuses ${fault} damage during verification`, async (t) => {
    const { x, r } = await openingHistoryFixture(t);
    if (fault === 'old-row') {
      const wire = x.make(1, 'before damage', { epoch: 3 });
      decision(x, await x.deliveryCall(wire), wire, undefined, 3);
    }
    let changed = false;
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    t.mock.method(crypto.subtle, 'verify', async (...args) => {
      if (!changed) {
        changed = true;
        mutate(x, (db) =>
          db.exec(
            fault === 'authority'
              ? "UPDATE accounts SET state='pending'"
              : "UPDATE delivery_decisions SET submission=X'00' WHERE position=1",
          ),
        );
      }
      return verify(...args);
    });
    const response = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
    assert(changed);
    assert.deepEqual(response, {
      ok: false,
      refusal: fault === 'authority' ? 'unavailable' : 'ledger-integrity',
    });
    assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
  });

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
    assert.deepEqual(
      db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
      name === 'promotions'
        ? rows.map((row) => Object.assign(Object.create(null), row, { removal_parent: null }))
        : rows,
      name,
    );
  assert.deepEqual(db.prepare('SELECT * FROM membership_admissions').all(), []);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
  assert.deepEqual(db.prepare('SELECT * FROM membership_ceremonies').all(), []);
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

function continuationExchange(x, admission, entry, approving = 'existing') {
  const c = admission.epoch.preparation.context.candidate;
  const context = {
    ...x.context,
    v: 2,
    epoch: admission.epoch.epoch,
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
    epoch: admission.epoch.epoch,
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
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; DROP TABLE membership_rotations; ALTER TABLE promotions DROP COLUMN removal_parent; DROP TABLE removal_preparations; DROP TABLE membership_cancellations; DROP TABLE membership_transfers; DROP TABLE membership_ceremonies; PRAGMA user_version=15;',
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
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
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

test('first checkpoint binds the nonzero accepted prefix from single-device uploads', async (t) => {
  const x = await checkpointFixture(t, {
    async beforeAdmit(x) {
      assert.equal((await x.call(x.make(1, 'first-device writing'))).kind, 'decision');
    },
  });
  assert.equal(
    x.checkpoint.heads.find((h) => h.credentialId === x.context.existing.id).position,
    1,
  );
  const altered = structuredClone(x.checkpoint);
  altered.heads.find((h) => h.position === 1).link = '99'.repeat(32);
  altered.manifest.headVectorDigest = await checkpointHeadDigest(altered.heads);
  altered.manifest.signature = signed(x.keys.existing, await manifestMessage(altered.manifest));
  assert.equal((await x.exchange('existing', 'publish', altered)).ok, false);
  assert.equal(x.f.rows('content_checkpoints').length, 0);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  assert.equal((await x.exchange('new', 'admit', x.admission)).ok, true);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual((await x.exchange('new', 'read')).checkpoint, x.checkpoint);
});

test('certification retains both local ledger cuts when the first device already adopted epoch two', async (t) => {
  let first;
  const x = await approved(t, {
    async beforeAdmit(x) {
      first = x.make(1, 'before enrollment');
      assert.equal((await x.call(first)).kind, 'decision');
    },
  });
  const middle = x.make(2, 'before approval', { epoch: 2 });
  assert.equal((await x.deliveryCall(middle)).kind, 'decision');
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  const { certification } = await x.transfer('new', 'install', x.installation);
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
  const client = await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
  const history = await client.verifyCertificationHistory(certification, x.successor, x.base, {
    epoch: 3,
    head: certification.head,
  });
  const route = {
    workspace: x.workspace,
    principal: history.principal,
    credential: history.credential,
    epoch: 3,
    generation: 1,
    history,
  };
  const wires = [first, middle].map((w) => new Uint8Array(envelope(w)));
  const events = wires.map((wire, i) =>
    client.encodeSpoolEntry(
      { type: 'envelope', position: i + 1, attempt: i + 1, wire },
      { ...route, epoch: i + 1 },
    ),
  );
  const before = await client.extendSpoolWitness(
    client.emptySpoolWitness(),
    events[0],
    crypto.subtle,
  );
  const certifiedBefore = await client.extendSpoolWitness(before, events[1], crypto.subtle);
  const installed = client.parseInstalledSuccessor({
    artifact: x.successor,
    certification,
    before,
    certifiedBefore,
  });
  // This function consumes the already verified spool's envelope and event projections.
  const spool = { events, positions: wires.map((wire, i) => ({ position: i + 1, wire })) };
  await client.verifyInstalledSuccessor(spool, route, installed, crypto.subtle);
  const { certifiedBefore: _cut, ...omitted } = installed;
  await assert.rejects(
    client.verifyInstalledSuccessor(spool, route, omitted, crypto.subtle),
    /boundary/,
  );
  await assert.rejects(
    client.verifyInstalledSuccessor(
      spool,
      route,
      { ...installed, certifiedBefore: { ...certifiedBefore, hash: '99'.repeat(32) } },
      crypto.subtle,
    ),
    /commitment/,
  );
  await assert.rejects(
    client.verifyInstalledSuccessor(
      { ...spool, positions: spool.positions.slice(1) },
      route,
      installed,
      crypto.subtle,
    ),
  );
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

async function continuationDelivery(
  x,
  e,
  wrap = { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
  { publishCheckpoint = true } = {},
) {
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
      epoch: x.admission.epoch.epoch + 1,
      generation: x.admission.epoch.generation,
      members: x.admission.epoch.roster.map(({ id, wPub, sPub }) => ({ id, wPub, sPub })),
      recoveryStateDigest: e.context.recoveryStateDigest,
      approver: e.context.existing.id,
    },
    e.keys.existing,
  );
  const { parseMembershipDelivery, parseMembershipInstallation } =
    await import('../../account-protocol/membershipDelivery.ts');
  const {
    replacementCheckpointHeads,
    replacementCheckpointMessage,
    replacementCheckpointHash,
    replacementCheckpointAdmissionBody,
    replacementCheckpointAdmissionMessage,
  } = await import('../../account-protocol/replacementCheckpoint.ts');
  const { replacementTransferMessage } =
    await import('../../account-protocol/replacementTransfer.ts');
  const replacement = x.admission.epoch.generation > 1;
  let checkpoint = null,
    checkpointHash = null;
  const checkpointRequest = async (role, action, payload = null) => {
    const request = {
      v: 1,
      workspaceId: x.workspace,
      parent: x.admission.head,
      preparationId: x.admissionInput.attemptId,
      credentialId: e.context[role === 'existing' ? 'existing' : 'candidate'].id,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    request.signature = signed(e.keys[role], await replacementTransferMessage(request));
    return request;
  };
  if (replacement) {
    const continuations = [
      'membership_admissions',
      'membership_transfers',
      'membership_cancellations',
      'membership_rotations',
    ]
      .flatMap((table) =>
        x.f
          .rows(table)
          .filter((r) => r.artifact)
          .map((r) => JSON.parse(r.artifact)),
      )
      .sort((a, b) => a.epoch.epoch - b.epoch.epoch);
    const parent = historyMembership(
      (
        await verifyMembershipChain(
          { successor: x.successor, certification: x.certification, continuations },
          x.base,
        )
      ).history,
    );
    const heads = replacementCheckpointHeads(parent);
    checkpoint = {
      v: 1,
      kind: 'replacement-checkpoint',
      salt: 'a1'.repeat(16),
      nonce: 'a2'.repeat(12),
      ct: 'a3'.repeat(18),
      manifest: {
        workspaceId: x.workspace,
        lineageId: e.context.lineageId,
        epoch: x.admission.epoch.epoch,
        epochHead: x.admission.head,
        generation: x.admission.epoch.generation,
        producer: e.context.existing.id,
        candidate: e.context.candidate.id,
        preparationId: x.admissionInput.attemptId,
        checkpointDigest: hash(Buffer.from('a3'.repeat(18), 'hex')),
        sv: '00',
        ds: '0000',
        headVectorDigest: await checkpointHeadDigest(heads),
      },
      heads,
      signature: '00'.repeat(64),
    };
    checkpoint.signature = signed(e.keys.existing, await replacementCheckpointMessage(checkpoint));
    checkpointHash = await replacementCheckpointHash(checkpoint);
    if (publishCheckpoint) {
      const r = await x.authority.owner.exchangeReplacementCheckpoint(
        x.f.core,
        await checkpointRequest('existing', 'publish', checkpoint),
      );
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  }
  const sealDelivery = (body) => {
    const value = parseMembershipDelivery({ ...body, signature: '00'.repeat(64) });
    return sign('done/membership-key-delivery/v' + value.v, value, e.keys.existing);
  };
  const delivery = sealDelivery({
    ...(replacement ? { v: 3, checkpointHash } : { v: 2 }),
    kind: 'membership-key-delivery',
    parent: x.admission.head,
    preparationId: x.admissionInput.attemptId,
    generation: x.admission.epoch.generation,
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
  let acknowledgement = null;
  if (checkpoint) {
    acknowledgement = await replacementCheckpointAdmissionBody(checkpoint);
    acknowledgement.signature = signed(
      e.keys.new,
      await replacementCheckpointAdmissionMessage(acknowledgement),
    );
  }
  const installation = sign(
    'done/membership-key-installed/v' + delivery.v,
    parseMembershipInstallation({
      ...(replacement ? { v: 3, checkpoint: acknowledgement } : { v: 2 }),
      kind: 'membership-key-installed',
      deliveryHash: hash(JSON.stringify(delivery)),
      credentialId: e.context.candidate.id,
      signature: '00'.repeat(64),
    }),
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
  return {
    certificate,
    delivery,
    installation,
    sealDelivery,
    request,
    transfer,
    approve,
    checkpoint,
    checkpointRequest,
  };
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
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; DROP TABLE membership_rotations; ALTER TABLE promotions DROP COLUMN removal_parent; DROP TABLE removal_preparations; DROP TABLE membership_cancellations; DROP TABLE membership_transfers; PRAGMA user_version=16;',
  );
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
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
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
  // Key delivery changed authority; acquiring the installation grant reclaimed the old writer grant.
  assert.throws(() => subscription.check(), denial('grant-required'));
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
  assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
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
      if (path === '/account/history/v1/checkpoint')
        return x.authority.owner.exchangeHistoryCheckpoint(x.f.core, body);
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

let comparisonClient;
async function compiledComparison() {
  comparisonClient ??= (async () => {
    const built = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        lib: { entry: resolve('test/account-membership/comparison-entry.ts'), formats: ['es'] },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    });
    const code = (Array.isArray(built) ? built[0] : built).output.find(
      (v) => v.type === 'chunk',
    ).code;
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  })();
  return comparisonClient;
}
for (const approver of ['existing', 'new'])
  test(`browser comparison by ${approver} composes with the real continuation relay and key handoff after restart`, async (t) => {
    const client = await compiledComparison(),
      x = await continuationFixture(t),
      e = x.exchange(approver);
    const anchor = await client.verifyMembershipAnchor(x.base, x.successor, x.certification, {
      epoch: 3,
      head: x.certification.head,
    });
    const parent = await client.verifyMembershipAdmission(x.admission, anchor);
    const current = {},
      durable = {},
      owners = {};
    let lostDecision = true;
    for (const role of ['existing', 'new']) {
      current[role] = client.beginMembershipComparison(role, parent);
      durable[role] = structuredClone(current[role]);
      owners[role] = {
        participant: role === 'existing' ? e.context.existing : e.context.candidate,
        load: async () => structuredClone(durable[role]),
        sign: async (bytes) => signed(e.keys[role], bytes),
        wrapContent: async () => ({ enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) }),
        sealIncoming: async () => ({ sequence: 1, ct: 'ef'.repeat(48) }),
        checkInstalled: async (key) => assert.deepEqual(key, durable[role].content.key),
      };
    }
    const save = async (role) => {
      durable[role] = structuredClone(current[role]);
    };
    const request = async (path, body) => {
      if (path === '/account/membership/v2/transfer')
        return x.authority.owner.transferMembership(x.f.core, body);
      assert.equal(path, '/account/membership/v2/ceremony');
      const result = await x.relay(body);
      if (body.action === 'decide' && lostDecision) {
        lostDecision = false;
        throw Error('Lost committed comparison reply');
      }
      return result;
    };
    const run = (role, typed) =>
      client.continueMembershipComparison(
        current[role],
        owners[role],
        parent,
        { signal: new AbortController().signal, now: () => 1000, save: () => save(role), request },
        typed,
      );
    assert.equal((await run('existing')).kind, 'waiting');
    assert.equal((await run('new')).kind, 'waiting');
    assert.equal((await run('existing')).kind, 'compare');
    const display = await run('new');
    assert.equal(display.kind, 'display');
    await assert.rejects(run('existing', display.code), /Lost committed/);
    const decision = structuredClone(durable.existing.decision);
    x.f.restart();
    for (const role of ['existing', 'new']) {
      current[role] = structuredClone(durable[role]);
      assert.equal((await run(role)).kind, 'approved');
      assert.deepEqual(durable[role].decision, decision);
    }
    let certification = null;
    const handoff = async (role) => {
      const result = await client.continueMembershipHandoff(
        current[role],
        owners[role],
        { base: x.base, membership: parent, certification },
        () => save(role),
        request,
      );
      certification = current[role].content?.certification ?? certification;
      return result;
    };
    assert.equal(await handoff('existing'), 'approved');
    assert.equal(await handoff('new'), 'certified');
    assert.equal(await handoff('existing'), 'certified');
    assert.deepEqual(durable.existing.content.certification, durable.new.content.certification);
    assert.equal(x.f.rows('membership_ceremonies').length, 1);
    assert.equal(x.f.rows('membership_transfers').length, 1);
    assert.equal(certification.epoch.epoch, 5);
  });

async function browserPreparationFixture(t) {
  const client = await compiledComparison(),
    authority = authorityFixture(t),
    x = await checkpointFixture(t, {
      authority,
      sessions: { pin: authority.pin, operatorKey: authority.key },
      membershipContinuation: true,
    });
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  const parent = await client.verifyMembershipAnchor(x.base, x.successor, x.certification, {
      epoch: 3,
      head: x.certification.head,
    }),
    entry = x.candidate(),
    c = entry.input.candidate,
    participant = { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
    stop = new AbortController(),
    calls = [],
    finishes = [],
    admissions = [];
  let p = client.beginMembershipPreparation(participant, parent),
    durable = structuredClone(p),
    login = null,
    prompts = 0,
    afterRequest,
    beforeSave;
  const owner = {
    participant,
    load: async () => structuredClone(durable),
    sign: async (bytes) => signed(entry.key, bytes),
    rememberLogin: async (pin, identity, result) => {
      assert.deepEqual(pin, authority.pin);
      assert.equal(identity.accountId, x.receipt.offer.epoch.accountId);
      assert.equal(result.ok, true);
      login ??= structuredClone(result);
      assert.deepEqual(result, login);
      return structuredClone(login);
    },
  };
  const io = {
    signal: stop.signal,
    now: () => 1000,
    save: async () => {
      await beforeSave?.(p);
      durable = structuredClone(p);
    },
    assert: async (context) => {
      prompts++;
      assert.deepEqual(durable.challenge, context);
      return nextProof(
        x,
        {
          ...entry,
          input: { ...entry.input, retryKey: p.retryKey, loginRetryKey: p.loginRetryKey },
        },
        { context },
      ).response;
    },
    acknowledge: async (result) => {
      assert.deepEqual(result, login);
      assert(durable.receipt, 'receipt is durable before login acknowledgement');
    },
    request: async (path, body) => {
      assert.deepEqual(p, durable, 'effects require the committed attempt');
      calls.push(path);
      let result;
      if (path === '/account/membership/v2/admit') {
        admissions.push(structuredClone(body));
        result = await authority.owner.admitMembership(x.f.core, body);
      } else {
        const op = path.split('/').at(-1);
        if (op === 'finish') finishes.push(structuredClone(body));
        result = await x.enroll(op, body);
      }
      await afterRequest?.(path, result);
      return result;
    },
  };
  return {
    client,
    x,
    parent,
    owner,
    io,
    stop,
    calls,
    finishes,
    admissions,
    get p() {
      return p;
    },
    get durable() {
      return durable;
    },
    get prompts() {
      return prompts;
    },
    set beforeSave(v) {
      beforeSave = v;
    },
    set afterRequest(v) {
      afterRequest = v;
    },
    cold() {
      p = structuredClone(durable);
    },
    run: (held = parent) => client.completeMembershipPreparation(p, owner, x.base, held, io),
  };
}

test('browser continuation enrollment saves before effects and retries finish and admission after service restart', async (t) => {
  const h = await browserPreparationFixture(t);
  h.beforeSave = (p) => {
    if (p.proof) throw Error('proof save failed');
  };
  await assert.rejects(h.run(), /proof save failed/);
  assert.equal(h.finishes.length, 0);
  assert.equal(h.durable.proof, null);
  assert.equal(h.prompts, 1);
  h.cold();
  h.beforeSave = null;
  h.afterRequest = (path) => {
    if (path.endsWith('/finish')) throw Error('lost finish reply');
  };
  await assert.rejects(h.run(), /lost finish reply/);
  const proof = structuredClone(h.durable.proof);
  assert(proof);
  assert.equal(h.durable.receipt, null);
  assert.equal(h.prompts, 2);
  h.x.f.restart();
  h.cold();
  h.afterRequest = null;
  h.beforeSave = (p) => {
    if (p.receipt) throw Error('receipt save failed');
  };
  await assert.rejects(h.run(), /receipt save failed/);
  assert.equal(h.durable.receipt, null);
  assert.equal(h.admissions.length, 0);
  h.cold();
  h.beforeSave = null;
  h.afterRequest = (path) => {
    if (path.endsWith('/admit')) throw Error('lost admission reply');
  };
  await assert.rejects(h.run(), /lost admission reply/);
  assert(h.durable.receipt);
  assert.equal(h.durable.admission, null);
  h.x.f.restart();
  h.cold();
  h.afterRequest = null;
  await h.run();
  assert.equal(h.durable.admission.epoch.epoch, 4);
  assert.equal(h.prompts, 2, 'no repeated passkey check once a proof was saved');
  for (const sent of h.finishes) assert.deepEqual(sent, proof);
  assert.deepEqual(h.admissions[0], h.admissions[1]);
  const calls = h.calls.length;
  h.cold();
  await h.run();
  assert.equal(h.calls.length, calls, 'completed preparation reopens without effects');
  assert.equal(h.x.f.rows('network_sessions').length, 1);
  assert.equal(h.x.f.rows('membership_admissions').length, 1);
});

test('browser continuation preparation rejects unsaved state and changed custody before network effects', async (t) => {
  const h = await browserPreparationFixture(t);
  h.p.retryKey = fresh();
  await assert.rejects(h.run(), /did not persist/);
  assert.equal(h.calls.length, 0);
  h.cold();
  const participant = h.owner.participant;
  h.owner.participant = { ...participant, id: 'ee'.repeat(16) };
  await assert.rejects(h.run(), /device or parent changed/);
  assert.equal(h.calls.length, 0);
  h.owner.participant = participant;
  h.stop.abort();
  await assert.rejects(h.run());
  assert.equal(h.calls.length, 0);
});

for (const approver of ['existing', 'new'])
  test(`retained connection coordinates invitation through third-device certification with ${approver} approving`, async (t) => {
    const client = await compiledComparison(),
      authority = authorityFixture(t),
      x = await checkpointFixture(t, {
        authority,
        sessions: { pin: authority.pin, operatorKey: authority.key },
        membershipContinuation: true,
      });
    assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
    const entry = x.candidate(),
      c = entry.input.candidate,
      proofs = { successor: x.successor, certification: x.certification, continuations: [] },
      durable = { existing: null, new: null },
      owners = {},
      keys = { existing: x.keys[approver], new: entry.key },
      calls = [];
    let prompts = 0,
      loseDecision = true,
      loseDelivery = true;
    const participants = {
      existing: x.context[approver === 'existing' ? 'existing' : 'candidate'],
      new: { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
    };
    for (const role of ['existing', 'new']) {
      owners[role] = {
        participant: participants[role],
        source:
          role === 'new'
            ? { kind: 'pending' }
            : approver === 'existing'
              ? { kind: 'original', base: x.base, proofs }
              : { kind: 'joined', authority: { base: x.base, ...proofs }, proofs },
        load: async () => structuredClone(durable[role]),
        save: async (p, check) => {
          check?.();
          durable[role] = structuredClone(p);
        },
        sign: async (bytes) => signed(keys[role], bytes),
        rememberLogin: async (_, __, result) => {
          assert.equal(result.ok, true);
          return result;
        },
        wrapContent: async () => ({ enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) }),
        sealIncoming: async () => ({ sequence: 1, ct: 'ef'.repeat(48) }),
        checkInstalled: async (key) => assert.deepEqual(key, durable[role].comparison.content.key),
      };
    }
    const run = (role, input) =>
      client.advanceMembershipConnection(
        owners[role],
        role,
        {
          pin: authority.pin,
          signal: new AbortController().signal,
          now: () => 1000,
          request: async (path, body, base) => {
            calls.push(path);
            assert(durable[role]?.invitation, 'save invitation before its first bootstrap');
            if (path.endsWith('/membership/bootstrap')) {
              assert.equal(base, null);
              return authority.owner.membershipBootstrap(x.f.core, body);
            }
            assert.deepEqual(base, x.base);
            if (path.includes('/enrollment/')) return x.enroll(path.split('/').at(-1), body);
            if (path.endsWith('/admit')) return authority.owner.admitMembership(x.f.core, body);
            if (path.endsWith('/ceremony')) {
              const result = await authority.owner.relayMembershipCeremony(x.f.core, body);
              if (body.action === 'decide' && loseDecision) {
                loseDecision = false;
                throw Error('Lost approved comparison reply');
              }
              return result;
            }
            assert(path.endsWith('/transfer'));
            const result = await authority.owner.transferMembership(x.f.core, body);
            if (body.action === 'deliver' && loseDelivery) {
              loseDelivery = false;
              throw Error('Lost delivered key reply');
            }
            return result;
          },
          assert: async (context) => {
            prompts++;
            const p = durable.new.preparation.progress;
            return nextProof(
              x,
              {
                ...entry,
                input: { ...entry.input, retryKey: p.retryKey, loginRetryKey: p.loginRetryKey },
              },
              { context },
            ).response;
          },
          acknowledge: async () => {
            assert(durable.new.preparation.progress.receipt);
          },
          reconnect: async () => {
            throw Error('Unexpected extra login');
          },
          read: async () => {
            throw Error('Writing load requires an explicit request');
          },
        },
        input,
      );
    const archived = [];
    let loseArchive = false;
    owners.existing.archiveConnection = async (expected, next) => {
      assert.deepEqual(durable.existing, expected);
      archived.push(structuredClone(expected));
      durable.existing = structuredClone(next);
      if (loseArchive) {
        loseArchive = false;
        throw Error('Lost archived connection reply');
      }
    };
    const invitation = (await run('existing')).invitation;
    assert(invitation);
    assert.equal((await run('new', { invitation, workspaceId: x.workspace })).kind, 'enroll');
    assert.equal((await run('new', { enroll: true })).kind, 'waiting');
    assert.equal((await run('existing')).kind, 'waiting');
    assert.equal((await run('new')).kind, 'waiting');
    assert.equal((await run('existing')).kind, 'compare');
    const display = await run('new');
    assert.equal(display.kind, 'display');
    const pendingComparison = structuredClone(durable.existing.comparison);
    assert.equal((await run('existing', { begin: 'a1'.repeat(16) })).kind, 'compare');
    assert.deepEqual(durable.existing.comparison, pendingComparison);
    assert.equal(archived.length, 0, 'revisiting unfinished connection must not replace it');
    await assert.rejects(run('existing', { typed: display.code }), /Lost approved/);
    const decision = structuredClone(durable.existing.comparison.decision);
    assert.equal((await run('existing', { cancel: true })).kind, 'removal-required');
    assert.equal(
      calls.some((path) => path.endsWith('/cancel')),
      false,
    );
    x.f.restart();
    await assert.rejects(run('existing'), /Lost delivered/);
    const delivery = structuredClone(durable.existing.comparison.content.delivery);
    x.f.restart();
    assert.equal((await run('existing')).kind, 'approved');
    assert.deepEqual(durable.existing.comparison.decision, decision);
    assert.deepEqual(durable.existing.comparison.content.delivery, delivery);
    assert.equal((await run('new')).kind, 'certified');
    assert.equal((await run('existing')).kind, 'certified');
    x.f.restart();
    for (const role of ['existing', 'new']) {
      assert.equal((await run(role)).kind, 'certified');
      assert.equal(durable[role].latest.continuations.at(-1).epoch.epoch, 5);
      assert.equal(
        durable[role].comparison.content.certification.head,
        durable[role].latest.continuations.at(-1).head,
      );
    }
    const before = calls.length;
    await assert.rejects(run('new', { workspaceId: 'ee'.repeat(16) }), /route changed/);
    assert.equal(calls.length, before);
    assert.equal(prompts, 1);
    assert.equal(x.f.rows('membership_admissions').length, 1);
    assert.equal(x.f.rows('membership_ceremonies').length, 1);
    assert.equal(x.f.rows('membership_transfers').length, 1);
    owners.existing.source.proofs = structuredClone(durable.existing.latest);
    const completed = structuredClone(durable.existing);
    loseArchive = true;
    await assert.rejects(run('existing', { begin: 'a2'.repeat(16) }), /Lost archived/);
    const savedInvitation = structuredClone(durable.existing.invitation);
    x.f.restart();
    assert.equal((await run('existing', { begin: 'a2'.repeat(16) })).kind, 'invite');
    assert.deepEqual(durable.existing.invitation, savedInvitation);
    assert.deepEqual(archived, [completed]);
    assert.notEqual(savedInvitation.nonce, completed.invitation.nonce);
    assert.equal(prompts, 1, 'new invitation does not perform an enrollment assertion');
    assert.equal(x.f.rows('membership_admissions').length, 1);
  });

test('retained connection loads actual encrypted writing and retries interrupted installation from committed reader state', async (t) => {
  const client = await compiledComparison(),
    f = await membershipReadingFixture(t),
    { x } = f,
    content = f.saved.content,
    d = content.delivery,
    invitationBody = {
      v: 2,
      workspaceId: x.workspace,
      lineageId: x.base.request.candidate.lineageId,
      credentialId: d.existing.context.existing.id,
      epoch: 3,
      head: x.certification.head,
      nonce: 'ad'.repeat(32),
    },
    invitation = {
      ...invitationBody,
      signature: signed(x.keys.new, message('done/membership-invitation/v2', invitationBody)),
    };
  let saved = {
      v: 2,
      kind: 'membership-connection',
      role: 'new',
      invitation,
      base: x.base,
      latest: f.authority.proofs,
      preparation: null,
      terminal: null,
      comparison: {
        v: 2,
        role: 'new',
        parent: x.admission.head,
        nonce: d.newReveal.nonce,
        attemptId: d.candidate.context.attemptId,
        context: d.candidate.context,
        own: d.candidate,
        peer: d.existing,
        reveal: d.newReveal,
        peerReveal: d.existingReveal,
        decision: d.decision,
        cancellation: null,
        terminal: null,
        content,
      },
    },
    fail = true,
    installs = 0,
    installed;
  const owner = {
    ...f.owner,
    source: { kind: 'pending' },
    load: async () => structuredClone(saved),
    save: async (p, check) => {
      check?.();
      saved = structuredClone(p);
    },
    checkInstalled: async (key) => assert.deepEqual(key, saved.comparison.content.key),
    installMembershipWriting: async (authority, reading, key) => {
      assert.deepEqual(authority, { base: x.base, ...f.authority.proofs });
      assert.deepEqual(reading, saved.comparison.reading);
      assert.deepEqual(key, saved.comparison.content.key);
      assert(reading.admission);
      installs++;
      if (fail) {
        fail = false;
        throw Error('Interrupted native installation');
      }
      installed = structuredClone(reading);
    },
  };
  const run = () =>
    client.advanceMembershipConnection(
      owner,
      'new',
      {
        pin: x.authority.pin,
        signal: f.stop.signal,
        assert: async () => {
          throw Error('Saved approval must not prompt again');
        },
        reconnect: async () => {
          throw Error('Unexpected reconnect');
        },
        acknowledge: async () => {
          throw Error('Unexpected enrollment');
        },
        request: async (path, body) => {
          if (path.endsWith('/bootstrap'))
            return x.authority.owner.membershipBootstrap(x.f.core, body);
          if (path.endsWith('/ceremony')) return x.relay(body);
          if (path.endsWith('/transfer'))
            return x.authority.owner.transferMembership(x.f.core, body);
          return f.io.request(path, body);
        },
        read: f.io.read,
      },
      { read: true },
    );
  await assert.rejects(run(), /Interrupted native installation/);
  assert(saved.comparison.reading.admission);
  assert.equal((await run()).kind, 'installed');
  assert.equal(installs, 2);
  assert.deepEqual(installed, saved.comparison.reading);
  f.setState({ ...f.saved, reading: installed });
  const reopened = await f.run();
  assert.equal(reopened.kind, 'reading');
  assert.equal(
    reopened.entries.find((e) => e.path === 'master.md').content,
    'Original genesis. Before sync began.',
  );
});

async function cancellationRequest(x, role = 'existing') {
  const actors = {
    existing: [x.context.existing.id, x.keys.existing],
    second: [x.context.candidate.id, x.keys.new],
    candidate: [x.entry.input.candidate.credentialId, x.entry.key],
  };
  const [actorId, key] = actors[role],
    e = x.admission.epoch;
  const r = {
    v: 2,
    kind: 'membership-cancellation-request',
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    parent: x.admission.head,
    epoch: e.epoch,
    preparationId: e.preparation.context.attemptId,
    candidateId: e.preparation.context.candidate.credentialId,
    actorId,
    nonce: 'c3'.repeat(32),
    signature: '00'.repeat(64),
  };
  r.signature = signed(key, await membershipCancellationRequestMessage(r));
  return r;
}

test('membership cancellation retains exact retry, both publisher boundaries and subsequent writing after crash', async (t) => {
  let fault;
  const x = await continuationFixture(t, {
    hook(at, op) {
      if (op === 'membership-cancellation' && at === fault) throw Error('interrupted');
    },
  });
  const retained = [];
  for (const [id, signer] of [
    [x.context.existing.id, x.keys.existing],
    [x.context.candidate.id, x.keys.new],
  ]) {
    const w = x.make(1, 'before cancellation', { epoch: 4, credential: id, signer });
    const r = await x.deliveryCall(w);
    decision(x, r, w, undefined, 4);
    retained.push({ id, signer, w, r });
  }
  const request = await cancellationRequest(x, 'second');
  const call = (r = request, auth) => x.authority.owner.cancelMembership(x.f.core, r, auth);
  fault = 'before-commit';
  assert.equal((await call()).ok, false);
  assert.equal(x.f.rows('membership_cancellations').length, 0);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.admission.head);
  fault = 'after-commit';
  assert.equal((await call()).ok, false);
  const row = x.f.rows('membership_cancellations')[0];
  assert(row);
  x.f.restart();
  x.authority.restart();
  fault = undefined;
  const result = await call();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.cancellation, JSON.parse(row.artifact));
  const anchor = await verifyMembershipAnchor(x.base, x.successor, x.certification, {
    epoch: 3,
    head: x.certification.head,
  });
  const parent = await verifyMembershipAdmission(x.admission, anchor);
  const state = membershipState(await verifyMembershipCancellation(result.cancellation, parent));
  assert.equal(state.roster.length, 2);
  assert(state.heads.every((h) => h.position === 1));
  const locator = membershipLocatorRequests(x),
    bootstrap = locator.bootstrap(),
    discovery = locator.discovery();
  const boot = await x.authority.owner.membershipBootstrap(x.f.core, bootstrap);
  assert.equal(
    (await verifyMembershipBootstrapResponse(boot, bootstrap, x.authority.pin)).history.current
      .head,
    result.cancellation.head,
  );
  const discovered = await x.authority.owner.discoverMembership(x.f.core, discovery);
  assert.equal(
    (await verifyMembershipDiscoveryResponse(discovered, discovery, x.base, 1000)).history.current
      .head,
    result.cancellation.head,
  );
  for (const { id, signer, w, r } of retained) {
    assert.deepEqual(await x.deliveryCall(w), r);
    const after = x.make(2, 'after cancellation', { epoch: 5, credential: id, signer });
    decision(x, await x.deliveryCall(after), after, link(w.subject, '00'.repeat(32)), 5);
  }
  assert.deepEqual(await call(), result);
  assert.equal((await call(await cancellationRequest(x, 'existing'))).refusal, 'request-conflict');
  assert.deepEqual(
    await x.authority.owner.admitMembership(x.f.core, x.admissionInput),
    x.admission,
  );
  const e = x.exchange('existing');
  assert.equal(
    (await x.relay(e.request('existing', 'commit', e.commits.existing))).refusal,
    'cancelled',
  );
  const d = await continuationDelivery(x, e);
  assert.equal((await d.transfer(d.request('new', 'read'))).refusal, 'cancelled');
  const pendingWrite = x.make(1, 'cancelled candidate cannot publish', {
    epoch: 5,
    credential: request.candidateId,
    signer: x.entry.key,
  });
  assert.equal((await x.deliveryCall(pendingWrite)).kind, 'unknown');
});

test('membership cancellation and approval have one winner; uncertain or delivered keys require removal', async (t) => {
  for (const approvedFirst of [false, true]) {
    const x = await continuationFixture(t),
      e = x.exchange('existing'),
      d = await continuationDelivery(x, e);
    for (const role of ['existing', 'new'])
      await x.relay(e.request(role, 'commit', e.commits[role]));
    for (const role of ['existing', 'new'])
      await x.relay(e.request(role, 'reveal', e.reveals[role]));
    const request = await cancellationRequest(x, 'candidate');
    if (approvedFirst) assert.equal((await x.relay(e.approval)).ok, true);
    const cancelled = await x.authority.owner.cancelMembership(x.f.core, request);
    if (approvedFirst) {
      assert.equal(cancelled.refusal, 'removal-required');
      assert.equal(x.f.rows('membership_cancellations').length, 0);
      assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
      assert.equal(
        (await x.authority.owner.cancelMembership(x.f.core, request)).refusal,
        'removal-required',
      );
    } else {
      assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
      assert.equal((await x.relay(e.approval)).refusal, 'cancelled');
      assert.equal(
        (await d.transfer(d.request('existing', 'deliver', d.delivery))).refusal,
        'cancelled',
      );
      assert.equal(x.f.rows('membership_transfers').length, 0);
    }
  }
  const x = await continuationFixture(t),
    e = x.exchange('existing');
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'commit', e.commits[role]));
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'reveal', e.reveals[role]));
  const request = await cancellationRequest(x);
  const [cancelled, approved] = await Promise.all([
    x.authority.owner.cancelMembership(x.f.core, request),
    x.relay(e.approval),
  ]);
  assert.notEqual(cancelled.ok, approved.ok);
  assert.equal(x.f.rows('membership_cancellations').length, cancelled.ok ? 1 : 0);
  assert.equal(!!x.f.rows('membership_ceremonies')[0].decision, approved.ok);
});

test('membership cancellation checks commit authorization, changed boundaries and signed mismatch', async (t) => {
  const x = await continuationFixture(t),
    e = x.exchange('existing');
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'commit', e.commits[role]));
  for (const role of ['existing', 'new']) await x.relay(e.request(role, 'reveal', e.reveals[role]));
  const mismatch = e.request('existing', 'decide', { ...e.approval.payload, outcome: 'mismatch' });
  assert.equal((await x.relay(mismatch)).ok, true);
  const request = await cancellationRequest(x, 'candidate');
  let checked = false;
  await assert.rejects(
    x.authority.owner.cancelMembership(x.f.core, request, (_db, target) => {
      assert.equal(target.credentialId, request.actorId);
      assert.equal(target.attemptId, request.preparationId);
      checked = true;
      return () => {
        throw new AuthorizationRefused('session-required');
      };
    }),
    AuthorizationRefused,
  );
  assert(checked);
  assert.equal(x.f.rows('membership_cancellations').length, 0);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.admission.head);
  const done = await x.authority.owner.cancelMembership(x.f.core, request);
  assert.equal(done.ok, true, JSON.stringify(done));
  const row = x.f.rows('membership_cancellations')[0];
  mutate(x, (db) => db.prepare('UPDATE membership_cancellations SET boundaries=?').run('[]'));
  assert.equal((await x.authority.owner.cancelMembership(x.f.core, request)).ok, false);
  mutate(x, (db) =>
    db.prepare('UPDATE membership_cancellations SET boundaries=?').run(row.boundaries),
  );
  assert.deepEqual(await x.authority.owner.cancelMembership(x.f.core, request), done);
});

test('schema-17 continuation requires explicit cancellation upgrade and preserves the pending attempt', async (t) => {
  const x = await continuationFixture(t),
    source = new DatabaseSync(x.f.path),
    path = x.f.path + '.offline-v17';
  await backup(source, path);
  source.close();
  let db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; DROP TABLE membership_rotations; ALTER TABLE promotions DROP COLUMN removal_parent; DROP TABLE removal_preparations; DROP TABLE membership_cancellations; PRAGMA user_version=17;',
  );
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
    upgradeFromV17: true,
  });
  upgraded.close();
  db = new DatabaseSync(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
  assert.deepEqual(
    db.prepare('SELECT * FROM membership_admissions').all(),
    x.f.rows('membership_admissions'),
  );
  assert.deepEqual(db.prepare('SELECT * FROM membership_cancellations').all(), []);
  db.close();
});

test('protected membership cancellation invalidates old grants and emits only one committed hint', async (t) => {
  const x = await continuationFixture(t),
    http = await membershipHTTP(t, x),
    g = await continuationGrants(x);
  const request = await cancellationRequest(x, 'candidate'),
    path = '/account/membership/v2/cancel';
  const scope = {
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: request.actorId,
    attemptId: request.preparationId,
  };
  assert.equal((await http.post(path, request)).status, 401);
  const workspace = await g.grant(
    { kind: 'workspace', workspaceId: x.workspace, credentialId: x.context.existing.id },
    x.keys.existing,
  );
  assert.equal((await http.post(path, request, workspace)).body.refusal, 'insufficient-scope');
  const grant = await g.grant(scope, x.entry.key);
  const done = await http.post(path, request, grant);
  assert.equal(done.status, 200, JSON.stringify(done));
  assert.equal(done.body.cancellation.kind, 'membership-cancellation');
  assert.equal(http.hints.length, 1);
  assert.equal((await http.post(path, request, grant)).body.refusal, 'authority-changed');
  const retry = await g.grant(scope, x.entry.key);
  assert.deepEqual((await http.post(path, request, retry)).body, done.body);
  assert.equal(http.hints.length, 1);
  assert.equal(
    (await g.begin({ kind: 'workspace', workspaceId: x.workspace, credentialId: request.actorId }))
      .ok,
    false,
  );
});

test('retained client cancellation saves before effects and cold-resolves a lost committed reply', async (t) => {
  const client = await compiledComparison(),
    x = await continuationFixture(t);
  let durable = null,
    failSave = false,
    loseReply = true,
    sends = 0;
  const owner = {
    participant: x.context.existing,
    source: {
      kind: 'original',
      base: x.base,
      proofs: { successor: x.successor, certification: x.certification, continuations: [] },
    },
    load: async () => structuredClone(durable),
    save: async (value) => {
      if (failSave && value.withdrawal) throw Error('failed cancellation save');
      durable = structuredClone(value);
    },
    sign: async (bytes) => signed(x.keys.existing, bytes),
  };
  const run = (input = {}) =>
    client.advanceMembershipConnection(
      owner,
      'existing',
      {
        pin: x.authority.pin,
        signal: new AbortController().signal,
        now: () => 1000,
        request: async (path, body) => {
          if (path.endsWith('/bootstrap'))
            return x.authority.owner.membershipBootstrap(x.f.core, body);
          if (path.endsWith('/ceremony')) return x.relay(body);
          assert(path.endsWith('/cancel'));
          assert.deepEqual(durable.withdrawal, body);
          sends++;
          const result = await x.authority.owner.cancelMembership(x.f.core, body);
          if (loseReply) {
            loseReply = false;
            throw Error('lost cancellation reply');
          }
          return result;
        },
      },
      input,
    );
  assert.equal((await run()).canCancel, true);
  failSave = true;
  await assert.rejects(run({ cancel: true }), /failed cancellation save/);
  assert.equal(sends, 0);
  assert.equal(durable.withdrawal, undefined);
  failSave = false;
  await assert.rejects(run({ cancel: true }), /lost cancellation reply/);
  assert.equal(sends, 1);
  const saved = structuredClone(durable.withdrawal);
  x.f.restart();
  x.authority.restart();
  assert.equal((await run()).kind, 'cancelled');
  assert.deepEqual(durable.withdrawal, saved);
  assert.equal(sends, 1, 'verified bootstrap resolves the already committed outcome');
  assert.equal(durable.latest.continuations.at(-1).kind, 'membership-cancellation');
  const cancelled = structuredClone(durable);
  owner.source.proofs = structuredClone(durable.latest);
  const archive = [];
  owner.archiveConnection = async (expected, next) => {
    assert.deepEqual(durable, expected);
    archive.push(structuredClone(expected));
    durable = structuredClone(next);
  };
  assert.equal((await run({ begin: 'a3'.repeat(16) })).kind, 'invite');
  assert.deepEqual(archive, [cancelled]);
  assert.equal(durable.withdrawal, undefined);
  assert.equal(sends, 1, 'new invitation cannot replay old cancellation');
});

async function removalRequest(x, target = x.context.candidate.id, actor = 'existing') {
  const { removalPreparationRequestMessage } = await import('../../account-protocol/rotation.ts');
  const current = x.admission?.kind === 'membership-admission' ? x.admission : x.certification;
  const r = {
    v: 1,
    kind: 'removal-preparation-request',
    workspaceId: x.workspace,
    lineageId: x.base.request.candidate.lineageId,
    parent: current.head,
    epoch: current.epoch.epoch,
    actorId: x.context[actor === 'existing' ? 'existing' : 'candidate'].id,
    targetId: target,
    nonce: 'd1'.repeat(32),
    signature: '00'.repeat(64),
  };
  r.signature = signed(x.keys[actor], await removalPreparationRequestMessage(r));
  return r;
}
async function removalFixture(t, options = {}) {
  const authority = authorityFixture(t);
  return checkpointFixture(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    ...options,
  });
}

test('removal preparation fences only the target and preserves exact accepted retries through lost response and restart', async (t) => {
  let fail = false;
  const x = await removalFixture(t, {
    hook: (point, operation) => {
      if (fail && point === 'after-commit' && operation === 'prepare-removal') {
        fail = false;
        throw Error('lost reply');
      }
    },
  });
  const w = x.make(1, 'target writing before fence', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  const answer = await x.deliveryCall(w);
  decision(x, answer, w, undefined, 3);
  const r = await removalRequest(x);
  fail = true;
  assert.equal((await x.authority.owner.prepareRemoval(x.f.core, r)).ok, false);
  assert.equal(x.f.rows('removal_preparations').length, 1);
  x.f.restart();
  x.authority.restart();
  const result = await x.authority.owner.prepareRemoval(x.f.core, r);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.preparation.cutoff.find((h) => h.credentialId === r.targetId).position, 1);
  assert.deepEqual(await x.deliveryCall(w), answer);
  const later = x.make(2, 'target writing after fence', {
    epoch: 3,
    credential: r.targetId,
    signer: x.keys.new,
  });
  assert.deepEqual(await x.deliveryCall(later), { kind: 'unknown', reason: 'removal-pending' });
  const own = x.make(1, 'remaining device continues', { epoch: 3 });
  decision(x, await x.deliveryCall(own), own, undefined, 3);
  assert.deepEqual(await x.authority.owner.prepareRemoval(x.f.core, r), result);
  const changed = await removalRequest(x, x.context.existing.id, 'new');
  assert.equal(
    (await x.authority.owner.prepareRemoval(x.f.core, changed)).refusal,
    'request-conflict',
  );
  assert.equal(x.f.rows('publisher_decisions').length, 1);
  assert.equal(x.f.rows('delivery_decisions').length, 1);
});

test('removal preparation serializes a racing write and a racing publication cannot bypass its fence', async (t) => {
  const x = await removalFixture(t);
  // The producer races the existing delivery path using two genuine async operations, not injected rows.
  const r = await removalRequest(x),
    w = x.make(1, 'racing target', {
      epoch: 3,
      credential: x.context.candidate.id,
      signer: x.keys.new,
    });
  const [prepared, delivered] = await Promise.all([
    x.authority.owner.prepareRemoval(x.f.core, r),
    x.deliveryCall(w),
  ]);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const cut = prepared.preparation.cutoff.find((h) => h.credentialId === r.targetId);
  if (delivered.kind === 'decision') {
    decision(x, delivered, w, undefined, 3);
    assert.equal(cut.position, 1);
  } else {
    assert.equal(cut.position, 0);
    assert.equal(delivered.reason, 'removal-pending');
  }
  const next = x.make(cut.position + 1, 'after race', {
    epoch: 3,
    credential: r.targetId,
    signer: x.keys.new,
  });
  assert.equal((await x.deliveryCall(next)).reason, 'removal-pending');
});

test('pending removal prevents comparison, delivery, certification and cancellation from changing the prepared parent', async (t) => {
  const x = await continuationFixture(t),
    e = x.exchange('existing'),
    d = await continuationDelivery(x, e);
  await d.approve();
  const r = await removalRequest(x, x.entry.input.candidate.credentialId);
  const result = await x.authority.owner.prepareRemoval(x.f.core, r);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((await x.relay(e.approval)).ok, false);
  assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, false);
  assert.equal(
    (await x.authority.owner.cancelMembership(x.f.core, await cancellationRequest(x))).ok,
    false,
  );
  assert.equal(x.f.rows('membership_transfers').length, 0);
  assert.equal(x.f.rows('membership_cancellations').length, 0);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.admission.head);
});

test('removal preparation refuses lost commit authorization and tampered retained fence without blocking prior rollback writes', async (t) => {
  const x = await removalFixture(t),
    r = await removalRequest(x);
  await assert.rejects(
    x.authority.owner.prepareRemoval(x.f.core, r, (_db, target) => {
      assert.deepEqual(target, {
        kind: 'workspace',
        workspaceId: x.workspace,
        credentialId: r.actorId,
        action: 'remove',
      });
      return () => {
        throw new AuthorizationRefused('signed-out');
      };
    }),
    AuthorizationRefused,
  );
  assert.equal(x.f.rows('removal_preparations').length, 0);
  const w = x.make(1, 'rollback kept target eligible', {
    epoch: 3,
    credential: r.targetId,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(w), w, undefined, 3);
  assert.equal((await x.authority.owner.prepareRemoval(x.f.core, r)).ok, true);
  const row = x.f.rows('removal_preparations')[0];
  mutate(x, (db) => db.prepare('UPDATE removal_preparations SET target_id=?').run(r.actorId));
  const next = x.make(2, 'tampered fence must not reopen target', {
    epoch: 3,
    credential: r.targetId,
    signer: x.keys.new,
  });
  assert.equal((await x.deliveryCall(next)).kind, 'unknown');
  assert.equal((await x.authority.owner.prepareRemoval(x.f.core, r)).ok, false);
  mutate(x, (db) =>
    db
      .prepare('UPDATE removal_preparations SET target_id=?,artifact=?')
      .run(row.target_id, row.artifact),
  );
  assert.equal((await x.deliveryCall(next)).reason, 'removal-pending');
  mutate(x, (db) => db.prepare('DELETE FROM removal_preparations').run());
  assert.equal((await x.deliveryCall(next)).kind, 'unknown');
  assert.equal((await x.authority.owner.prepareRemoval(x.f.core, r)).ok, false);
  assert.equal(x.f.rows('publisher_decisions').length, 1);
});

test('removal schema upgrades only offline from 18 and refuses an older host', async (t) => {
  const x = await removalFixture(t),
    path = x.f.path + '.schema18';
  let db = new DatabaseSync(x.f.path);
  await backup(db, path);
  db.close();
  db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; DROP TABLE membership_rotations; ALTER TABLE promotions DROP COLUMN removal_parent; DROP TABLE removal_preparations; PRAGMA user_version=18;',
  );
  db.close();
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
    sessions = { pin: x.authority.pin, operatorKey: x.authority.key };
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV18: true,
  });
  upgraded.close();
  db = new DatabaseSync(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
  assert.deepEqual(db.prepare('SELECT * FROM removal_preparations').all(), []);
  assert.deepEqual(db.prepare('SELECT * FROM promotions').all(), x.f.rows('promotions'));
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

test('joined owner can prepare original-device removal while a new admission cannot invalidate its parent', async (t) => {
  const x = await removalFixture(t);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  const entry = x.candidate();
  entry.input.candidate.head = x.certification.head;
  const begun = await x.enroll('begin', entry.input);
  const enrolled = await x.enroll('finish', nextProof(x, entry, begun.challenge));
  const r = await removalRequest(x, x.context.existing.id, 'new');
  const prepared = await x.authority.owner.prepareRemoval(x.f.core, r);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const own = x.make(1, 'joined survivor continues', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(own), own, undefined, 3);
  assert.equal(
    (await x.deliveryCall(x.make(1, 'original is fenced', { epoch: 3 }))).reason,
    'removal-pending',
  );
  const another = x.candidate();
  another.input.candidate.head = x.certification.head;
  assert.equal((await x.enroll('begin', another.input)).refusal, 'connection-in-progress');
  const admission = await x.authority.owner.admitMembership(x.f.core, {
    retryKey: entry.input.retryKey,
    attemptId: enrolled.receipt.context.attemptId,
    receiptId: enrolled.receipt.receiptId,
  });
  assert.equal(admission.ok, false);
  assert.equal(x.f.rows('membership_admissions').length, 0);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.certification.head);
  x.f.restart();
  assert.deepEqual(await x.authority.owner.prepareRemoval(x.f.core, r), prepared);
});

async function rotationRequest(x, preparationRequest = null, parentInput = null) {
  const { rotationIntentMessage } = await import('../../account-protocol/rotation.ts');
  const request = preparationRequest ?? (await removalRequest(x));
  const prepared = await x.authority.owner.prepareRemoval(x.f.core, request);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  let parent =
    parentInput ??
    (await verifyMembershipAnchor(x.base, x.successor, x.certification, {
      epoch: 3,
      head: x.certification.head,
    }));
  if (!parentInput && x.admission?.kind === 'membership-admission')
    parent = await verifyMembershipAdmission(x.admission, parent);
  const p = membershipState(parent);
  const r = {
    v: 1,
    kind: 'rotation-request',
    preparation: prepared.preparation,
    actorId: request.actorId,
    target: p.generation + 1,
    payload: {
      cutoff: prepared.preparation.cutoff,
      excluded: [request.targetId],
      recoveryWrap: { enc: 'b1'.repeat(32), ct: 'b2'.repeat(48) },
      wraps: p.certificate.members
        .filter((m) => m.id !== request.targetId)
        .map((m) => ({ credentialId: m.id, enc: 'b3'.repeat(32), ct: 'b4'.repeat(48) })),
    },
    signature: '00'.repeat(64),
  };
  const sign = async (value) => ({
    ...value,
    signature: signed(
      x.keys[request.actorId === x.context.existing.id ? 'existing' : 'new'],
      await rotationIntentMessage(value),
    ),
  });
  return { request: await sign(r), parent, sign };
}

test('rotation commits once across rollback, lost reply, restart and a competing signed intent', async (t) => {
  let fault;
  const x = await removalFixture(t, {
    hook: (point, operation) => {
      if (operation === 'commit-rotation' && point === fault) throw Error('interrupted');
    },
  });
  const w = x.make(1, 'target accepted', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  const accepted = await x.deliveryCall(w);
  decision(x, accepted, w, undefined, 3);
  const { request, parent, sign } = await rotationRequest(x);
  const call = (r = request, authorize) => x.authority.owner.commitRotation(x.f.core, r, authorize);
  fault = 'before-commit';
  assert.equal((await call()).ok, false);
  assert.equal(x.f.rows('membership_rotations').length, 0);
  assert.equal(x.f.rows('removal_preparations').length, 1);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.certification.head);
  const survivor = x.make(1, 'advances after preparation', { epoch: 3 });
  decision(x, await x.deliveryCall(survivor), survivor, undefined, 3);
  fault = 'after-commit';
  assert.equal((await call()).ok, false);
  assert.equal(x.f.rows('membership_rotations').length, 1);
  assert.equal(x.f.rows('removal_preparations').length, 0);
  assert.equal(x.f.rows('promotions')[0].removal_parent, null);
  const retained = x.f.rows('membership_rotations')[0];
  x.f.restart();
  x.authority.restart();
  fault = undefined;
  const result = await call();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.rotation, JSON.parse(retained.artifact));
  const { verifyMembershipRotation } = await import('../../account-protocol/membership.ts');
  const { verifyRotationRequest, resolveRotationOutcome } =
    await import('../../account-protocol/rotation.ts');
  const state = membershipState(await verifyMembershipRotation(result.rotation, parent));
  assert.equal(state.generation, 2);
  assert.equal(state.roster.length, 1);
  assert.equal(state.finalized[0].position, 1);
  assert.equal(state.heads[0].position, 1);
  assert.deepEqual(await x.deliveryCall(w), accepted);
  const competing = structuredClone(request);
  competing.payload.wraps[0].ct = 'c1'.repeat(48);
  const rival = await sign(competing),
    answer = await call(rival);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(
    (
      await resolveRotationOutcome(
        answer.outcome,
        await verifyRotationRequest(rival, parent, x.base.request.recovery),
      )
    ).kind,
    'superseded',
  );
  assert.deepEqual(x.f.rows('membership_rotations'), [retained]);
  assert.equal(x.f.rows('publisher_decisions').length, 1);
});

test('rotation retains old accepted history and allows survivor offline work before and after its new generation writes', async (t) => {
  const x = await removalFixture(t);
  const target = x.context.candidate.id;
  const old = x.make(1, 'removed history', { epoch: 3, credential: target, signer: x.keys.new });
  const accepted = await x.deliveryCall(old);
  decision(x, accepted, old, undefined, 3);
  const { request } = await rotationRequest(x);
  const result = await x.authority.owner.commitRotation(x.f.core, request);
  assert.equal(result.ok, true, JSON.stringify(result));
  const w1 = x.make(1, 'offline survivor', { epoch: 3, gen: 1 }),
    r1 = await x.deliveryCall(w1);
  decision(x, r1, w1, undefined, 4);
  const w2 = x.make(2, 'activated survivor', { epoch: 4, gen: 2 }),
    r2 = await x.deliveryCall(w2);
  decision(x, r2, w2, link(w1.subject, '00'.repeat(32)), 4);
  const w3 = x.make(3, 'late old offline work', { epoch: 3, gen: 1 }),
    r3 = await x.deliveryCall(w3);
  decision(x, r3, w3, link(w2.subject, link(w1.subject, '00'.repeat(32))), 4);
  // A current-epoch envelope cannot pretend its retired generation is still current.
  const wrong = x.make(4, 'wrong new epoch generation', { epoch: 4, gen: 1 });
  assert.equal(decision(x, await x.deliveryCall(wrong), wrong, undefined, 4).kind, 'refused');
  for (const epoch of [3, 4]) {
    const denied = x.make(2, 'removed cannot publish', {
      epoch,
      gen: epoch === 3 ? 1 : 2,
      credential: target,
      signer: x.keys.new,
    });
    assert.equal((await x.deliveryCall(denied)).kind, 'unknown');
  }
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.deliveryCall(w1), r1);
  assert.deepEqual(await x.deliveryCall(w3), r3);
  const q = query(
    x,
    0,
    8,
    { reader: x.context.existing.id, publisher: target, epoch: 4, head: result.rotation.head },
    x.keys.existing,
  );
  page(x, await read(x, q), q, [{ w: old, r: accepted, epoch: 3 }]);
  const denied = query(
    x,
    0,
    8,
    { reader: target, publisher: x.context.existing.id, epoch: 4, head: result.rotation.head },
    x.keys.new,
  );
  assert.equal((await read(x, denied)).kind, 'unknown');
});

test('rotation can remove the original publisher and finalize a never-writing or exposed pending target', async (t) => {
  for (const pending of [false, true]) {
    const x = pending ? await continuationFixture(t) : await removalFixture(t);
    if (pending) {
      const d = await continuationDelivery(x, x.exchange('existing'));
      await d.approve();
      assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
    }
    const target = pending ? x.entry.input.candidate.credentialId : x.context.existing.id;
    const prep = await removalRequest(x, target, pending ? 'existing' : 'new');
    const { request, parent } = await rotationRequest(x, prep);
    const result = await x.authority.owner.commitRotation(x.f.core, request);
    assert.equal(result.ok, true, JSON.stringify(result));
    const { verifyMembershipRotation } = await import('../../account-protocol/membership.ts');
    assert.equal(
      membershipState(await verifyMembershipRotation(result.rotation, parent)).finalized[0]
        .position,
      0,
    );
    const role = pending ? 'existing' : 'new',
      id = x.context[role === 'existing' ? 'existing' : 'candidate'].id;
    const w = x.make(1, 'remaining publisher', {
      epoch: result.rotation.epoch.epoch,
      gen: 2,
      credential: id,
      signer: x.keys[role],
    });
    decision(x, await x.deliveryCall(w), w, undefined, result.rotation.epoch.epoch);
    x.f.restart();
    x.authority.restart();
    assert.equal((await x.authority.owner.commitRotation(x.f.core, request)).ok, true);
    if (pending) assert.equal((await x.relay(x.exchange('existing').approval)).ok, false);
  }
});

test('rotation fails closed on final authorization loss, altered preparation, and missing committed proof', async (t) => {
  const x = await removalFixture(t),
    { request, sign } = await rotationRequest(x);
  await assert.rejects(
    x.authority.owner.commitRotation(x.f.core, request, (_db, target) => {
      assert.equal(target.action, 'remove');
      return () => {
        throw new AuthorizationRefused('signed-out');
      };
    }),
    AuthorizationRefused,
  );
  assert.equal(x.f.rows('membership_rotations').length, 0);
  assert.equal(x.f.rows('removal_preparations').length, 1);
  const altered = structuredClone(request);
  altered.preparation.cutoff[0].position++;
  altered.preparation.cutoff[0].link = 'c2'.repeat(32);
  assert.equal((await x.authority.owner.commitRotation(x.f.core, await sign(altered))).ok, false);
  assert.equal((await x.authority.owner.commitRotation(x.f.core, request)).ok, true);
  const row = x.f.rows('membership_rotations')[0];
  mutate(x, (db) => db.prepare('DELETE FROM membership_rotations').run());
  assert.equal((await x.deliveryCall(x.make(1, 'missing rotation', { epoch: 3 }))).kind, 'unknown');
  assert.equal((await x.authority.owner.commitRotation(x.f.core, request)).ok, false);
  mutate(x, (db) =>
    db.prepare('INSERT INTO membership_rotations VALUES (?,?,?,?,?,?)').run(...Object.values(row)),
  );
  assert.equal((await x.authority.owner.commitRotation(x.f.core, request)).ok, true);
});

test('rotation serializes a survivor publication and fences previously issued target grants', async (t) => {
  const x = await removalFixture(t),
    g = await continuationGrants(x);
  const scope = (id) => ({ kind: 'workspace', workspaceId: x.workspace, credentialId: id });
  const target = await g.grant(scope(x.context.candidate.id), x.keys.new);
  const { request } = await rotationRequest(x);
  // Preparation invalidates old access; only a freshly bound survivor grant can rotate.
  const own = await g.grant(scope(x.context.existing.id), x.keys.existing);
  const w = x.make(1, 'survivor concurrent with rotation', { epoch: 3 });
  const [rotated, published] = await Promise.all([
    x.authority.owner.commitRotation(x.f.core, request, x.f.core.grants.authorize(own.grantToken)),
    x.deliveryCall(w),
  ]);
  assert.equal(rotated.ok, true, JSON.stringify(rotated));
  assert.equal(published.kind, 'decision', JSON.stringify(published));
  const epoch = JSON.parse(Buffer.from(published.bytes).toString())[7];
  assert([3, 4].includes(epoch));
  decision(x, published, w, undefined, epoch);
  assert.equal(
    rotated.rotation.epoch.heads.find((h) => h.credentialId === x.context.existing.id).position,
    epoch === 3 ? 1 : 0,
  );
  const later = x.make(2, 'remaining authenticated publisher', { epoch: 4, gen: 2 });
  await assert.rejects(
    x.authority.owner.decideSubmission(
      x.f.core,
      { workspaceId: x.workspace, bytes: later.bytes },
      x.f.core.grants.authorize(own.grantToken),
    ),
    AuthorizationRefused,
  );
  assert.equal((await g.begin(scope(x.context.candidate.id))).ok, false);
  const renewed = await g.grant(scope(x.context.existing.id), x.keys.existing);
  const response = await x.authority.owner.decideSubmission(
    x.f.core,
    { workspaceId: x.workspace, bytes: later.bytes },
    x.f.core.grants.authorize(renewed.grantToken),
  );
  decision(x, response, later, link(w.subject, '00'.repeat(32)), 4);
  const removed = x.make(1, 'removed signed publisher', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  await assert.rejects(
    x.authority.owner.decideSubmission(
      x.f.core,
      { workspaceId: x.workspace, bytes: removed.bytes },
      x.f.core.grants.authorize(target.grantToken),
    ),
    AuthorizationRefused,
  );
  const q = membershipLocatorRequests(x).discovery(x.context.existing.id, x.keys.existing);
  const responseDiscovery = await x.authority.owner.discoverMembership(
    x.f.core,
    q,
    x.f.core.grants.authorize(renewed.grantToken),
  );
  assert.equal(
    (await verifyMembershipDiscoveryResponse(responseDiscovery, q, x.base, 1000)).history.current
      .head,
    rotated.rotation.head,
  );
});

test('rotation schema explicitly upgrades a retained preparation from 19 without reopening an old host', async (t) => {
  const x = await removalFixture(t);
  await rotationRequest(x);
  const path = x.f.path + '.schema19';
  let db = new DatabaseSync(x.f.path);
  await backup(db, path);
  db.close();
  db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; DROP TABLE membership_rotations; PRAGMA user_version=19;',
  );
  db.close();
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
    sessions = { pin: x.authority.pin, operatorKey: x.authority.key };
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV19: true,
  });
  upgraded.close();
  db = new DatabaseSync(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
  assert.deepEqual(
    db.prepare('SELECT * FROM removal_preparations').all(),
    x.f.rows('removal_preparations'),
  );
  assert.deepEqual(db.prepare('SELECT * FROM promotions').all(), x.f.rows('promotions'));
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

let removalClient;
async function compiledRemoval() {
  removalClient ??= (async () => {
    const built = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        lib: { entry: resolve('test/account-membership/removal-entry.ts'), formats: ['es'] },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    });
    const code = (Array.isArray(built) ? built[0] : built).output.find(
      (v) => v.type === 'chunk',
    ).code;
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  })();
  return removalClient;
}

test('protected rotation routes require the exact actor and emit only committed preparation and rotation hints', async (t) => {
  const x = await removalFixture(t),
    api = await membershipHTTP(t, x),
    g = await continuationGrants(x),
    r = await removalRequest(x);
  const prepare = '/account/membership/v2/removal/prepare',
    commit = '/account/membership/v2/removal/commit';
  assert.equal((await api.post(prepare, r)).status, 401);
  const target = await g.grant(
    { kind: 'workspace', workspaceId: x.workspace, credentialId: r.targetId },
    x.keys.new,
  );
  assert.equal((await api.post(prepare, r, target)).status, 403);
  assert.equal(x.f.rows('removal_preparations').length, 0);
  const own = () =>
    g.grant(
      { kind: 'workspace', workspaceId: x.workspace, credentialId: r.actorId },
      x.keys.existing,
    );
  const first = await api.post(prepare, r, await own());
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal(api.hints.length, 1);
  assert.deepEqual((await api.post(prepare, r, await own())).body, first.body);
  assert.equal(api.hints.length, 1);
  const { request } = await rotationRequest(x, r);
  assert.equal((await api.post(commit, request)).status, 401);
  const grant = await own();
  const result = await api.post(commit, request, grant);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(api.hints.length, 2);
  assert.equal((await api.post(commit, request, grant)).status, 409);
  assert.deepEqual((await api.post(commit, request, await own())).body, result.body);
  assert.equal(api.hints.length, 2);
  for (const path of ['/__account-setup/removal/prepare', '/__account-setup/removal/commit'])
    assert.equal((await api.post(path, request)).status, 404);
});

test('retained browser rotation producer composes with scoped HTTP through lost preparation and committed replies', async (t) => {
  let liveClock = false;
  const client = await compiledRemoval(),
    x = await removalFixture(t, { now: () => (liveClock ? Date.now() : 1000) }),
    api = await membershipHTTP(t, x);
  liveClock = true;
  const g = await continuationGrants(x);
  const beforeLocation = globalThis.location;
  globalThis.location = { origin: x.authority.pin.origin };
  t.after(() => {
    globalThis.location = beforeLocation;
  });
  const stop = new AbortController();
  t.after(() => stop.abort());
  let access,
    retained = null,
    lose = 'prepare';
  const requests = [];
  const login = {
    networkSignal: stop.signal,
    getSnapshot: () => 'remembered',
    authorization: async () => {
      access ??= x.f.core.sessions.renew({
        sessionId: g.session.sessionId,
        renewalToken: g.session.renewalToken,
      });
      assert.equal(access.stage, 'access', JSON.stringify(access));
      return {
        token: access.accessToken,
        sessionId: access.sessionId,
        accountId: access.accountId,
      };
    },
    rejectAccess: () => {
      access = undefined;
    },
  };
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, body: init.body });
    const auth = new Headers(init.headers).get('Authorization');
    const result = await api.post(
      path,
      init.body,
      auth ? { grantToken: auth.slice(7) } : undefined,
    );
    if (result.status === 200 && path.endsWith('/removal/' + lose)) {
      lose = lose === 'prepare' ? 'commit' : null;
      throw Error('committed reply lost');
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: result.headers,
    });
  };
  const transport = new client.ScopedTransport(x.authority.pin, stop.signal, fetch);
  const binding = {
    login,
    scope: { kind: 'workspace', workspaceId: x.workspace, credentialId: x.context.existing.id },
    sign: async (bytes) => signed(x.keys.existing, bytes),
  };
  const parent = await client.verifyMembershipAnchor(x.base, x.successor, x.certification, {
    epoch: 3,
    head: x.certification.head,
  });
  const network = client.createDeviceRemovalTransport(parent, transport.bind(binding), stop.signal);
  const wrapping = await crypto.subtle.importKey(
    'pkcs8',
    x.w.privateKey.export({ format: 'der', type: 'pkcs8' }),
    'X25519',
    false,
    ['deriveBits'],
  );
  const opened = [];
  const owner = {
    participant: x.context.existing,
    sign: binding.sign,
    openWrap: async (w, info) => {
      const key = await client.openGeneration(
        w,
        wrapping,
        new Uint8Array(Buffer.from(x.context.existing.wPub, 'hex')),
        info,
      );
      opened.push(key);
      return key;
    },
  };
  const run = () =>
    client.continueDeviceRemoval(parent, x.base.request.recovery, x.context.candidate.id, owner, {
      ...network,
      signal: stop.signal,
      load: async () => structuredClone(retained),
      replace: async (before, next) => {
        assert.deepEqual(before, retained);
        retained = structuredClone(next);
      },
    });
  assert.equal(await run(), 'pending');
  assert.equal(retained.preparation, null);
  assert.equal(api.hints.length, 1);
  assert.equal(await run(), 'pending');
  assert(retained.rotation);
  assert.equal(retained.outcome, null);
  assert.equal(api.hints.length, 2);
  const intent = structuredClone(retained.rotation);
  x.f.restart();
  x.authority.restart();
  assert.equal(await run(), 'committed');
  assert.deepEqual(retained.rotation, intent);
  assert.equal(api.hints.length, 2);
  assert.equal(x.f.rows('membership_rotations').length, 1);
  assert(opened.every((k) => k.every((b) => b === 0)));
  const sent = requests.filter((r) => r.path.endsWith('/removal/commit'));
  assert(sent.length >= 2);
  assert(sent.every((r) => r.body === JSON.stringify(intent)));
  const own = await client.openGeneration(
    intent.payload.wraps[0],
    wrapping,
    new Uint8Array(Buffer.from(x.context.existing.wPub, 'hex')),
    client.generationInfo({
      workspaceId: x.workspace,
      lineageId: x.context.lineageId,
      authRoot: x.authority.pin.authRoot,
      generation: 2,
    }),
  );
  assert.equal(own.length, 32);
  own.fill(0);
  const removedAccess = transport.bind({
    login,
    scope: { kind: 'removal', workspaceId: x.workspace, credentialId: x.context.candidate.id },
    sign: async (bytes) => signed(x.keys.new, bytes),
  });
  const discovery = await removalDiscoveryRequest(x, x.context.candidate.id, x.keys.new, {
    expiresAt: Date.now() + 60000,
  });
  const terminal = await client.privateDiscoveryPost(
    x.authority.pin,
    removedAccess,
    discovery,
    stop.signal,
  );
  const checked = await client.verifyRemovalDiscoveryResponse(
    terminal,
    discovery,
    x.base,
    Date.now(),
  );
  assert.equal(
    checked.proofs.continuations.at(-1).epoch.outcome.committedId,
    retained.outcome.committedId,
  );
  await assert.rejects(
    removedAccess.fetch('/account/delivery/read-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array([1]),
    }),
  );
});

async function removalDiscoveryRequest(x, id, key, changes = {}) {
  const { removalDiscoveryRequestMessage } =
    await import('../../account-protocol/removalDiscovery.ts');
  const request = {
    v: 1,
    kind: 'removal-discovery-request',
    pin: x.authority.pin,
    workspaceId: x.workspace,
    lineageId: x.context.lineageId,
    credentialId: id,
    nonce: 'ef'.repeat(32),
    expiresAt: 61000,
    signature: '00'.repeat(64),
    ...changes,
  };
  return { ...request, signature: signed(key, await removalDiscoveryRequestMessage(request)) };
}
test('removed and exposed pending devices receive only their authenticated terminal proof through a separate grant', async (t) => {
  const { verifyRemovalDiscoveryResponse } =
    await import('../../account-protocol/removalDiscovery.ts');
  for (const pending of [false, true]) {
    const x = pending ? await continuationFixture(t) : await removalFixture(t),
      g = await continuationGrants(x),
      api = await membershipHTTP(t, x);
    const target = pending ? x.entry.input.candidate.credentialId : x.context.candidate.id,
      key = pending ? x.entry.key : x.keys.new;
    const scope = { kind: 'removal', workspaceId: x.workspace, credentialId: target };
    assert.equal((await g.begin(scope)).ok, false);
    const prep = await removalRequest(x, target),
      { request } = await rotationRequest(x, prep);
    const committed = await x.authority.owner.commitRotation(x.f.core, request);
    assert.equal(committed.ok, true, JSON.stringify(committed));
    const query = await removalDiscoveryRequest(x, target, key);
    const grant = await g.grant(scope, key);
    assert.throws(
      () => x.f.core.grants.subscription(grant.grantToken, scope),
      AuthorizationRefused,
    );
    const path = '/account/membership/v2/removal/discover';
    assert.equal((await api.post(path, query)).status, 401);
    const response = await api.post(path, query, grant);
    assert.equal(response.status, 200, JSON.stringify(response));
    const verified = await verifyRemovalDiscoveryResponse(response.body, query, x.base, 1000);
    assert.equal(verified.history.current.head, committed.rotation.head);
    assert.equal(verified.member.state, pending ? 'pending' : 'certified');
    assert.deepEqual(
      verified.proofs.continuations.at(-1).epoch.finalization,
      committed.rotation.epoch.finalization,
    );
    assert.equal(api.hints.length, 0);
    assert.equal((await g.begin({ ...scope, kind: 'workspace' })).ok, false);
    const owner = await g.grant(
      { kind: 'workspace', workspaceId: x.workspace, credentialId: x.context.existing.id },
      x.keys.existing,
    );
    assert.equal((await api.post(path, query, owner)).status, 403);
    assert.equal(
      (await api.post(path, { ...query, signature: '00'.repeat(64) }, grant)).status,
      409,
    );
    assert.equal(
      (await api.post('/account/membership/v2/removal/commit', request, grant)).status,
      403,
    );
    x.f.restart();
    x.authority.restart();
    g.restart();
    const resumed = await api.post(path, query, await g.grant(scope, key));
    assert.equal(resumed.status, 200);
    await assert.rejects(
      verifyRemovalDiscoveryResponse(
        resumed.body,
        { ...query, nonce: 'ab'.repeat(32) },
        x.base,
        1000,
      ),
    );
    const after = await g.grant(scope, key);
    g.revoke();
    assert.equal((await api.post(path, query, after)).status, 401);
  }
});

test('removed-device discovery stops at its own removal even after another rotation', async (t) => {
  const { verifyRemovalDiscoveryResponse } =
    await import('../../account-protocol/removalDiscovery.ts');
  const { removalPreparationRequestMessage } = await import('../../account-protocol/rotation.ts');
  const x = await continuationFixture(t),
    d = await continuationDelivery(x, x.exchange('existing'));
  await d.approve();
  assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
  const installed = await d.transfer(d.request('new', 'install', d.installation));
  const chain = {
    successor: x.successor,
    certification: x.certification,
    continuations: [x.admission, installed.certification],
  };
  let parent = historyMembership((await verifyMembershipChain(chain, x.base)).history);
  const rotate = async (target) => {
    const p = membershipState(parent),
      prep = {
        v: 1,
        kind: 'removal-preparation-request',
        workspaceId: x.workspace,
        lineageId: p.lineageId,
        parent: p.head,
        epoch: p.epoch,
        actorId: x.context.existing.id,
        targetId: target,
        nonce: 'ba'.repeat(32),
        signature: '00'.repeat(64),
      };
    prep.signature = signed(x.keys.existing, await removalPreparationRequestMessage(prep));
    const { request } = await rotationRequest(x, prep, parent);
    const result = await x.authority.owner.commitRotation(x.f.core, request);
    assert.equal(result.ok, true, JSON.stringify(result));
    chain.continuations.push(result.rotation);
    parent = historyMembership((await verifyMembershipChain(chain, x.base)).history);
    return result;
  };
  const target = x.entry.input.candidate.credentialId,
    first = await rotate(target);
  const second = await rotate(x.context.candidate.id);
  assert.equal(second.rotation.epoch.generation, 3);
  const g = await continuationGrants(x),
    scope = { kind: 'removal', workspaceId: x.workspace, credentialId: target };
  const begun = await g.begin(scope);
  assert.equal(begun.challenge.head, first.rotation.head);
  const grant = await g.finish(begun.challenge, x.entry.key);
  const query = await removalDiscoveryRequest(x, target, x.entry.key);
  const response = await x.authority.owner.discoverRemoval(
    x.f.core,
    query,
    x.f.core.grants.authorize(grant.grantToken),
  );
  const checked = await verifyRemovalDiscoveryResponse(response, query, x.base, 1000);
  assert.equal(checked.history.current.head, first.rotation.head);
  assert.equal(
    checked.proofs.continuations.some((p) => p.head === second.rotation.head),
    false,
  );
});

test('another remaining device can finish the same prepared removal without replacing its cutoff or original retry evidence', async (t) => {
  const x = await continuationFixture(t),
    target = x.entry.input.candidate.credentialId;
  const first = await removalRequest(x, target),
    original = await rotationRequest(x, first);
  const row = x.f.rows('removal_preparations')[0];
  const second = await removalRequest(x, target, 'new');
  const takeover = await rotationRequest(x, second);
  takeover.request.payload.recoveryWrap.ct = 'da'.repeat(48);
  takeover.request = await takeover.sign(takeover.request);
  assert.deepEqual(takeover.request.preparation, original.request.preparation);
  assert.deepEqual(x.f.rows('removal_preparations'), [row]);
  const result = await x.authority.owner.commitRotation(x.f.core, takeover.request);
  assert.equal(result.ok, true, JSON.stringify(result));
  x.f.restart();
  x.authority.restart();
  const retry = await x.authority.owner.commitRotation(x.f.core, original.request);
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.deepEqual(retry.rotation, result.rotation);
  const { verifyRotationRequest, resolveRotationOutcome } =
    await import('../../account-protocol/rotation.ts');
  const checked = await verifyRotationRequest(
    original.request,
    original.parent,
    x.base.request.recovery,
  );
  assert.equal((await resolveRotationOutcome(retry.outcome, checked)).kind, 'superseded');
  assert.equal(x.f.rows('membership_rotations').length, 1);
});

async function admitNext(x, parent, lostReply = false) {
  const entry = x.candidate();
  entry.input.candidate.head = parent.head;
  const begun = await x.enroll('begin', entry.input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  assert.equal(begun.challenge.context.epoch, parent.epoch.epoch);
  const proof = nextProof(x, entry, begun.challenge);
  const prepared = await x.enroll('finish', proof);
  assert.equal(prepared.stage, 'prepared', JSON.stringify(prepared));
  const admissionInput = {
    retryKey: entry.input.retryKey,
    attemptId: prepared.receipt.context.attemptId,
    receiptId: prepared.receipt.receiptId,
  };
  let admission = await x.authority.owner.admitMembership(x.f.core, admissionInput);
  if (lostReply) {
    assert.equal(admission.ok, false);
    x.f.restart();
    x.authority.restart();
    admission = await x.authority.owner.admitMembership(x.f.core, admissionInput);
  }
  assert.equal(admission.kind, 'membership-admission', JSON.stringify(admission));
  return {
    ...x,
    entry,
    proof,
    admissionInput,
    admission,
    relay: (r, auth) => x.authority.owner.relayMembershipCeremony(x.f.core, r, auth),
  };
}

test('repeatable admission after cancellation preserves old attempts and refuses old ceremony authority', async (t) => {
  const x = await continuationFixture(t);
  const r = await cancellationRequest(x);
  const cancelled = await x.authority.owner.cancelMembership(x.f.core, r);
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  const prior = x.f.rows('membership_admissions');
  const y = await admitNext(x, cancelled.cancellation);
  assert.equal(y.admission.epoch.epoch, 6);
  assert.deepEqual(x.f.rows('membership_admissions').slice(0, 1), prior);
  assert.deepEqual(
    await x.authority.owner.admitMembership(x.f.core, x.admissionInput),
    x.admission,
  );
  assert.equal((await x.relay(x.exchange('existing').request('new', 'read'))).ok, false);
  const d = await continuationDelivery(y, continuationExchange(y, y.admission, y.entry));
  await d.approve();
  assert.equal((await d.transfer(d.request('existing', 'deliver', d.delivery))).ok, true);
  const installed = await d.transfer(d.request('new', 'install', d.installation));
  assert.equal(installed.ok, true, JSON.stringify(installed));
  assert.equal(installed.certification.epoch.epoch, 7);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await d.transfer(d.request('new', 'install', d.installation)), installed);
  assert.equal((await x.enroll('resume', { retryKey: x.entry.input.retryKey })).stage, 'admitted');
});

for (const removedOriginal of [false, true])
  test(`replacement after rotation (original removed: ${removedOriginal}) certifies at generation two and permits another rotation`, async (t) => {
    let fault;
    const x = await removalFixture(t, {
      hook(point, operation) {
        if (point === 'after-commit' && operation === fault) {
          fault = null;
          throw Error('Lost later transition reply');
        }
      },
    });
    assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
    const actor = removedOriginal ? 'new' : 'existing';
    const target = removedOriginal ? x.context.existing.id : x.context.candidate.id;
    const oldWrite = x.make(1, 'before removal', {
      epoch: 3,
      credential: target,
      signer: x.keys[removedOriginal ? 'existing' : 'new'],
    });
    assert.equal((await x.deliveryCall(oldWrite)).kind, 'decision');
    const firstRequest = await rotationRequest(x, await removalRequest(x, target, actor));
    const first = await x.authority.owner.commitRotation(x.f.core, firstRequest.request);
    assert.equal(first.ok, true, JSON.stringify(first));
    const frozen = x.f.rows(removedOriginal ? 'promotions' : 'publisher_witnesses');
    fault = 'admit-membership';
    const y = await admitNext(x, first.rotation, true);
    assert.equal(y.admission.epoch.generation, 2);
    const d = await continuationDelivery(y, continuationExchange(y, y.admission, y.entry, actor));
    await d.approve();
    const delivered = await d.transfer(d.request('existing', 'deliver', d.delivery));
    assert.equal(delivered.ok, true, JSON.stringify(delivered));
    fault = 'membership-transfer';
    assert.equal((await d.transfer(d.request('new', 'install', d.installation))).ok, false);
    x.f.restart();
    x.authority.restart();
    const installed = await d.transfer(d.request('new', 'install', d.installation));
    assert.equal(installed.ok, true, JSON.stringify(installed));
    assert.equal(installed.certification.epoch.generation, 2);
    if (removedOriginal)
      assert.equal(x.f.rows('promotions')[0].delivery_witness, frozen[0].delivery_witness);
    else
      assert.deepEqual(
        x.f.rows('publisher_witnesses').find((r) => r.credential_id === target),
        frozen.find((r) => r.credential_id === target),
      );
    const chain = {
      successor: x.successor,
      certification: x.certification,
      continuations: [first.rotation, y.admission, installed.certification],
    };
    const history = (await verifyMembershipChain(chain, x.base)).history;
    const { removalPreparationRequestMessage } = await import('../../account-protocol/rotation.ts');
    const prep = {
      ...firstRequest.request.preparation.request,
      parent: history.current.head,
      epoch: history.current.tip,
      targetId: y.entry.input.candidate.credentialId,
      nonce: 'e1'.repeat(32),
    };
    prep.signature = signed(x.keys[actor], await removalPreparationRequestMessage(prep));
    const secondRequest = await rotationRequest(x, prep, historyMembership(history));
    const second = await x.authority.owner.commitRotation(x.f.core, secondRequest.request);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.rotation.epoch.generation, 3);
    x.f.restart();
    x.authority.restart();
    assert.deepEqual(
      await x.authority.owner.commitRotation(x.f.core, secondRequest.request),
      second,
    );
    assert.deepEqual(await x.authority.owner.commitRotation(x.f.core, firstRequest.request), first);
    assert.equal(x.f.rows('membership_rotations').length, 2);
    assert.deepEqual(
      await x.authority.owner.admitMembership(x.f.core, y.admissionInput),
      y.admission,
    );
  });

test('replacement admission fences new historical-key uploads but retains accepted bytes and signed retry outcomes', async (t) => {
  let fault;
  const x = await removalFixture(t, {
    hook(point, operation) {
      if (operation === 'decide-submission' && point === fault) {
        fault = undefined;
        throw Error('Interrupted generation retry decision');
      }
    },
  });
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  const { request } = await rotationRequest(x);
  const rotation = await x.authority.owner.commitRotation(x.f.core, request);
  assert.equal(rotation.ok, true, JSON.stringify(rotation));
  const acceptedOld = x.make(1, 'accepted before replacement', { epoch: 3, gen: 1 });
  const accepted = await x.deliveryCall(acceptedOld);
  decision(x, accepted, acceptedOld, undefined, 4);
  const y = await admitNext(x, rotation.rotation);
  const old = x.make(2, 'offline writing must survive', { epoch: 3, gen: 1 });
  const previous = link(acceptedOld.subject, '00'.repeat(32));
  const before = x.f.rows('delivery_decisions');
  fault = 'before-commit';
  assert.equal((await x.deliveryCall(old)).kind, 'unknown');
  assert.deepEqual(x.f.rows('delivery_decisions'), before);
  fault = 'after-commit';
  assert.equal((await x.deliveryCall(old)).kind, 'unknown');
  x.f.restart();
  x.authority.restart();
  const answer = await x.deliveryCall(old);
  const denied = decision(x, answer, old, previous, 5);
  assert.equal(denied.kind, 'refused');
  assert.equal(denied.refusal.reason, 'retired-generation');
  assert.deepEqual(await x.deliveryCall(acceptedOld), accepted);
  const withoutParent = x.make(2, 'offline writing must survive', { epoch: 5, gen: 2 });
  assert.equal((await x.deliveryCall(withoutParent)).kind, 'unknown');
  const retry = x.make(2, 'offline writing must survive', {
    epoch: 5,
    gen: 2,
    parent: denied.refusal,
  });
  fault = 'after-commit';
  assert.equal((await x.deliveryCall(retry)).kind, 'unknown');
  x.f.restart();
  x.authority.restart();
  const retried = await x.deliveryCall(retry);
  decision(x, retried, retry, previous, 5);
  assert.deepEqual(
    await x.deliveryCall(old),
    answer,
    'old refusal remains exact after its successor',
  );
  assert.deepEqual(await x.deliveryCall(acceptedOld), accepted);
  const cancelled = await x.authority.owner.cancelMembership(
    x.f.core,
    await cancellationRequest(y),
  );
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  const late = x.make(3, 'cancellation cannot reopen old-key upload', { epoch: 3, gen: 1 });
  assert.equal(decision(x, await x.deliveryCall(late), late).kind, 'refused');
  assert.deepEqual(await x.deliveryCall(retry), retried);
});

async function replacementServiceFixture(t, options = {}) {
  const x = await removalFixture(t, options);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  const rotation = await rotationRequest(x, await removalRequest(x, x.context.candidate.id));
  const committed = await x.authority.owner.commitRotation(x.f.core, rotation.request);
  assert.equal(committed.ok, true, JSON.stringify(committed));
  const y = await admitNext(x, committed.rotation),
    e = continuationExchange(y, y.admission, y.entry);
  const d = await continuationDelivery(y, e, undefined, { publishCheckpoint: false });
  await d.approve();
  return { ...y, d, e };
}

test('replacement publication binds admitted history and source inventory while preserving exact lost-reply retries', async (t) => {
  let lose = false;
  const x = await replacementServiceFixture(t, {
    hook(point, operation) {
      if (lose && operation === 'replacement-checkpoint' && point === 'after-commit') {
        lose = false;
        throw Error('Lost publication reply');
      }
    },
  });
  const { client: c } = await import('../account-history/client.mjs');
  const { historyExchangeMessage } = await import('../../account-protocol/historyExchange.ts');
  const { replacementCheckpointMessage } =
    await import('../../account-protocol/replacementCheckpoint.ts');
  const proofs = {
    successor: x.successor,
    certification: x.certification,
    continuations: [
      'membership_admissions',
      'membership_transfers',
      'membership_cancellations',
      'membership_rotations',
    ]
      .flatMap((table) =>
        x.f
          .rows(table)
          .filter((r) => r.artifact)
          .map((r) => JSON.parse(r.artifact)),
      )
      .sort((a, b) => a.epoch.epoch - b.epoch.epoch),
  };
  const parent = c.historyMembership((await c.verifyMembershipChain(proofs, x.base)).history),
    p = c.membershipState(parent);
  const sign = async (bytes) => signed(x.e.keys.existing, bytes);
  const exchange = async (action, payload) => {
    const request = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      credentialId: x.e.context.existing.id,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: 61000,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    request.signature = await sign(await historyExchangeMessage(request));
    const result = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.page;
  };
  const doc = new c.Y.Doc({ gc: false }),
    key = new Uint8Array(32).fill(63);
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'snapshot-only original');
  t.after(() => {
    doc.destroy();
    key.fill(0);
  });
  const create = async (prior = null) => {
    const page = await exchange('read', 'latest');
    const cp = await c.createHistoryCheckpoint(
      doc,
      doc,
      key,
      parent,
      x.e.context.existing.id,
      page.heads,
      prior,
      sign,
      page.sources,
    );
    await exchange('publish', cp);
    await exchange(
      'admit',
      await c.admitHistoryCheckpoint(cp, key, parent, x.e.context.existing.id, doc, sign),
    );
    return cp;
  };
  const first = await create(),
    inventory = (await exchange('read', 'latest')).sources;
  const call = (cp) =>
    x.d
      .checkpointRequest('existing', 'publish', cp)
      .then((request) => x.authority.owner.exchangeReplacementCheckpoint(x.f.core, request));
  assert.equal(
    (await call(x.d.checkpoint)).refusal,
    'history-changed',
    'legacy publication cannot omit admitted history',
  );
  const prepare = async (history) => {
    const cp = { ...x.d.checkpoint, history };
    cp.signature = await sign(await replacementCheckpointMessage(cp));
    return cp;
  };
  assert.equal(
    (await call(await prepare({ checkpoint: await c.historyCheckpointHash(first), sources: [] })))
      .refusal,
    'history-changed',
  );
  const held = await prepare({
    checkpoint: await c.historyCheckpointHash(first),
    sources: inventory,
  });
  doc.getText('master').insert(0, 'later snapshot\n');
  const second = await create(first);
  assert.equal(
    (await call(held)).refusal,
    'history-changed',
    'changed baseline requires a fresh preparation',
  );
  assert.equal(x.f.rows('replacement_checkpoints').length, 0);
  const current = await prepare({
    checkpoint: await c.historyCheckpointHash(second),
    sources: inventory,
  });
  lose = true;
  assert.equal((await call(current)).ok, false);
  assert.equal(x.f.rows('replacement_checkpoints').length, 1);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual((await call(current)).checkpoint, current);
  // The published immutable carrier remains exact after later history advances.
  await create(second);
  assert.deepEqual((await call(current)).checkpoint, current);
});

test('replacement snapshot retention survives commit faults and cannot be swapped or bypassed at certification', async (t) => {
  let fault;
  const x = await replacementServiceFixture(t, {
    hook(point, operation) {
      if (fault === operation + ':' + point) {
        fault = null;
        throw Error('Interrupted replacement');
      }
    },
  });
  const { d } = x;
  const call = (r, auth) => x.authority.owner.exchangeReplacementCheckpoint(x.f.core, r, auth);
  const publish = await d.checkpointRequest('existing', 'publish', d.checkpoint),
    read = await d.checkpointRequest('new', 'read');
  const deliver = d.request('existing', 'deliver', d.delivery),
    install = d.request('new', 'install', d.installation);
  assert.equal(
    (await d.transfer(deliver)).ok,
    false,
    'a hash without the retained snapshot is insufficient',
  );
  assert.equal(
    (await call(await d.checkpointRequest('new', 'publish', d.checkpoint))).refusal,
    'invalid-proof',
  );
  assert.equal((await call({ ...publish, signature: '00'.repeat(64) })).ok, false);
  await assert.rejects(
    call(publish, () => () => {
      throw new AuthorizationRefused('session-expired');
    }),
    AuthorizationRefused,
  );
  assert.equal(x.f.rows('replacement_checkpoints').length, 0);
  fault = 'replacement-checkpoint:before-commit';
  assert.equal((await call(publish)).ok, false);
  assert.equal(x.f.rows('replacement_checkpoints').length, 0);
  fault = 'replacement-checkpoint:after-commit';
  assert.equal((await call(publish)).ok, false);
  assert.equal(x.f.rows('replacement_checkpoints').length, 1);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual((await call(publish)).checkpoint, d.checkpoint);
  assert.deepEqual((await call(read)).checkpoint, d.checkpoint);
  const binding = (await call(read)).binding;
  assert.deepEqual(binding, x.checkpoint.binding);
  const originalCheckpoint = x.f.rows('content_checkpoints')[0];
  mutate(x, (db) => {
    const bad = JSON.parse(originalCheckpoint.checkpoint);
    bad.binding.stored.bindingSignature = 'ff'.repeat(64);
    db.prepare('UPDATE content_checkpoints SET checkpoint=?').run(JSON.stringify(bad));
  });
  assert.equal((await call(read)).ok, false, 'a changed original unlock binding is not returned');
  mutate(x, (db) =>
    db.prepare('UPDATE content_checkpoints SET checkpoint=?').run(originalCheckpoint.checkpoint),
  );
  const { replacementCheckpointMessage } =
    await import('../../account-protocol/replacementCheckpoint.ts');
  const changed = { ...d.checkpoint, nonce: 'af'.repeat(12) };
  changed.signature = signed(x.e.keys.existing, await replacementCheckpointMessage(changed));
  assert.equal(
    (await call(await d.checkpointRequest('existing', 'publish', changed))).refusal,
    'checkpoint-conflict',
  );
  const swapped = d.sealDelivery({ ...d.delivery, checkpointHash: 'fe'.repeat(32) });
  assert.equal((await d.transfer(d.request('existing', 'deliver', swapped))).ok, false);
  const { checkpointHash: _, ...legacy } = d.delivery;
  assert.equal(
    (await d.transfer(d.request('existing', 'deliver', d.sealDelivery({ ...legacy, v: 2 }))))
      .refusal,
    'checkpoint-required',
  );
  assert.equal((await d.transfer(deliver)).ok, true);
  const { membershipInstallationMessage } =
    await import('../../account-protocol/membershipDelivery.ts');
  const wrong = {
    ...d.installation,
    checkpoint: { ...d.installation.checkpoint, checkpointHash: 'ff'.repeat(32) },
  };
  wrong.signature = signed(x.e.keys.new, await membershipInstallationMessage(wrong));
  assert.equal((await d.transfer(d.request('new', 'install', wrong))).ok, false);
  const downgraded = {
    v: 2,
    kind: 'membership-key-installed',
    deliveryHash: d.installation.deliveryHash,
    credentialId: x.e.context.candidate.id,
    signature: '00'.repeat(64),
  };
  downgraded.signature = signed(x.e.keys.new, await membershipInstallationMessage(downgraded));
  assert.equal((await d.transfer(d.request('new', 'install', downgraded))).ok, false);
  fault = 'membership-transfer:before-commit';
  assert.equal((await d.transfer(install)).ok, false);
  assert.equal(x.f.rows('membership_transfers').at(-1).artifact, null);
  fault = 'membership-transfer:after-commit';
  assert.equal((await d.transfer(install)).ok, false);
  x.f.restart();
  x.authority.restart();
  const installed = await d.transfer(install);
  assert.equal(installed.ok, true, JSON.stringify(installed));
  assert.equal(
    installed.certification.epoch.installation.checkpoint.checkpointHash,
    d.delivery.checkpointHash,
  );
  assert.deepEqual(await d.transfer(install), installed);
  const row = x.f.rows('replacement_checkpoints')[0];
  mutate(x, (db) =>
    db
      .prepare('UPDATE replacement_checkpoints SET checkpoint=?')
      .run(JSON.stringify({ ...d.checkpoint, signature: 'ff'.repeat(64) })),
  );
  assert.equal((await call(read)).ok, false);
  assert.equal((await d.transfer(install)).ok, false);
  mutate(x, (db) =>
    db.prepare('UPDATE replacement_checkpoints SET checkpoint=?').run(row.checkpoint),
  );
  assert.deepEqual(await d.transfer(install), installed);
});

test('replacement snapshot HTTP route requires the exact enrollment grant and only hints on its first publication', async (t) => {
  const x = await replacementServiceFixture(t),
    api = await membershipHTTP(t, x),
    g = await continuationGrants(x);
  const scope = {
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: x.e.context.existing.id,
    attemptId: x.admissionInput.attemptId,
  };
  const existing = await g.grant(scope, x.e.keys.existing),
    candidate = await g.grant({ ...scope, credentialId: x.e.context.candidate.id }, x.e.keys.new),
    workspace = await g.grant(
      { kind: 'workspace', workspaceId: x.workspace, credentialId: x.e.context.existing.id },
      x.e.keys.existing,
    );
  const path = '/account/membership/v3/checkpoint',
    publish = await x.d.checkpointRequest('existing', 'publish', x.d.checkpoint),
    read = await x.d.checkpointRequest('new', 'read');
  assert.equal((await api.post(path, publish)).status, 401);
  assert.equal((await api.post(path, publish, candidate)).status, 403);
  assert.equal((await api.post(path, publish, workspace)).status, 403);
  assert.equal((await api.post(path, read, candidate)).body.checkpoint, null);
  assert.equal(api.hints.length, 0);
  assert.equal((await api.post(path, publish, existing)).status, 200);
  assert.equal(api.hints.length, 1);
  assert.equal((await api.post(path, publish, existing)).status, 200);
  assert.equal(api.hints.length, 1);
  assert.deepEqual((await api.post(path, read, candidate)).body.checkpoint, x.d.checkpoint);
  assert.equal(api.hints.length, 1);
});

test('replacement snapshot schema requires explicit upgrade from 20 and preserves retained rows', async (t) => {
  const x = await removalFixture(t),
    path = x.f.path + '.schema20';
  let db = new DatabaseSync(x.f.path);
  await backup(db, path);
  db.close();
  db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; DROP TABLE replacement_checkpoints; PRAGMA user_version=20;',
  );
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  const rows = tables.map((table) => [table, db.prepare('SELECT * FROM ' + table).all()]);
  db.close();
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
    sessions = { pin: x.authority.pin, operatorKey: x.authority.key };
  assert.throws(
    () => new AccountCore(path, policy, { sessions, membershipContinuation: true }),
    /offline upgrade/,
  );
  new AccountCore(path, policy, {
    sessions,
    membershipContinuation: true,
    upgradeFromV20: true,
  }).close();
  db = new DatabaseSync(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
  for (const [table, original] of rows)
    assert.deepEqual(db.prepare('SELECT * FROM ' + table).all(), original, table);
  assert.deepEqual(db.prepare('SELECT * FROM replacement_checkpoints').all(), []);
  db.close();
  assert.throws(() => new AccountCore(path, policy, { sessions }), /Unsupported account schema/);
});

test('lost-device recovery verifies rotated history and reads finalized publisher writing without a surviving-device grant', async (t) => {
  const { recoveryReader } = await import('../account-recovery/read-fixtures.mjs');
  const { verifyRecoveryReadPage } = await import('../../account-protocol/recoveryRead.ts');
  const x = await removalFixture(t);
  const target = x.context.candidate.id;
  const wire = x.make(1, 'writing from subsequently removed device', {
    epoch: 3,
    credential: target,
    signer: x.keys.new,
  });
  const accepted = await x.deliveryCall(wire);
  decision(x, accepted, wire, undefined, 3);
  const { request } = await rotationRequest(x);
  const committed = await x.authority.owner.commitRotation(x.f.core, request);
  assert.equal(committed.ok, true, JSON.stringify(committed));
  const before = [
    'promotions',
    'membership_rotations',
    'publisher_decisions',
    'network_sessions',
  ].map((table) => x.f.rows(table));
  const reader = await recoveryReader(x);
  assert.equal(reader.verified.context.head.assertion.epoch, 4);
  assert.equal(reader.verified.prepared.proofs.continuations.at(-1).kind, 'membership-rotation');
  const readRequest = reader.request({ publisher: target });
  const page = await verifyRecoveryReadPage(
    await reader.read(readRequest),
    readRequest,
    x.authority.pin,
  );
  assert.equal(page.through, 1);
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].proof, Buffer.from(accepted.bytes).toString('hex'));
  assert.deepEqual(
    ['promotions', 'membership_rotations', 'publisher_decisions', 'network_sessions'].map((table) =>
      x.f.rows(table),
    ),
    before,
  );
});

test('lost-device recovery cold-replays removed writing and a later generation using the saved code', async (t) => {
  const { sourceFixture, client } = await import('../account-recovery/source-fixtures.mjs');
  const { recoveryReader } = await import('../account-recovery/read-fixtures.mjs');
  const x = await sourceFixture(t, {}, removalFixture),
    key2 = new Uint8Array(32).fill(74);
  const a = new client.Y.Doc({ gc: false }),
    b = new client.Y.Doc({ gc: false }),
    expected = new client.Y.Doc({ gc: false });
  a.clientID = 908;
  b.clientID = 909;
  for (const doc of [a, b, expected])
    client.Y.applyUpdate(doc, client.Y.encodeStateAsUpdate(x.root));
  const baseline = client.Y.encodeStateVector(x.root);
  b.getText('master').insert(b.getText('master').length, 'accepted on removed device\n');
  const oldUpdate = client.Y.encodeStateAsUpdate(b, baseline);
  const old = x.make(1, 'unused', {
    updates: [oldUpdate],
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(old), old, undefined, 3);
  const { request, sign } = await rotationRequest(x);
  const wrap = await client.sealGeneration(
    new Uint8Array(Buffer.from(x.recovery.draft.rPub, 'hex')),
    new Uint8Array(
      lp(
        'done/gen-wrap/v1',
        x.workspace,
        x.recovery.draft.lineageId,
        x.authority.pin.authRoot,
        '2',
      ),
    ),
    key2,
  );
  const committed = await x.authority.owner.commitRotation(
    x.f.core,
    await sign({ ...request, payload: { ...request.payload, recoveryWrap: wrap } }),
  );
  assert.equal(committed.ok, true, JSON.stringify(committed));
  a.getText('master').insert(a.getText('master').length, 'accepted under new key\n');
  const newUpdate = client.Y.encodeStateAsUpdate(a, baseline);
  const current = x.make(1, 'unused', {
    updates: [newUpdate],
    epoch: 4,
    gen: 2,
    generationKey: key2,
  });
  decision(x, await x.deliveryCall(current), current, undefined, 4);
  client.Y.applyUpdate(expected, oldUpdate);
  client.Y.applyUpdate(expected, newUpdate);
  const reader = await recoveryReader(x);
  const result = await client.readRecoverySource({
    ...x.input,
    prepared: reader.verified.prepared,
    begin: reader.input,
    bootstrap: reader.bootstrap,
    sign: async (bytes) =>
      Buffer.from(await crypto.subtle.sign('Ed25519', reader.signer, bytes)).toString('hex'),
    read: reader.read,
  });
  const reopened = new client.Y.Doc({ gc: false });
  try {
    client.Y.applyUpdate(reopened, result.snapshot);
    assert(client.sameDocState(reopened, expected));
    assert.equal(result.generation, 2);
    assert.equal(result.head, committed.rotation.head);
    assert.equal(result.heads.length, 2);
    assert(result.heads.every((h) => h.position === 1));
    const intent = await client.prepareRecoveryCommit({
      ...x.input,
      prepared: reader.verified.prepared,
      begin: reader.input,
      bootstrap: reader.bootstrap,
      sign: async (bytes) =>
        Buffer.from(await crypto.subtle.sign('Ed25519', reader.signer, bytes)).toString('hex'),
      read: reader.read,
    });
    try {
      const recovered = await x.authority.owner.commitRecovery(x.f.core, intent.request);
      assert.equal(recovered.stage, 'committed', JSON.stringify(recovered));
      assert.equal(recovered.successor.epoch.generation, 3);
      assert.equal(recovered.successor.epoch.finalizations.length, 1);
      x.f.restart();
      x.authority.restart();
      assert.deepEqual(await x.authority.owner.commitRecovery(x.f.core, intent.request), recovered);
    } finally {
      intent.key.fill(0);
    }
  } finally {
    result.snapshot.fill(0);
    key2.fill(0);
    for (const doc of [a, b, expected, reopened]) doc.destroy();
  }
});

test('history maintenance preserves admitted ancestry across rotation and rechecks eligible admitters', async (t) => {
  const { client: c } = await import('../account-history/client.mjs');
  const { historyExchangeMessage, verifyHistoryCheckpointPage } =
    await import('../../account-protocol/historyExchange.ts');
  const x = await removalFixture(t);
  let proofs = { successor: x.successor, certification: x.certification, continuations: [] };
  const current = async () =>
    c.historyMembership((await c.verifyMembershipChain(proofs, x.base)).history);
  let authority = await current();
  const doc = new c.Y.Doc({ gc: false }),
    key = new Uint8Array(32).fill(81);
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + x.context.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'surviving and removed writing');
  t.after(() => {
    doc.destroy();
    key.fill(0);
  });
  const sign = (role) => async (bytes) => signed(x.keys[role], bytes);
  const exchange = async (role, action, payload) => {
    const p = c.membershipState(authority);
    const r = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: x.workspace,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      credentialId: role === 'existing' ? x.context.existing.id : x.context.candidate.id,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: 61000,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = await sign(role)(await historyExchangeMessage(r));
    const result = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
    if (result.ok) await verifyHistoryCheckpointPage(result.page, r, x.authority.pin);
    return result;
  };
  const inventory = await exchange('existing', 'read', 'latest');
  assert.equal(inventory.ok, true, JSON.stringify(inventory));
  let sources = inventory.page.sources;
  assert.deepEqual(sources, [], 'handoff publication is still unfinished');
  for (const ref of sources) {
    const source = await exchange('new', 'source', ref.head);
    assert.equal(source.ok, true, JSON.stringify(source));
    assert.deepEqual(source.page.source.ref, ref);
  }
  let first = await c.createHistoryCheckpoint(
    doc,
    doc,
    key,
    authority,
    x.context.existing.id,
    c.membershipState(authority).heads,
    null,
    sign('existing'),
    sources,
  );
  assert.equal((await exchange('existing', 'publish', first)).ok, true);
  const self = await c.historyCheckpointAdmissionBody(first, x.context.existing.id);
  self.signature = await sign('existing')(await c.historyCheckpointAdmissionMessage(self));
  assert.equal(
    (await exchange('existing', 'admit', self)).ok,
    false,
    'another certified device must admit',
  );
  let peer = await c.admitHistoryCheckpoint(
    first,
    key,
    authority,
    x.context.candidate.id,
    doc,
    sign('new'),
  );
  // A genuine handoff publication can arrive without a membership change or new ledger write.
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  assert.equal((await exchange('new', 'admit', peer)).refusal, 'sources-changed');
  assert.equal(
    (await exchange('existing', 'discard', await c.historyCheckpointHash(first))).ok,
    true,
  );
  const nextInventory = await exchange('existing', 'read', 'latest');
  sources = nextInventory.page.sources;
  assert.equal(sources.length, 1);
  const fetched = await exchange('new', 'source', sources[0].head);
  assert.equal(fetched.ok, true, JSON.stringify(fetched));
  assert.deepEqual(fetched.page.source.checkpoint, x.checkpoint);
  assert.equal((await exchange('new', 'source', 'ff'.repeat(32))).refusal, 'source-unavailable');
  assert.equal((await exchange('existing', 'publish', first)).refusal, 'checkpoint-cancelled');
  first = await c.createHistoryCheckpoint(
    doc,
    doc,
    key,
    authority,
    x.context.existing.id,
    c.membershipState(authority).heads,
    null,
    sign('existing'),
    sources,
  );
  assert.equal((await exchange('existing', 'publish', first)).ok, true);
  peer = await c.admitHistoryCheckpoint(
    first,
    key,
    authority,
    x.context.candidate.id,
    doc,
    sign('new'),
  );
  assert.equal((await exchange('new', 'admit', peer)).ok, true);
  const wire = x.make(1, 'removed accepted text', {
    epoch: 3,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(wire), wire, undefined, 3);
  const removal = await rotationRequest(x),
    rotation = await x.authority.owner.commitRotation(x.f.core, removal.request);
  assert.equal(rotation.ok, true, JSON.stringify(rotation));
  proofs = { ...proofs, continuations: [rotation.rotation] };
  authority = await current();
  const p = c.membershipState(authority),
    cuts = [
      ...p.heads,
      ...p.finalized.map((h) => ({
        credentialId: h.credential,
        position: h.position,
        link: h.link,
      })),
    ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  const second = await c.createHistoryCheckpoint(
    doc,
    doc,
    key,
    authority,
    x.context.existing.id,
    cuts,
    first,
    sign('existing'),
    sources,
  );
  assert.equal((await exchange('existing', 'publish', second)).ok, true);
  const admission = await c.admitHistoryCheckpoint(
    second,
    key,
    authority,
    x.context.existing.id,
    doc,
    sign('existing'),
  );
  assert.equal((await exchange('existing', 'admit', admission)).ok, true);
  const read = await exchange('existing', 'read', 'previous');
  assert.deepEqual(read.page.checkpoint, first);
  assert.equal(read.page.catalog.sequence, 2);
  assert.equal(
    (await exchange('new', 'read', 'latest')).ok,
    false,
    'removed credential has no history-read authority',
  );
  assert.equal(
    x.f.rows('publisher_decisions').length,
    1,
    'removed accepted ciphertext remains retained',
  );
  // Worker verification must re-establish the process-local membership brands, including
  // historical publishers across rotation; copying a verified object across realms is not proof.
  x.f.core.auditDelivery();
  const deadline = Date.now() + 8000;
  while (
    x.f.core.deliveryVerificationStatus.auditActive ||
    x.f.core.deliveryVerificationStatus.auditsQueued
  ) {
    assert.ok(Date.now() < deadline, 'membership audit did not finish');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(x.f.core.deliveryVerificationStatus.quarantined, 0);
  assert.ok(x.f.core.deliveryVerificationStatus.auditsCompleted >= 1);
});

test('retained generation-one reader adopts admitted history across interrupted save and preserves suffix receipts', async (t) => {
  const f = await membershipReadingFixture(t),
    { x, client: c, source, kg } = f;
  const { historyExchangeMessage } = await import('../../account-protocol/historyExchange.ts');
  const { history } = await c.verifyMembershipChain(f.authority.proofs, f.authority.base);
  const authority = c.historyMembership(history);
  const sign = async (bytes) => signed(x.keys.existing, bytes);
  const exchange = async (action, payload) => {
    const r = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: history.current.workspace,
      lineageId: history.current.lineage,
      epoch: history.current.tip,
      head: history.current.head,
      credentialId: action === 'admit' ? f.owner.participant.id : x.context.existing.id,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 30000,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = await (action === 'admit' ? f.owner.sign : sign)(await historyExchangeMessage(r));
    const result = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.page;
  };
  const upload = async (n) =>
    assert.equal(
      (
        await x.deliveryCall(
          x.make(n, '', {
            epoch: history.current.tip,
            updates: [c.Y.encodeStateAsUpdate(source)],
          }),
        )
      ).kind,
      'decision',
    );
  const publish = async (previous) => {
    const page = await exchange('read', 'latest');
    const cp = await c.createHistoryCheckpoint(
      source,
      source,
      new Uint8Array(kg),
      authority,
      x.context.existing.id,
      page.heads,
      previous,
      sign,
      page.sources,
    );
    await exchange('publish', cp);
    const admission = await c.admitHistoryCheckpoint(
      cp,
      new Uint8Array(kg),
      authority,
      f.owner.participant.id,
      source,
      f.owner.sign,
    );
    await exchange('admit', admission);
    return { checkpoint: cp, admission };
  };
  source.getText('master').insert(source.getText('master').length, ' Accepted before history.');
  await upload(1);
  assert.equal((await f.run()).kind, 'reading');
  const original = f.saved.reading;
  assert.equal(original.streams.flatMap((s) => s.events).length, 1);
  source
    .getText('master')
    .insert(source.getText('master').length, ' Snapshot-only retained handoff writing.');
  const first = await publish(null);
  f.hooks({
    beforeSave(p) {
      if (p.reading.history) throw Error('history save interrupted');
    },
  });
  await assert.rejects(f.run(), /history save interrupted/);
  assert.deepEqual(f.saved.reading, original);
  f.restart();
  // Other publishers have a zero cut, so constrain only the original publisher.
  f.hooks({
    beforeRead(bytes) {
      const r = JSON.parse(Buffer.from(bytes).toString());
      if (r[6] === x.context.existing.id) assert(r[10] >= 1);
    },
  });
  assert.match(JSON.stringify(await f.run()), /Snapshot-only retained handoff writing/);
  assert.equal(
    f.saved.reading.streams.flatMap((s) => s.events).length,
    1,
    'older receipts stay in custody',
  );
  source.getText('master').insert(source.getText('master').length, ' Accepted suffix two.');
  await upload(2);
  assert.match(JSON.stringify(await f.run()), /Accepted suffix two/);
  await publish(first.checkpoint);
  source.getText('master').insert(source.getText('master').length, ' Accepted suffix three.');
  await upload(3);
  f.restart();
  f.hooks({
    beforeRead(bytes) {
      const r = JSON.parse(Buffer.from(bytes).toString());
      if (r[6] === x.context.existing.id) assert(r[10] >= 2);
    },
  });
  assert.match(JSON.stringify(await f.run()), /Accepted suffix three/);
  f.restart();
  assert.match(JSON.stringify(await f.run()), /Snapshot-only retained handoff writing/);
});

async function discoveryDatabase(x) {
  const db = new DatabaseSync(x.f.path);
  const { enableMembershipStore } = await import('../../account-service/membershipStore.ts');
  enableMembershipStore(db);
  return db;
}

// Discovery race regressions use the same real signed enrollment/authority owners as the cases above.
function discoverySigningCut(x, request, cut, authorization) {
  let calls = 0;
  const result = x.authority.owner.discoverMembership(
    {
      discoverMembership(input, issuer) {
        return x.f.core.discoverMembership(input, {
          ...issuer,
          async discovery(body) {
            const response = await issuer.discovery(body);
            await cut(++calls);
            return response;
          },
        });
      },
    },
    request,
    authorization,
  );
  return { result, calls: () => calls };
}

test('discovery completes once while the unrelated first publisher appends at every signing cut', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const before = x.f.rows('publisher_decisions');
  let previous = '00'.repeat(32);
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    const wire = x.make(n, 'unrelated first-publisher writing', { epoch: 4 });
    previous = decision(x, await x.deliveryCall(wire), wire, previous, 4).head.link;
  });
  const response = await call.result;
  assert.equal(response.kind, 'membership-discovery', JSON.stringify(response));
  assert.equal(call.calls(), 1, 'another publisher writing must not restart discovery');
  assert.deepEqual(x.f.rows('publisher_decisions'), before, 'requesting publisher is unchanged');
  assert.equal(
    (await verifyMembershipDiscoveryResponse(response, q.discovery(), x.base, 1000)).history.current
      .tip,
    4,
  );
});

test('discovery retries its own publisher append and returns only the freshly covered history', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    if (n !== 1) return;
    const wire = x.make(1, 'requesting publisher writing', {
      epoch: 4,
      credential: x.context.candidate.id,
      signer: x.keys.new,
    });
    decision(x, await x.deliveryCall(wire), wire, undefined, 4);
  });
  const response = await call.result;
  assert.equal(response.kind, 'membership-discovery');
  assert.equal(call.calls(), 2);
  assert.equal(x.f.rows('publisher_decisions').filter((r) => r.kind === 'accepted').length, 1);
  await verifyMembershipDiscoveryResponse(response, q.discovery(), x.base, 1000);
});

test('discovery still refuses continuous changes to its own publisher after four attempts', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  let previous = '00'.repeat(32);
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    const wire = x.make(n, 'requesting publisher keeps writing', {
      epoch: 4,
      credential: x.context.candidate.id,
      signer: x.keys.new,
    });
    previous = decision(x, await x.deliveryCall(wire), wire, previous, 4).head.link;
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'state-changed' });
  assert.equal(call.calls(), 4);
});

test('first publisher discovery retains its own witness under continuous signing-time writes', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const request = q.discovery(x.credential, x.keys.existing, { epoch: 1, head: x.offer.head });
  let previous = '00'.repeat(32);
  const call = discoverySigningCut(x, request, async (n) => {
    const wire = x.make(n, 'first publisher discovers its own stream', { epoch: 4 });
    previous = decision(x, await x.deliveryCall(wire), wire, previous, 4).head.link;
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'state-changed' });
  assert.equal(call.calls(), 4);
});

test('discovery rebuilds a genuine membership certification committed during signing', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const d = await continuationDelivery(x, x.exchange('new'));
  await d.approve();
  await d.transfer(d.request('existing', 'deliver', d.delivery));
  let installed;
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    if (n === 1) installed = await d.transfer(d.request('new', 'install', d.installation));
  });
  const response = await call.result;
  assert.equal(call.calls(), 2);
  assert.equal(
    (await verifyMembershipDiscoveryResponse(response, q.discovery(), x.base, 1000)).history.current
      .head,
    installed.certification.head,
  );
});

test('discovery retains exact other authority fields and external-version invalidation', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const call = discoverySigningCut(x, q.discovery(), async () => {
    mutate(x, (db) => db.exec("UPDATE recovery SET draft=draft || ' '"));
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'state-changed' });
  assert.equal(call.calls(), 4);
});

test('discovery never hides a deleted requesting-publisher prefix behind current membership', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const wire = x.make(1, 'prefix that must remain', {
    epoch: 4,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(wire), wire, undefined, 4);
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    if (n === 1)
      mutate(x, (db) =>
        db
          .prepare('DELETE FROM publisher_decisions WHERE credential_id=?')
          .run(x.context.candidate.id),
      );
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'ledger-integrity' });
  assert.equal(
    call.calls(),
    1,
    'the fresh census must refuse the damaged prefix before another reply is signed',
  );
});

test('discovery never hides same-count requesting-publisher corruption after verification', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const wire = x.make(1, 'row whose signature must remain valid', {
    epoch: 4,
    credential: x.context.candidate.id,
    signer: x.keys.new,
  });
  decision(x, await x.deliveryCall(wire), wire, undefined, 4);
  const call = discoverySigningCut(x, q.discovery(), async (n) => {
    if (n === 1)
      mutate(x, (db) =>
        db
          .prepare('UPDATE publisher_decisions SET response=? WHERE credential_id=?')
          .run(Buffer.from('invalid signed head'), x.context.candidate.id),
      );
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'ledger-integrity' });
});

test('discovery reauthorizes a revoked session after signing even with discovery capture purpose', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x),
    g = await continuationGrants(x);
  const grant = await g.grant(
    { kind: 'workspace', workspaceId: x.workspace, credentialId: x.context.candidate.id },
    x.keys.new,
  );
  const call = discoverySigningCut(
    x,
    q.discovery(),
    async () => g.revoke(),
    x.f.core.grants.authorize(grant.grantToken),
  );
  await assert.rejects(call.result, denial('sign-in-required'));
  assert.equal(call.calls(), 1);
});

test('discovery refuses request expiry reached while signing the response', async (t) => {
  let now = 1000;
  const x = await continuationFixture(t, { now: () => now }),
    q = membershipLocatorRequests(x);
  const call = discoverySigningCut(x, q.discovery(), async () => {
    now = 61000;
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'unavailable' });
  assert.equal(call.calls(), 1);
});

test('discovery snapshot purpose is captured and must match both guard directions', async (t) => {
  const x = await continuationFixture(t);
  const { read: capture, unchanged } = await import('../../account-service/delivery.ts');
  const { createDeliveryVerification } =
    await import('../../account-service/deliveryVerification.ts');
  const db = await discoveryDatabase(x),
    reuse = createDeliveryVerification({ db, path: x.f.path, signal() {} });
  const check = (s, purpose) => {
    db.exec('BEGIN');
    try {
      return unchanged(db, s, reuse, purpose);
    } finally {
      db.exec('ROLLBACK');
    }
  };
  try {
    const full = capture(db, x.workspace, x.context.candidate.id, reuse);
    const discovery = capture(db, x.workspace, x.context.candidate.id, reuse, {
      purpose: 'membership-discovery',
    });
    assert(check(full));
    assert(
      !check(full, 'membership-discovery'),
      'a full capture cannot be widened after verification',
    );
    assert(check(discovery, 'membership-discovery'));
    assert(!check(discovery), 'discovery capture cannot authorize an ordinary comparison');
    const external = capture(db, x.workspace, x.context.candidate.id, reuse, {
      purpose: 'membership-discovery',
    });
    mutate(x, (other) => other.exec('CREATE TABLE phase16_external_probe (value INTEGER)'));
    assert(
      !check(external, 'membership-discovery'),
      'unknown external writes retain the data_version fence',
    );
    const afterExternal = capture(db, x.workspace, x.context.candidate.id, reuse, {
      purpose: 'membership-discovery',
    });
    reuse.clear();
    assert(!check(afterExternal, 'membership-discovery'), 'clear/ownership fence still applies');
    reuse.close();
    assert.throws(() => check(discovery, 'membership-discovery'));
  } finally {
    reuse.close();
    db.close();
  }
});

test('discovery projection removes exactly the unrelated witness and retains every other snapshot field', async (t) => {
  const x = await continuationFixture(t);
  const { read: capture, snapshotBytesForPurpose: snapshotBytes } =
    await import('../../account-service/delivery.ts');
  const db = await discoveryDatabase(x);
  try {
    const joined = capture(db, x.workspace, x.context.candidate.id),
      first = capture(db, x.workspace, x.credential);
    const changed = structuredClone(joined);
    changed.promotion.delivery_witness = 'another first publisher witness';
    assert.notEqual(
      snapshotBytes(joined),
      snapshotBytes(changed),
      'ordinary comparison stays exact',
    );
    assert.equal(
      snapshotBytes(joined, 'membership-discovery'),
      snapshotBytes(changed, 'membership-discovery'),
    );
    const own = structuredClone(first);
    own.promotion.delivery_witness = 'first publisher own witness';
    assert.notEqual(
      snapshotBytes(first, 'membership-discovery'),
      snapshotBytes(own, 'membership-discovery'),
    );
    for (const [name, edit] of [
      [
        'own witness',
        (s) => {
          s.publisherWitness = 'changed';
        },
      ],
      [
        'row prefix',
        (s) => {
          s.rows.push({
            account_id: s.account.id,
            ordinal: 1,
            position: 1,
            kind: 'accepted',
            submission: new Uint8Array([1]),
            response: new Uint8Array([2]),
          });
        },
      ],
      [
        'account state',
        (s) => {
          s.account.state = 'changed';
        },
      ],
      [
        'credential state',
        (s) => {
          s.credential.state = 'changed';
        },
      ],
      [
        'recovery authority',
        (s) => {
          s.recovery.draft += ' ';
        },
      ],
      [
        'promotion authority',
        (s) => {
          s.promotion.acceptance_seal += ' ';
        },
      ],
      [
        'membership proof',
        (s) => {
          s.continuations[0].artifact += ' ';
        },
      ],
      [
        'removal preparation',
        (s) => {
          s.removalPreparation = { parent: 'changed' };
        },
      ],
      [
        'rotation',
        (s) => {
          s.rotations = [{ artifact: 'changed' }];
        },
      ],
    ]) {
      const next = structuredClone(joined);
      edit(next);
      assert.notEqual(
        snapshotBytes(joined, 'membership-discovery'),
        snapshotBytes(next, 'membership-discovery'),
        name,
      );
    }
  } finally {
    db.close();
  }
});

test('uncached discovery also ignores unrelated writing while retaining complete own census', async (t) => {
  const x = await continuationFixture(t),
    q = membershipLocatorRequests(x);
  const { discoverMembership } = await import('../../account-service/membershipLocator.ts');
  const db = await discoveryDatabase(x);
  let calls = 0,
    previous = '00'.repeat(32);
  try {
    const response = await x.authority.owner.discoverMembership(
      {
        discoverMembership(input, issuer) {
          return discoverMembership(
            db,
            input,
            {
              ...issuer,
              async discovery(body) {
                const response = await issuer.discovery(body);
                const wire = x.make(++calls, 'uncached unrelated writing', { epoch: 4 });
                previous = decision(x, await x.deliveryCall(wire), wire, previous, 4).head.link;
                return response;
              },
            },
            () => 1000,
            () => {},
          );
        },
      },
      q.discovery(),
    );
    assert.equal(response.kind, 'membership-discovery');
    assert.equal(calls, 1);
    await verifyMembershipDiscoveryResponse(response, q.discovery(), x.base, 1000);
  } finally {
    db.close();
  }
});

async function continuationHistoryRequest(x, overrides = {}, key = x.keys.new) {
  const request = {
    v: 1,
    kind: 'history-checkpoint-request',
    workspaceId: x.workspace,
    lineageId: x.context.lineageId,
    epoch: 4,
    head: x.admission.head,
    credentialId: x.context.candidate.id,
    nonce: 'b7'.repeat(32),
    expiresAt: 61000,
    action: 'read',
    payload: 'catalog',
    signature: '00'.repeat(64),
    ...overrides,
  };
  request.signature = signed(key, await historyExchangeMessage(request));
  return request;
}

test('history catalog reuses the current branded membership timeline instead of verifying its admission twice', async (t) => {
  const x = await continuationFixture(t);
  const request = await continuationHistoryRequest(x);
  let admissionVerifications = 0;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/device-membership-admission/v2')))
      admissionVerifications++;
    return verify(...args);
  });
  const response = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request);
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(
    admissionVerifications,
    1,
    'the current authority already verifies this exact admission',
  );
  const page = await verifyHistoryCheckpointPage(response.page, request, x.authority.pin);
  assert.equal(page.catalog.sequence, 0);
  assert.equal(page.checkpoint, null);
  assert.equal(page.heads.find((h) => h.credentialId === x.context.candidate.id).position, 0);
});

function historySigningCut(x, request, cut, authorization) {
  let calls = 0;
  const result = x.authority.owner.exchangeHistoryCheckpoint(
    {
      exchangeHistoryCheckpoint(input, issuer) {
        return x.f.core.exchangeHistoryCheckpoint(input, {
          ...issuer,
          async historyPage(body) {
            const response = await issuer.historyPage(body);
            await cut(++calls);
            return response;
          },
        });
      },
    },
    request,
    authorization,
  );
  return { result, calls: () => calls };
}

for (const continuous of [false, true])
  test(`history timeline reuse retains ${continuous ? 'four-attempt refusal' : 'fresh-head retry'} during writing`, async (t) => {
    const x = await continuationFixture(t);
    const request = await continuationHistoryRequest(x);
    let previous = '00'.repeat(32);
    const call = historySigningCut(x, request, async (n) => {
      if (!continuous && n > 1) return;
      const wire = x.make(n, 'writing while history is signed', { epoch: 4 });
      previous = decision(x, await x.deliveryCall(wire), wire, previous, 4).head.link;
    });
    const response = await call.result;
    if (continuous) {
      assert.deepEqual(response, { ok: false, refusal: 'state-changed' });
      assert.equal(call.calls(), 4);
      assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
    } else {
      assert.equal(response.ok, true, JSON.stringify(response));
      assert.equal(call.calls(), 2);
      const page = await verifyHistoryCheckpointPage(response.page, request, x.authority.pin);
      assert.deepEqual(
        page.heads.find((h) => h.credentialId === x.context.existing.id),
        {
          credentialId: x.context.existing.id,
          position: 1,
          link: previous,
        },
      );
    }
  });

for (const fault of ['authority', 'old-row', 'membership-proof'])
  test(`history timeline reuse refuses ${fault} damage without returning a catalog`, async (t) => {
    const x = await continuationFixture(t);
    const request = await continuationHistoryRequest(x);
    if (fault === 'old-row') {
      const wire = x.make(1, 'retained writing before damage', { epoch: 4 });
      decision(x, await x.deliveryCall(wire), wire, undefined, 4);
    }
    const call = historySigningCut(x, request, async (n) => {
      if (n > 1) return;
      mutate(x, (db) =>
        db.exec(
          fault === 'authority'
            ? "UPDATE accounts SET state='pending'"
            : fault === 'old-row'
              ? "UPDATE delivery_decisions SET submission=X'00' WHERE position=1"
              : "UPDATE membership_ceremonies SET artifact='{}'",
        ),
      );
    });
    assert.deepEqual(await call.result, {
      ok: false,
      refusal: fault === 'old-row' ? 'ledger-integrity' : 'unavailable',
    });
    assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
  });

test('history timeline reuse retains transaction-time session revocation', async (t) => {
  const x = await continuationFixture(t),
    request = await continuationHistoryRequest(x),
    g = await continuationGrants(x);
  const grant = await g.grant(
    { kind: 'workspace', workspaceId: x.workspace, credentialId: x.context.candidate.id },
    x.keys.new,
  );
  const call = historySigningCut(
    x,
    request,
    async () => g.revoke(),
    x.f.core.grants.authorize(grant.grantToken),
  );
  await assert.rejects(call.result, denial('sign-in-required'));
  assert.equal(call.calls(), 1);
  assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
});

test('history timeline reuse refuses a request that expires during signing', async (t) => {
  let now = 1000;
  const x = await continuationFixture(t, { now: () => now });
  const call = historySigningCut(x, await continuationHistoryRequest(x), async () => {
    now = 61000;
  });
  assert.deepEqual(await call.result, { ok: false, refusal: 'unavailable' });
  assert.equal(call.calls(), 1);
  assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
});

test('history early-epoch lookup verifies only the latest complete timeline and reuses its earlier memberships', async (t) => {
  const { x, r } = await openingHistoryFixture(t);
  let count = 0,
    issuer;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/admission-successor/v1'))) count++;
    return verify(...args);
  });
  const response = await x.authority.owner.exchangeHistoryCheckpoint(
    {
      exchangeHistoryCheckpoint(input, value) {
        issuer = value;
        return x.f.core.exchangeHistoryCheckpoint(input, value);
      },
    },
    r,
  );
  assert.equal(response.ok, true, JSON.stringify(response));
  const exchangeCount = count;
  const { snapshot, verifyCurrentWorkspaceAuthority } =
    await import('../../account-service/delivery.ts');
  const db = await discoveryDatabase(x);
  try {
    count = 0;
    db.exec('BEGIN');
    const captured = snapshot(db, x.workspace);
    db.exec('ROLLBACK');
    const auth = await verifyCurrentWorkspaceAuthority(captured, issuer);
    const authorityCount = count;
    count = 0;
    await verifyCertificationHistory(
      auth.certificationSuccessor,
      auth.successor,
      { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
      { epoch: 3, head: auth.a.head },
    );
    assert.equal(
      exchangeCount,
      count,
      'one complete history supplies native authority and its earlier memberships',
    );
    assert(authorityCount > 0, 'the standalone authority denominator still verifies its successor');
  } finally {
    db.close();
  }
  await verifyHistoryCheckpointPage(response.page, r, x.authority.pin);
});

test('history complete timeline still resolves a retained checkpoint under its earlier membership', async (t) => {
  const { setup: historySetup } = await import('../account-history/service-fixture.mjs');
  const f = await historySetup(t);
  const head = await f.upload(1, 'writing under the earlier membership');
  const checkpoint = await f.create(null, [head]);
  const publish = await f.makeRequest('publish', checkpoint);
  await f.check(publish, await f.exchange(publish));
  const admit = await f.makeRequest('admit', await f.admit(checkpoint));
  await f.check(admit, await f.exchange(admit));
  await f.advance();
  const request = await f.makeRequest('read', 'latest');
  assert.equal(request.epoch, 2);
  const page = await f.check(request, await f.exchange(request));
  assert.equal(page.checkpoint.manifest.epoch, 1);
  assert.deepEqual(page.checkpoint, checkpoint);
  assert.equal(page.heads.length, 2);
  assert.deepEqual(
    page.heads.find((h) => h.credentialId === head.credentialId),
    head,
  );
  assert.equal(page.heads.find((h) => h.credentialId !== head.credentialId).position, 0);
  assert.equal(page.catalog.sequence, 1);
});

for (const fault of ['head', 'epoch', 'signature'])
  test(`history timeline reuse preserves ${fault} request validation`, async (t) => {
    const x = await continuationFixture(t);
    const request = await continuationHistoryRequest(
      x,
      fault === 'head' ? { head: 'fa'.repeat(32) } : fault === 'epoch' ? { epoch: 3 } : {},
    );
    if (fault === 'signature') request.signature = '00'.repeat(64);
    assert.deepEqual(await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request), {
      ok: false,
      refusal: 'unavailable',
    });
    assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
  });

test('history complete timeline includes epochs after the original publisher was finalized', async (t) => {
  const x = await removalFixture(t);
  assert.equal((await x.exchange('existing', 'publish', x.checkpoint)).ok, true);
  const prep = await removalRequest(x, x.context.existing.id, 'new');
  const { request } = await rotationRequest(x, prep);
  const rotation = await x.authority.owner.commitRotation(x.f.core, request);
  assert.equal(rotation.ok, true, JSON.stringify(rotation));
  const y = await admitNext(x, rotation.rotation);
  assert.equal(y.admission.epoch.epoch, 5);
  const query = await continuationHistoryRequest(y, { epoch: 5 });
  const response = await y.authority.owner.exchangeHistoryCheckpoint(y.f.core, query);
  assert.equal(response.ok, true, JSON.stringify(response));
  const page = await verifyHistoryCheckpointPage(response.page, query, y.authority.pin);
  assert.equal(page.catalog.sequence, 0);
  assert.equal(page.heads.find((h) => h.credentialId === x.context.existing.id).position, 0);
  assert.equal(
    page.heads.find((h) => h.credentialId === y.entry.input.candidate.credentialId).position,
    0,
  );
});

test('history catalog captures fresh publisher heads after authority verification despite continuous signed writing', async (t) => {
  const { x } = await openingHistoryFixture(t);
  const request = await continuationHistoryRequest(x, { epoch: 3, head: x.certification.head });
  let armed = false,
    appends = 0,
    previous = '00'.repeat(32);
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (armed) {
      armed = false;
      const wire = x.make(++appends, 'writing during authority verification', { epoch: 3 });
      previous = decision(x, await x.deliveryCall(wire), wire, previous, 3).head.link;
    }
    return verify(...args);
  });
  const response = await x.authority.owner.exchangeHistoryCheckpoint(
    {
      exchangeHistoryCheckpoint(input, issuer) {
        return x.f.core.exchangeHistoryCheckpoint(input, {
          ...issuer,
          check(...args) {
            issuer.check(...args);
            armed = true;
          },
        });
      },
    },
    request,
  );
  armed = false; // Response verification below is outside the service interleaving.
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(appends, 1, 'a catalog read captures heads after the one authority pass');
  const page = await verifyHistoryCheckpointPage(response.page, request, x.authority.pin);
  assert.deepEqual(
    page.heads.find((h) => h.credentialId === x.context.existing.id),
    { credentialId: x.context.existing.id, position: 1, link: previous },
  );
});

for (const fault of ['authority-input', 'old-row'])
  test(`catalog's late publisher capture refuses ${fault} changed during authority verification`, async (t) => {
    const { x } = await openingHistoryFixture(t);
    if (fault === 'old-row') {
      const wire = x.make(1, 'retained writing before authority cut', { epoch: 3 });
      decision(x, await x.deliveryCall(wire), wire, undefined, 3);
    }
    const request = await continuationHistoryRequest(x, { epoch: 3, head: x.certification.head });
    let changed = false;
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    t.mock.method(crypto.subtle, 'verify', async (...args) => {
      if (!changed) {
        changed = true;
        mutate(x, (db) =>
          db.exec(
            fault === 'old-row'
              ? "UPDATE delivery_decisions SET submission=X'00' WHERE position=1"
              : "UPDATE promotions SET offer='{}'",
          ),
        );
      }
      return verify(...args);
    });
    assert.deepEqual(await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request), {
      ok: false,
      refusal: fault === 'old-row' ? 'ledger-integrity' : 'unavailable',
    });
    assert.equal(changed, true);
    assert.equal(x.f.rows('history_checkpoint_catalog').length, 0);
  });

test('independent continuation reads reuse branded history evidence without repeating its admission', async (t) => {
  const x = await continuationFixture(t),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let admissions = 0;
  t.mock.method(crypto.subtle, 'verify', (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/device-membership-admission/v2')))
      admissions++;
    return verify(...args);
  });
  const { query, pageProof } = await import('../account-service-inbound/oracle.mjs');
  const overrides = {
    reader: x.context.candidate.id,
    publisher: x.credential,
    epoch: 4,
    head: x.admission.head,
  };
  for (let i = 0; i < 2; i++) {
    const q = query(x, 0, 1, overrides, x.keys.new);
    pageProof(await x.authority.owner.readInbound(x.f.core, q), q, x, []);
  }
  assert.equal(admissions, 1);
});

for (const stream of ['first-publisher', 'reader-own'])
  test(`v2 late-ledger continuation ${stream} capture survives writing during authenticated request verification`, async (t) => {
    const x = await continuationFixture(t),
      publisher = stream === 'first-publisher' ? x.credential : x.context.candidate.id;
    const q = query(
      x,
      0,
      8,
      { epoch: 4, head: x.admission.head, reader: x.context.candidate.id, publisher },
      x.keys.new,
    );
    const unsigned = Buffer.from(
        JSON.stringify(JSON.parse(Buffer.from(q).toString()).slice(0, -1)),
      ),
      verify = crypto.subtle.verify.bind(crypto.subtle);
    const retained = [];
    let calls = 0,
      previous = '00'.repeat(32);
    t.mock.method(crypto.subtle, 'verify', async (...args) => {
      if (Buffer.from(args[3]).equals(unsigned)) {
        calls++;
        const w = x.make(calls, 'first publisher writes during verified request', { epoch: 4 }),
          r = await x.deliveryCall(w);
        previous = decision(x, r, w, previous, 4).head.link;
        retained.push({ w, r, epoch: 4 });
      }
      return verify(...args);
    });
    page(x, await read(x, q), q, stream === 'first-publisher' ? retained : []);
    assert.equal(calls, 1, 'same and unrelated live witnesses are captured after verification');
    assert.equal(x.f.rows('publisher_decisions').length, 0, 'reader own stream remains empty');
  });

test('v2 late-ledger refuses a membership-removal transition across the authority-to-ledger boundary', async (t) => {
  const x = await continuationFixture(t),
    q = query(
      x,
      0,
      8,
      { epoch: 4, head: x.admission.head, reader: x.context.candidate.id, publisher: x.credential },
      x.keys.new,
    );
  const unsigned = Buffer.from(JSON.stringify(JSON.parse(Buffer.from(q).toString()).slice(0, -1))),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let changed = false;
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (!changed && Buffer.from(args[3]).equals(unsigned)) {
      changed = true;
      const preparation = await removalRequest(x, x.context.candidate.id);
      const { request } = await rotationRequest(x, preparation);
      const removed = await x.authority.owner.commitRotation(x.f.core, request);
      assert.equal(removed.ok, true, JSON.stringify(removed));
    }
    return verify(...args);
  });
  const answer = await read(x, q);
  assert.equal(changed, true);
  assert.equal(answer.kind, 'unknown');
  assert.equal('bytes' in answer, false);
});

// Phase22: independent normal protocol verification is the work denominator, never a server cache.
async function completeAuthorityWork(t, run) {
  const domains = [
    'done/admission-successor/v1',
    'done/device-certification-epoch/v1',
    'done/device-membership-admission/v2',
  ];
  const counts = Object.fromEntries(domains.map((domain) => [domain, 0]));
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  const mocked = t.mock.method(crypto.subtle, 'verify', async (...args) => {
    for (const domain of domains)
      if (Buffer.from(args[3]).includes(Buffer.from(domain))) counts[domain]++;
    return verify(...args);
  });
  try {
    return { result: await run(), counts };
  } finally {
    mocked.mock.restore();
  }
}

for (const later of [false, true])
  for (const operation of ['bootstrap', 'discovery', 'catalog'])
    test(`single request shares one complete ${later ? 'continued' : 'certified'} authority timeline for ${operation}`, async (t) => {
      const x = later ? await continuationFixture(t) : (await openingHistoryFixture(t)).x;
      const { snapshot } = await import('../../account-service/delivery.ts');
      const { membershipProofChain } = await import('../../account-service/membershipLocator.ts');
      const db = await discoveryDatabase(x);
      let s;
      try {
        db.exec('BEGIN');
        s = snapshot(db, x.workspace);
        db.exec('ROLLBACK');
      } finally {
        db.close();
      }
      const base = {
        pin: x.authority.pin,
        request: JSON.parse(s.promotion.request),
        receipt: JSON.parse(s.promotion.result),
      };
      const expected = await completeAuthorityWork(t, () =>
        verifyMembershipChain(membershipProofChain(s), base),
      );
      const q = membershipLocatorRequests(x);
      const request =
        operation === 'bootstrap'
          ? q.bootstrap()
          : operation === 'discovery'
            ? q.discovery()
            : await continuationHistoryRequest(x, {
                epoch: later ? 4 : 3,
                head: later ? x.admission.head : x.certification.head,
              });
      const actual = await completeAuthorityWork(t, () =>
        operation === 'bootstrap'
          ? x.authority.owner.membershipBootstrap(x.f.core, request)
          : operation === 'discovery'
            ? x.authority.owner.discoverMembership(x.f.core, request)
            : x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request),
      );
      assert.equal(
        operation === 'catalog' ? actual.result.ok : actual.result.kind,
        operation === 'catalog' ? true : `membership-${operation}`,
        JSON.stringify(actual.result),
      );
      assert.deepEqual(
        actual.counts,
        expected.counts,
        'native eligibility and one complete independently verified history suffice for this request',
      );
      const checked =
        operation === 'bootstrap'
          ? await verifyMembershipBootstrapResponse(actual.result, request, x.authority.pin)
          : operation === 'discovery'
            ? await verifyMembershipDiscoveryResponse(actual.result, request, base, 1000)
            : await verifyHistoryCheckpointPage(actual.result.page, request, x.authority.pin);
      assert(checked);
      if (operation !== 'catalog') assert.deepEqual(actual.result.proofs, expected.result.proofs);
    });

async function nativeHistoryEvidenceFixture(t) {
  const { x } = await openingHistoryFixture(t);
  const request = membershipLocatorRequests(x).bootstrap();
  let issuer;
  const answer = await x.authority.owner.membershipBootstrap({
    membershipBootstrap(input, value) {
      issuer = value;
      return x.f.core.membershipBootstrap(input, value);
    },
  }, request);
  assert.equal(answer.kind, 'membership-bootstrap');
  const { snapshot, verifyWorkspaceAuthorityWithHistory } =
    await import('../../account-service/delivery.ts');
  const db = await discoveryDatabase(x);
  let s;
  try {
    db.exec('BEGIN');
    s = snapshot(db, x.workspace);
    db.exec('ROLLBACK');
  } finally {
    db.close();
  }
  return { x, s, issuer, verify: verifyWorkspaceAuthorityWithHistory };
}

for (const fault of [
  'recovery-draft', 'recovery-confirmation', 'activation', 'native-credential',
  'workspace', 'request-digest', 'offer', 'successor-row', 'transfer-row',
  'retained-delivery', 'successor-signature', 'certification-signature', 'pending-delivery',
])
  test(`single history producer refuses ${fault} damage before exposing verified evidence`, async (t) => {
    const f = await nativeHistoryEvidenceFixture(t), s = structuredClone(f.s);
    const alter = (row, key, mutate) => { const value = JSON.parse(row[key]); mutate(value); row[key] = JSON.stringify(value); };
    if (fault === 'recovery-draft') alter(s.recovery, 'draft', v => { v.principalId = 'ee'.repeat(16); });
    if (fault === 'recovery-confirmation') alter(s.recovery, 'result', v => { v.recoveryStateDigest = 'ee'.repeat(32); });
    if (fault === 'activation') alter(s.promotion, 'activation', v => { v.challenge.context.credentialId = 'ee'.repeat(16); });
    if (fault === 'native-credential') s.credential.id = 'ee'.repeat(16);
    if (fault === 'workspace') s.promotion.workspace_id = 'ee'.repeat(16);
    if (fault === 'request-digest') s.promotion.request_digest = 'ee'.repeat(32);
    if (fault === 'offer') alter(s.promotion, 'offer', v => { v.head = 'ee'.repeat(32); });
    if (fault === 'successor-row') s.successor.preparation_id = 'ee'.repeat(16);
    if (fault === 'transfer-row') s.transfer.workspace_id = 'ee'.repeat(16);
    if (fault === 'retained-delivery' || fault === 'pending-delivery')
      alter(s.transfer, 'delivery', v => { v.certificate.signature = '00'.repeat(64); });
    if (fault === 'successor-signature') alter(s.successor, 'artifact', v => { v.signature = '00'.repeat(64); });
    if (fault === 'certification-signature') alter(s.transfer, 'artifact', v => { v.signature = '00'.repeat(64); });
    if (fault === 'pending-delivery') {
      s.transfer.artifact = null;
      s.transfer.boundary_witness = null;
      s.promotion.successor_head = JSON.parse(s.successor.artifact).head;
    }
    await assert.rejects(f.verify(s, f.issuer));
  });

test('single history producer retains protocol brands and the original standalone delivery-authority shape', async (t) => {
  const f = await nativeHistoryEvidenceFixture(t);
  const { verifyWorkspaceAuthority } = await import('../../account-service/delivery.ts');
  const { historyMembershipAt } = await import('../../account-protocol/admissionHistory.ts');
  const result = await f.verify(f.s, f.issuer);
  assert.deepEqual(result.authority, await verifyWorkspaceAuthority(f.s, f.issuer));
  assert.equal('history' in result.authority, false, 'early delivery dispatch stays unchanged');
  assert.equal(historyMembershipAt(result.history, 1).state.epoch, 1);
  assert.equal(historyMembershipAt(result.history, 2).state.epoch, 2);
  assert.equal(historyMembershipAt(result.history, 3).state.epoch, 3);
  assert.throws(() => historyMembershipAt(structuredClone(result.history), 1), /Unverified/);
  const again = await f.verify(f.s, f.issuer);
  assert.notStrictEqual(again.history, result.history, 'this phase never retains cross-request evidence');
});
