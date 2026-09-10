import { es256Signature } from './es256Signature';
/**
 * The device-local slot verifier (TRD §13.9, §15 row 12).
 *
 * Reopening a closed slot on this device requires proof of the account
 * credential. The proof is a WebAuthn assertion, checked here, offline, against
 * a **service-signed binding** held in §6.5's slot index — and what it opens is
 * already-local state. It grants no relay token, no account session and no
 * authorization change; when the service is reachable it authenticates the
 * account separately and restores network capability. That scoping is the whole
 * reason this verifier is allowed to be offline.
 *
 * **The binding is checked first, and the order is load-bearing.** §6.5's index
 * holds a structured clone whose properties the load path trusts, so a profile
 * holder can substitute a public key into it. An asymmetric verifier removes the
 * guessable secret and introduces exactly that substitutable key; the anchor is
 * the service's signature over
 *
 *     LP("done/slotbind/v1") || LP(dec v) || LP(account_id) || LP(principal_id)
 *       || LP(rp_id) || LP(dec epoch) || LP(cred_id) || LP(hex public_key)
 *
 * under the authorization key of the epoch it names (§13.5). Everything after
 * step 1 trusts a key that came out of IndexedDB, so step 1 is what makes that
 * trust earned. Substituting a key needs the service's private key rather than
 * write access to the profile.
 *
 * **The challenge binds the operation, not a clock** (row 14 §5's rule, reused
 * here at a challenge with different provenance):
 *
 *     challenge = SHA-256( LP("done/slotunlock/v1") || LP(dec v)
 *                          || LP(principal_id) || LP(cred_id) || LP(hex nonce) )
 *
 * with 32 fresh random bytes per attempt. There is no freshness window and
 * nothing to tune. **The label is the purpose**: it is what stops a slot-unlock
 * assertion being replayed to the service as a sign-in, the service's own
 * challenges being service-issued and single-use is the second and independent
 * refusal (§11.2 test 16).
 *
 * `principal_id` and `cred_id` are read out of the verified binding rather than
 * accepted beside it. They are not independent inputs to a real attempt — the
 * client mints its challenge for the credential the binding names — and taking
 * them from the caller would let a bug quietly verify a challenge minted for
 * somebody else. The generator's model parameterizes them because its negatives
 * have to vary each bound field alone; that is the vectors' job, not this
 * verifier's.
 *
 * **The bytes this file does not own.** `client_data_json` is hashed and parsed,
 * never rebuilt: the exact bytes are the user agent's, key order and whitespace
 * included, and they are inside the signature. Re-serializing is the WebAuthn
 * implementation error that stays correct until a browser adds a member.
 */

/** The compiled-in construction labels. Changing either is a carrier version. */
export const SLOT_BIND_LABEL = 'done/slotbind/v1';
export const SLOT_UNLOCK_LABEL = 'done/slotunlock/v1';
export const SLOT_BIND_VERSION = 1;
export const SLOT_UNLOCK_VERSION = 1;

/** WebAuthn authenticator-data flag bits. UP is presence; UV is verification. */
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;

/**
 * The accepted public-key encodings, and it is a **set of two**, matched by
 * prefix, with everything else refused rather than guessed at.
 *
 * A credential's public key is stored as SubjectPublicKeyInfo — what
 * `PublicKeyCredential.getPublicKey()` returns and what WebCrypto imports — so
 * the encoding names its own algorithm and there is no separate `alg` field to
 * bind. An earlier draft bound one and the AAD coverage audit took it out: the
 * algorithm is a function of the key encoding, so no negative can vary it alone.
 *
 * Ed25519 (COSE -8) is preferred and ES256 (COSE -7) accepted, in that order.
 * Both verify in WebCrypto, which is why this row needs no polyfill.
 */
const SPKI = [
  {
    prefix: '302a300506032b6570032100',
    importAs: { name: 'Ed25519' } as const,
    verifyWith: { name: 'Ed25519' } as const,
  },
  {
    prefix: '3059301306072a8648ce3d020106082a8648ce3d030107034200',
    importAs: { name: 'ECDSA', namedCurve: 'P-256' } as const,
    verifyWith: { name: 'ECDSA', hash: 'SHA-256' } as const,
  },
] as const;

/**
 * Why a verifier refused, as a value rather than a message.
 *
 * The caller has to tell a person something, and a slot that will not open is
 * the one moment this product cannot answer with a shrug. A string would make
 * that copy a substring match; these are the refusals §13.9 enumerates, in the
 * order they are checked.
 */
export type SlotRefusal =
  | 'binding-not-signed-by-the-service'
  | 'unknown-key-encoding'
  | 'assertion-from-an-unbound-credential'
  | 'client-data-unreadable'
  | 'client-data-is-not-an-assertion'
  | 'client-data-origin-mismatch'
  | 'embedded-ceremony'
  | 'challenge-is-not-the-one-minted'
  | 'rp-id-mismatch'
  | 'user-presence-not-asserted'
  | 'user-verification-not-asserted'
  | 'authenticator-data-truncated'
  | 'assertion-signature-invalid';

/** The service-signed binding §6.5's index holds for one credential. */
export interface SlotBinding {
  v: number;
  accountId: string;
  principalId: string;
  rpId: string;
  /** The lineage epoch whose authorization key signed this (§13.5). */
  epoch: number;
  credId: string;
  /** SubjectPublicKeyInfo, hex. The algorithm is inside these bytes. */
  publicKey: string;
}

/** What `navigator.credentials.get()` came back with, unmodified. */
export interface SlotAssertion {
  /** The returned credential id. Outside the signature; answered by the binding. */
  credentialId: string;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}

export interface SlotUnlockAttempt {
  binding: SlotBinding;
  /** Ed25519 over `slotBindingMessage(binding)`. */
  bindingSignature: Uint8Array;
  /** Raw Ed25519 public key of the authorization key for `binding.epoch`. */
  authorizationKey: Uint8Array;
  /** The 32 random bytes this attempt minted, hex — the challenge's only input. */
  nonce: string;
  /** The origin this application is served from; in the app, `location.origin`. */
  origin: string;
  assertion: SlotAssertion;
}

export type SlotUnlockResult =
  | {
      opened: true;
      /**
       * Read, and deliberately not enforced. WebAuthn's counter exists to detect
       * a cloned authenticator, and a synced passkey — one that follows the
       * person rather than the device — cannot maintain one and reports zero
       * forever. A verifier enforcing monotonicity refuses the ordinary case
       * while detecting nothing. Surfaced here so the omission is visible rather
       * than looking like an oversight.
       */
      signCount: number;
    }
  | { opened: false; refusal: SlotRefusal };

/* -------------------------------------------------------------------------- */
/* Encoding                                                                    */

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** `LP(s) = uint16be(byteLength(utf8 s)) || utf8 s`. Injective, per row 2 §4. */
const lp = (s: string): Uint8Array => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff)
    throw new RangeError(`field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

const unhex = (s: string): Uint8Array => {
  if (s.length % 2 !== 0 || /[^0-9a-f]/iu.test(s)) throw new SyntaxError('not hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Base64url, which is how a challenge reaches `clientDataJSON`. */
const b64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

/* -------------------------------------------------------------------------- */
/* The two constructions                                                       */

/** The bytes the service signs to anchor one credential's key to this account. */
export const slotBindingMessage = (binding: SlotBinding): Uint8Array =>
  concat(
    lp(SLOT_BIND_LABEL),
    lp(String(binding.v)),
    lp(binding.accountId),
    lp(binding.principalId),
    lp(binding.rpId),
    lp(String(binding.epoch)),
    lp(binding.credId),
    lp(binding.publicKey),
  );

/**
 * The challenge for one unlock attempt. The caller mints `nonce` fresh — 32
 * random bytes — and hands the same value back to {@link verifySlotUnlock}.
 */
export const slotUnlockChallenge = async ({
  v = SLOT_UNLOCK_VERSION,
  principalId,
  credId,
  nonce,
}: {
  v?: number;
  principalId: string;
  credId: string;
  nonce: string;
}): Promise<Uint8Array> =>
  sha256(concat(lp(SLOT_UNLOCK_LABEL), lp(String(v)), lp(principalId), lp(credId), lp(nonce)));

/** 32 fresh random bytes, hex — one attempt's whole contribution to its challenge. */
export const mintUnlockNonce = (): string => hex(crypto.getRandomValues(new Uint8Array(32)));

/* -------------------------------------------------------------------------- */
/* The ceremony                                                                */

const verifyUnder = async (
  spkiHex: string,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean | null> => {
  const accepted = SPKI.find((entry) => spkiHex.startsWith(entry.prefix));
  // Null is not false: an encoding outside the compiled-in set is refused as
  // unrecognized rather than reported as a bad signature, because they are
  // different answers and only one of them means "try again".
  if (!accepted) return null;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      unhex(spkiHex) as BufferSource,
      accepted.importAs,
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
  const encoded = accepted.importAs.name === 'ECDSA' ? es256Signature(signature) : signature;
  if (!encoded) return false;
  return crypto.subtle.verify(
    accepted.verifyWith,
    key,
    encoded as BufferSource,
    message as BufferSource,
  );
};

const verifyEd25519 = async (
  rawKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> => {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature as BufferSource,
      message as BufferSource,
    );
  } catch {
    return false;
  }
};

/**
 * Verify one slot-unlock attempt. Never throws on hostile input: every rejection
 * is a {@link SlotRefusal}, because the caller has to render one.
 *
 * The steps are §13.9's, in its order — binding, credential id, client data,
 * authenticator data, signature — and the order is the reason the rest may trust
 * a public key that came out of a structured clone.
 */
export const verifySlotUnlock = async ({
  binding,
  bindingSignature,
  authorizationKey,
  nonce,
  origin,
  assertion,
}: SlotUnlockAttempt): Promise<SlotUnlockResult> => {
  const refuse = (refusal: SlotRefusal): SlotUnlockResult => ({ opened: false, refusal });

  // 1. The anchor. Without it everything below verifies against whatever key the
  //    profile happens to contain, which is the key an attacker with write
  //    access to IndexedDB chose.
  if (!(await verifyEd25519(authorizationKey, bindingSignature, slotBindingMessage(binding)))) {
    return refuse('binding-not-signed-by-the-service');
  }

  // 2. The stored encoding is one of the two, decided before it is used for
  //    anything. A valid DER key of the wrong kind — X25519 is the shape of this
  //    mistake — is refused here rather than reaching an importKey that would
  //    fail for a reason nobody can act on.
  if (!SPKI.some((entry) => binding.publicKey.startsWith(entry.prefix))) {
    return refuse('unknown-key-encoding');
  }

  // 3. The assertion came from the credential this binding names. The returned
  //    id is outside the signature, and it is answered by the binding rather
  //    than by a second signed list.
  if (assertion.credentialId !== binding.credId) {
    return refuse('assertion-from-an-unbound-credential');
  }

  // 4. Client data — parsed, never rebuilt.
  let clientData: {
    type?: unknown;
    origin?: unknown;
    challenge?: unknown;
    crossOrigin?: unknown;
    topOrigin?: unknown;
  };
  try {
    clientData = JSON.parse(
      new TextDecoder().decode(assertion.clientDataJSON),
    ) as typeof clientData;
  } catch {
    return refuse('client-data-unreadable');
  }
  if (clientData === null || typeof clientData !== 'object')
    return refuse('client-data-unreadable');
  if (clientData.type !== 'webauthn.get') return refuse('client-data-is-not-an-assertion');
  if (clientData.origin !== origin) return refuse('client-data-origin-mismatch');

  // Same-origin only, and it is **two** checks rather than one. `topOrigin` is
  // emitted only when `crossOrigin` is true, so client data carrying
  // `crossOrigin: false` *and* a `topOrigin` is a client contradicting itself,
  // and a verifier reading only the boolean accepts an embedding recorded in the
  // bytes it just hashed. Absent is not false: the member is optional and a
  // missing one is the ordinary same-origin ceremony, so the test is `!== true`.
  // The exact `origin` and `rpIdHash` checks do not make this redundant — in a
  // delegated frame the caller is still the legitimate app origin while the
  // top-level one differs.
  if (clientData.crossOrigin === true) return refuse('embedded-ceremony');
  if (clientData.topOrigin !== undefined) return refuse('embedded-ceremony');

  const minted = await slotUnlockChallenge({
    principalId: binding.principalId,
    credId: binding.credId,
    nonce,
  });
  if (clientData.challenge !== b64url(minted)) return refuse('challenge-is-not-the-one-minted');

  // 5. Authenticator data. `rpIdHash` and the flags are inside the signature, so
  //    reading them here and verifying below are the same check twice by
  //    construction — which is why this row needs no second bound field list.
  if (assertion.authenticatorData.length < 37) return refuse('authenticator-data-truncated');
  if (hex(assertion.authenticatorData.subarray(0, 32)) !== hex(await sha256(utf8(binding.rpId)))) {
    return refuse('rp-id-mismatch');
  }
  const flags = assertion.authenticatorData[32] ?? 0;
  if ((flags & FLAG_UP) === 0) return refuse('user-presence-not-asserted');
  // The gate is *verification*. A UP-only assertion is a click, and a click is
  // what the person at a shared keyboard already has.
  if ((flags & FLAG_UV) === 0) return refuse('user-verification-not-asserted');

  // 6. The assertion signature, under the algorithm the stored encoding names.
  const signed = concat(assertion.authenticatorData, await sha256(assertion.clientDataJSON));
  const verified = await verifyUnder(binding.publicKey, assertion.signature, signed);
  if (verified === null) return refuse('unknown-key-encoding');
  if (!verified) return refuse('assertion-signature-invalid');

  const view = new DataView(
    assertion.authenticatorData.buffer,
    assertion.authenticatorData.byteOffset,
    assertion.authenticatorData.byteLength,
  );
  return { opened: true, signCount: view.getUint32(33, false) };
};
