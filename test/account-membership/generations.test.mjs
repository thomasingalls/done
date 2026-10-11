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
    rollupOptions: { output: { codeSplitting: false } },
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
  return { x, keys, history, route, oldRoute, one, two, old, next, cut, pub, proof };
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
  // Self progress uses each decision/source at its authenticated historical epoch,
  // including the pre-rotation acceptance retained by the surviving publisher.
  const receipts = client.emptyDelivery();
  const wires = [
    accepted,
    response({
      kind: 'accepted',
      head: head(f.two.subject, f.cut, 4, f.x.f.f.keys.acceptance),
      leaf: { epoch: 4, digest: f.two.subject.digest },
    }),
  ];
  for (const [i, wire] of wires.entries()) {
    const subject = [f.one, f.two][i].subject;
    const decision = await client.verifyDeliveryDecision(
      wire,
      { ...subject, previous: i ? f.cut : zero, parent: zero },
      f.history.current,
      f.route,
      crypto.subtle,
    );
    assert.equal(decision.kind, 'accepted');
    client.applyDecision(receipts, decision);
    receipts.responses.set(i + 1, [wire]);
  }
  const own = client.emptyInbound();
  const records = [f.old, f.next].map((bytes, i) => ({
    seq: i + 1,
    gen: i + 1,
    kind: 'update',
    bytes,
  }));
  client.advanceSelfReceive(
    { spool: state, entries: [], ledger: [] },
    receipts,
    own,
    f.route,
    (updates) => client.verifyInboundCoverage(records, updates),
  );
  assert.equal(own.prefix.position, 2);
  assert.equal(own.prefix.link, link(f.two.subject, f.cut));
});
function packet(f, wire, previous, a = f.history.current, through = wire.subject.position) {
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
    a.tip,
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
    through,
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

test('cold replay uses the stored page epoch cut, never a later membership cutoff', async () => {
  const f = await fixture();
  const secondOld = envelope(f.x, f.next, 1, 3, 2, f.keys.get(1));
  const laterCut = link(secondOld.subject, f.cut);
  const rotation = f.x.rotate(
    undefined,
    f.x.p.heads.map((h) =>
      h.credentialId === f.route.credential ? { ...h, position: 2, link: laterCut } : h,
    ),
  );
  const { history } = await client.verifyMembershipChain(
    { ...f.x.proofs, continuations: [rotation] },
    f.x.f.f.base,
  );
  const authority = history.authorities.find((a) => a.tip === 3);
  const context = {
    baseline: { kind: 'promotion-genesis', id: hash('historical page') },
    service: { id: f.x.p.pin.serviceId, origin: f.x.p.pin.origin },
    authority,
    history,
    creatingCredential: f.route.credential,
    reader: { id: f.route.credential, publicKey: history.signingKey, active: true },
    publisher: {
      id: f.route.credential,
      publicKey: history.signingKey,
      principal: history.principal,
      system: true,
      active: true,
    },
    generation: 2,
    generationKey: f.keys.get(2),
    retainedGenerationKeys: new Map([[1, f.keys.get(1)]]),
    prefix: { position: 0, link: zero, observedThrough: 0 },
  };
  const lifetime = { assertCurrent() {}, now: () => 1000 };
  const first = packet(f, f.one, zero, authority);
  const received = await client.verifyInboundPage(context, first.request, first.page, lifetime);
  assert.equal(received.kind, 'received');
  const cold = await client.verifyStoredInbound(context, received.record, lifetime);
  assert.equal(cold.kind, 'received');
  assert.deepEqual(cold.updates, [f.old]);
  // A historical request may advertise newer accepted work while returning this old envelope.
  const beyond = packet(f, f.one, zero, authority, 3);
  assert.equal(
    (await client.verifyInboundPage(context, beyond.request, beyond.page, lifetime)).kind,
    'received',
  );
  const atCurrent = packet(f, f.one, zero, history.current);
  await assert.rejects(
    client.verifyInboundPage(
      { ...context, authority: history.current },
      atCurrent.request,
      atCurrent.page,
      lifetime,
    ),
    /prefix/,
  );
});

test('incremental replay matches the full ledger across retained and current generation decisions', async () => {
  const f = await fixture();
  const base = {
    authority: f.history.current,
    generation: 2,
    generationKey: f.keys.get(2),
    retainedGenerationKeys: new Map([[1, f.keys.get(1)]]),
    publisher: { id: f.route.credential },
  };
  const counter = { v: 2, spool: client.emptySpoolWitness() };
  const memo = client.createVerificationMemo(),
    reuse = { memo, current: () => {} };
  let records = [],
    value = {
      census: client.inspectInbound([], f.route, base),
      delivery: client.emptyDelivery(),
      inbound: client.emptyInbound(),
    };
  value.indexes = await client.indexVerifiedLedger(value, records, f.route, counter, crypto.subtle);
  let installed;
  for (const [i, route] of [f.oldRoute, f.route].entries()) {
    if (i === 1) {
      installed = {
        v: 1,
        proofs: { ...f.x.proofs, continuations: [f.proof] },
        cuts: [{ epoch: 4, head: f.proof.head, before: { ...counter.spool } }],
      };
      // Adoption fully verifies the retained prefix, then rebuilds indexes under the new
      // authority. Historical events are never eligible as new appends after this boundary.
      await client.verifyInstalledMembership(
        value.census.delivery.spool,
        f.history,
        installed,
        3,
        crypto.subtle,
      );
      memo.clear();
      value.indexes = await client.indexVerifiedLedger(
        value,
        records,
        route,
        counter,
        crypto.subtle,
      );
      assert.equal(value.indexes.epoch, 3, 'last retained event predates installed epoch 4');
      const staleProof = response({
        kind: 'accepted',
        head: head(f.one.subject, zero, 3, f.x.f.f.keys.acceptance, true),
        leaf: { epoch: 3, digest: f.one.subject.digest },
      });
      const stale = {
        kind: 'heads',
        seq: records.length + 1,
        gen: 2,
        bytes: client.encodeDeliveryEntry(
          { type: 'response', position: 1, wire: staleProof },
          f.oldRoute,
          f.history.authorities.find((a) => a.tip === 3),
        ),
      };
      const staleRows = [...records, stale];
      const staleCounter = {
        ...counter,
        spool: await client.extendSpoolWitness(counter.spool, stale.bytes, crypto.subtle),
      };
      const staleCensus = client.inspectInbound(staleRows, route, base);
      await assert.rejects(
        client.verifyInstalledMembership(
          staleCensus.delivery.spool,
          f.history,
          installed,
          3,
          crypto.subtle,
        ),
        /Ledger crosses membership adoption/,
      );
      await assert.rejects(
        client.extendAccountLedger(
          value,
          records,
          staleRows,
          route,
          staleCounter,
          base,
          f.pub,
          crypto.subtle,
          reuse,
        ),
        /authority/,
        'a valid old-epoch decision must fail immediately, not wait for audit/cold open',
      );
    }
    const wire = [f.one, f.two][i],
      update = [f.old, f.next][i];
    const source = client.makeSourceCapsule(route, [
      { actor: route.principal, kind: 'human', bytes: update },
    ]);
    const capsule = client.decodeSourceCapsule(source, f.route);
    const proof = response({
      kind: 'accepted',
      head: head(wire.subject, i ? f.cut : zero, route.epoch, f.x.f.f.keys.acceptance),
      leaf: { epoch: route.epoch, digest: wire.subject.digest },
    });
    const authority = f.history.authorities.find((a) => a.tip === route.epoch);
    const rows = [
      ['outbound', source],
      ['update', update],
      [
        'heads',
        client.encodeSpoolEntry(
          {
            type: 'position',
            position: i + 1,
            source: { id: capsule.id, index: 0, hash: hash(source) },
          },
          route,
        ),
      ],
      [
        'heads',
        client.encodeSpoolEntry({ type: 'attempt', position: i + 1, attempt: i + 1 }, route),
      ],
      [
        'outbound',
        client.encodeSpoolEntry(
          { type: 'envelope', position: i + 1, attempt: i + 1, wire: wire.wire },
          route,
        ),
      ],
      [
        'heads',
        client.encodeDeliveryEntry(
          { type: 'response', position: i + 1, wire: proof },
          route,
          authority,
        ),
      ],
    ];
    for (const [offset, [kind, bytes]] of rows.entries()) {
      const next = [...records, { kind, bytes, seq: records.length + 1, gen: 2 }];
      if (offset >= 2)
        counter.spool = await client.extendSpoolWitness(counter.spool, bytes, crypto.subtle);
      const delta = await client.extendAccountLedger(
        value,
        records,
        next,
        route,
        counter,
        base,
        f.pub,
        crypto.subtle,
        reuse,
      );
      assert.ok(delta, 'generation delta stays eligible');
      const inbound = structuredClone(value.inbound);
      client.advanceSelfReceive(
        delta.census.delivery,
        delta.delivery,
        inbound,
        f.route,
        (u) => client.verifyInboundCoverage(next, u),
        value.delivery.acceptedThrough,
      );
      const census = client.inspectInbound(next, f.route, base);
      if (installed)
        await client.verifyInstalledMembership(
          census.delivery.spool,
          f.history,
          installed,
          3,
          crypto.subtle,
        );
      await client.verifySpool(census.delivery.spool, f.route, f.keys, f.pub, crypto.subtle);
      const delivery = await client.verifyDelivery(
        census.delivery,
        f.route,
        base.authority,
        f.pub,
        crypto.subtle,
      );
      const full = client.emptyInbound();
      client.advanceSelfReceive(census.delivery, delivery, full, f.route, (u) =>
        client.verifyInboundCoverage(next, u),
      );
      value = { ...delta, inbound };
      records = next;
      assert.equal(client.sameAccountLedger(value, { census, delivery, inbound: full }), true);
    }
  }
  assert.equal(value.delivery.acceptedThrough, 2);
  assert.equal(value.inbound.prefix.position, 2);
  memo.clear();
});
