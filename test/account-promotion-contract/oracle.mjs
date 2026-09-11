// Independent Node/OpenSSL reconstruction; no production encoders, parsers or KDF helpers.
import { createHash, createHmac, hkdfSync } from 'node:crypto';
import {
  fixedFixture,
  ordered,
  pendingBody,
  signed,
  bindingFields,
  lp as asciiLP,
} from '../account-first-authority/oracle.mjs';
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));
export const hex = (b) => Buffer.from(b).toString('hex');
export function lp(...values) {
  return Buffer.concat(
    values.map((s) => {
      if (
        typeof s !== 'string' ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)
      )
        throw Error('Invalid Unicode');
      const b = Buffer.from(s, 'utf8'),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
}
export const stages = [
  [1, 'reserved'],
  [1, 'prepared'],
  [2, 'genesis-prepared'],
  [3, 'admission-requested'],
  [3, 'admission-offered'],
  [3, 'admission-receipted'],
  [4, 'handoff-prepared'],
  [4, 'handoff-selected'],
  [5, 'account-active'],
  [6, 'account-capturing'],
  [7, 'account-spooling'],
  [8, 'account-delivering'],
  [9, 'account-receiving'],
];
export function fixture() {
  const f = fixedFixture();
  const binding = {
    v: 1,
    kind: 'promotion-slot-binding',
    requestDigest: f.epoch.requestDigest,
    epochHead: f.offer.head,
    stored: {
      binding: f.binding,
      bindingSignature: signed(f.keys.authority, asciiLP(...bindingFields(f.binding))),
    },
  };
  return {
    root: '80'.repeat(32),
    retryKey: Buffer.alloc(32, 129).toString('base64url'),
    source: {
      slotId: 'Local-é-🗝',
      principalId: f.candidate.principalId,
      workspaceId: f.candidate.workspaceId,
      storeId: '82'.repeat(16),
      rootId: '83'.repeat(16),
      genesisIntentId: '84'.repeat(16),
      generation: 1,
    },
    pin: f.pin,
    account: pendingBody(f.pending),
    genesis: ordered('candidate', f.candidate),
    admission: {
      request: ordered('request', f.request),
      offer: ordered('offer', f.offer),
      completion: ordered('completion', f.completion),
      receipt: ordered('receipt', f.receipt),
    },
    handoff: {
      binding,
      destination: {
        id: 'Local-é-🗝',
        status: 'active',
        unlockBinding: structuredClone(binding.stored),
        account: {
          v: 1,
          promotionId: '85'.repeat(16),
          requestDigest: f.epoch.requestDigest,
          epochHead: f.offer.head,
        },
        stores: [
          {
            principal: f.candidate.principalId,
            workspace: f.candidate.workspaceId,
            dbName: 'done.fixture.encrypted',
          },
        ],
      },
    },
  };
}
export function record(f, v, stage) {
  const credentialIds = ['86'.repeat(16), '87'.repeat(16)];
  const r = {
    v,
    kind: 'local-promotion',
    id: '85'.repeat(16),
    source: structuredClone(f.source),
    claimMac: '88'.repeat(32),
    pin: structuredClone(f.pin),
    account: structuredClone(f.account),
    retryHash: hash(lp('done/promotion-attempt/v1', f.retryKey)),
    custodyMac: '89'.repeat(32),
    sealReserved: 5,
    credentialIds,
    stage,
    credentials:
      stage === 'reserved'
        ? null
        : credentialIds.map((id, i) => ({
            role: i === 0 ? 'wrapping' : 'signing',
            id,
            publicKey: bytes((i === 0 ? '90' : '91').repeat(32)),
            sealed: {
              v: 2,
              nonce: bytes((i === 0 ? '92' : '93').repeat(12)),
              ct: bytes((i === 0 ? '94' : '95').repeat(48)),
            },
          })),
    mac: new Uint8Array(32),
  };
  if (v >= 2) r.genesis = structuredClone(f.genesis);
  if (v >= 3) {
    r.admission = structuredClone(f.admission);
    if (stage === 'admission-requested')
      r.admission.offer = r.admission.completion = r.admission.receipt = null;
    if (stage === 'admission-offered') r.admission.receipt = null;
  }
  if (v >= 4) r.handoff = structuredClone(f.handoff);
  return r;
}
const bindingBody = (p) => ({
  v: p.v,
  kind: p.kind,
  requestDigest: p.requestDigest,
  epochHead: p.epochHead,
  stored: {
    binding: Object.fromEntries(
      ['v', 'accountId', 'principalId', 'rpId', 'epoch', 'credId', 'publicKey'].map((k) => [
        k,
        p.stored.binding[k],
      ]),
    ),
    bindingSignature: p.stored.bindingSignature,
  },
});
export function payload(r) {
  const a = [
    'done/local-promotion/v1',
    r.v,
    r.kind,
    r.id,
    [
      'slotId',
      'principalId',
      'workspaceId',
      'storeId',
      'rootId',
      'genesisIntentId',
      'generation',
    ].map((k) => r.source[k]),
    r.claimMac,
    ['v', 'serviceId', 'origin', 'rpId', 'authRoot'].map((k) => r.pin[k]),
    JSON.stringify(pendingBody(r.account)),
    r.retryHash,
    r.custodyMac,
    r.sealReserved,
    r.credentialIds,
    r.stage,
    r.credentials?.map((c) => [
      c.role,
      c.id,
      hex(c.publicKey),
      c.sealed.v,
      hex(c.sealed.nonce),
      hex(c.sealed.ct),
    ]) ?? null,
  ];
  if (r.v >= 2) a.push(ordered('candidate', r.genesis));
  if (r.v >= 3)
    a.push(
      Object.fromEntries(
        ['request', 'offer', 'completion', 'receipt'].map((k) => [
          k,
          r.admission[k] === null ? null : ordered(k, r.admission[k]),
        ]),
      ),
    );
  if (r.v >= 4)
    a.push({
      binding: bindingBody(r.handoff.binding),
      destination: structuredClone(r.handoff.destination),
    });
  return a;
}
export const message = (r) => Buffer.from(JSON.stringify(payload(r)), 'utf8');
export const info = (r) =>
  lp(
    'done/local-promotion/v1',
    ...['slotId', 'principalId', 'workspaceId', 'rootId'].map((k) => r.source[k]),
  );
export const key = (root, r) =>
  Buffer.from(hkdfSync('sha256', Buffer.from(root, 'hex'), Buffer.alloc(0), info(r), 32));
export const mac = (k, b) => createHmac('sha256', k).update(b).digest('hex');
export const lineageFields = (f) => [
  'done/promotion-lineage/v1',
  f.pin.serviceId,
  f.pin.authRoot,
  f.account.accountId,
  ...['slotId', 'principalId', 'workspaceId', 'storeId', 'rootId', 'genesisIntentId'].map((k) =>
    k === 'slotId' ? 'Local-main' : f.source[k],
  ),
];
export const at = (o, p) => p.reduce((o, k) => o[k], o);
export function change(v) {
  if (v instanceof Uint8Array) {
    const b = v.slice();
    b[0] ^= 1;
    return b;
  }
  if (v === null) return 'unexpected';
  if (Array.isArray(v)) return ['unexpected'];
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') return (v[0] === 'a' ? 'b' : 'a') + v.slice(1);
  throw Error('Unsupported mutation');
}
export function paths(v, p = []) {
  if (
    v instanceof Uint8Array ||
    v === null ||
    typeof v !== 'object' ||
    (Array.isArray(v) && !v.length)
  )
    return [p];
  return Object.entries(v).flatMap(([k, x]) => paths(x, [...p, k]));
}
export function replace(o, p, v) {
  const r = structuredClone(o);
  at(r, p.slice(0, -1))[p.at(-1)] = v;
  return r;
}
export function omit(o, p) {
  const r = structuredClone(o),
    parent = at(r, p.slice(0, -1));
  if (Array.isArray(parent)) parent.splice(Number(p.at(-1)), 1);
  else delete parent[p.at(-1)];
  return r;
}
export function reverse(v) {
  if (v instanceof Uint8Array) return v.slice();
  if (Array.isArray(v)) return v.map(reverse);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .reverse()
        .map(([k, x]) => [k, reverse(x)]),
    );
  return v;
}
export function corpus() {
  const f = fixture(),
    vectors = stages.map(([v, stage]) => {
      const r = record(f, v, stage),
        body = payload(r),
        messageHex = message(r).toString('hex'),
        k = key(f.root, r);
      // Include null and empty-array leaves. The pending JSON string has its own nested matrix.
      const matrices = [
        { prefix: 'payload.', body, encode: (b) => Buffer.from(JSON.stringify(b)) },
        {
          prefix: 'pending.',
          body: JSON.parse(body[7]),
          encode: (b) => {
            const a = structuredClone(body);
            a[7] = JSON.stringify(b);
            return Buffer.from(JSON.stringify(a));
          },
        },
      ];
      return {
        id: 'promotion-' + stage,
        kind: 'mac',
        signer: null,
        v,
        stage,
        expected: { messageHex, resultHex: mac(k, Buffer.from(messageHex, 'hex')) },
        negatives: paths(r)
          .filter((p) => p[0] !== 'mac')
          .map((p) => ({ path: p })),
        encodedBindingControls: matrices.flatMap((m) =>
          paths(m.body).map((p) => ({
            matrix: m.prefix,
            path: p,
            omittedMessageHash: hash(m.encode(omit(m.body, p))),
          })),
        ),
      };
    });
  const r = record(f, 1, 'prepared');
  vectors.push({
    id: 'promotion-mac-key',
    kind: 'kdf',
    signer: null,
    expected: { messageHex: info(r).toString('hex'), resultHex: key(f.root, r).toString('hex') },
    negatives: ['root', 'slotId', 'principalId', 'workspaceId', 'rootId', 'salt', 'label'].map(
      (field) => ({ field }),
    ),
  });
  for (const [id, fields] of [
    ['promotion-lineage', lineageFields(f)],
    ['promotion-attempt', ['done/promotion-attempt/v1', f.retryKey]],
  ])
    vectors.push({
      id,
      kind: 'digest',
      signer: null,
      fields,
      expected: { messageHex: lp(...fields).toString('hex'), resultHex: hash(lp(...fields)) },
      negatives: fields.map((_, index) => ({ index })),
    });
  return { v: 1, fixture: f, vectors };
}
