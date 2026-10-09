/** Internal envelope codec: v1 vector readback; v2 for new private envelopes. No allocation, lineage authority, acceptance or send capability.
 * The future owner must reserve EACH seal invocation and persist exact bytes before sending.
 * v2 separates network keys by workspace, credential and generation. See docs/account-outbound.md.
 */
import { hex, lp } from './recovery.ts';

type Bytes = Uint8Array<ArrayBuffer>;
export const ENVELOPE_BODY_LIMIT = 4 * 1024 * 1024;
export const ENVELOPE_UPDATE_LIMIT = 256;
export const ENVELOPE_WIRE_LIMIT = ENVELOPE_BODY_LIMIT + 2048;
// Current admission profile. The broader codec bounds above also read historical ledgers.
export const ADMITTED_ENVELOPE_WIRE_LIMIT = 512 * 1024;
export const ADMITTED_ENVELOPE_UPDATE_LIMIT = 255;
export const ADMITTED_ENVELOPE_UPDATE_BYTES = 512 * 1024;
export class EnvelopeSizeError extends Error {
  readonly reason = 'envelope-size';
  constructor() {
    super('Envelope exceeds the current receive limits; source writing is retained');
  }
}
export function assertAdmittedEnvelopeWireSize(length: number): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > ADMITTED_ENVELOPE_WIRE_LIMIT)
    throw new EnvelopeSizeError();
}
export interface EnvelopeHeader {
  v: 1 | 2;
  workspace_id: string;
  credential_id: string;
  epoch: number;
  gen: number;
  seq: number;
}
export type EnvelopeRoute = Omit<EnvelopeHeader, 'seq'>;
export interface EnvelopeBody {
  actor_id: string;
  actor_kind: 'human' | 'agent' | 'system';
  updates: readonly Bytes[];
}
export interface NetworkEnvelope extends EnvelopeHeader {
  nonce: Bytes;
  digest: Bytes;
  ct: Bytes;
  sig: Bytes;
}
const bad = (): never => {
  throw Error('Malformed network envelope');
};
const identifier = (value: string): string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : bad();
const positive = (value: number): string =>
  Number.isSafeInteger(value) && value > 0 ? String(value) : bad();
const fixed = (value: Bytes, size: number): Bytes =>
  value instanceof Uint8Array && value.length === size ? value.slice() : bad();
const concat = (...parts: Bytes[]): Bytes => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    result.set(part, at);
    at += part.length;
  }
  return result;
};
const u32 = (n: number): Bytes => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, n);
  return bytes;
};
const headerFields = (h: EnvelopeHeader): string[] => {
  if (h.v !== 1 && h.v !== 2) return bad();
  return [
    String(h.v),
    identifier(h.workspace_id),
    identifier(h.credential_id),
    positive(h.epoch),
    positive(h.gen),
    positive(h.seq),
  ];
};
const wirePrefix = (e: EnvelopeHeader): Bytes =>
  lp(`done/envelope-wire/v${e.v}`, ...headerFields(e));
export const envelopeKeyInfo = (h: EnvelopeHeader): Bytes => {
  headerFields(h);
  return h.v === 1
    ? lp('done/envelope/v1', h.workspace_id)
    : lp('done/envelope/v2', h.workspace_id, h.credential_id, String(h.gen));
};
export const envelopeAAD = (h: EnvelopeHeader): Bytes => lp(`done/env/v${h.v}`, ...headerFields(h));
export const envelopeSignatureMessage = (h: EnvelopeHeader, nonce: Bytes, digest: Bytes): Bytes =>
  lp(`done/env-sig/v${h.v}`, ...headerFields(h), hex(fixed(nonce, 12)), hex(fixed(digest, 32)));

export function encodeEnvelopeBody(body: EnvelopeBody): Bytes {
  if (
    !['human', 'agent', 'system'].includes(body.actor_kind) ||
    !Array.isArray(body.updates) ||
    !body.updates.length ||
    body.updates.length > ENVELOPE_UPDATE_LIMIT
  )
    return bad();
  const prefix = lp('done/env-body/v1', identifier(body.actor_id), body.actor_kind);
  let length = prefix.length + 4;
  for (const update of body.updates) {
    if (!(update instanceof Uint8Array) || !update.length) return bad();
    length += 4 + update.length;
    if (length > ENVELOPE_BODY_LIMIT) return bad();
  }
  return concat(
    prefix,
    u32(body.updates.length),
    ...body.updates.flatMap((u) => [u32(u.length), u]),
  );
}
function admittedBody(header: EnvelopeHeader, body: EnvelopeBody): Bytes {
  if (
    body.updates.length > ADMITTED_ENVELOPE_UPDATE_LIMIT ||
    body.updates.reduce((n, u) => n + u.length, 0) > ADMITTED_ENVELOPE_UPDATE_BYTES
  )
    throw new EnvelopeSizeError();
  const plaintext = encodeEnvelopeBody(body);
  try {
    // Exact framing, including the AES-GCM tag; the plaintext limit alone is insufficient.
    assertAdmittedEnvelopeWireSize(
      wirePrefix(header).length + 12 + 32 + 4 + plaintext.length + 16 + 64,
    );
    return plaintext;
  } catch (cause) {
    plaintext.fill(0);
    throw cause;
  }
}
/** Synchronous preflight before position or invocation allocation. Does not authorize sending. */
export function assertAdmittedEnvelope(header: EnvelopeHeader, body: EnvelopeBody): void {
  admittedBody(header, body).fill(0);
}
class Reader {
  at = 0;
  readonly input: Bytes;
  constructor(input: Bytes) {
    this.input = input;
  }
  take(n: number): Bytes {
    if (n < 0 || n > this.input.length - this.at) return bad();
    const result = this.input.slice(this.at, this.at + n);
    this.at += n;
    return result;
  }
  count(): number {
    return new DataView(this.take(4).buffer).getUint32(0);
  }
  text(): string {
    const length = new DataView(this.take(2).buffer).getUint16(0),
      bytes = this.take(length);
    if (bytes.some((b) => b < 32 || b > 126)) return bad();
    return new TextDecoder().decode(bytes);
  }
  number(): number {
    const text = this.text(),
      n = Number(text);
    if (positive(n) !== text) return bad();
    return n;
  }
  end(): void {
    if (this.at !== this.input.length) bad();
  }
}
export function decodeEnvelopeBody(input: Bytes): EnvelopeBody {
  if (!(input instanceof Uint8Array) || input.length > ENVELOPE_BODY_LIMIT) return bad();
  const reader = new Reader(input);
  if (reader.text() !== 'done/env-body/v1') return bad();
  const actor_id = identifier(reader.text()),
    actor_kind = reader.text();
  if (actor_kind !== 'human' && actor_kind !== 'agent' && actor_kind !== 'system') return bad();
  const count = reader.count();
  if (count < 1 || count > ENVELOPE_UPDATE_LIMIT) return bad();
  const updates: Bytes[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const length = reader.count();
      if (!length) return bad();
      updates.push(reader.take(length));
    }
    reader.end();
    return { actor_id, actor_kind, updates };
  } catch (cause) {
    for (const update of updates) update.fill(0);
    throw cause;
  }
}

/** Concrete framing for the previously selected fields; a detached, canonical byte string. */
export function encodeNetworkEnvelope(e: NetworkEnvelope): Bytes {
  if (!(e.ct instanceof Uint8Array) || e.ct.length < 16 || e.ct.length > ENVELOPE_BODY_LIMIT + 16)
    return bad();
  return concat(
    wirePrefix(e),
    fixed(e.nonce, 12),
    fixed(e.digest, 32),
    u32(e.ct.length),
    e.ct,
    fixed(e.sig, 64),
  );
}
export function decodeNetworkEnvelope(input: Bytes): NetworkEnvelope {
  if (!(input instanceof Uint8Array) || input.length > ENVELOPE_WIRE_LIMIT) return bad();
  const r = new Reader(input);
  const domain = r.text(),
    version = r.text();
  if ((version !== '1' && version !== '2') || domain !== `done/envelope-wire/v${version}`)
    return bad();
  const v = version === '1' ? 1 : 2;
  const workspace_id = identifier(r.text()),
    credential_id = identifier(r.text()),
    epoch = r.number(),
    gen = r.number(),
    seq = r.number(),
    nonce = r.take(12),
    digest = r.take(32),
    length = r.count();
  if (length < 16 || length > ENVELOPE_BODY_LIMIT + 16) return bad();
  const ct = r.take(length),
    sig = r.take(64);
  r.end();
  return { v, workspace_id, credential_id, epoch, gen, seq, nonce, digest, ct, sig };
}
const netKey = async (
  kg: Bytes,
  header: EnvelopeHeader,
  usage: 'encrypt' | 'decrypt',
  subtle: SubtleCrypto,
) => {
  const copy = fixed(kg, 32);
  try {
    const ikm = await subtle.importKey('raw', copy, 'HKDF', false, ['deriveKey']);
    return await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: envelopeKeyInfo(header) },
      ikm,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage],
    );
  } finally {
    copy.fill(0);
  }
};
/** Low-level cryptographic primitive. The caller owns durable allocation, nonce and signer lifetime. */
export async function sealNetworkEnvelope(
  header: EnvelopeHeader,
  body: EnvelopeBody,
  kg: Bytes,
  signer: CryptoKey,
  nonce: Bytes,
  subtle = crypto.subtle,
): Promise<Bytes> {
  if (header.v !== 2) throw Error('New network envelopes require v2');
  const h = { ...header },
    iv = fixed(nonce, 12),
    aad = envelopeAAD(h),
    generationKey = fixed(kg, 32);
  let plaintext: Bytes | undefined;
  try {
    plaintext = admittedBody(h, body);
    const key = await netKey(generationKey, h, 'encrypt', subtle);
    const ct = new Uint8Array(
      await subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
        key,
        plaintext,
      ),
    );
    const digest = new Uint8Array(await subtle.digest('SHA-256', ct));
    const sig = new Uint8Array(
      await subtle.sign('Ed25519', signer, envelopeSignatureMessage(h, iv, digest)),
    );
    return encodeNetworkEnvelope({ ...h, nonce: iv, digest, ct, sig });
  } finally {
    plaintext?.fill(0);
    generationKey.fill(0);
  }
}
/** Content-blind check under a caller-resolved key and exact authenticated route.
 * A true signature does NOT establish membership, acceptance, freshness or actor authorization.
 */
export async function verifyNetworkEnvelope(
  input: Bytes,
  route: EnvelopeRoute,
  signer: CryptoKey,
  subtle = crypto.subtle,
): Promise<NetworkEnvelope> {
  const e = decodeNetworkEnvelope(input);
  if (
    e.v !== route.v ||
    e.workspace_id !== route.workspace_id ||
    e.credential_id !== route.credential_id ||
    e.epoch !== route.epoch ||
    e.gen !== route.gen
  )
    throw Error('Envelope route mismatch');
  if (hex(new Uint8Array(await subtle.digest('SHA-256', e.ct))) !== hex(e.digest))
    throw Error('Envelope digest mismatch');
  if (
    !(await subtle.verify('Ed25519', signer, e.sig, envelopeSignatureMessage(e, e.nonce, e.digest)))
  )
    throw Error('Envelope signature mismatch');
  return e;
}
export async function openNetworkEnvelope(
  input: Bytes,
  route: EnvelopeRoute,
  signer: CryptoKey,
  kg: Bytes,
  subtle = crypto.subtle,
): Promise<EnvelopeBody> {
  // Capture caller inputs before the first await; verified bytes are detached by the decoder.
  const key = fixed(kg, 32);
  let plaintext: Bytes | undefined;
  try {
    const e = await verifyNetworkEnvelope(input, route, signer, subtle);
    plaintext = new Uint8Array(
      await subtle.decrypt(
        { name: 'AES-GCM', iv: e.nonce, additionalData: envelopeAAD(e), tagLength: 128 },
        await netKey(key, e, 'decrypt', subtle),
        e.ct,
      ),
    );
    return decodeEnvelopeBody(plaintext);
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}
