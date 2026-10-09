/** Independent signed v2 and local-event fixtures. No production encoder/verifier is imported. */
import { createPrivateKey, sign } from 'node:crypto';
import {
  A,
  B,
  READER,
  authority,
  hash,
  generationKey,
  packet,
  sources,
  type FixtureEntry,
  type Packet,
} from '../account-inbound/fixtures';
import type { InboundContext } from '../../src/crdt/accountInbound';
export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
export const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
const key = (byte: string) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
const signed = (v: unknown[], byte: string) =>
  json([...v, sign(null, json(v), key(byte)).toString('hex')]);
export function reframe(
  p: Packet,
  options: { request?: (r: unknown[]) => void; page?: (p: unknown[]) => void } = {},
): Packet {
  const r = JSON.parse(Buffer.from(p.request).toString()) as unknown[];
  r.pop();
  options.request?.(r);
  const request = signed(r, r[5] === A ? '41' : r[5] === B ? '42' : '43');
  const page = JSON.parse(Buffer.from(p.page).toString()) as unknown[];
  page.pop();
  page[2] = hash(request);
  options.page?.(page);
  return { request, page: signed(page, '44') };
}
export function context(publisher = A): InboundContext {
  const a = authority();
  return {
    baseline: { kind: 'promotion-genesis', id: sources().baselineId },
    service: { id: a.serviceId, origin: a.origin },
    authority: a,
    creatingCredential: publisher,
    reader: { id: READER, publicKey: a.members[READER]!.publicKey, active: true },
    publisher: {
      id: publisher,
      publicKey: a.members[publisher]!.publicKey,
      principal: publisher,
      system: true,
      active: true,
    },
    generation: 1,
    generationKey: generationKey.slice(),
    prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
}
export function prior(c: InboundContext, e: FixtureEntry): InboundContext {
  return {
    ...c,
    prefix: { position: e.position, link: e.link, observedThrough: e.position },
    retained: { previous: e.previous, envelope: e.envelope.slice(), proof: e.proof.slice() },
  };
}
export function eventWire(
  e: FixtureEntry,
  c = context(e.publisher),
  p = packet(e),
  kind = 'received',
) {
  return json([
    'done/account-inbound/v1',
    1,
    c.baseline.id,
    c.authority.lineage,
    c.authority.head,
    c.reader.id,
    e.publisher,
    kind,
    e.position,
    e.previous,
    e.link,
    hex(p.request),
    hex(p.page),
  ]);
}
export const live = { assertCurrent() {}, now: () => 1000 };
