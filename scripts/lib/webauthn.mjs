/**
 * The WebAuthn assertion ceremony, in one place (TRD §13.9, §13.8).
 *
 * Two selections put an assertion from the account credential in front of an
 * operation, and they are different operations with different challenges:
 * **row 12** gates opening a device-local slot, and **row 14 §5** gates
 * replacing the recovery envelope. What they share is the ceremony underneath —
 * how `authenticatorData` is laid out, how the user agent serializes
 * `clientDataJSON`, and what the credential actually signs.
 *
 * That much lives here rather than in both generators, on row 14 §9's rule
 * about its own primitive KATs: repeating a fact creates a second place for it
 * to be true, and a ceremony copied into two files is exactly the shape that
 * drifts when one of them gains a member.
 *
 * **What does not live here is either challenge.** A challenge is the selection
 * — it is where the operation is bound, it is what each row's negatives have to
 * isolate field by field, and it belongs in the file a reviewer reads beside
 * the record that argues it.
 */

import { webcrypto as crypto } from 'node:crypto';

const utf8 = (s) => new TextEncoder().encode(s);

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const u32be = (n) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/** Base64url, which is how a challenge reaches `clientDataJSON`. */
export const b64url = (u) => Buffer.from(u).toString('base64url');

/** WebAuthn authenticator-data flag bits. UP is presence; UV is verification. */
export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;

/**
 * authenticatorData = rpIdHash(32) || flags(1) || signCount(4, big-endian)
 *
 * No attested credential data and no extensions: these are assertions, not
 * registrations, and neither row uses a WebAuthn extension at all. That absence
 * is why this credential can root on the authenticator where §13.3's device
 * lock could not — PRF is an extension whose availability is a matrix of OS,
 * browser and authenticator kind, and a signature is the core of the API.
 */
export const authenticatorData = async ({ rpId, flags, signCount }) =>
  concat(await sha256(utf8(rpId)), new Uint8Array([flags]), u32be(signCount));

/**
 * clientDataJSON, as the user agent serializes it.
 *
 * **The verifier must hash the bytes it received and parse them for fields.**
 * It may not re-serialize this object and compare: the exact bytes are the user
 * agent's, key order and whitespace included, and they are inside the
 * signature. Reconstructing them is the WebAuthn implementation error that
 * looks correct until a browser adds a member.
 */
export const clientDataJSON = ({ type, challenge, origin, crossOrigin = false, topOrigin = null }) =>
  utf8(
    JSON.stringify({
      type,
      challenge: b64url(challenge),
      origin,
      // `null` means OMIT the member, which is a case the policy below has to
      // accept: `crossOrigin` is optional in the serialization and a missing one
      // is the ordinary same-origin ceremony. The defaults reproduce the bytes
      // both rows already publish.
      ...(crossOrigin === null ? {} : { crossOrigin }),
      ...(topOrigin === null ? {} : { topOrigin }),
    }),
  );

/**
 * The selected embedding policy: **same-origin only** (`S0-1`, `P-5`, TRD §13.9).
 *
 * Neither verifier read these two members, so an assertion collected in a
 * delegated iframe — this exact origin, this RP ID, this challenge — verified.
 * The `origin` check does not cover it: in a cross-origin frame the caller is
 * still the legitimate app origin while the top-level one differs
 * (`f-b9ff071-webauthn-cross-origin-policy`).
 *
 * **Two checks, because a client can contradict itself.** `topOrigin` appears
 * only when `crossOrigin` is true, so client data carrying `crossOrigin: false`
 * *and* a `topOrigin` is malformed — and a verifier reading only the boolean
 * accepts an embedding recorded in the bytes it just hashed.
 *
 * **Absent is not false.** The member is optional, so the test is `!== true`.
 *
 * There is no allowlist: there is no embedding partner, §10.9's boundary is this
 * origin, and a list with no entries is failure modes arriving before benefits.
 * CSP `frame-ancestors 'none'` makes the frame unreachable and is row 17's; this
 * is the half that can be verified from the repository.
 *
 * It lives here rather than in the two generators because **the omission was in
 * both of them**, which is exactly the drift this file was extracted to stop.
 */
export const checkEmbedding = (cd) => {
  if (cd.crossOrigin === true) {
    throw new Error('client data says crossOrigin: the ceremony was performed in a frame');
  }
  if (cd.topOrigin !== undefined) {
    throw new Error(`client data claims an embedding origin: topOrigin ${cd.topOrigin}`);
  }
};

/** What the credential signs: authenticatorData || SHA-256(clientDataJSON). */
export const signedBytes = async (authData, clientData) =>
  concat(authData, await sha256(clientData));
