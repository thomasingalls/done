// Independent carrier/chain reconstruction, reusing independently written transport primitives.
import {
  fixture as transport,
  encrypted,
  encode,
  envelopeParts,
  submissionParts,
  submissionWireParts,
  signBytes,
  headParts,
  linkParts,
  responseValues,
  requestValues,
  pageValues,
  hash,
  hex,
  json,
  zero,
  u32,
} from '../account-transport-contract/oracle.mjs';
import { fixedFixture, ordered } from '../account-first-authority/oracle.mjs';
export { hash, hex, json, zero };
export const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));
export const fields = (r) => [r.workspace, r.credential, r.principal, r.epoch, r.generation];
export const sourceValues = (c) => [
  'done/source-capture/v1',
  1,
  c.id,
  ...fields(c),
  c.sources.map((s) => [s.actor, s.kind, s.bytes]),
];
export const spoolValues = (r, e) => [
  'done/account-spool/v1',
  1,
  ...fields(r),
  e.type,
  e.position,
  e.type === 'position'
    ? [e.source.id, e.source.index, e.source.hash]
    : e.type === 'position-batch'
      ? e.sources.map((s) => [s.id, s.index, s.hash])
      : e.type === 'attempt'
        ? e.attempt
        : [e.attempt, e.wire],
];
export const deliveryValues = (r, a, e) => [
  'done/account-delivery/v1',
  1,
  ...fields(r),
  a.lineage,
  a.head,
  e.type,
  e.position,
  e.wire,
];
export const inboundValues = (e) => [
  'done/account-inbound/v1',
  1,
  e.baseline,
  e.lineage,
  e.head,
  e.reader,
  e.publisher,
  e.kind,
  e.position,
  e.previous,
  e.link,
  e.request,
  e.page,
];
export const chainPayload = (previous, event) =>
  Buffer.concat([
    Buffer.from('done/account-spool-chain/v1\0'),
    Buffer.from(previous, 'hex'),
    u32(event.length),
    event,
  ]);
export const extend = (before, event) => ({
  events: before.events + 1,
  hash: hash(chainPayload(before.hash, event)),
});
export const fold = (events) => events.reduce(extend, { events: 0, hash: zero });
export function makeEnvelope(
  f,
  position,
  update,
  nonce = 'ab'.repeat(12),
  actor = f.route.principal,
) {
  return encrypted(
    {
      v: 2,
      workspace_id: f.route.workspace,
      credential_id: f.route.credential,
      epoch: f.route.epoch,
      gen: 1,
      seq: position,
      nonce,
    },
    { actor_id: actor, actor_kind: actor === 'system' ? 'system' : 'human', updates: [update] },
    f.kg,
    f.keys.member.seed,
  );
}
export function makeSubmission(f, env) {
  const s = {
    lineage: f.authority.lineage,
    envelope: hex(encode(envelopeParts(env))),
    parent: null,
  };
  s.signature = signBytes(encode(submissionParts(s)), f.keys.member.seed);
  return hex(encode(submissionWireParts(s)));
}
export function makeAnswer(f, env, previous = zero) {
  const subject = {
    workspace: f.route.workspace,
    credential: f.route.credential,
    position: env.seq,
    digest: env.digest,
    epoch: env.epoch,
  };
  const head = {
    workspace: subject.workspace,
    credential: subject.credential,
    position: subject.position,
    link: hash(encode(linkParts(subject, previous))),
    epoch: 1,
    final: false,
  };
  head.signature = signBytes(encode(headParts(head)), f.keys.acceptance.seed);
  const proof = hex(
    json(responseValues({ kind: 'accepted', head, leaf: { epoch: 1, digest: env.digest } })),
  );
  const request = { ...f.request, after: env.seq - 1 };
  request.signature = signBytes(json(requestValues(request, 2)), f.keys.reader.seed);
  const requestWire = hex(json([...requestValues(request, 2), request.signature]));
  const page = {
    request: hash(bytes(requestWire)),
    through: env.seq,
    next: env.seq,
    entries: [{ envelope: hex(encode(envelopeParts(env))), proof }],
  };
  page.signature = signBytes(json(pageValues(page, 2)), f.keys.acceptance.seed);
  return {
    proof,
    request: requestWire,
    page: hex(json([...pageValues(page, 2), page.signature])),
    link: head.link,
    previous,
  };
}
export function fixture() {
  const t = transport(),
    a = fixedFixture();
  const f = {
    route: {
      workspace: t.base.workspace,
      credential: t.base.credential,
      principal: 'aa'.repeat(16),
      epoch: 1,
      generation: 1,
    },
    authority: {
      workspace: t.base.workspace,
      lineage: t.base.lineage,
      head: t.base.head,
      tip: 1,
      acceptanceKey: t.keys.acceptance.publicKey,
    },
    keys: t.keys,
    kg: t.kg,
    updates: t.body.updates,
    request: t.requests[1],
    baseline: hash(JSON.stringify(ordered('receipt', a.receipt))),
    receipt: ordered('receipt', a.receipt),
    promotion: {
      source: {
        workspaceId: a.candidate.workspaceId,
        principalId: a.candidate.principalId,
        generation: 1,
      },
      credentialIds: [a.candidate.wraps[0].id, a.candidate.signer],
      credentials: [{}, { publicKey: a.pub.device }],
      genesis: a.candidate,
      admission: { request: a.request, receipt: a.receipt },
      pin: a.pin,
    },
  };
  f.capsule = {
    ...f.route,
    v: 1,
    id: 'cc'.repeat(16),
    sources: [{ actor: f.route.principal, kind: 'human', bytes: f.updates[0] }],
  };
  f.mixed = {
    ...f.capsule,
    id: 'cd'.repeat(16),
    sources: [...f.capsule.sources, { actor: 'system', kind: 'system', bytes: f.updates[1] }],
  };
  f.env = makeEnvelope(f, 1, f.updates[0]);
  f.answer = makeAnswer(f, f.env);
  f.other = makeEnvelope(f, 1, f.updates[1], 'ad'.repeat(12));
  f.conflict = makeAnswer(f, f.other);
  f.spool = [
    {
      type: 'position',
      position: 1,
      source: { id: f.capsule.id, index: 0, hash: hash(json(sourceValues(f.capsule))) },
    },
    { type: 'attempt', position: 1, attempt: 1 },
    { type: 'attempt', position: 1, attempt: 2 },
    { type: 'envelope', position: 1, attempt: 2, wire: hex(encode(envelopeParts(f.env))) },
  ];
  f.delivery = [
    { type: 'submission', position: 1, wire: makeSubmission(f, f.env) },
    { type: 'response', position: 1, wire: f.answer.proof },
  ];
  f.inbound = ['received', 'conflict'].map((kind) => {
    const e = kind === 'received' ? f.answer : f.conflict;
    return {
      baseline: f.baseline,
      lineage: f.authority.lineage,
      head: f.authority.head,
      reader: t.base.reader,
      publisher: f.route.credential,
      kind,
      position: 1,
      previous: zero,
      link: e.link,
      request: e.request,
      page: e.page,
    };
  });
  return f;
}
export function descriptors(f) {
  return [
    ...[
      ['source-human', f.capsule],
      ['source-mixed', f.mixed],
    ].map(([id, c]) => ({
      id,
      family: 'source',
      input: c,
      values: sourceValues(c),
      placement: 'outbound',
    })),
    ...f.spool.map((e, i) => ({
      id: 'spool-' + (i === 2 ? 'retry' : e.type),
      family: 'spool',
      input: e,
      values: spoolValues(f.route, e),
      placement: e.type === 'envelope' ? 'outbound' : 'heads',
    })),
    ...f.delivery.map((e) => ({
      id: 'delivery-' + e.type,
      family: 'delivery',
      input: e,
      values: deliveryValues(f.route, f.authority, e),
      placement: e.type === 'submission' ? 'outbound' : 'heads',
    })),
    ...f.inbound.map((e) => ({
      id: 'inbound-' + e.kind,
      family: 'inbound',
      input: e,
      values: inboundValues(e),
      placement: 'heads',
    })),
  ];
}
export const at = (o, p) => p.reduce((o, k) => o[k], o);
export const leaves = (o, p = []) =>
  Array.isArray(o) && o.length ? o.flatMap((v, i) => leaves(v, [...p, i])) : [p];
export const change = (v) =>
  typeof v === 'number'
    ? v + 1
    : typeof v === 'string'
      ? (v[0] === 'a' ? 'b' : 'a') + v.slice(1)
      : Array.isArray(v)
        ? [0]
        : !v;
export function mutate(o, p, remove = false) {
  const x = structuredClone(o),
    parent = at(x, p.slice(0, -1)),
    last = p.at(-1);
  if (remove) parent.splice(last, 1);
  else parent[last] = change(parent[last]);
  return x;
}
export const objectLeaves = (o, p = []) =>
  o && typeof o === 'object' && Object.keys(o).length
    ? Object.entries(o).flatMap(([k, v]) => objectLeaves(v, [...p, k]))
    : [p];
export function corpus() {
  const f = fixture(),
    ds = descriptors(f),
    vectors = ds.map((d) => ({
      id: d.id,
      kind: 'carrier',
      signer: null,
      family: d.family,
      placement: d.placement,
      input: d.input,
      expected: { messageHex: hex(json(d.values)), resultHex: hex(json(d.values)) },
      negatives: leaves(d.values).map((path) => ({
        path,
        alteredHash: hash(json(mutate(d.values, path))),
      })),
      encodedBindingControls: leaves(d.values).map((path) => ({
        path,
        omittedHash: hash(json(mutate(d.values, path, true))),
      })),
    }));
  let w = { events: 0, hash: zero };
  for (const d of ds.filter((d) => d.family !== 'source')) {
    const b = json(d.values),
      after = extend(w, b);
    vectors.push({
      id: 'chain-' + d.id,
      kind: 'digest',
      signer: null,
      before: w,
      eventHex: hex(b),
      expected: { messageHex: hex(chainPayload(w.hash, b)), resultHex: after.hash },
      negatives: ['domain', 'previous', 'length', 'event'].map((field) => ({ field })),
      after,
    });
    w = after;
  }
  vectors.push({
    id: 'capture-source-digest',
    kind: 'digest',
    signer: null,
    expected: {
      messageHex: hex(json(sourceValues(f.capsule))),
      resultHex: hash(json(sourceValues(f.capsule))),
    },
    negatives: leaves(sourceValues(f.capsule)).map((path) => ({ path })),
  });
  vectors.push({
    id: 'inbound-baseline-digest',
    kind: 'digest',
    signer: null,
    expected: { messageHex: hex(json(f.receipt)), resultHex: f.baseline },
    negatives: objectLeaves(f.receipt).map((path) => ({ path })),
  });
  return { v: 1, fixture: f, vectors };
}
// A second oracle for legal durable spool prefixes; it never calls production inspectors.
export function history(f, attemptCounts, unfinished = false) {
  let seq = 1,
    attempt = 0;
  const records = [],
    events = [],
    positions = [];
  for (const [i, count] of attemptCounts.entries()) {
    const capsule = {
      ...f.capsule,
      id: (i + 1).toString(16).padStart(32, '0'),
      sources: [{ ...f.capsule.sources[0], bytes: f.updates[i % f.updates.length] }],
    };
    const source = json(sourceValues(capsule));
    records.push({ seq: seq++, gen: 1, kind: 'outbound', bytes: bytes(hex(source)) });
    const append = (e) => {
      const b = json(spoolValues(f.route, e));
      records.push({
        seq: seq++,
        gen: 1,
        kind: e.type === 'envelope' ? 'outbound' : 'heads',
        bytes: bytes(hex(b)),
      });
      events.push(b);
    };
    append({
      type: 'position',
      position: i + 1,
      source: { id: capsule.id, index: 0, hash: hash(source) },
    });
    const granted = [];
    for (let j = 0; j < count; j++) {
      granted.push(++attempt);
      append({ type: 'attempt', position: i + 1, attempt });
    }
    let wire;
    if (!(unfinished && i === attemptCounts.length - 1)) {
      const env = makeEnvelope(
        f,
        i + 1,
        capsule.sources[0].bytes,
        (i + 1).toString(16).padStart(24, '0'),
      );
      wire = hex(encode(envelopeParts(env)));
      append({ type: 'envelope', position: i + 1, attempt, wire });
    }
    positions.push({ position: i + 1, attempts: granted, wire });
  }
  return { records, events, positions, attempts: attempt, witness: fold(events) };
}
