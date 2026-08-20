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
export const clientDataJSON = ({ type, challenge, origin }) =>
  utf8(JSON.stringify({ type, challenge: b64url(challenge), origin, crossOrigin: false }));

/** What the credential signs: authenticatorData || SHA-256(clientDataJSON). */
export const signedBytes = async (authData, clientData) =>
  concat(authData, await sha256(clientData));
