// Fixed, independently signed opaque envelopes and decision bytes; no production codec.
import { sign } from 'node:crypto';
import { fixture, hash, lp } from './oracle.mjs';
import { link, head, response, refusal } from '../account-decisions/oracle.mjs';
export { link, head, response, refusal };
export const ZERO = '00'.repeat(32);
export function wire(f, position, epoch = 1, tag = 'original', changes = {}) {
  const subject = {
    workspace: f.epoch.workspaceId,
    credential: f.request.certification.members[0].id,
    position,
    epoch,
    ...changes,
  };
  const ct = Buffer.from(tag.padEnd(20, '.')),
    nonce = Buffer.alloc(12, position % 256),
    fields = ['2', subject.workspace, subject.credential, String(epoch), '1', String(position)],
    digest = hash(ct),
    size = Buffer.alloc(4);
  size.writeUInt32BE(ct.length);
  const signature = sign(
    null,
    lp('done/env-sig/v2', ...fields, nonce.toString('hex'), digest),
    f.keys.device,
  );
  return {
    subject: { ...subject, digest },
    bytes: new Uint8Array(
      Buffer.concat([
        lp('done/envelope-wire/v2', ...fields),
        nonce,
        Buffer.from(digest, 'hex'),
        size,
        ct,
        signature,
      ]),
    ),
  };
}
export function historyFixture(count = 2) {
  const first = fixture(),
    wires = [];
  let previous = ZERO;
  for (let n = 1; n <= count; n++) {
    const w = wire(first, n);
    wires.push({ ...w, previous });
    previous = link(w.subject, previous);
  }
  const f = fixture(count, previous);
  return { ...f, wires };
}
export const expected = (wire, previous = wire.previous ?? ZERO) => ({
  ...wire.subject,
  previous,
  parent: ZERO,
});
export const accepted = (f, wire, epoch, previous = wire.previous ?? ZERO) =>
  response({
    kind: 'accepted',
    head: head(wire.subject, previous, epoch, f.keys.acceptance),
    leaf: { epoch: wire.subject.epoch, digest: wire.subject.digest },
  });
