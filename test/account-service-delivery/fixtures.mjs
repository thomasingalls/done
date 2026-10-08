import { createCipheriv, hkdfSync, randomBytes, sign, createPublicKey, verify } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { prepared } from '../account-admission/core-fixtures.mjs';
import { lp, hash, refusalMessage, link, headMessage } from '../account-decisions/oracle.mjs';
export { lp, hash, link, headMessage };
export const ZERO = '00'.repeat(32);
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
export async function ready(t, options = {}) {
  const x = await prepared(t, options),
    offer = await x.begin(),
    receipt = await x.finish(offer);
  if (receipt.kind !== 'promotion-receipt') throw Error(JSON.stringify(receipt));
  const kg = options.generationKey ? Buffer.from(options.generationKey) : randomBytes(32);
  t.after(() => kg.fill(0));
  const workspace = x.request.candidate.workspaceId,
    credential = x.request.candidate.signer;
  // Independent Node/OpenSSL envelope and wrapper framing, no production codec used here.
  const make = (position = 1, tag = 'first', options = {}) => {
    const epoch = options.epoch ?? 1,
      gen = options.gen ?? 1,
      id = options.credential ?? credential,
      ws = options.workspace ?? workspace;
    const updates = options.updates ?? [Buffer.from(tag)];
    const fields = ['2', ws, id, String(epoch), String(gen), String(position)],
      nonce = randomBytes(12),
      aad = lp('done/env/v2', ...fields),
      body = Buffer.concat([
        lp('done/env-body/v1', x.request.candidate.principalId, 'human'),
        u32(updates.length),
        ...updates.flatMap((u) => [u32(u.length), u]),
      ]),
      k = Buffer.from(
        hkdfSync('sha256', kg, Buffer.alloc(0), lp('done/envelope/v2', ws, id, String(gen)), 32),
      ),
      cipher = createCipheriv('aes-256-gcm', k, nonce);
    cipher.setAAD(aad);
    const ct =
      options.ct ?? Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]);
    k.fill(0);
    const digest = hash(ct),
      sig = sign(
        null,
        lp('done/env-sig/v2', ...fields, nonce.toString('hex'), digest),
        options.signer ?? x.s.privateKey,
      ),
      envelope = Buffer.concat([
        lp('done/envelope-wire/v2', ...fields),
        nonce,
        Buffer.from(digest, 'hex'),
        u32(ct.length),
        ct,
        sig,
      ]);
    const proof = options.parent ?? null,
      parent = proof ? hash(refusalMessage(proof)) : ZERO,
      proofBytes = proof
        ? Buffer.from(
            JSON.stringify([
              'done/position-response/v1',
              1,
              'refused',
              proof.workspace,
              proof.credential,
              proof.position,
              proof.digest,
              proof.epoch,
              proof.reason,
              proof.parent,
              proof.signature,
            ]),
          )
        : Buffer.alloc(0),
      lineage = options.lineage ?? offer.epoch.lineageId,
      wrapper = sign(
        null,
        lp('done/envelope-submission/v1', '1', lineage, hash(envelope), parent),
        options.signer ?? x.s.privateKey,
      ),
      bytes = new Uint8Array(
        Buffer.concat([
          lp('done/envelope-submission-wire/v1', '1', lineage),
          u32(envelope.length),
          envelope,
          u32(proofBytes.length),
          proofBytes,
          wrapper,
        ]),
      );
    return {
      bytes,
      ct,
      subject: { workspace: ws, credential: id, position, digest, epoch },
      parent,
    };
  };
  const call = (w) =>
    x.authority.owner.decideSubmission(x.f.core, { workspaceId: workspace, bytes: w.bytes });
  return { ...x, offer, receipt, workspace, credential, make, call, generationKey: kg };
}
export function proof(result, pub, subject, previous = ZERO, parent = ZERO) {
  if (result.kind !== 'decision') throw Error(JSON.stringify(result));
  const v = JSON.parse(Buffer.from(result.bytes).toString()),
    key = createPublicKey({
      key: Buffer.from('302a300506032b6570032100' + pub, 'hex'),
      format: 'der',
      type: 'spki',
    });
  if (v[0] !== 'done/position-response/v1' || v[1] !== 1) throw Error('Response framing');
  if (v[2] === 'refused') {
    const r = {
      workspace: v[3],
      credential: v[4],
      position: v[5],
      digest: v[6],
      epoch: v[7],
      reason: v[8],
      parent: v[9],
      signature: v[10],
    };
    if (
      JSON.stringify([r.workspace, r.credential, r.position, r.digest, r.epoch, r.parent]) !==
        JSON.stringify([
          subject.workspace,
          subject.credential,
          subject.position,
          subject.digest,
          subject.epoch,
          parent,
        ]) ||
      !verify(null, refusalMessage(r), key, Buffer.from(r.signature, 'hex'))
    )
      throw Error('Invalid refusal');
    return { kind: 'refused', refusal: r };
  }
  const h = {
    workspace: v[3],
    credential: v[4],
    position: v[5],
    link: v[6],
    epoch: v[7],
    final: v[8],
    signature: v[11],
  };
  if (
    h.workspace !== subject.workspace ||
    h.credential !== subject.credential ||
    h.position !== subject.position ||
    h.link !== link(subject, previous) ||
    v[9] !== subject.epoch ||
    v[10] !== subject.digest ||
    h.epoch !== 1 ||
    h.final !== false ||
    !verify(null, headMessage(h), key, Buffer.from(h.signature, 'hex'))
  )
    throw Error('Invalid head');
  return { kind: 'accepted', head: h };
}
export function mutate(x, operation) {
  const db = new DatabaseSync(x.f.path);
  try {
    return operation(db);
  } finally {
    db.close();
  }
}
export const inventory = (x) =>
  JSON.stringify({ promotions: x.f.rows('promotions'), decisions: x.f.rows('delivery_decisions') });
