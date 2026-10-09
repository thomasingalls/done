/** Independent Node crypto and framing. Does not import runtime protocol helpers. */
import { createHash, hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const vectors = JSON.parse(
  readFileSync(new URL('../vectors/enrollment-ceremony.json', import.meta.url), 'utf8'),
);
export const published = vectors.vectors[0];
const i = published.inputs;
export const honest = {
  workspaceId: i.workspace_id,
  epoch: i.epoch,
  head: i.epoch_head,
  existingCredentialId: i.existing_credential_id,
  newCredentialId: i.new_credential_id,
  wPub: i.new_wrapping_key,
  sPub: i.new_signing_key,
  recoveryStateDigest: i.recovery_state_digest,
  nonceExisting: i.nonce_existing,
  nonceNew: i.nonce_new,
};
export const lp = (...fields) =>
  Buffer.concat(
    fields.map((field) => {
      const bytes = Buffer.from(String(field), 'utf8'),
        prefix = Buffer.alloc(2);
      prefix.writeUInt16BE(bytes.length);
      return Buffer.concat([prefix, bytes]);
    }),
  );
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const commitment = (role, nonce, label = 'done/enroll-commit/v1') =>
  sha(lp(label, role, nonce));
export const commitments = (r) => ({
  existing: commitment('existing', r.nonceExisting),
  new: commitment('new', r.nonceNew),
});
export const transcript = (r, label = 'done/enroll/v1') =>
  lp(
    label,
    r.workspaceId,
    r.epoch,
    r.head,
    r.existingCredentialId,
    r.newCredentialId,
    r.wPub,
    r.sPub,
    r.recoveryStateDigest,
    r.nonceExisting,
    r.nonceNew,
  );
export const derive = (r, label) => {
  const bytes = transcript(r, label),
    transcriptHash = sha(bytes);
  return {
    transcriptHash,
    sas: Array.from(
      new Uint8Array(hkdfSync('sha256', bytes, Buffer.alloc(0), lp('done/enroll-sas/v1'), 5)),
      (b) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[b & 31],
    ).join(''),
    wrapInfo: lp('done/enroll-wrap/v1', transcriptHash).toString('hex'),
  };
};
export const change = (r, key) => ({
  ...r,
  [key]:
    key === 'epoch'
      ? r.epoch + 1
      : ['workspaceId', 'existingCredentialId', 'newCredentialId'].includes(key)
        ? `x${r[key].slice(1)}`
        : (r[key][0] === '0' ? '1' : '0') + r[key].slice(1),
});
