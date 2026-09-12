/** Internal response framing and cryptographic evidence. No durable delivery-state authority. */
import { hex, lp, unhex } from './recovery.ts';
export type Bytes = Uint8Array<ArrayBuffer>;
export const RESPONSE_LIMIT = 4096;
export const ZERO_REFUSAL = '00'.repeat(32);
export interface PositionSubject {
  workspace: string;
  credential: string;
  position: number;
  digest: string;
  epoch: number;
}
export interface Refusal extends PositionSubject {
  reason: string;
  parent: string;
  signature: string;
}
export interface AcceptedHead {
  workspace: string;
  credential: string;
  position: number;
  link: string;
  epoch: number;
  final: boolean;
  signature: string;
}
export type PositionResponse =
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'accepted'; head: AcceptedHead; leaf: { epoch: number; digest: string } };
/** Supplied only by authenticated lineage ownership, never decoded from an answer. */
export interface DecisionAuthority {
  workspace: string;
  lineage: string;
  tip: number;
  head: string;
  acceptanceKey: string;
}
export type DecisionEvidence =
  | { kind: 'unknown' }
  | { kind: 'refused'; refusalId: string; refusal: Refusal }
  | { kind: 'accepted' | 'conflict'; head: AcceptedHead; leaf: { epoch: number; digest: string } };
const invalid = (): never => {
  throw Error('Malformed position evidence');
};
const identifier = (v: unknown): string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : invalid();
const positive = (v: unknown): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : invalid();
const fixed = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const sha = async (b: Bytes, subtle: SubtleCrypto): Promise<string> =>
  hex(new Uint8Array(await subtle.digest('SHA-256', b)));
export function captureAuthority(a: DecisionAuthority): Readonly<DecisionAuthority> {
  return Object.freeze({
    workspace: identifier(a.workspace),
    lineage: fixed(a.lineage),
    tip: positive(a.tip),
    head: fixed(a.head),
    acceptanceKey: fixed(a.acceptanceKey),
  });
}
export function captureSubject(s: PositionSubject): Readonly<PositionSubject> {
  return Object.freeze({
    workspace: identifier(s.workspace),
    credential: identifier(s.credential),
    position: positive(s.position),
    digest: fixed(s.digest),
    epoch: positive(s.epoch),
  });
}
export const samePosition = (a: PositionSubject, b: PositionSubject): boolean =>
  a.workspace === b.workspace && a.credential === b.credential && a.position === b.position;
export const sameSubject = (a: PositionSubject, b: PositionSubject): boolean =>
  samePosition(a, b) && a.digest === b.digest && a.epoch === b.epoch;
export function refusalMessage(r: Refusal): Bytes {
  const s = captureSubject(r);
  if (typeof r.reason !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(r.reason)) invalid();
  return lp(
    'done/position-refuse/v1',
    '1',
    s.workspace,
    s.credential,
    String(s.position),
    s.digest,
    String(s.epoch),
    r.reason,
    fixed(r.parent),
  );
}
export const refusalId = (r: Refusal, subtle = crypto.subtle): Promise<string> =>
  sha(refusalMessage(r), subtle);
export function headMessage(h: AcceptedHead): Bytes {
  if (typeof h.final !== 'boolean') invalid();
  return lp(
    'done/accept-head/v1',
    identifier(h.workspace),
    identifier(h.credential),
    String(positive(h.position)),
    fixed(h.link),
    String(positive(h.epoch)),
    String(h.final),
  );
}
export function acceptanceLink(
  subject: PositionSubject,
  previous: string,
  subtle = crypto.subtle,
): Promise<string> {
  const s = captureSubject(subject);
  return sha(
    lp(
      'done/accept/v1',
      s.workspace,
      s.credential,
      String(s.position),
      String(s.epoch),
      s.digest,
      fixed(previous),
    ),
    subtle,
  );
}
export function encodePositionResponse(r: PositionResponse): Bytes {
  let values: unknown[];
  if (r.kind === 'refused') {
    const f = r.refusal;
    refusalMessage(f);
    values = [
      f.workspace,
      f.credential,
      f.position,
      f.digest,
      f.epoch,
      f.reason,
      f.parent,
      fixed(f.signature, 64),
    ];
  } else if (r.kind === 'accepted') {
    const h = r.head;
    headMessage(h);
    values = [
      h.workspace,
      h.credential,
      h.position,
      h.link,
      h.epoch,
      h.final,
      positive(r.leaf.epoch),
      fixed(r.leaf.digest),
      fixed(h.signature, 64),
    ];
  } else return invalid();
  const b = new TextEncoder().encode(
    JSON.stringify(['done/position-response/v1', 1, r.kind, ...values]),
  );
  if (b.length > RESPONSE_LIMIT) invalid();
  return b;
}
export function decodePositionResponse(bytes: Bytes): PositionResponse {
  if (!(bytes instanceof Uint8Array) || bytes.length > RESPONSE_LIMIT) return invalid();
  const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(v) || v[0] !== 'done/position-response/v1' || v[1] !== 1) return invalid();
  let r: PositionResponse;
  if (v[2] === 'refused' && v.length === 11)
    r = {
      kind: 'refused',
      refusal: {
        workspace: v[3],
        credential: v[4],
        position: v[5],
        digest: v[6],
        epoch: v[7],
        reason: v[8],
        parent: v[9],
        signature: v[10],
      },
    };
  else if (v[2] === 'accepted' && v.length === 12)
    r = {
      kind: 'accepted',
      head: {
        workspace: v[3],
        credential: v[4],
        position: v[5],
        link: v[6],
        epoch: v[7],
        final: v[8],
        signature: v[11],
      },
      leaf: { epoch: v[9], digest: v[10] },
    };
  else return invalid();
  if (hex(encodePositionResponse(r)) !== hex(bytes)) return invalid();
  return r;
}
async function verifySignature(
  a: DecisionAuthority,
  signature: string,
  message: Bytes,
  subtle: SubtleCrypto,
): Promise<void> {
  const key = await subtle.importKey('raw', unhex(a.acceptanceKey, 32), 'Ed25519', false, [
    'verify',
  ]);
  if (!(await subtle.verify('Ed25519', key, unhex(signature, 64), message)))
    throw Error('Position signature refused');
}
/** Authenticate the service's claim. Permanent closure must additionally be enforced by its durable store. */
export async function verifyRefusalClaim(
  input: Refusal,
  authority: DecisionAuthority,
  subtle = crypto.subtle,
): Promise<Refusal> {
  const a = captureAuthority(authority),
    decoded = decodePositionResponse(encodePositionResponse({ kind: 'refused', refusal: input }));
  if (decoded.kind !== 'refused') return invalid();
  const r = decoded.refusal;
  if (r.workspace !== a.workspace || r.epoch > a.tip) throw Error('Refusal lineage mismatch');
  await verifySignature(a, r.signature, refusalMessage(r), subtle);
  return Object.freeze(r);
}
/** Exact-position proof only. Previous link is computed from retained local history, not from the response. */
export async function verifyPositionResponse(
  input: Bytes,
  expected: PositionSubject & { parent: string; previous: string },
  authority: DecisionAuthority,
  subtle = crypto.subtle,
): Promise<DecisionEvidence> {
  const own = {
      ...captureSubject(expected),
      parent: fixed(expected.parent),
      previous: fixed(expected.previous),
    },
    a = captureAuthority(authority);
  if (own.workspace !== a.workspace || own.epoch > a.tip)
    throw Error('Expected subject outside owned lineage');
  // Parse/capture synchronously before the first crypto await. No caller-owned mutable input survives it.
  try {
    const r = decodePositionResponse(input);
    if (r.kind === 'refused') {
      if (!sameSubject(r.refusal, own) || r.refusal.parent !== own.parent)
        return { kind: 'unknown' };
      const refusal = await verifyRefusalClaim(r.refusal, a, subtle);
      return Object.freeze({
        kind: 'refused',
        refusalId: await refusalId(refusal, subtle),
        refusal,
      });
    }
    const h = r.head;
    if (
      h.workspace !== own.workspace ||
      h.credential !== own.credential ||
      h.position !== own.position ||
      h.epoch !== a.tip ||
      r.leaf.epoch > a.tip
    )
      return { kind: 'unknown' };
    await verifySignature(a, h.signature, headMessage(h), subtle);
    const candidate = { ...own, ...r.leaf };
    if ((await acceptanceLink(candidate, own.previous, subtle)) !== h.link)
      return { kind: 'unknown' };
    return Object.freeze({
      kind: sameSubject(candidate, own) ? 'accepted' : 'conflict',
      head: Object.freeze(h),
      leaf: Object.freeze(r.leaf),
    });
  } catch {
    return { kind: 'unknown' };
  }
}
