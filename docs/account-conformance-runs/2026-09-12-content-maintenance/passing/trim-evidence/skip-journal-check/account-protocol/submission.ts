/** Detached signed transport wrapper. Does not change v2 envelope bytes or grant permission to mint/send. */
import { hex, lp, unhex } from './recovery.ts';
import {
  decodeNetworkEnvelope,
  verifyNetworkEnvelope,
  ENVELOPE_WIRE_LIMIT,
  type EnvelopeRoute,
} from './envelope.ts';
import {
  captureAuthority,
  decodePositionResponse,
  encodePositionResponse,
  refusalId,
  verifyRefusalClaim,
  ZERO_REFUSAL,
  RESPONSE_LIMIT,
  type Refusal,
  type DecisionAuthority,
  type Bytes,
} from './positionDecision.ts';
export const SUBMISSION_LIMIT = ENVELOPE_WIRE_LIMIT + RESPONSE_LIMIT + 512;
export interface Submission {
  lineage: string;
  envelope: Bytes;
  parent: Refusal | null;
  signature: Bytes;
}
const concat = (...parts: Bytes[]): Bytes => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    b.set(p, i);
    i += p.length;
  }
  return b;
};
const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
export function encodeSubmission(s: Submission): Bytes {
  unhex(s.lineage, 32);
  if (
    !(s.envelope instanceof Uint8Array) ||
    s.envelope.length > ENVELOPE_WIRE_LIMIT ||
    decodeNetworkEnvelope(s.envelope).v !== 2
  )
    throw Error('Submission requires v2 envelope');
  if (!(s.signature instanceof Uint8Array) || s.signature.length !== 64)
    throw Error('Submission signature length');
  const proof = s.parent
    ? encodePositionResponse({ kind: 'refused', refusal: s.parent })
    : new Uint8Array();
  return concat(
    lp('done/envelope-submission-wire/v1', '1', s.lineage),
    u32(s.envelope.length),
    s.envelope,
    u32(proof.length),
    proof,
    s.signature,
  );
}
export function decodeSubmission(input: Bytes): Submission {
  if (!(input instanceof Uint8Array) || input.length > SUBMISSION_LIMIT)
    throw Error('Submission size');
  let at = 0;
  const take = (n: number) => {
    if (n < 0 || at + n > input.length) throw Error('Truncated submission');
    const b = new Uint8Array(input.subarray(at, at + n));
    at += n;
    return b;
  };
  const count = (size: number) => {
    const b = take(size);
    return size === 2 ? new DataView(b.buffer).getUint16(0) : new DataView(b.buffer).getUint32(0);
  };
  const text = () => new TextDecoder('utf-8', { fatal: true }).decode(take(count(2)));
  if (text() !== 'done/envelope-submission-wire/v1' || text() !== '1')
    throw Error('Submission version');
  const lineage = text();
  unhex(lineage, 32);
  const length = count(4);
  if (length > ENVELOPE_WIRE_LIMIT) throw Error('Envelope size');
  const envelope = take(length),
    proofLength = count(4);
  if (proofLength > RESPONSE_LIMIT) throw Error('Proof size');
  const proof = proofLength ? decodePositionResponse(take(proofLength)) : null;
  if (proof && proof.kind !== 'refused') throw Error('Parent must be refusal');
  const s = {
    lineage,
    envelope,
    parent: proof?.kind === 'refused' ? proof.refusal : null,
    signature: take(64),
  };
  if (at !== input.length || hex(encodeSubmission(s)) !== hex(input))
    throw Error('Noncanonical submission');
  return s;
}
async function message(s: Submission, subtle: SubtleCrypto): Promise<Bytes> {
  const digest = hex(new Uint8Array(await subtle.digest('SHA-256', s.envelope))),
    parent = s.parent ? await refusalId(s.parent, subtle) : ZERO_REFUSAL;
  return lp('done/envelope-submission/v1', '1', s.lineage, digest, parent);
}
/** Low-level construction only. The lifecycle must persist the exact result before any future dispatch. */
export async function signSubmission(
  input: Omit<Submission, 'signature'>,
  signer: CryptoKey,
  subtle = crypto.subtle,
): Promise<Bytes> {
  const s = decodeSubmission(encodeSubmission({ ...input, signature: new Uint8Array(64) }));
  s.signature = new Uint8Array(await subtle.sign('Ed25519', signer, await message(s, subtle)));
  return encodeSubmission(s);
}
/** The future service must also resolve membership, issued refusal IDs, permanent closure and one accepted digest. */
export async function verifySubmission(
  input: Bytes,
  route: EnvelopeRoute,
  signer: CryptoKey,
  authority: DecisionAuthority,
  subtle = crypto.subtle,
) {
  const s = decodeSubmission(input),
    r = { ...route },
    a = captureAuthority(authority);
  if (s.lineage !== a.lineage || r.workspace_id !== a.workspace || r.epoch > a.tip)
    throw Error('Submission lineage mismatch');
  const envelope = await verifyNetworkEnvelope(s.envelope, r, signer, subtle);
  if (!(await subtle.verify('Ed25519', signer, s.signature, await message(s, subtle))))
    throw Error('Submission signature mismatch');
  let parentId = ZERO_REFUSAL;
  if (s.parent) {
    const p = await verifyRefusalClaim(s.parent, a, subtle);
    if (
      p.workspace !== envelope.workspace_id ||
      p.credential !== envelope.credential_id ||
      p.position !== envelope.seq ||
      p.digest === hex(envelope.digest) ||
      envelope.epoch !== a.tip
    )
      throw Error('Successor subject mismatch');
    parentId = await refusalId(p, subtle);
  }
  return Object.freeze({ ...s, parentId });
}
