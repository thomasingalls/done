import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, hkdfSync, sign } from 'node:crypto';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { membershipRotationFixture } from './rotation-fixtures.mjs';
import { lp, hash, link, head, response } from '../account-decisions/oracle.mjs';
const result = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-membership/generations-entry.ts'), formats: ['es'] },
  },
});
const code = (Array.isArray(result) ? result[0] : result).output.find(
  (o) => o.type === 'chunk',
).code;
const dir = mkdtempSync(join(tmpdir(), 'done-generation-replay-')),
  path = join(dir, 'client.mjs');
writeFileSync(path, code);
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
const client = await import(pathToFileURL(path).href);
const zero = '00'.repeat(32),
  bytes = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const json = (x) => new Uint8Array(Buffer.from(JSON.stringify(x)));
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
// Independent Node/OpenSSL envelope construction, with distinct real AES keys per generation.
function envelope(x, update, generation, epoch, position, key) {
  const id = x.f.context.existing.id,
    workspace = x.p.workspaceId;
  const h = ['2', workspace, id, String(epoch), String(generation), String(position)];
  const body = Buffer.concat([
    lp('done/env-body/v1', x.p.principalId, 'human'),
    u32(1),
    u32(update.length),
    update,
  ]);
  const net = hkdfSync(
    'sha256',
    key,
    Buffer.alloc(0),
    lp('done/envelope/v2', workspace, id, String(generation)),
    32,
  );
  const nonce = Buffer.alloc(12, position),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(net), nonce);
  cipher.setAAD(lp('done/env/v2', ...h));
  const ct = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]),
    digest = hash(ct);
  const signature = sign(
    null,
    lp('done/env-sig/v2', ...h, nonce.toString('hex'), digest),
    x.f.keys.existing,
  );
  return {
    wire: new Uint8Array(
      Buffer.concat([
        lp('done/envelope-wire/v2', ...h),
        nonce,
        Buffer.from(digest, 'hex'),
        u32(ct.length),
        ct,
        signature,
      ]),
    ),
    subject: { workspace, credential: id, position, epoch, digest },
  };
}
async function fixture() {
  const x = await membershipRotationFixture();
  const keys = new Map([
    [1, new Uint8Array(32).fill(41)],
    [2, new Uint8Array(32).fill(42)],
  ]);
  const doc = new client.Y.Doc();
  doc.getText('master').insert(0, 'before');
  const old = client.Y.encodeStateAsUpdate(doc),
    vector = client.Y.encodeStateVector(doc);
  doc.getText('master').insert(6, ' after');
  const next = client.Y.encodeStateAsUpdate(doc, vector);
  doc.destroy();
  const one = envelope(x, old, 1, 3, 1, keys.get(1));
  const cut = link(one.subject, zero);
  const proof = x.rotate(
    undefined,
    x.p.heads.map((h) =>
      h.credentialId === one.subject.credential ? { ...h, position: 1, link: cut } : h,
    ),
  );
  const { history } = await client.verifyMembershipChain(
    { ...x.proofs, continuations: [proof] },
    x.f.f.base,
  );
  const route = {
    workspace: x.p.workspaceId,
    credential: one.subject.credential,
    principal: x.p.principalId,
    epoch: 4,
    generation: 2,
    history,
  };
  const oldRoute = client.captureRouteAt(route, 3);
  const two = envelope(x, next, 2, 4, 2, keys.get(2));
  const pub = await crypto.subtle.importKey('raw', bytes(history.signingKey), 'Ed25519', false, [
    'verify',
  ]);
  return { x, keys, history, route, oldRoute, one, two, old, next, cut, pub };
}
test('retained source, spool and delivery records resolve their own authenticated generation', async () => {
  const f = await fixture();
  assert.equal(f.oldRoute.generation, 1);
  const sources = [f.oldRoute, f.route].map((route, i) =>
    client.makeSourceCapsule(route, [
      { actor: route.principal, kind: 'human', bytes: i ? f.next : f.old },
    ]),
  );
  const capsules = sources.map((b) => client.decodeSourceCapsule(b, f.route));
  assert.deepEqual(
    capsules.map((c) => c.generation),
    [1, 2],
  );
  const state = {
    sources: new Map(capsules.map((c, i) => [c.id, sources[i]])),
    positions: [f.one, f.two].map((w, i) => ({
      position: i + 1,
      source: { id: capsules[i].id, index: 0, hash: hash(sources[i]) },
      attempts: [i + 1],
      wire: w.wire,
    })),
  };
  await client.verifySpool(state, f.route, f.keys, f.pub, crypto.subtle);
  await assert.rejects(
    client.verifySpool(state, f.route, new Map([[2, f.keys.get(2)]]), f.pub, crypto.subtle),
    /No retained opener/,
  );
  await assert.rejects(
    client.verifySpool(
      state,
      f.route,
      new Map([
        [1, f.keys.get(2)],
        [2, f.keys.get(1)],
      ]),
      f.pub,
      crypto.subtle,
    ),
  );
  const oldEntry = client.encodeSpoolEntry(
    { type: 'envelope', position: 1, attempt: 1, wire: f.one.wire },
    f.oldRoute,
  );
  assert.deepEqual(client.decodeSpoolEntry(oldEntry, f.route).wire, f.one.wire);
  const changed = JSON.parse(new TextDecoder().decode(oldEntry));
  changed[6] = 2;
  assert.throws(() => client.decodeSpoolEntry(json(changed), f.route));
  const accepted = response({
    kind: 'accepted',
    head: head(f.one.subject, zero, 3, f.x.f.f.keys.acceptance),
    leaf: { epoch: 3, digest: f.one.subject.digest },
  });
  const oldAuthority = f.history.authorities.find((a) => a.tip === 3);
  const delivery = client.encodeDeliveryEntry(
    { type: 'response', position: 1, wire: accepted },
    f.oldRoute,
    oldAuthority,
  );
  assert.deepEqual(client.decodeDeliveryEntry(delivery, f.route, f.history.current).wire, accepted);
});
function packet(f, wire, previous) {
  const a = f.history.current;
  const requestFields = [
    'done/private-read/v2',
    2,
    f.x.p.pin.serviceId,
    f.x.p.pin.origin,
    a.workspace,
    f.route.credential,
    f.route.credential,
    a.lineage,
    a.head,
    4,
    wire.subject.position - 1,
    1,
    'af'.repeat(32),
    30000,
  ];
  const request = json([
    ...requestFields,
    sign(null, json(requestFields), f.x.f.keys.existing).toString('hex'),
  ]);
  const proof = response({
    kind: 'accepted',
    head: head(wire.subject, previous, wire.subject.epoch, f.x.f.f.keys.acceptance),
    leaf: { epoch: wire.subject.epoch, digest: wire.subject.digest },
  });
  const pageFields = [
    'done/private-read-page/v2',
    2,
    hash(request),
    wire.subject.position,
    wire.subject.position,
    [[Buffer.from(wire.wire).toString('hex'), Buffer.from(proof).toString('hex')]],
  ];
  return {
    request,
    page: json([
      ...pageFields,
      sign(null, json(pageFields), f.x.f.f.keys.acceptance).toString('hex'),
    ]),
  };
}
test('inbound replay opens old and successor envelopes without accepting a key or generation hint from the wire', async () => {
  const f = await fixture();
  const context = {
    baseline: { kind: 'promotion-genesis', id: hash('test baseline') },
    service: { id: f.x.p.pin.serviceId, origin: f.x.p.pin.origin },
    authority: f.history.current,
    history: f.history,
    creatingCredential: f.route.credential,
    reader: { id: f.route.credential, publicKey: f.history.signingKey, active: true },
    publisher: {
      id: f.route.credential,
      publicKey: f.history.signingKey,
      principal: f.route.principal,
      system: true,
      active: true,
    },
    generation: 2,
    generationKey: f.keys.get(2),
    retainedGenerationKeys: new Map([[1, f.keys.get(1)]]),
    prefix: { position: 0, link: zero, observedThrough: 0 },
  };
  const lifetime = { assertCurrent() {}, now: () => 1000 };
  const first = packet(f, f.one, zero);
  const result = await client.verifyInboundPage(context, first.request, first.page, lifetime);
  assert.equal(result.kind, 'received');
  assert.deepEqual(result.updates, [f.old]);
  await assert.rejects(
    client.verifyInboundPage(
      { ...context, retainedGenerationKeys: new Map() },
      first.request,
      first.page,
      lifetime,
    ),
    /No retained opener/,
  );
  const second = packet(f, f.two, f.cut);
  const next = await client.verifyInboundPage(
    { ...context, prefix: { position: 1, link: f.cut, observedThrough: 1 } },
    second.request,
    second.page,
    lifetime,
  );
  assert.equal(next.kind, 'received');
  assert.deepEqual(next.updates, [f.next]);
  assert(f.keys.get(1).every((b) => b === 41));
  assert(f.keys.get(2).every((b) => b === 42));
  await assert.rejects(
    client.verifyInboundPage(
      {
        ...context,
        generation: 1,
        generationKey: f.keys.get(1),
        retainedGenerationKeys: new Map(),
      },
      first.request,
      first.page,
      lifetime,
    ),
  );
});
