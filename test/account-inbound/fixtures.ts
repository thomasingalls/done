/** Synthetic independent Node/OpenSSL wire oracle. No production encoders or real credentials. */
import {
  createCipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
} from 'node:crypto';
import { Y } from '../../src/crdt/yjs';
import type { DecisionAuthority, Bytes } from '../../account-protocol/positionDecision';

export const ZERO = '00'.repeat(32);
export const A = '11'.repeat(16),
  B = '22'.repeat(16),
  READER = '33'.repeat(16);
export const fields = (...items: string[]) =>
  Buffer.concat(
    items.map((s) => {
      const b = Buffer.from(s),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
export const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const key = (byte: string) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
const keys = { [A]: key('41'), [B]: key('42'), [READER]: key('43') };
const acceptance = key('44');
const pub = (k: ReturnType<typeof key>) =>
  createPublicKey(k).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
export interface Authority extends DecisionAuthority {
  serviceId: string;
  origin: string;
  reader: string;
  generation: number;
  members: Record<string, { publicKey: string; principal: string; active: boolean }>;
}
export const authority = (): Authority => ({
  workspace: '55'.repeat(16),
  lineage: '66'.repeat(32),
  head: '77'.repeat(32),
  tip: 1,
  acceptanceKey: pub(acceptance),
  serviceId: '88'.repeat(16),
  origin: 'https://fixture.invalid',
  reader: READER,
  generation: 1,
  members: Object.fromEntries(
    Object.entries(keys).map(([id, k]) => [id, { publicKey: pub(k), principal: id, active: true }]),
  ),
});
export const generationKey = new Uint8Array(32).fill(91);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const json = (v: unknown): Bytes => new Uint8Array(Buffer.from(JSON.stringify(v)));
export interface Source {
  publisher: string;
  updates: Bytes[];
}
export interface FixtureEntry extends Source {
  position: number;
  previous: string;
  link: string;
  digest: string;
  envelope: Bytes;
  proof: Bytes;
}
export function entry(
  source: Source,
  position: number,
  previous = ZERO,
  options: {
    epoch?: number;
    generation?: number;
    actor?: string;
    actorKind?: string;
    final?: boolean;
    nonceByte?: number;
  } = {},
): FixtureEntry {
  const a = authority(),
    epoch = options.epoch ?? 1,
    generation = options.generation ?? 1;
  const h = [
    '2',
    a.workspace,
    source.publisher,
    String(epoch),
    String(generation),
    String(position),
  ];
  const body = Buffer.concat([
    fields('done/env-body/v1', options.actor ?? source.publisher, options.actorKind ?? 'human'),
    u32(source.updates.length),
    ...source.updates.flatMap((u) => [u32(u.length), u]),
  ]);
  const net = hkdfSync(
    'sha256',
    generationKey,
    Buffer.alloc(0),
    fields('done/envelope/v2', a.workspace, source.publisher, String(generation)),
    32,
  );
  // Deterministic fixture-only nonce. Production allocation/randomness is deliberately not modeled.
  const nonce = Buffer.alloc(12, options.nonceByte ?? position),
    c = createCipheriv('aes-256-gcm', Buffer.from(net), nonce);
  c.setAAD(fields('done/env/v2', ...h));
  const ct = Buffer.concat([c.update(body), c.final(), c.getAuthTag()]),
    digest = hash(ct);
  const sig = sign(
    null,
    fields('done/env-sig/v2', ...h, nonce.toString('hex'), digest),
    keys[source.publisher]!,
  );
  const envelope = new Uint8Array(
    Buffer.concat([
      fields('done/envelope-wire/v2', ...h),
      nonce,
      Buffer.from(digest, 'hex'),
      u32(ct.length),
      ct,
      sig,
    ]),
  );
  const link = hash(
    fields(
      'done/accept/v1',
      a.workspace,
      source.publisher,
      String(position),
      String(epoch),
      digest,
      previous,
    ),
  );
  const final = options.final ?? false;
  const proof = json([
    'done/position-response/v1',
    1,
    'accepted',
    a.workspace,
    source.publisher,
    position,
    link,
    1,
    final,
    epoch,
    digest,
    sign(
      null,
      fields(
        'done/accept-head/v1',
        a.workspace,
        source.publisher,
        String(position),
        link,
        '1',
        String(final),
      ),
      acceptance,
    ).toString('hex'),
  ]);
  return { ...source, position, previous, link, digest, envelope, proof };
}
export interface Packet {
  request: Bytes;
  page: Bytes;
}
export function packet(e: FixtureEntry, through = e.position, nonce = 1, reader = READER): Packet {
  const a = authority();
  const requestFields = [
    'done/private-read/v2',
    2,
    a.serviceId,
    a.origin,
    a.workspace,
    reader,
    e.publisher,
    a.lineage,
    a.head,
    1,
    e.position - 1,
    1,
    nonce.toString(16).padStart(64, '0'),
    30000,
  ];
  const request = json([
    ...requestFields,
    sign(null, json(requestFields), keys[reader]!).toString('hex'),
  ]);
  const pageFields = [
    'done/private-read-page/v2',
    2,
    hash(request),
    through,
    e.position,
    [[Buffer.from(e.envelope).toString('hex'), Buffer.from(e.proof).toString('hex')]],
  ];
  return {
    request,
    page: json([...pageFields, sign(null, json(pageFields), acceptance).toString('hex')]),
  };
}
export function sources() {
  const root = new Y.Doc(),
    one = new Y.Doc(),
    two = new Y.Doc();
  root.clientID = 1000;
  one.clientID = 1001;
  two.clientID = 1002;
  const change = (doc: InstanceType<typeof Y.Doc>, f: () => void): Bytes => {
    const sv = Y.encodeStateVector(doc);
    f();
    return new Uint8Array(Y.encodeStateAsUpdate(doc, sv));
  };
  try {
    root.getText('master').insert(0, 'base');
    const baseline = new Uint8Array(Y.encodeStateAsUpdate(root));
    Y.applyUpdate(one, baseline);
    Y.applyUpdate(two, baseline);
    const a1 = change(one, () => one.getText('master').insert(4, 'X'));
    Y.applyUpdate(two, a1);
    const b1 = change(two, () => two.getText('master').insert(5, 'Y'));
    const b2 = change(two, () => two.getText('master').delete(4, 1));
    const a2 = change(one, () => one.getText('master').insert(5, 'Z'));
    const aa1 = entry({ publisher: A, updates: [a1] }, 1),
      aa2 = entry({ publisher: A, updates: [a2] }, 2, aa1.link);
    const bb1 = entry({ publisher: B, updates: [b1] }, 1),
      bb2 = entry({ publisher: B, updates: [b2] }, 2, bb1.link);
    const entries = [aa1, aa2, bb1, bb2];
    for (const e of entries) for (const u of e.updates) Y.applyUpdate(root, u);
    return {
      baseline,
      baselineId: hash('synthetic independently admitted genesis'),
      entries,
      expected: root.getText('master').toString(),
    };
  } finally {
    root.destroy();
    one.destroy();
    two.destroy();
  }
}
