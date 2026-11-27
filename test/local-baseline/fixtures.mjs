// Small real-crypto membership fixture; no browser, service, or live credentials.
import { sign } from 'node:crypto';
import { fixture } from '../account-membership/fixtures.mjs';
import { head, response, refusal, hash } from '../account-decisions/oracle.mjs';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator.ts';
import { historyPublisher, historyMembership } from '../../account-protocol/admissionHistory.ts';
import { sealNetworkEnvelope, decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
import { decodePositionResponse } from '../../account-protocol/positionDecision.ts';
import { signSubmission } from '../../account-protocol/submission.ts';
import { encodeSpoolEntry, networkRoute, extendSpoolWitness } from '../../src/crdt/spoolRecord.ts';
import { encodeDeliveryEntry } from '../../src/crdt/deliveryRecord.ts';
import { makeSourceCapsule, captureRouteAt } from '../../src/crdt/sourceCapture.ts';
import { membershipRotationFixture } from '../account-membership/rotation-fixtures.mjs';
import { membershipState, verifyMembershipRotation } from '../../account-protocol/membership.ts';
import { Y } from '../../src/crdt/yjs.ts';
import {
  createHistoryCheckpoint,
  admitHistoryCheckpoint,
} from '../../src/crdt/historyCheckpoint.ts';
import { encodeHistoryInstall } from '../../src/crdt/historyInstall.ts';
const zero = '00'.repeat(32),
  bytes = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));
const hex = (b) => Buffer.from(b).toString('hex');
export async function memberFixture() {
  const f = fixture(),
    proofs = { successor: f.f.successor, certification: f.certification, continuations: [] };
  const { history: h } = await verifyMembershipChain(proofs, f.f.base);
  const existing = f.context.existing,
    peer = f.context.candidate;
  let history = historyPublisher(h, existing.id);
  const kg = new Uint8Array(32).fill(41);
  const signer = await crypto.subtle.importKey('raw', bytes(existing.sPub), 'Ed25519', false, [
    'verify',
  ]);
  const signing = async (key) =>
    crypto.subtle.importKey(
      'pkcs8',
      key.export({ format: 'der', type: 'pkcs8' }),
      'Ed25519',
      false,
      ['sign'],
    );
  let base = {
    baseline: { kind: 'promotion-genesis', id: hash(JSON.stringify(f.f.receipt)) },
    service: { id: f.f.pin.serviceId, origin: f.f.pin.origin },
    authority: history.current,
    history,
    creatingCredential: existing.id,
    reader: { id: existing.id, publicKey: existing.sPub, active: true },
    publisher: {
      id: existing.id,
      publicKey: existing.sPub,
      principal: history.principal,
      system: true,
      active: true,
    },
    generation: 1,
    generationKey: kg,
    prefix: { position: 0, link: zero, observedThrough: 0 },
  };
  let route = {
    workspace: h.current.workspace,
    credential: existing.id,
    principal: history.principal,
    epoch: 3,
    generation: 1,
    history,
  };
  const ctx = {
    identity: {
      slotId: '01'.repeat(16),
      principalId: history.principal,
      workspaceId: route.workspace,
      storeId: '02'.repeat(16),
      rootId: '03'.repeat(16),
    },
    route,
    inbound: base,
    signer,
    installation: {
      kind: 'original',
      successor: {
        artifact: f.f.successor,
        before: { events: 0, hash: zero },
        certification: f.certification,
        certifiedBefore: { events: 0, hash: zero },
      },
    },
    assertCurrent() {},
  };
  const rows = [],
    peerDoc = new Y.Doc({ gc: false });
  let position = 0,
    previous = zero,
    attempts = 0,
    ownPosition = 0,
    ownPrevious = zero,
    lastCheckpoint = null;
  const add = (kind, data) => rows.push({ seq: rows.length + 1, gen: 1, kind, bytes: data });
  const appendPeer = async (remove = false) => {
    let update;
    const capture = (u) => {
      update = new Uint8Array(u);
    };
    peerDoc.on('update', capture);
    const text = peerDoc.getText('peer');
    if (remove && text.length) text.delete(0, 1);
    else text.insert(text.length, 'peer text');
    peerDoc.off('update', capture);
    const pr = { ...route, credential: peer.id, history: historyPublisher(history, peer.id) };
    const envelope = await sealNetworkEnvelope(
      { ...networkRoute(pr), seq: ++position },
      { actor_id: history.principal, actor_kind: 'human', updates: [update] },
      kg,
      await signing(f.keys.new),
      crypto.getRandomValues(new Uint8Array(12)),
    );
    const e = decodeNetworkEnvelope(envelope),
      subject = {
        workspace: route.workspace,
        credential: peer.id,
        position,
        epoch: route.epoch,
        digest: hex(e.digest),
      };
    const accepted = head(subject, previous, route.epoch, f.f.keys.acceptance),
      proof = response({
        kind: 'accepted',
        head: accepted,
        leaf: { epoch: route.epoch, digest: subject.digest },
      });
    const signed = (v, key) => json([...v, sign(null, json(v), key).toString('hex')]);
    const request = signed(
      [
        'done/private-read/v2',
        2,
        base.service.id,
        base.service.origin,
        route.workspace,
        existing.id,
        peer.id,
        base.authority.lineage,
        base.authority.head,
        route.epoch,
        position - 1,
        1,
        '95'.repeat(32),
        30000,
      ],
      f.keys.existing,
    );
    const page = signed(
      [
        'done/private-read-page/v2',
        2,
        hash(request),
        position,
        position,
        [[hex(envelope), hex(proof)]],
      ],
      f.f.keys.acceptance,
    );
    const record = json([
      'done/account-inbound/v1',
      1,
      base.baseline.id,
      base.authority.lineage,
      base.authority.head,
      existing.id,
      peer.id,
      'received',
      position,
      previous,
      accepted.link,
      hex(request),
      hex(page),
    ]);
    add('update', update);
    add('heads', record);
    previous = accepted.link;
    return { update, record, envelope, proof };
  };
  const appendOwn = async (kind = 'accepted') => {
    const own = ++ownPosition;
    const d = new Y.Doc({ gc: false });
    d.getText('own').insert(0, 'unaccepted local writing');
    const update = new Uint8Array(Y.encodeStateAsUpdate(d));
    d.destroy();
    const capsule = makeSourceCapsule(route, [
        { actor: route.principal, kind: 'human', bytes: update },
      ]),
      id = JSON.parse(Buffer.from(capsule).toString())[2];
    add('update', update);
    add('outbound', capsule);
    const event = (e) =>
      add(e.type === 'envelope' ? 'outbound' : 'heads', encodeSpoolEntry(e, route));
    event({ type: 'position', position: own, source: { id, index: 0, hash: hash(capsule) } });
    event({ type: 'attempt', position: own, attempt: ++attempts });
    const envelope = await sealNetworkEnvelope(
      { ...networkRoute(route), seq: own },
      { actor_id: route.principal, actor_kind: 'human', updates: [update] },
      kg,
      await signing(f.keys.existing),
      crypto.getRandomValues(new Uint8Array(12)),
    );
    event({ type: 'envelope', position: own, attempt: attempts, wire: envelope });
    const e = decodeNetworkEnvelope(envelope),
      subject = {
        workspace: route.workspace,
        credential: route.credential,
        position: own,
        epoch: route.epoch,
        digest: hex(e.digest),
      };
    const submission = await signSubmission(
      { envelope, parent: null, lineage: base.authority.lineage },
      await signing(f.keys.existing),
    );
    add(
      'outbound',
      encodeDeliveryEntry(
        { type: 'submission', position: own, wire: submission },
        route,
        base.authority,
      ),
    );
    const proof =
      kind === 'accepted'
        ? response({
            kind,
            head: head(subject, ownPrevious, route.epoch, f.f.keys.acceptance),
            leaf: { epoch: route.epoch, digest: subject.digest },
          })
        : response({ kind: 'refused', refusal: refusal(subject, f.f.keys.acceptance) });
    add(
      'heads',
      encodeDeliveryEntry({ type: 'response', position: own, wire: proof }, route, base.authority),
    );
    if (kind === 'accepted') ownPrevious = decodePositionResponse(proof).head.link;
    return { update, proof, envelope };
  };
  const appendHistory = async () => {
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peerDoc));
      doc.getMap('meta').set('schemaVersion', 4);
      doc
        .getMap('meta')
        .set('actor:' + route.principal, { kind: 'human', name: 'Fixture', color: 'blue' });
      const authority = historyMembership(history);
      const heads = [
        { credentialId: existing.id, position: ownPosition, link: ownPrevious },
        { credentialId: peer.id, position, link: previous },
      ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
      const cp = await createHistoryCheckpoint(
        doc,
        doc,
        kg,
        authority,
        existing.id,
        heads,
        lastCheckpoint,
        async (bytes) => sign(null, bytes, f.keys.existing).toString('hex'),
      );
      const admission = await admitHistoryCheckpoint(
        cp,
        kg,
        authority,
        peer.id,
        doc,
        async (bytes) => sign(null, bytes, f.keys.new).toString('hex'),
      );
      const record = encodeHistoryInstall({
        version: 2,
        baseline: base.baseline.id,
        workspace: route.workspace,
        lineage: base.authority.lineage,
        epoch: route.epoch,
        head: base.authority.head,
        reader: existing.id,
        checkpoint: cp,
        admission,
      });
      add('state', new Uint8Array(Y.encodeStateAsUpdate(doc)));
      add('heads', record);
      lastCheckpoint = cp;
      return record;
    } finally {
      doc.destroy();
    }
  };
  const adopt = async (change = () => {}) => {
    let before = { events: 0, hash: zero };
    for (const row of rows)
      if (
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          JSON.parse(Buffer.from(row.bytes).toString())[0] !== 'done/source-capture/v1')
      )
        before = await extendSpoolWitness(before, row.bytes, crypto.subtle);
    const state = structuredClone(membershipState(historyMembership(history)));
    for (const head of state.heads) {
      if (head.credentialId === existing.id) {
        head.position = ownPosition;
        head.link = ownPrevious;
      }
      if (head.credentialId === peer.id) {
        head.position = position;
        head.link = previous;
      }
    }
    change(state);
    const admission = f.admit(state, (160 + state.epoch).toString(16).repeat(16));
    const nextProofs = {
      ...proofs,
      continuations: [...(ctx.installation.membership?.proofs.continuations ?? []), admission],
    };
    const verified = await verifyMembershipChain(nextProofs, f.f.base);
    history = historyPublisher(verified.history, existing.id);
    route = { ...route, epoch: history.current.tip, history };
    base = { ...base, authority: history.current, history };
    ctx.route = route;
    ctx.inbound = base;
    ctx.installation.membership = {
      v: 1,
      proofs: nextProofs,
      cuts: [
        ...(ctx.installation.membership?.cuts ?? []),
        { epoch: route.epoch, head: history.current.head, before },
      ],
    };
  };
  return {
    ctx,
    rows,
    adopt,
    appendPeer,
    appendOwn,
    appendHistory,
    clear: () => peerDoc.destroy(),
    f,
    proofs,
  };
}

export async function retriedFixture() {
  const f = await memberFixture(),
    x = await membershipRotationFixture();
  const rotation = x.rotate(),
    admission = x.f.admit(membershipState(await verifyMembershipRotation(rotation, x.parent)));
  const proofs = { ...x.proofs, continuations: [rotation, admission] };
  const { history } = await verifyMembershipChain(proofs, x.f.f.base);
  const route = { ...f.ctx.route, epoch: 5, generation: 2, history },
    old = captureRouteAt(route, 3);
  const signing = await crypto.subtle.importKey(
    'pkcs8',
    x.f.keys.existing.export({ format: 'der', type: 'pkcs8' }),
    'Ed25519',
    false,
    ['sign'],
  );
  const keys = new Map([
    [1, new Uint8Array(32).fill(41)],
    [2, new Uint8Array(32).fill(42)],
  ]);
  const d = new Y.Doc({ gc: false });
  d.getText('master').insert(0, 'offline writing survives rotation');
  const update = new Uint8Array(Y.encodeStateAsUpdate(d));
  d.destroy();
  const capsule = makeSourceCapsule(old, [
      { actor: route.principal, kind: 'human', bytes: update },
    ]),
    id = JSON.parse(Buffer.from(capsule).toString())[2];
  const rows = [];
  const add = (kind, bytes) => rows.push({ kind, bytes, gen: 1, seq: rows.length + 1 });
  const event = (r, e) => add(e.type === 'envelope' ? 'outbound' : 'heads', encodeSpoolEntry(e, r));
  add('update', update);
  add('outbound', capsule);
  event(old, { type: 'position', position: 1, source: { id, index: 0, hash: hash(capsule) } });
  event(old, { type: 'attempt', position: 1, attempt: 1 });
  const envelope = async (r) =>
    sealNetworkEnvelope(
      { ...networkRoute(r), seq: 1 },
      { actor_id: r.principal, actor_kind: 'human', updates: [update] },
      keys.get(r.generation),
      signing,
      crypto.getRandomValues(new Uint8Array(12)),
    );
  const first = await envelope(old);
  event(old, { type: 'envelope', position: 1, attempt: 1, wire: first });
  let before = { events: 0, hash: zero };
  for (const r of rows.slice(2)) before = await extendSpoolWitness(before, r.bytes, crypto.subtle);
  const subject = (wire) => {
    const e = decodeNetworkEnvelope(wire);
    return {
      workspace: route.workspace,
      credential: route.credential,
      position: 1,
      epoch: e.epoch,
      digest: hex(e.digest),
    };
  };
  const closed = refusal(subject(first), x.f.f.keys.acceptance, zero, 'retired-generation');
  const refused = response({ kind: 'refused', refusal: closed });
  add(
    'heads',
    encodeDeliveryEntry({ type: 'response', position: 1, wire: refused }, route, history.current),
  );
  event(route, { type: 'retry', position: 1, refusal: refused });
  event(route, { type: 'attempt', position: 1, attempt: 2 });
  event(route, { type: 'attempt', position: 1, attempt: 3 });
  const second = await envelope(route);
  event(route, { type: 'envelope', position: 1, attempt: 3, wire: second });
  const submitted = await signSubmission(
    { envelope: second, lineage: history.current.lineage, parent: closed },
    signing,
  );
  add(
    'outbound',
    encodeDeliveryEntry(
      { type: 'submission', position: 1, wire: submitted },
      route,
      history.current,
    ),
  );
  const accepted = response({
    kind: 'accepted',
    head: head(subject(second), zero, 5, x.f.f.keys.acceptance),
    leaf: { epoch: 5, digest: subject(second).digest },
  });
  add(
    'heads',
    encodeDeliveryEntry({ type: 'response', position: 1, wire: accepted }, route, history.current),
  );
  f.ctx.route = route;
  f.ctx.inbound = {
    ...f.ctx.inbound,
    history,
    authority: history.current,
    generation: 2,
    generationKey: keys.get(2),
    retainedGenerationKeys: new Map([[1, keys.get(1)]]),
  };
  f.ctx.installation.membership = {
    v: 1,
    proofs,
    cuts: [
      { epoch: 4, head: rotation.head, before },
      { epoch: 5, head: admission.head, before },
    ],
  };
  return { ...f, rows };
}
