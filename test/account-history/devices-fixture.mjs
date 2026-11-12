// Phase 547: two and three certified devices of one account against the real in-process service,
// each with its own credential, key, verified membership and saved history progress. The account
// set-up follows test/account-ceremony/content-transfer.test.mjs (approved, checkpointFixture,
// continuationFixture, continuationDelivery); the helpers are copied, not shared, so that file
// and its case identities stay unchanged.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { setup } from '../account-ceremony/development-fixtures.mjs';
import { signed, message, hash } from '../account-ceremony/exchange-oracle.mjs';
import { commitment, derive } from '../account-ceremony/oracle.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { lp } from '../account-enrollment/fixtures.mjs';
import { manifestMessage } from '../../account-protocol/admission.ts';
import { digest } from '../../account-protocol/recovery.ts';
import { checkpointHeadDigest } from '../../account-protocol/contentCheckpoint.ts';
import {
  recipientCertificateMessage,
  contentDeliveryMessage,
  contentDeliveryHash,
  contentInstallationMessage,
  contentTransferMessage,
} from '../../account-protocol/contentDelivery.ts';
import { checkpointRequestMessage } from '../../account-protocol/contentCheckpoint.ts';
import {
  parseMembershipDelivery,
  parseMembershipInstallation,
} from '../../account-protocol/membershipDelivery.ts';
import { historyExchangeMessage } from '../../account-protocol/historyExchange.ts';
import { client as c } from './client.mjs';

/** Two certified devices at epoch 3: `existing` (the original) and `new` (enrolled). */
async function approvedAccount(t) {
  const authority = authorityFixture(t);
  const x = await setup(t, {
    now: () => 1000,
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
  });
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
    recovery: x.f.rows('promotions').map((r) => JSON.parse(r.request))[0].recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    signature: '00'.repeat(64),
  };
  const delivery = { ...d, signature: signed(x.keys.existing, await contentDeliveryMessage(d)) };
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
  await x.call(approval);
  await transfer('existing', 'deliver', delivery);
  const { certification } = await transfer('new', 'install', installation);
  assert(certification, 'second device certified');
  const base = {
    pin: x.authority.pin,
    request: JSON.parse(x.f.rows('promotions')[0].request),
    receipt: x.receipt,
  };
  return { ...x, authority, certification, base };
}

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
  };
};

function continuationExchange(x, admission, entry) {
  const ca = admission.epoch.preparation.context.candidate;
  const context = {
    ...x.context,
    v: 2,
    epoch: admission.epoch.epoch,
    head: admission.head,
    certifiedSetDigest: admission.epoch.certifiedSetDigest,
    existing: x.context.existing,
    candidate: { id: ca.credentialId, wPub: ca.wPub, sPub: ca.sPub },
    attemptId: 'b1'.repeat(32),
  };
  const keys = { existing: x.keys.existing, new: entry.key };
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
  const request = (role, action, payload = null) =>
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
      },
      role,
    );
  const open = derive({
    workspaceId: x.workspace,
    epoch: admission.epoch.epoch,
    head: admission.head,
    existingCredentialId: context.existing.id,
    newCredentialId: context.candidate.id,
    wPub: ca.wPub,
    sPub: ca.sPub,
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
    approval: request('existing', 'decide', {
      contextHash,
      transcriptHash: open.transcriptHash,
      outcome: 'approved',
    }),
  };
}

/** A third device joins through the continuation ceremony; all three are certified at epoch 5. */
async function thirdDevice(x) {
  const binding = await x.authority.owner.promotionBinding(x.f.core, {
    retryKey: x.account.retryKey,
    requestDigest: x.receipt.offer.epoch.requestDigest,
  });
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
      epochHead: x.certification.head,
      generation: 1,
      checkpointDigest: await digest(new Uint8Array(32).fill(0xef)),
      sv: '00',
      ds: '00',
      headVectorDigest: await checkpointHeadDigest(x.certification.epoch.heads),
      producer: x.context.existing.id,
      signature: '00'.repeat(64),
    },
    heads: x.certification.epoch.heads,
    binding,
  };
  checkpoint.manifest.signature = signed(
    x.keys.existing,
    await manifestMessage(checkpoint.manifest),
  );
  const publish = {
    workspaceId: x.workspace,
    credentialId: x.context.existing.id,
    head: x.certification.head,
    nonce: 'ac'.repeat(32),
    action: 'publish',
    payload: checkpoint,
    signature: '00'.repeat(64),
  };
  publish.signature = signed(x.keys.existing, await checkpointRequestMessage(publish));
  assert.equal((await x.authority.owner.exchangeCheckpoint(x.f.core, publish)).ok, true);
  const entry = x.candidate();
  entry.input.candidate.head = x.certification.head;
  const begun = await x.enroll('begin', entry.input);
  const prepared = await x.enroll('finish', nextProof(x, entry, begun.challenge));
  const admissionInput = {
    retryKey: entry.input.retryKey,
    attemptId: prepared.receipt.context.attemptId,
    receiptId: prepared.receipt.receiptId,
  };
  const admission = await x.authority.owner.admitMembership(x.f.core, admissionInput);
  assert.equal(admission.kind, 'membership-admission', JSON.stringify(admission));
  const e = continuationExchange(x, admission, entry);
  const relay = (r) => x.authority.owner.relayMembershipCeremony(x.f.core, r);
  for (const role of ['existing', 'new'])
    assert.equal((await relay(e.request(role, 'commit', e.commits[role]))).ok, true);
  for (const role of ['existing', 'new'])
    assert.equal((await relay(e.request(role, 'reveal', e.reveals[role]))).ok, true);
  assert.equal((await relay(e.approval)).stage, 'approved');
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
      parent: admission.head,
      epoch: admission.epoch.epoch + 1,
      generation: admission.epoch.generation,
      members: admission.epoch.roster.map(({ id, wPub, sPub }) => ({ id, wPub, sPub })),
      recoveryStateDigest: e.context.recoveryStateDigest,
      approver: e.context.existing.id,
    },
    e.keys.existing,
  );
  const deliveryBody = parseMembershipDelivery({
    v: 2,
    kind: 'membership-key-delivery',
    parent: admission.head,
    preparationId: admissionInput.attemptId,
    generation: admission.epoch.generation,
    transcriptHash: e.approval.payload.transcriptHash,
    existing: e.commits.existing,
    candidate: e.commits.new,
    existingReveal: e.reveals.existing,
    newReveal: e.reveals.new,
    decision: e.approval,
    certificate,
    recovery: x.base.request.recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    signature: '00'.repeat(64),
  });
  const delivery = sign('done/membership-key-delivery/v2', deliveryBody, e.keys.existing);
  const installation = sign(
    'done/membership-key-installed/v2',
    parseMembershipInstallation({
      v: 2,
      kind: 'membership-key-installed',
      deliveryHash: hash(JSON.stringify(delivery)),
      credentialId: e.context.candidate.id,
      signature: '00'.repeat(64),
    }),
    e.keys.new,
  );
  const transfer = (role, action, payload) =>
    x.authority.owner.transferMembership(
      x.f.core,
      sign(
        'done/membership-key-transfer/v2',
        {
          v: 2,
          workspaceId: x.workspace,
          credentialId: role === 'existing' ? e.context.existing.id : e.context.candidate.id,
          parent: admission.head,
          preparationId: admissionInput.attemptId,
          action,
          payload,
        },
        e.keys[role],
      ),
    );
  assert.equal((await transfer('existing', 'deliver', delivery)).ok, true);
  const installed = await transfer('new', 'install', installation);
  assert.equal(installed.ok, true, JSON.stringify(installed));
  return {
    id: e.context.candidate.id,
    key: entry.key,
    continuations: [admission, installed.certification],
    head: installed.certification.head,
  };
}

class Refused extends Error {
  constructor(refusal) {
    super(refusal);
    this.refusal = refusal;
  }
}

/**
 * One account with `count` certified devices (2 or 3). Each device has its own saved progress
 * and runs the real `runHistoryMaintenance` against the real in-process service. A refusal is
 * thrown, as the HTTP route answers it with 409 and the transport throws for any non-200.
 */
export async function devices(t, count = 2) {
  const x = await approvedAccount(t);
  const third = count === 3 ? await thirdDevice(x) : null;
  const { history } = third
    ? await c.verifyMembershipChain(
        {
          successor: x.successor,
          certification: x.certification,
          continuations: third.continuations,
        },
        x.base,
      )
    : {
        history: await c.verifyCertificationHistory(x.certification, x.successor, x.base, {
          epoch: 3,
          head: x.certification.head,
        }),
      };
  const membership = c.historyMembership(history),
    p = c.membershipState(membership);
  assert.equal(p.certificate.members.length, count);
  const doc = new c.Y.Doc({ gc: false });
  doc.getMap('meta').set('schemaVersion', 4);
  doc
    .getMap('meta')
    .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  doc.getText('master').insert(0, 'accepted text');
  const generationKey = new Uint8Array(32).fill(71);
  t.after(() => {
    doc.destroy();
    generationKey.fill(0);
  });
  const roles = [
    { name: 'A', id: x.context.existing.id, key: x.keys.existing },
    { name: 'B', id: x.context.candidate.id, key: x.keys.new },
    ...(third ? [{ name: 'C', id: third.id, key: third.key }] : []),
  ];
  const positions = new Map(roles.map((r) => [r.id, 0]));
  /** Accepted positions by device A, n at a time. */
  const upload = async (n, role = roles[0]) => {
    for (let i = 0; i < n; i++) {
      const position = positions.get(role.id) + 1;
      const w = x.make(position, `writing ${position}`, {
        epoch: p.epoch,
        credential: role.id,
        signer: role.key,
      });
      const r = await x.deliveryCall(w);
      assert.equal(r.kind, 'decision', JSON.stringify(r));
      positions.set(role.id, position);
    }
  };
  const device = (role) => {
    let saved = null,
      prepares = 0,
      admits = 0,
      gate = null,
      start = null,
      before = null,
      after = null,
      prepareFault = null,
      admitFault = null;
    const sent = [],
      refusals = [],
      signer = async (bytes) => signed(role.key, bytes);
    const owner = {
      authority: membership,
      credentialId: role.id,
      async authorityAt(epoch, head) {
        assert.equal(epoch, p.epoch);
        assert.equal(head, p.head);
        return membership;
      },
      sign: signer,
      async prepare(previous, heads, sources) {
        prepares++;
        await gate?.();
        if (prepareFault) throw prepareFault;
        return c.createHistoryCheckpoint(
          doc,
          doc,
          generationKey,
          membership,
          role.id,
          heads,
          previous,
          signer,
          sources,
        );
      },
      async admit(cp) {
        admits++;
        if (admitFault) throw admitFault;
        return c.admitHistoryCheckpoint(cp, generationKey, membership, role.id, doc, signer);
      },
    };
    const io = {
      signal: new AbortController().signal,
      now: () => 1000,
      load: async () => structuredClone(saved),
      replace: async (before, next) => {
        assert.deepEqual(before, saved);
        saved = structuredClone(next);
      },
      async exchange(request) {
        sent.push(request.action + ':' + (request.action === 'read' ? request.payload : ''));
        await before?.(request);
        const reply = await x.authority.owner.exchangeHistoryCheckpoint(x.f.core, request);
        await after?.(request, reply);
        if (!reply.ok) {
          refusals.push(request.action + ':' + reply.refusal);
          throw new Refused(reply.refusal);
        }
        return reply.page;
      },
    };
    return {
      id: role.id,
      name: role.name,
      sent,
      refusals,
      run: (command) =>
        c.runHistoryMaintenance(start ? { ...owner, replayStart: start } : owner, command, io),
      saved: () => structuredClone(saved),
      setSaved: (next) => {
        saved = structuredClone(next);
      },
      stats: () => ({ prepares, admits }),
      /** Hold `prepare` until the returned release is called. Resolves `entered` when it is held. */
      hold() {
        let release, entered;
        const held = new Promise((r) => (release = r)),
          reached = new Promise((r) => (entered = r));
        gate = async () => {
          gate = null;
          entered();
          await held;
        };
        return { release, reached };
      },
      /** Make the next preparations or verifications throw, as a replay that fails would. */
      failPrepare(error) {
        prepareFault = error;
      },
      failAdmit(error) {
        admitFault = error;
      },
      /** Run before each request reaches the service; throwing loses the request. */
      beforeSend(fn) {
        before = fn;
      },
      /** Run after the service answered; throwing loses the reply. */
      afterSend(fn) {
        after = fn;
      },
      /** Count this device's replay from these cuts, as a device joined by a handoff would. */
      replayFrom(heads) {
        start = heads ? () => structuredClone(heads) : null;
      },
      /** A request this device signs now, for a delayed or repeated delivery. */
      async request(action, payload) {
        const r = {
          v: 1,
          kind: 'history-checkpoint-request',
          workspaceId: p.workspaceId,
          lineageId: p.lineageId,
          epoch: p.epoch,
          head: p.head,
          credentialId: role.id,
          nonce: randomBytes(32).toString('hex'),
          expiresAt: 31000,
          action,
          payload,
          signature: '00'.repeat(64),
        };
        r.signature = await signer(await historyExchangeMessage(r));
        return x.authority.owner.exchangeHistoryCheckpoint(x.f.core, r);
      },
    };
  };
  const rows = () => x.f.rows('history_checkpoint_records');
  return {
    x,
    p,
    membership,
    upload,
    rows,
    catalog: () => {
      const r = x.f.rows('history_checkpoint_catalog')[0];
      return r ? JSON.parse(r.value) : null;
    },
    devices: roles.map(device),
    positions: () => [...positions].map(([credentialId, position]) => ({ credentialId, position })),
  };
}
