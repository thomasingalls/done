/** Independent Node/OpenSSL framing and signing oracle. Synthetic keys only. */
import { createHash, createPrivateKey, sign, createDecipheriv, hkdfSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
export const lp = (...fields) =>
  Buffer.concat(
    fields.map((s) => {
      const b = Buffer.from(s),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const key = (seed) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
export const signBytes = (message, key) => sign(null, message, key).toString('hex');
export const refusalMessage = (r) =>
  lp(
    'done/position-refuse/v1',
    '1',
    r.workspace,
    r.credential,
    String(r.position),
    r.digest,
    String(r.epoch),
    r.reason,
    r.parent,
  );
export const refusal = (subject, key, parent = '00'.repeat(32), reason = 'stale-epoch') => {
  const r = { ...subject, reason, parent };
  return { ...r, signature: signBytes(refusalMessage(r), key) };
};
export const link = (s, previous) =>
  hash(
    lp(
      'done/accept/v1',
      s.workspace,
      s.credential,
      String(s.position),
      String(s.epoch),
      s.digest,
      previous,
    ),
  );
export const headMessage = (h) =>
  lp(
    'done/accept-head/v1',
    h.workspace,
    h.credential,
    String(h.position),
    h.link,
    String(h.epoch),
    String(h.final),
  );
export const head = (s, previous, tip, key, final = false) => {
  const h = {
    workspace: s.workspace,
    credential: s.credential,
    position: s.position,
    link: link(s, previous),
    epoch: tip,
    final,
  };
  return { ...h, signature: signBytes(headMessage(h), key) };
};
export const response = (r) =>
  new Uint8Array(
    Buffer.from(
      JSON.stringify(
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
            ],
      ),
    ),
  );
export const submissionMessage = (lineage, envelope, parent) =>
  lp(
    'done/envelope-submission/v1',
    '1',
    lineage,
    hash(envelope),
    parent ? hash(refusalMessage(parent)) : '00'.repeat(32),
  );
/** Independently open the synthetic service's acceptance seal. Does not add a production signing API. */
export function fixtureAcceptance(f, workspace) {
  const db = new DatabaseSync(f.dbPath, { readOnly: true });
  let row;
  try {
    row = db
      .prepare('SELECT request_digest, acceptance_seal FROM promotions WHERE workspace_id=?')
      .get(workspace);
  } finally {
    db.close();
  }
  const s = JSON.parse(row.acceptance_seal),
    p = f.pin;
  const custody = Buffer.from(
    hkdfSync(
      'sha256',
      f.testOperatorKey,
      Buffer.alloc(0),
      lp('done/acceptance-custody/v1', p.serviceId, p.authRoot),
      32,
    ),
  );
  let derived, raw;
  try {
    derived = Buffer.from(
      hkdfSync('sha256', custody, Buffer.from(s.salt, 'hex'), lp('done/acceptance-seal/v1'), 32),
    );
    const c = createDecipheriv('aes-256-gcm', derived, Buffer.from(s.nonce, 'hex')),
      ct = Buffer.from(s.ct, 'hex');
    c.setAAD(
      Buffer.concat([
        lp('done/service-authority-pin/v1', '1', p.serviceId, p.origin, p.rpId, p.authRoot),
        lp('done/acceptance-seal/v1', row.request_digest, s.publicKey),
      ]),
    );
    c.setAuthTag(ct.subarray(-16));
    raw = Buffer.concat([c.update(ct.subarray(0, -16)), c.final()]);
    return key(raw.toString('hex'));
  } finally {
    custody.fill(0);
    derived?.fill(0);
    raw?.fill(0);
  }
}
