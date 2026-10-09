// Independent encoding and crypto oracle. No production encoder is imported.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  hkdfSync,
  createCipheriv,
} from 'node:crypto';
export const b = (h) => Buffer.from(h, 'hex');
export const hex = (value) => Buffer.from(value).toString('hex');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const json = (value) => Buffer.from(JSON.stringify(value));
export const lp = (...fields) =>
  Buffer.concat(
    fields.map((value) => {
      const bytes = Buffer.from(value),
        size = Buffer.alloc(2);
      size.writeUInt16BE(bytes.length);
      return Buffer.concat([size, bytes]);
    }),
  );
export const u32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
};
export const privateKey = (seed) =>
  createPrivateKey({
    key: b('302e020100300506032b657004220420' + seed),
    type: 'pkcs8',
    format: 'der',
  });
export const publicKey = (seed) =>
  createPublicKey(privateKey(seed))
    .export({ type: 'spki', format: 'der' })
    .subarray(-32)
    .toString('hex');
export const signBytes = (bytes, seed) => sign(null, bytes, privateKey(seed)).toString('hex');
export const zero = '00'.repeat(32);
const part = (name, codec, value) => ({ name, codec, value });
export const lpParts = (names, values) => values.map((v, i) => part(names[i], 'lp', String(v)));
export const encode = (parts) =>
  Buffer.concat(
    parts.map((p) =>
      p.codec === 'lp'
        ? lp(p.value)
        : p.codec === 'u32'
          ? u32(p.value)
          : p.codec === 'json'
            ? json(p.value)
            : b(p.value),
    ),
  );
export const headerParts = (e, label) =>
  lpParts(
    ['domain', 'version', 'workspace', 'credential', 'epoch', 'generation', 'position'],
    [label, e.v, e.workspace_id, e.credential_id, e.epoch, e.gen, e.seq],
  );
export const keyParts = (e) =>
  e.v === 1
    ? lpParts(['domain', 'workspace'], ['done/envelope/v1', e.workspace_id])
    : lpParts(
        ['domain', 'workspace', 'credential', 'generation'],
        ['done/envelope/v2', e.workspace_id, e.credential_id, e.gen],
      );
export const signatureParts = (e) => [
  ...headerParts(e, 'done/env-sig/v' + e.v),
  part('nonce', 'lp', e.nonce),
  part('digest', 'lp', e.digest),
];
export const bodyParts = (body) => [
  ...lpParts(['domain', 'actor', 'kind'], ['done/env-body/v1', body.actor_id, body.actor_kind]),
  part('count', 'u32', body.updates.length),
  ...body.updates.flatMap((u, i) => [
    part('update-' + i + '-length', 'u32', b(u).length),
    part('update-' + i, 'raw', u),
  ]),
];
export function encrypted(e, body, kg, seed) {
  const key = Buffer.from(hkdfSync('sha256', b(kg), Buffer.alloc(0), encode(keyParts(e)), 32));
  const cipher = createCipheriv('aes-256-gcm', key, b(e.nonce));
  cipher.setAAD(encode(headerParts(e, 'done/env/v' + e.v)));
  const ct = hex(
    Buffer.concat([cipher.update(encode(bodyParts(body))), cipher.final(), cipher.getAuthTag()]),
  );
  const r = { ...e, ct, digest: hash(b(ct)) };
  return { ...r, sig: signBytes(encode(signatureParts(r)), seed) };
}
export const envelopeParts = (e) => [
  ...headerParts(e, 'done/envelope-wire/v' + e.v),
  part('nonce', 'raw', e.nonce),
  part('digest', 'raw', e.digest),
  part('ciphertext-length', 'u32', b(e.ct).length),
  part('ciphertext', 'raw', e.ct),
  part('signature', 'raw', e.sig),
];
export const refusalParts = (r) =>
  lpParts(
    [
      'domain',
      'version',
      'workspace',
      'credential',
      'position',
      'digest',
      'epoch',
      'reason',
      'parent',
    ],
    [
      'done/position-refuse/v1',
      '1',
      r.workspace,
      r.credential,
      r.position,
      r.digest,
      r.epoch,
      r.reason,
      r.parent,
    ],
  );
export const linkParts = (s, previous) =>
  lpParts(
    ['domain', 'workspace', 'credential', 'position', 'epoch', 'digest', 'previous'],
    ['done/accept/v1', s.workspace, s.credential, s.position, s.epoch, s.digest, previous],
  );
export const headParts = (h) =>
  lpParts(
    ['domain', 'workspace', 'credential', 'position', 'link', 'epoch', 'final'],
    ['done/accept-head/v1', h.workspace, h.credential, h.position, h.link, h.epoch, h.final],
  );
export const responseValues = (r) =>
  r.kind === 'refused'
    ? [
        'done/position-response/v1',
        1,
        'refused',
        r.refusal.workspace,
        r.refusal.credential,
        r.refusal.position,
        r.refusal.digest,
        r.refusal.epoch,
        r.refusal.reason,
        r.refusal.parent,
        r.refusal.signature,
      ]
    : [
        'done/position-response/v1',
        1,
        'accepted',
        r.head.workspace,
        r.head.credential,
        r.head.position,
        r.head.link,
        r.head.epoch,
        r.head.final,
        r.leaf.epoch,
        r.leaf.digest,
        r.head.signature,
      ];
export const submissionParts = (s) =>
  lpParts(
    ['domain', 'version', 'lineage', 'envelope-hash', 'parent-id'],
    [
      'done/envelope-submission/v1',
      '1',
      s.lineage,
      hash(b(s.envelope)),
      s.parent ? hash(encode(refusalParts(s.parent))) : zero,
    ],
  );
export const submissionWireParts = (s) => {
  const proof = s.parent
    ? json(responseValues({ kind: 'refused', refusal: s.parent }))
    : Buffer.alloc(0);
  return [
    ...lpParts(
      ['domain', 'version', 'lineage'],
      ['done/envelope-submission-wire/v1', '1', s.lineage],
    ),
    part('envelope-length', 'u32', b(s.envelope).length),
    part('envelope', 'raw', s.envelope),
    part('proof-length', 'u32', proof.length),
    part('proof', 'raw', hex(proof)),
    part('signature', 'raw', s.signature),
  ];
};
export const requestValues = (r, v) => [
  'done/private-read/v' + v,
  v,
  r.serviceId,
  r.origin,
  r.workspace,
  ...(v === 1 ? [r.credential] : [r.reader, r.publisher]),
  r.lineage,
  r.head,
  r.epoch,
  r.after,
  r.limit,
  r.nonce,
  r.expires,
];
export const pageValues = (p, v) => [
  'done/private-read-page/v' + v,
  v,
  p.request,
  p.through,
  p.next,
  p.entries.map((e) => [e.envelope, e.proof]),
];
export const chainParts = (previous, ordinal, submission, response) =>
  lpParts(
    ['domain', 'previous', 'ordinal', 'submission-hash', 'response-hash'],
    ['done/service-delivery-chain/v1', previous, ordinal, hash(b(submission)), hash(b(response))],
  );
export const witnessParts = (s, w) =>
  lpParts(
    ['domain', 'workspace', 'credential', 'lineage', 'head', 'request', 'events', 'hash'],
    [
      'done/service-delivery-witness/v1',
      s.workspace,
      s.credential,
      s.lineage,
      s.head,
      s.request,
      w.events,
      w.hash,
    ],
  );
export function fixture() {
  const keys = Object.fromEntries(
    ['member', 'acceptance', 'reader', 'wrong'].map((name, i) => {
      const seed = (41 + i).toString(16).padStart(2, '0').repeat(32);
      return [name, { seed, publicKey: publicKey(seed) }];
    }),
  );
  const base = {
    workspace: '11'.repeat(16),
    credential: '22'.repeat(16),
    reader: '33'.repeat(16),
    lineage: '44'.repeat(32),
    head: '55'.repeat(32),
    serviceId: '66'.repeat(16),
    origin: 'https://transport.done.invalid',
    nonce: '77'.repeat(32),
    request: '88'.repeat(32),
  };
  const body = {
      actor_id: base.credential,
      actor_kind: 'human',
      updates: ['010192210004010474657874014100', '010192210184922100014200'],
    },
    kg = '99'.repeat(32);
  const initial = {
    v: 2,
    workspace_id: base.workspace,
    credential_id: base.credential,
    epoch: 1,
    gen: 1,
    seq: 1,
    nonce: 'ab'.repeat(12),
  };
  const envelopes = [1, 2].map((v) => encrypted({ ...initial, v }, body, kg, keys.member.seed));
  const env = envelopes[1],
    subject = {
      workspace: base.workspace,
      credential: base.credential,
      position: 1,
      digest: env.digest,
      epoch: 1,
    };
  const refusal = {
    ...subject,
    digest: 'cd'.repeat(32),
    reason: 'epoch-generation-mismatch',
    parent: zero,
  };
  refusal.signature = signBytes(encode(refusalParts(refusal)), keys.acceptance.seed);
  const head = {
    workspace: base.workspace,
    credential: base.credential,
    position: 1,
    link: hash(encode(linkParts(subject, zero))),
    epoch: 1,
    final: false,
  };
  head.signature = signBytes(encode(headParts(head)), keys.acceptance.seed);
  const responses = [
    { kind: 'refused', refusal },
    { kind: 'accepted', head, leaf: { epoch: 1, digest: env.digest } },
  ];
  const submissions = [null, refusal].map((parent) => {
    const s = { lineage: base.lineage, envelope: hex(encode(envelopeParts(env))), parent };
    return { ...s, signature: signBytes(encode(submissionParts(s)), keys.member.seed) };
  });
  const requests = [1, 2].map((v) => {
    const r = {
      serviceId: base.serviceId,
      origin: base.origin,
      workspace: base.workspace,
      ...(v === 1
        ? { credential: base.credential }
        : { reader: base.reader, publisher: base.credential }),
      lineage: base.lineage,
      head: base.head,
      epoch: 1,
      after: 0,
      limit: 1,
      nonce: base.nonce,
      expires: 31000,
    };
    return {
      ...r,
      signature: signBytes(json(requestValues(r, v)), keys[v === 1 ? 'member' : 'reader'].seed),
    };
  });
  const pages = [1, 2].map((v) => {
    const r = requests[v - 1],
      request = json([...requestValues(r, v), r.signature]);
    return [false, true].map((full) => {
      const p = {
        request: hash(request),
        through: full ? 1 : 0,
        next: full ? 1 : 0,
        entries: full
          ? [
              {
                envelope: hex(encode(envelopeParts(env))),
                proof: hex(json(responseValues(responses[1]))),
              },
            ]
          : [],
      };
      return { ...p, signature: signBytes(json(pageValues(p, v)), keys.acceptance.seed) };
    });
  });
  const events = [
    {
      submission: hex(encode(submissionWireParts(submissions[0]))),
      response: hex(json(responseValues(responses[1]))),
    },
  ];
  // Second fixed event is a refusal at position two; its bytes and ordinal both extend the witness.
  const e2 = encrypted(
    { ...initial, seq: 2, gen: 2, nonce: 'ac'.repeat(12) },
    body,
    kg,
    keys.member.seed,
  );
  const s2 = { lineage: base.lineage, envelope: hex(encode(envelopeParts(e2))), parent: null };
  s2.signature = signBytes(encode(submissionParts(s2)), keys.member.seed);
  const r2 = { ...refusal, position: 2, digest: e2.digest };
  r2.signature = signBytes(encode(refusalParts(r2)), keys.acceptance.seed);
  events.push({
    submission: hex(encode(submissionWireParts(s2))),
    response: hex(json(responseValues({ kind: 'refused', refusal: r2 }))),
  });
  let previous = zero;
  for (const [i, e] of events.entries()) {
    e.previous = previous;
    e.ordinal = i + 1;
    e.hash = hash(encode(chainParts(previous, i + 1, e.submission, e.response)));
    previous = e.hash;
  }
  const scope = {
    workspace: base.workspace,
    credential: base.credential,
    lineage: base.lineage,
    head: base.head,
    request: base.request,
  };
  const witness = { events: events.length, hash: previous };
  witness.signature = signBytes(encode(witnessParts(scope, witness)), keys.acceptance.seed);
  return {
    keys,
    base,
    body,
    kg,
    envelopes,
    subject,
    refusal,
    head,
    responses,
    submissions,
    requests,
    pages,
    events,
    scope,
    witness,
  };
}
function paths(value, path = []) {
  return Array.isArray(value) && value.length
    ? value.flatMap((v, i) => paths(v, [...path, i]))
    : [path];
}
const changed = (v) =>
  typeof v === 'number'
    ? v + 1
    : typeof v === 'boolean'
      ? !v
      : Array.isArray(v)
        ? [0]
        : v.length && /^[0-9a-f]+$/.test(v)
          ? (v[0] === 'a' ? 'b' : 'a') + v.slice(1)
          : v + '~';
function alter(parts, at, path, omit) {
  const next = structuredClone(parts),
    p = next[at];
  if (!path.length) {
    if (omit) next.splice(at, 1);
    else
      p.value =
        p.codec === 'raw'
          ? p.value.length
            ? (p.value[0] === 'a' ? 'b' : 'a') + p.value.slice(1)
            : '00'
          : changed(p.value);
  } else {
    let into = p.value;
    for (const i of path.slice(0, -1)) into = into[i];
    const last = path.at(-1);
    if (omit) into.splice(last, 1);
    else into[last] = changed(into[last]);
  }
  return next;
}
export function vectors(f = fixture()) {
  const out = [];
  const add = (id, kind, parts, signer = null, extra = {}) => {
    const evaluate = (parts) => {
      const msg = encode(parts);
      return kind === 'signature'
        ? signBytes(
            msg,
            f.keys[
              signer === 'transport-acceptance'
                ? 'acceptance'
                : signer === 'transport-reader'
                  ? 'reader'
                  : 'member'
            ].seed,
          )
        : kind === 'digest'
          ? hash(msg)
          : kind === 'kdf'
            ? Buffer.from(hkdfSync('sha256', b(f.kg), Buffer.alloc(0), msg, 32)).toString('hex')
            : kind === 'aead'
              ? (() => {
                  const e = f.envelopes[id.includes('v1') ? 0 : 1],
                    key = Buffer.from(
                      hkdfSync('sha256', b(f.kg), Buffer.alloc(0), encode(keyParts(e)), 32),
                    ),
                    cipher = createCipheriv('aes-256-gcm', key, b(e.nonce));
                  cipher.setAAD(msg);
                  return hex(
                    Buffer.concat([
                      cipher.update(encode(bodyParts(f.body))),
                      cipher.final(),
                      cipher.getAuthTag(),
                    ]),
                  );
                })()
              : hex(msg);
    };
    const result = evaluate(parts),
      make = (omit) =>
        parts.flatMap((p, at) =>
          (p.codec === 'json' ? paths(p.value) : [[]]).map((path) => {
            const altered = alter(parts, at, path, omit);
            return {
              field: [p.name, ...path].join('.'),
              parts: altered,
              messageHex: hex(encode(altered)),
              resultHex: evaluate(altered),
            };
          }),
        );
    out.push({
      id,
      kind,
      signer,
      parts,
      expected: {
        messageHex: hex(encode(parts)),
        resultHex: result,
        ...(kind === 'signature' ? { signature: result } : {}),
        ...extra,
      },
      negatives: make(false),
      encodedBindingControls: make(true),
    });
  };
  add('transport-envelope-body', 'carrier', bodyParts(f.body));
  for (const e of f.envelopes) {
    const tag = 'transport-envelope-v' + e.v;
    add(tag + '-kdf', 'kdf', keyParts(e));
    add(tag + '-aad', 'aead', headerParts(e, 'done/env/v' + e.v));
    add(tag + '-signature', 'signature', signatureParts(e), 'transport-member');
    add(tag + '-wire', 'carrier', envelopeParts(e));
  }
  add('transport-refusal', 'signature', refusalParts(f.refusal), 'transport-acceptance');
  add('transport-refusal-id', 'digest', refusalParts(f.refusal));
  add('transport-accepted-link', 'digest', linkParts(f.subject, zero));
  add('transport-accepted-head', 'signature', headParts(f.head), 'transport-acceptance');
  for (const r of f.responses)
    add('transport-response-' + r.kind, 'carrier', [part('frame', 'json', responseValues(r))]);
  for (const [i, s] of f.submissions.entries()) {
    const tag = 'transport-submission-' + (i ? 'successor' : 'first');
    add(tag, 'signature', submissionParts(s), 'transport-member');
    add(tag + '-wire', 'carrier', submissionWireParts(s));
  }
  add('transport-submit-carrier', 'carrier', [
    part('frame', 'json', [
      'done/private-submit/v1',
      1,
      f.base.workspace,
      hex(encode(submissionWireParts(f.submissions[0]))),
    ]),
  ]);
  for (const v of [1, 2]) {
    const r = f.requests[v - 1],
      unsigned = requestValues(r, v),
      wire = [...unsigned, r.signature];
    add(
      'transport-read-v' + v,
      'signature',
      [part('frame', 'json', unsigned)],
      v === 1 ? 'transport-member' : 'transport-reader',
    );
    add('transport-read-v' + v + '-wire', 'carrier', [part('frame', 'json', wire)]);
    add('transport-read-v' + v + '-hash', 'digest', [part('frame', 'json', wire)]);
    for (const [i, p] of f.pages[v - 1].entries()) {
      const tag = 'transport-page-v' + v + '-' + (i ? 'full' : 'empty'),
        unsigned = pageValues(p, v);
      add(tag, 'signature', [part('frame', 'json', unsigned)], 'transport-acceptance');
      add(tag + '-wire', 'carrier', [part('frame', 'json', [...unsigned, p.signature])]);
    }
  }
  for (const e of f.events)
    add(
      'transport-service-chain-' + e.ordinal,
      'digest',
      chainParts(e.previous, e.ordinal, e.submission, e.response),
    );
  add(
    'transport-service-witness',
    'signature',
    witnessParts(f.scope, f.witness),
    'transport-acceptance',
  );
  return out;
}
export const corpus = () => {
  const f = fixture();
  return {
    v: 1,
    scope:
      'Private transport and acceptance bytes; synthetic keys, no current membership or freshness implied',
    fixture: f,
    vectors: vectors(f),
  };
};
