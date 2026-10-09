import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bytes,
  hex,
  json,
  zero,
  sourceValues,
  spoolValues,
  deliveryValues,
  inboundValues,
} from './oracle.mjs';
export function report(name, value) {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
}
export const context = (f) => ({
  baseline: { kind: 'promotion-genesis', id: f.baseline },
  service: { id: f.request.serviceId, origin: f.request.origin },
  authority: f.authority,
  creatingCredential: f.route.credential,
  reader: { id: f.request.reader, publicKey: f.keys.reader.publicKey, active: true },
  publisher: {
    id: f.route.credential,
    publicKey: f.keys.member.publicKey,
    principal: f.route.principal,
    system: true,
    active: true,
  },
  generation: 1,
  generationKey: bytes(f.kg),
  prefix: { position: 0, link: zero, observedThrough: 0 },
});
export const publicKey = (f) =>
  crypto.subtle.importKey('raw', bytes(f.keys.member.publicKey), 'Ed25519', false, ['verify']);
export function fullRecords(f, conflict = true) {
  const list = [
    { kind: 'outbound', bytes: bytes(hex(json(sourceValues(f.capsule)))) },
    ...f.spool.map((e) => ({
      kind: e.type === 'envelope' ? 'outbound' : 'heads',
      bytes: bytes(hex(json(spoolValues(f.route, e)))),
    })),
    ...f.delivery.map((e) => ({
      kind: e.type === 'submission' ? 'outbound' : 'heads',
      bytes: bytes(hex(json(deliveryValues(f.route, f.authority, e)))),
    })),
    { kind: 'update', bytes: bytes(f.updates[0]) },
    ...f.inbound
      .slice(0, conflict ? 2 : 1)
      .map((e) => ({ kind: 'heads', bytes: bytes(hex(json(inboundValues(e)))) })),
  ];
  return list.map((r, i) => ({ ...r, gen: 1, seq: i + 1 }));
}
export async function audit(h, f, records, witness) {
  const c = h.inspectInbound(records, f.route, context(f));
  await h.verifySpoolWitness(c.delivery.spool, { v: 2, spool: witness }, crypto.subtle);
  await h.verifySpool(c.delivery.spool, f.route, bytes(f.kg), await publicKey(f), crypto.subtle);
  const delivery = await h.verifyDelivery(
    c.delivery,
    f.route,
    f.authority,
    await publicKey(f),
    crypto.subtle,
  );
  const received = await h.verifyInboundLedger(c, records, context(f), {
    assertCurrent() {},
    now: () => 1e9,
  });
  return { c, delivery, received };
}
