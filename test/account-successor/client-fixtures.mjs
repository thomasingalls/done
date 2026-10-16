import { build } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emitBundle } from '../../scripts/lib/emitted-bundle.mjs';
import { createCipheriv, hkdfSync, sign } from 'node:crypto';
import { fixture, hash, lp } from './oracle.mjs';
import { head, response, link, ZERO } from './history-oracle.mjs';
export const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));
export const hex = (b) => Buffer.from(b).toString('hex');
export { ZERO };
export async function adapters(control) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: control
      ? [
          {
            name: 'history-control',
            enforce: 'pre',
            transform(code, id) {
              const controls = {
                'issuance-boundary': [
                  '/account-protocol/admissionHistory.ts',
                  'response.head.epoch !== (response.head.position <= h.boundary.position ? 1 : 2) ||',
                  '',
                ],
                'publisher-binding': [
                  '/src/crdt/accountInbound.ts',
                  'publisher.publicKey !== h.signingKey ||',
                  '',
                ],
              };
              const [file, before, after] = controls[control];
              if (!id.endsWith(file)) return;
              if (code.split(before).length !== 2)
                throw Error('Missing unique control anchor: ' + control);
              hits++;
              return code.replace(before, after);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      rolldownOptions: { external: ['yjs'] },
      lib: { entry: resolve('test/account-successor/client-browser.ts'), formats: ['es'] },
    },
  });
  if (control && hits !== 1) throw Error('Unapplied control');
  const emitted = emitBundle(result, resolve('test-results/account-successor-adapters'));
  try {
    return { lib: await import(pathToFileURL(emitted.entry)), clear: emitted.clear };
  } catch (error) {
    emitted.clear();
    throw error;
  }
}
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const signed = (values, key) => json([...values, sign(null, json(values), key).toString('hex')]);
export async function clientFixture(
  lib,
  { count = 4, boundary = 1, firstCurrent = boundary + 2 } = {},
) {
  const first = fixture(),
    member = first.request.certification.members[0],
    route1 = {
      workspace: first.epoch.workspaceId,
      credential: member.id,
      principal: first.epoch.principalId,
      epoch: 1,
      generation: 1,
    },
    kg = new Uint8Array(32).fill(91),
    doc = new lib.Y.Doc({ gc: false }),
    entries = [];
  let previous = ZERO;
  for (let n = 1; n <= count; n++) {
    let update;
    const handler = (u) => (update = new Uint8Array(u));
    doc.on('update', handler);
    doc.getText('writing').insert(doc.getText('writing').length, `entry ${n}; `);
    doc.off('update', handler);
    const epoch = n < firstCurrent ? 1 : 2,
      captureEpoch = n <= boundary + 2 ? 1 : 2,
      fields = ['2', route1.workspace, route1.credential, String(epoch), '1', String(n)],
      body = Buffer.concat([
        lp('done/env-body/v1', route1.principal, 'human'),
        u32(1),
        u32(update.length),
        update,
      ]),
      key = Buffer.from(
        hkdfSync(
          'sha256',
          kg,
          Buffer.alloc(0),
          lp('done/envelope/v2', route1.workspace, route1.credential, '1'),
          32,
        ),
      ),
      nonce = Buffer.alloc(12, n),
      cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(lp('done/env/v2', ...fields));
    const ct = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]),
      digest = hash(ct);
    key.fill(0);
    const envelope = new Uint8Array(
      Buffer.concat([
        lp('done/envelope-wire/v2', ...fields),
        nonce,
        Buffer.from(digest, 'hex'),
        u32(ct.length),
        ct,
        sign(null, lp('done/env-sig/v2', ...fields, hex(nonce), digest), first.keys.device),
      ]),
    );
    const subject = {
        workspace: route1.workspace,
        credential: route1.credential,
        position: n,
        epoch,
        digest,
      },
      id = n.toString(16).padStart(32, '0'),
      capsule = json([
        'done/source-capture/v1',
        1,
        id,
        route1.workspace,
        route1.credential,
        route1.principal,
        captureEpoch,
        1,
        [[route1.principal, 'human', hex(update)]],
      ]),
      submission = new Uint8Array(
        Buffer.concat([
          lp('done/envelope-submission-wire/v1', '1', first.epoch.lineageId),
          u32(envelope.length),
          envelope,
          u32(0),
          sign(
            null,
            lp('done/envelope-submission/v1', '1', first.epoch.lineageId, hash(envelope), ZERO),
            first.keys.device,
          ),
        ]),
      );
    entries.push({
      update,
      envelope,
      subject,
      previous,
      link: link(subject, previous),
      id,
      capsule,
      submission,
      captureEpoch,
    });
    previous = entries.at(-1).link;
  }
  doc.destroy();
  const f = fixture(boundary, boundary ? entries[boundary - 1].link : ZERO),
    history = await lib.verifyAdmissionHistory(f.successor, f.base, f.held),
    route2 = { ...route1, epoch: 2, history },
    rows = [];
  const context = {
    baseline: { kind: 'promotion-genesis', id: hash(JSON.stringify(f.receipt)) },
    service: { id: f.pin.serviceId, origin: f.pin.origin },
    authority: history.current,
    history,
    creatingCredential: route1.credential,
    reader: { id: route1.credential, publicKey: member.sPub, active: true },
    publisher: {
      id: route1.credential,
      publicKey: member.sPub,
      principal: route1.principal,
      active: true,
      system: true,
    },
    generation: 1,
    generationKey: kg,
    prefix: { position: 0, link: ZERO, observedThrough: 0 },
  };
  const add = (kind, bytes) => rows.push({ seq: rows.length + 1, gen: 1, kind, bytes });
  const capsule = (n) => {
    const e = entries[n - 1];
    add('update', e.update);
    add('outbound', e.capsule);
  };
  const spool = (n, type, detail, epoch = entries[n - 1].subject.epoch) =>
    add(
      type === 'envelope' ? 'outbound' : 'heads',
      json([
        'done/account-spool/v1',
        1,
        route1.workspace,
        route1.credential,
        route1.principal,
        epoch,
        1,
        type,
        n,
        detail,
      ]),
    );
  const allocate = (n) => {
    const e = entries[n - 1];
    spool(n, 'position', [e.id, 0, hash(e.capsule)]);
    spool(n, 'attempt', n);
    spool(n, 'envelope', [n, hex(e.envelope)]);
  };
  const delivery = (n, type, bytes, epoch) =>
    add(
      type === 'submission' ? 'outbound' : 'heads',
      json([
        'done/account-delivery/v1',
        1,
        route1.workspace,
        route1.credential,
        route1.principal,
        epoch,
        1,
        history.first.lineage,
        epoch === 1 ? history.first.head : history.current.head,
        type,
        n,
        hex(bytes),
      ]),
    );
  const proof = (n, issuance = n <= boundary ? 1 : 2) => {
    const e = entries[n - 1];
    return response({
      kind: 'accepted',
      head: head(e.subject, e.previous, issuance, f.keys.acceptance),
      leaf: { epoch: e.subject.epoch, digest: e.subject.digest },
    });
  };
  const packet = (n, requestEpoch = n <= boundary ? 1 : 2, proofBytes = proof(n)) => {
    const e = entries[n - 1],
      a = requestEpoch === 1 ? history.first : history.current,
      request = signed(
        [
          'done/private-read/v2',
          2,
          f.pin.serviceId,
          f.pin.origin,
          route1.workspace,
          route1.credential,
          route1.credential,
          a.lineage,
          a.head,
          requestEpoch,
          n - 1,
          1,
          '95'.repeat(32),
          30000,
        ],
        f.keys.device,
      ),
      page = signed(
        [
          'done/private-read-page/v2',
          2,
          hash(request),
          Math.max(n, requestEpoch === 1 ? boundary : count),
          n,
          [[hex(e.envelope), hex(proofBytes)]],
        ],
        f.keys.acceptance,
      );
    return {
      request,
      page,
      record: json([
        'done/account-inbound/v1',
        1,
        context.baseline.id,
        a.lineage,
        a.head,
        route1.credential,
        route1.credential,
        'received',
        n,
        e.previous,
        e.link,
        hex(request),
        hex(page),
      ]),
    };
  };
  for (let n = 1; n <= count; n++) {
    capsule(n);
    allocate(n);
    delivery(n, 'submission', entries[n - 1].submission, entries[n - 1].subject.epoch);
    delivery(n, 'response', proof(n), n <= boundary ? 1 : 2);
    add('heads', packet(n).record);
  }
  const signer = await crypto.subtle.importKey(
    'raw',
    Buffer.from(member.sPub, 'hex'),
    'Ed25519',
    false,
    ['verify'],
  );
  return {
    f,
    history,
    context,
    route1,
    route2,
    kg,
    entries,
    rows,
    signer,
    proof,
    packet,
    add,
    capsule,
    spool,
    allocate,
    delivery,
  };
}
export async function check(lib, f, rows = f.rows, reuse = false) {
  const census = lib.inspectInbound(rows, f.route2, f.context),
    memo = lib.createVerificationMemo(),
    coverage = lib.createInboundCoverage(),
    owner = { memo, current() {} };
  let witness = { events: 0, hash: ZERO };
  for (const event of census.delivery.spool.events)
    witness = await lib.extendSpoolWitness(witness, event, crypto.subtle);
  await lib.verifySpoolWitness(
    census.delivery.spool,
    { v: 2, spool: witness },
    crypto.subtle,
    reuse ? owner : undefined,
  );
  await lib.verifySpool(
    census.delivery.spool,
    f.route2,
    f.kg,
    f.signer,
    crypto.subtle,
    reuse ? owner : undefined,
  );
  const delivery = await lib.verifyDelivery(
      census.delivery,
      f.route2,
      f.history.current,
      f.signer,
      crypto.subtle,
      reuse ? owner : undefined,
    ),
    inbound = await lib.verifyInboundLedger(
      census,
      rows,
      f.context,
      { assertCurrent() {} },
      reuse ? { memo, coverage } : undefined,
    );
  memo.clear();
  coverage.clear();
  return { census, delivery, inbound };
}
