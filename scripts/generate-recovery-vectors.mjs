/**
 * Test vectors for the recovery code and its envelope (TRD §15 row 14, §13.8).
 *
 * The construction is specified in docs/selections/row-14-recovery-code.md.
 * This script is the executable half of that document: it emits
 * test/vectors/recovery-code.json, which Stage 4's implementation must
 * reproduce byte for byte.
 *
 * Three kinds of vector, and the split is the point:
 *
 *   - The *encoding* vectors pin how random bytes become a code the user
 *     transcribes. This is where entropy is silently lost — a modulo that is
 *     not a power of two, a bit-packing step off by one — and none of it is
 *     visible in a ciphertext comparison.
 *   - The *normalization* vectors pin what the input field accepts. Crockford
 *     Base32's whole reason for being selected is that O/0 and I/1/L are
 *     transcription errors it can absorb, and an implementation that skips
 *     that mapping is one that turns a correct transcription into a lost
 *     workspace.
 *   - The *seal* vectors pin the derivation, the AAD and the envelope framing.
 *
 * The primitives' known-answer tests are not repeated here: HKDF-SHA-256 and
 * AES-256-GCM are row 1's selections and row 1's vectors carry their published
 * KATs. What this file adds is the X25519 keypair, which is RFC 7748 §6.1's
 * published pair and is verified rather than asserted — the generator derives
 * the public key from the private scalar and refuses to write a file if they
 * are not a genuine pair. An AAD that binds a public key to a private one is
 * worth nothing if the vector's own two halves do not match.
 *
 * Usage: node scripts/generate-recovery-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto, createPrivateKey, createPublicKey } from 'node:crypto';

import { aadFields, assertedNames, eliding, refuses, reportAudit } from './lib/aad-coverage.mjs';
import {
  FLAG_UP,
  FLAG_UV,
  authenticatorData,
  b64url,
  clientDataJSON,
  signedBytes,
} from './lib/webauthn.mjs';

const OUT = new URL('../test/vectors/recovery-code.json', import.meta.url);

const LABEL = 'done/recovery/v1';
const REPLACE_LABEL = 'done/recovery-replace/v1';
const ENVELOPE_VERSION = 1;
const STEPUP_VERSION = 1;
const SYMBOLS = 25;
const GROUP = 5;

/**
 * The step-up ceremony's fixed parts (§5 of the selection).
 *
 * The relying party, the origin and the credential are row 12's: the assertion
 * that answers a step-up is the account credential's, and there is not a second
 * one. Only the *challenge* is this row's, which is the whole reason the two
 * constructions are separable at all.
 */
const RP_ID = 'app.done.invalid';
const ORIGIN = 'https://app.done.invalid';

/** Row 12's slot-unlock label, used here only as a label that is not this one. */
const UNLOCK_LABEL = 'done/slotunlock/v1';

const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

/**
 * Two row 15 transition ids, and this construction treats them as what they are
 * to it: **opaque 32-byte digests**. Their internal structure is row 15's and is
 * tested there — `kind` is bound inside the Intent, so an assertion minted for a
 * `replace-recovery` cannot be redirected to a `retire` without changing the id.
 * Recomputing that here would put row 15's message encoding in a second file and
 * give it a second chance to disagree with itself.
 */
const INTENT_ID = '2b8f5c1e90a7d34f6e21c058bb47f9a3d5602e8c17439fbd0a6e2c5148d37b09';
const RIVAL_INTENT_ID = 'c47a0d3f18be62915d0fa7c3462b8e10935cd7f4a20e6b8815c3d9027ef4a6b2';

/**
 * The account credential, and a passkey that is not it.
 *
 * Both are RFC 8032 §7.1 seeds, and both are row 12's — same credential, same
 * attacker. The pairing is checked by use rather than asserted: the worked
 * vector signs with the seed and verifies against the published public key, so
 * a mismatched pair fails the generator instead of publishing a vector nobody
 * can reproduce.
 */
const ACCOUNT_CREDENTIAL = {
  role: 'The account credential (row 12), where the authenticator offers Ed25519.',
  source: 'RFC 8032 §7.1, TEST 2',
  seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
  public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
};

/** The nonce the service issued for this attempt, and one it has retired. */
const STEPUP_NONCE = '3f9a1c47e0b85d26fa74310c9e5b8d02a1c76f3e40b295d8c3ea617f0492bd53';
const RETIRED_NONCE = '8e40c31d75af69b208e5f1c34d7092ab6e1503f8c9d24b7e0a31f6584c9d2b70';

const OTHER_PASSKEY = {
  role: "A passkey the account does not know. Whoever runs the origin can enroll one; what they cannot do is make it the account's.",
  source: 'RFC 8032 §7.1, TEST 1',
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
};

/**
 * Crockford Base32. I, L, O and U are absent: the first three because they are
 * the characters a human confuses with 1, 1 and 0, and U because Crockford
 * removes it to reduce the chance of a generated code spelling something the
 * user has to read out to support.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const utf8 = (s) => new TextEncoder().encode(s);
const hex = (u) => Buffer.from(u).toString('hex');
const unhex = (s) => new Uint8Array(Buffer.from(s, 'hex'));

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Length-prefixed field: uint16be(byteLength) || utf8. Injective, per row 2 §4. */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

// --- the code -----------------------------------------------------------------

/**
 * 25 symbols, one per byte, from the low 5 bits.
 *
 * 256 = 8 x 32, so `byte & 0x1f` hits each symbol exactly eight times and the
 * mask is uniform without rejection sampling. That property is asserted below
 * rather than trusted, because it is the entire entropy argument and it is one
 * alphabet-length change away from being false.
 *
 * The three discarded bits per byte are deliberate. Packing 125 bits out of 16
 * bytes would save nine bytes of a value that is never stored, and would add a
 * bit-shuffling step whose failure mode is a code with less entropy than the
 * document claims.
 */
const encode = (bytes) => {
  if (bytes.length !== SYMBOLS) throw new Error(`Need ${SYMBOLS} bytes, got ${bytes.length}`);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 0x1f];
  return out;
};

/** Display form: five groups of five, hyphen-separated, uppercase. */
const group = (code) => (code.match(new RegExp(`.{1,${GROUP}}`, 'gu')) ?? []).join('-');

/**
 * The canonical form of whatever the user typed.
 *
 * Uppercase first, so the lowercase confusables are handled by the same three
 * substitutions. U is rejected with its own reason rather than folded to V: it
 * is a character the generator can never emit, so accepting it would convert a
 * transcription error into a well-formed code that fails later, at the seal,
 * with nothing useful to say about which character was wrong.
 */
const normalize = (input) => {
  const stripped = input.replaceAll(/[-\s]/gu, '').toUpperCase();
  let out = '';
  for (const ch of stripped) {
    const mapped = ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch;
    if (mapped === 'U') throw new Error('U never appears in a recovery code');
    if (!ALPHABET.includes(mapped)) throw new Error(`Not a recovery-code character: ${ch}`);
    out += mapped;
  }
  if (out.length !== SYMBOLS) {
    throw new Error(`A recovery code is ${SYMBOLS} characters; got ${out.length}`);
  }
  return out;
};

// --- the envelope -------------------------------------------------------------

/**
 * K_rec = HKDF-SHA256(ikm = utf8(canonical code), salt = salt[16],
 *                     info = LP("done/recovery/v1") || LP(principal_id), L = 32)
 *
 * The IKM is the 25 ASCII characters, not the 125 bits packed down. HKDF's
 * security rests on the entropy in the IKM rather than its length, so packing
 * buys nothing and costs a bit-manipulation step on the one path that has no
 * second chance.
 *
 * No password hash. The code is generated at 125 bits and never chosen by a
 * human, so there is nothing for a work factor to protect — see the selection
 * document, §2.
 */
const deriveRecoveryKey = async (code, salt, principalId) => {
  const ikm = await crypto.subtle.importKey('raw', utf8(code), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: concat(lp(LABEL), lp(principalId)) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
};

/** AAD = LP(label) || LP(principal_id) || LP(dec v) || LP(hex r_pub) */
const aadFor = (principalId, v, rPub, label = LABEL) =>
  concat(
    ...aadFields('recovery envelope', {
      label,
      principal_id: principalId,
      v: String(v),
      r_pub: hex(rPub),
    }).map(lp),
  );

const seal = async (kRec, nonce, aad, rPriv) => {
  const key = await crypto.subtle.importKey('raw', kRec, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
    key,
    rPriv,
  );
  return new Uint8Array(ct);
};

const unseal = async (kRec, nonce, aad, ct) => {
  const key = await crypto.subtle.importKey('raw', kRec, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
    key,
    ct,
  );
  return new Uint8Array(pt);
};

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- step-up: the challenge, and the ceremony that answers it ---------------------

/**
 * The step-up challenge the service issues for a recovery replacement
 * (selection §5).
 *
 *   challenge = SHA-256( LP("done/recovery-replace/v1") || LP(dec v)
 *                        || LP(hex intent_id) || LP(hex nonce) )
 *
 * **Bound to the operation rather than to a clock.** A freshness window is a
 * parameter with no principled value, and the thing it approximates is *this
 * assertion was collected for this operation*, so the operation is bound
 * directly. Nothing to tune, and nothing to get wrong on a device whose clock
 * is off.
 *
 * **The nonce is what makes "single-use" true rather than said.** Without it
 * the challenge is a pure function of the operation, so an assertion collected
 * for a replacement that never completed stays presentable forever — row 9's
 * finding, that a signed artifact with no nonce is a standing artifact and
 * replay needs no key at all. 32 fresh bytes per attempt, issued by the service
 * and retired on use.
 *
 * **It binds the transition id, not the new public key**, which is a change
 * from §5's draft and is row 15's doing: when §5 was written the operation had
 * no name, so it named the operation's target instead. The id covers `kind`,
 * the lineage, the parent epoch and the payload — the new public key among it —
 * so binding the key beside the id would be a second binding of a fact already
 * inside it, which rows 10, 12 and 15 each refused for the same reason.
 *
 * **And it binds no principal or credential id, where §13.9's slot-unlock
 * challenge binds both.** The two have opposite provenance: that one is
 * client-constructed for a device-local gate, so it names device-local things,
 * while this one is service-issued for a service operation and names the
 * operation as the service knows it. Binding a credential id here would also
 * forbid answering from a second passkey the account has registered, which is a
 * feature rather than an attack.
 */
const stepUpChallenge = async ({ label = REPLACE_LABEL, v, intentId, nonce }) =>
  sha256(
    concat(
      ...aadFields('step-up challenge', {
        label,
        v: String(v),
        intent_id: intentId,
        nonce,
      }).map(lp),
    ),
  );

const edSign = async (seedHex, message) =>
  new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      await crypto.subtle.importKey(
        'pkcs8',
        unhex(ED25519_PKCS8_PREFIX + seedHex),
        { name: 'Ed25519' },
        false,
        ['sign'],
      ),
      message,
    ),
  );

const edVerify = async (publicHex, sig, message) =>
  crypto.subtle.verify(
    { name: 'Ed25519' },
    await crypto.subtle.importKey('raw', unhex(publicHex), { name: 'Ed25519' }, false, ['verify']),
    sig,
    message,
  );

/** One assertion, as the authenticator would produce it over a given challenge. */
const assertOver = async (
  seedHex,
  challenge,
  { flags = FLAG_UP | FLAG_UV, signCount = 0 } = {},
) => {
  const authData = await authenticatorData({ rpId: RP_ID, flags, signCount });
  const clientData = clientDataJSON({ type: 'webauthn.get', challenge, origin: ORIGIN });
  return {
    authData,
    clientData,
    signature: await edSign(seedHex, await signedBytes(authData, clientData)),
  };
};

/**
 * The attacker's move, and every step-up negative below makes it.
 *
 * An assertion collected over the wrong challenge, presented unmodified, is
 * refused by a **string comparison** between the challenge in `clientDataJSON`
 * and the one the service issued — and that comparison fails whether or not the
 * challenge is signed at all. Rewriting `clientDataJSON` to carry the wanted
 * challenge is what forces the refusal onto the signature, and it is also what
 * a real attacker would do, since the bytes are theirs to edit.
 *
 * Row 9 found this three rows after building the construction it applied to.
 * Here it is the shape of the whole negative group.
 */
const presentedAs = (assertion, wantedChallenge) => ({
  ...assertion,
  clientData: clientDataJSON({ type: 'webauthn.get', challenge: wantedChallenge, origin: ORIGIN }),
});

/**
 * The verifier, and every step-up vector runs through it.
 *
 * `clientDataJSON` is **parsed, never rebuilt** (§13.9): the exact bytes are the
 * user agent's, key order and whitespace included, and they are inside the
 * signature.
 */
const verifyStepUp = async ({ publicHex = ACCOUNT_CREDENTIAL.public_key, wanted, assertion }) => {
  const challenge = await stepUpChallenge(wanted);
  const cd = JSON.parse(new TextDecoder().decode(assertion.clientData));

  if (cd.type !== 'webauthn.get') throw new Error('not an assertion');
  if (cd.origin !== ORIGIN) throw new Error('assertion collected on another origin');
  if (cd.challenge !== b64url(challenge)) throw new Error('challenge is not the one issued');
  if (hex(assertion.authData.subarray(0, 32)) !== hex(await sha256(utf8(RP_ID)))) {
    throw new Error('assertion is for another relying party');
  }
  const flags = assertion.authData[32];
  if (!(flags & FLAG_UP)) throw new Error('user presence not asserted');
  if (!(flags & FLAG_UV)) throw new Error('user verification not asserted');
  if (
    !(await edVerify(
      publicHex,
      assertion.signature,
      await signedBytes(assertion.authData, assertion.clientData),
    ))
  ) {
    throw new Error('assertion signature does not verify');
  }
  return challenge;
};

// --- the keypair, published rather than ours ----------------------------------

const KEYPAIR_KAT = {
  source: 'RFC 7748 §6.1',
  note: "Alice's X25519 keypair. Used so the vector's own keypair is itself a known-answer test; the generator derives the public key from the scalar and fails if they do not match.",
  r_priv: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  r_pub: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
};

const PKCS8_X25519_PREFIX = unhex('302e020100300506032b656e04220420');

/** Derive the X25519 public key from a raw scalar, through Node's key objects. */
const publicFromScalar = (scalar) => {
  const der = Buffer.from(concat(PKCS8_X25519_PREFIX, scalar));
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return new Uint8Array(spki.subarray(-32));
};

const checkKeypairKat = () => {
  const derived = hex(publicFromScalar(unhex(KEYPAIR_KAT.r_priv)));
  if (derived !== KEYPAIR_KAT.r_pub) {
    throw new Error(`Keypair KAT failed: scalar yields ${derived}, not ${KEYPAIR_KAT.r_pub}`);
  }
};

/**
 * The alphabet's two structural properties, asserted rather than described.
 *
 * The first is the entropy argument: every symbol must have exactly eight
 * preimages under `byte & 0x1f`, or the codes are biased and the 125-bit claim
 * is false. The second is the transcription argument: the four confusable
 * characters must be absent, or normalization maps a character onto one the
 * generator can also emit and two distinct codes collide.
 */
const checkAlphabet = () => {
  if (ALPHABET.length !== 32) throw new Error(`Alphabet is ${ALPHABET.length} symbols, not 32`);
  if (new Set(ALPHABET).size !== 32) throw new Error('Alphabet has a duplicate symbol');
  for (const ch of 'ILOU') {
    if (ALPHABET.includes(ch)) throw new Error(`Alphabet must not contain ${ch}`);
  }
  const preimages = new Map();
  for (let b = 0; b < 256; b++) {
    const s = ALPHABET[b & 0x1f];
    preimages.set(s, (preimages.get(s) ?? 0) + 1);
  }
  for (const [s, n] of preimages) {
    if (n !== 8) throw new Error(`Symbol ${s} has ${n} preimages, not 8 — the mask is biased`);
  }
};

// --- the cases ----------------------------------------------------------------

const PRINCIPAL = 'pr_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const SALT = unhex('9f3c1a70d4b28e6501fa47c39b0d5e82');
const NONCE = unhex('0b1d2e3f4a5b6c7d8e9fa0b1');

const ENCODING_CASES = [
  {
    name: 'all-zero-bytes',
    why: 'Pins symbol 0. A code of all zeroes is a legal code, and an implementation that special-cases it is wrong.',
    bytes: '00'.repeat(SYMBOLS),
  },
  {
    name: 'ascending-bytes',
    why: 'Bytes 0x00..0x18 walk the first 25 symbols in order, pinning the alphabet itself.',
    bytes: Array.from({ length: SYMBOLS }, (_, i) => i.toString(16).padStart(2, '0')).join(''),
  },
  {
    name: 'high-bits-set',
    why: 'Bytes 0xE0..0xF8 must encode identically to 0x00..0x18. Proves the three discarded bits are discarded, and catches an implementation that reaches for a modulo instead of a mask.',
    bytes: Array.from({ length: SYMBOLS }, (_, i) => (0xe0 + i).toString(16)).join(''),
  },
  {
    name: 'generated-code',
    why: 'A realistic draw, and the code the seal vectors below use.',
    bytes: '4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e',
  },
];

const NORMALIZATION_CASES = [
  { name: 'already-canonical', why: 'The identity case.' },
  { name: 'lowercase', why: 'A user transcribing into a phone keyboard gets lowercase for free.' },
  {
    name: 'letter-o-for-zero',
    why: 'The confusion Crockford exists to absorb, in the direction people actually make it.',
  },
  { name: 'letter-i-for-one', why: 'A handwritten 1 read back as I.' },
  {
    name: 'letter-l-for-one',
    why: 'The same 1 read back as l, which is the worse of the two in a sans-serif face.',
  },
  {
    name: 'spaces-instead-of-hyphens',
    why: 'Separators are presentation. Any run of them, anywhere, is dropped.',
  },
  {
    name: 'no-separators',
    why: 'Pasted out of a password manager that stored the canonical form.',
  },
  {
    name: 'mixed-confusables',
    why: 'Lowercase, both substitutions and the wrong separator at once — one person copying handwriting into a phone. Every rule fires on the same input, which is the case an implementation that applies them in the wrong order gets wrong.',
  },
];

const REJECTED = [
  {
    input: 'ABCDE-FGHJK-MNPQR-STVWX-YZUZ0',
    reason: 'Contains U, which the generator can never emit',
  },
  { input: 'ABCDE-FGHJK-MNPQR-STVWX-YZ01', reason: '24 symbols — too short' },
  { input: 'ABCDE-FGHJK-MNPQR-STVWX-YZ0123', reason: '26 symbols — too long' },
  {
    input: 'ABCDE-FGHJK-MNPQR-STVWX-YZ01!',
    reason: 'Punctuation is not a separator and not a symbol',
  },
];

const MUST_FAIL = [
  { name: 'wrong-code', mutate: 'Change one symbol of the code, then derive and unseal.' },
  { name: 'wrong-salt', mutate: 'Derive with a salt of 16 zero bytes.' },
  {
    name: 'wrong-principal',
    mutate:
      'Derive and authenticate against a second principal id. Changes both halves at once -- the AAD half alone is aad-only-other-principal.',
  },
  {
    name: 'rebound-public-key',
    mutate:
      "Authenticate with Bob's public key in the AAD — the envelope re-paired with a public key that is not its own.",
  },
  { name: 'downgraded-version', mutate: 'Authenticate with v=0 in the AAD.' },
  { name: 'flipped-tag-bit', mutate: 'Flip the low bit of the final tag byte.' },
  { name: 'truncated-ciphertext', mutate: 'Drop the final byte of the sealed envelope.' },
  // The AAD-only group. Every field in the AAD needs an entry here or its
  // binding is untested: principal_id is bound in the derivation as well, so a
  // negative that changes both proves only that one of the two works.
  {
    name: 'aad-only-other-principal',
    mutate:
      'The correct K_rec, with the AAD naming a second principal. Isolates the AAD binding from the derivation.',
  },
  {
    name: 'aad-only-devicelock-label',
    mutate:
      "Authenticate with row 13's device-lock label. Both constructions seal a key under a 125-bit generated code, so the label is what stops a local device-lock seal being presented as this service-held envelope.",
  },
  // The step-up group (§5). Every one of these presents an assertion collected
  // over a challenge that differs in exactly one field, with clientDataJSON
  // rewritten to carry the challenge the service issued -- so the refusal is
  // the signature's rather than a string comparison's.
  {
    name: 'stepup-other-passkey',
    mutate:
      'The correct challenge, signed by a passkey the account does not know. Not an aad-only: it tests that the credential matters, which is the thing every other step-up negative holds constant.',
  },
  {
    name: 'aad-only-stepup-label',
    mutate:
      "An assertion collected for row 12's slot unlock, re-presented as a step-up. The label is the purpose, and this is the negative that says so.",
  },
  {
    name: 'aad-only-stepup-version',
    mutate: 'An assertion collected under v=0, presented against a v=1 challenge.',
  },
  {
    name: 'aad-only-stepup-intent',
    mutate:
      'An assertion collected for a different transition id. Since row 15 binds `kind` inside the Intent, this is also what stops a `replace-recovery` step-up being redirected to a `retire`.',
  },
  {
    name: 'aad-only-stepup-nonce',
    mutate:
      'The replay the nonce exists for: an assertion collected under a nonce the service has since retired, presented against a fresh one. Without the nonce field this negative cannot be built at all, because the challenge would be identical.',
  },
];

// RFC 7748 §6.1 Bob, used only as a public key that is not ours.
const OTHER_PUB = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
const OTHER_PRINCIPAL = 'pr_01J0000000000000000000000A';

// Negatives that appear in the published must_fail list are recorded as they
// run. The normalization rejections share `refuses` but are generated from
// their own case list, so they are excluded from the reconciliation below.

/**
 * Every pinned 32-byte constant is 32 bytes.
 *
 * A transition id or a nonce that is short by a character still
 * length-prefixes, still hashes and still produces a challenge that verifies
 * against itself -- so the vectors would be internally consistent and wrong,
 * which is the one failure a round trip cannot see.
 */
const checkPinnedWidths = () => {
  const pinned = {
    INTENT_ID,
    RIVAL_INTENT_ID,
    STEPUP_NONCE,
    RETIRED_NONCE,
    'ACCOUNT_CREDENTIAL.seed': ACCOUNT_CREDENTIAL.seed,
    'ACCOUNT_CREDENTIAL.public_key': ACCOUNT_CREDENTIAL.public_key,
    'OTHER_PASSKEY.seed': OTHER_PASSKEY.seed,
    'OTHER_PASSKEY.public_key': OTHER_PASSKEY.public_key,
  };
  for (const [name, value] of Object.entries(pinned)) {
    if (!/^[0-9a-f]{64}$/u.test(value)) {
      throw new Error(`${name} is not 32 lowercase hex bytes: "${value}"`);
    }
  }
  if (INTENT_ID === RIVAL_INTENT_ID) throw new Error('The rival transition id is not rival.');
  if (STEPUP_NONCE === RETIRED_NONCE) throw new Error('The retired nonce is the live one.');
};

const main = async () => {
  checkAlphabet();
  checkKeypairKat();
  checkPinnedWidths();

  const rPriv = unhex(KEYPAIR_KAT.r_priv);
  const rPub = unhex(KEYPAIR_KAT.r_pub);

  // Encoding vectors, each re-encoded and checked against what is published.
  const encodingVectors = ENCODING_CASES.map((c) => {
    const code = encode(unhex(c.bytes));
    return {
      name: c.name,
      why: c.why,
      inputs: { random_bytes: c.bytes },
      expected: { canonical: code, display: group(code) },
    };
  });
  for (const v of encodingVectors) {
    if (encode(unhex(v.inputs.random_bytes)) !== v.expected.canonical) {
      throw new Error(`Encoding vector "${v.name}" does not reproduce.`);
    }
    if (normalize(v.expected.display) !== v.expected.canonical) {
      throw new Error(`Display form of "${v.name}" does not normalize back.`);
    }
  }

  const CODE = encodingVectors.find((v) => v.name === 'generated-code').expected.canonical;
  const DISPLAY = group(CODE);

  // Normalization vectors, built from that code so they are all the same secret.
  const variants = {
    'already-canonical': DISPLAY,
    lowercase: DISPLAY.toLowerCase(),
    'letter-o-for-zero': DISPLAY.replaceAll(/0/gu, 'O'),
    'letter-i-for-one': DISPLAY.replaceAll(/1/gu, 'I'),
    'letter-l-for-one': DISPLAY.replaceAll(/1/gu, 'L'),
    'spaces-instead-of-hyphens': DISPLAY.replaceAll(/-/gu, '  '),
    'no-separators': CODE,
    'mixed-confusables': DISPLAY.toLowerCase()
      .replaceAll(/0/gu, 'o')
      .replaceAll(/1/gu, 'l')
      .replaceAll(/-/gu, ' '),
  };
  const normalizationVectors = NORMALIZATION_CASES.map((c) => ({
    name: c.name,
    why: c.why,
    inputs: { typed: variants[c.name] },
    expected: { canonical: CODE },
  }));
  for (const v of normalizationVectors) {
    if (normalize(v.inputs.typed) !== v.expected.canonical) {
      throw new Error(`Normalization vector "${v.name}" does not reach the canonical form.`);
    }
    // A variant that is already the display form exercises nothing. This fires
    // if a regenerated code happens to contain no 0 or no 1, which would turn
    // the two confusable vectors into identity cases without changing a line
    // of the file that publishes them.
    if (v.name !== 'already-canonical' && v.inputs.typed === DISPLAY) {
      throw new Error(`Normalization vector "${v.name}" is identical to the display form.`);
    }
  }
  for (const r of REJECTED) {
    await refuses(`rejected: ${r.reason}`, () => normalize(r.input));
  }

  // Seal vectors.
  const sealCases = [
    {
      name: 'primary-envelope',
      why: 'The envelope as account creation writes it, with RFC 7748 §6.1 as the recovery keypair.',
      principal: PRINCIPAL,
    },
    {
      name: 'second-principal',
      why: 'Same code, same salt, same nonce, different principal. Proves the principal is bound in both the derivation and the AAD — two principals on one profile is the ordinary path, not an attack (row 3 §3).',
      principal: OTHER_PRINCIPAL,
    },
  ];

  const sealVectors = [];
  for (const c of sealCases) {
    const kRec = await deriveRecoveryKey(CODE, SALT, c.principal);
    const aad = aadFor(c.principal, ENVELOPE_VERSION, rPub);
    const ct = await seal(kRec, NONCE, aad, rPriv);
    sealVectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        code: CODE,
        code_display: DISPLAY,
        principal_id: c.principal,
        v: ENVELOPE_VERSION,
        salt: hex(SALT),
        nonce: hex(NONCE),
        r_priv: hex(rPriv),
        r_pub: hex(rPub),
      },
      derived: {
        hkdf_info: hex(concat(lp(LABEL), lp(c.principal))),
        k_rec: hex(kRec),
        aad: hex(aad),
      },
      expected: { ct: hex(ct) },
    });
  }
  for (const v of sealVectors) {
    const got = await unseal(
      unhex(v.derived.k_rec),
      unhex(v.inputs.nonce),
      unhex(v.derived.aad),
      unhex(v.expected.ct),
    );
    if (hex(got) !== v.inputs.r_priv)
      throw new Error(`Seal vector "${v.name}" does not round-trip.`);
  }

  // The negatives, against the primary envelope.
  const base = sealVectors[0];
  const kRec = unhex(base.derived.k_rec);
  const aad = unhex(base.derived.aad);
  const ct = unhex(base.expected.ct);

  const wrongCode = CODE.slice(0, -1) + (CODE.endsWith('0') ? '1' : '0');
  await refuses('wrong-code', async () =>
    unseal(await deriveRecoveryKey(wrongCode, SALT, PRINCIPAL), NONCE, aad, ct),
  );
  await refuses('wrong-salt', async () =>
    unseal(await deriveRecoveryKey(CODE, new Uint8Array(16), PRINCIPAL), NONCE, aad, ct),
  );
  await refuses('wrong-principal', async () =>
    unseal(await deriveRecoveryKey(CODE, SALT, OTHER_PRINCIPAL), NONCE, aad, ct),
  );
  await refuses('rebound-public-key', () =>
    unseal(kRec, NONCE, aadFor(PRINCIPAL, ENVELOPE_VERSION, OTHER_PUB), ct),
  );
  await refuses('downgraded-version', () => unseal(kRec, NONCE, aadFor(PRINCIPAL, 0, rPub), ct));

  const flipped = Uint8Array.from(ct);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-tag-bit', () => unseal(kRec, NONCE, aad, flipped));
  await refuses('truncated-ciphertext', () => unseal(kRec, NONCE, aad, ct.subarray(0, -1)));

  // The AAD-only group: the correct K_rec throughout, one bound field changed.
  await refuses('aad-only-other-principal', () =>
    unseal(kRec, NONCE, aadFor(OTHER_PRINCIPAL, ENVELOPE_VERSION, rPub), ct),
  );
  await refuses('aad-only-devicelock-label', () =>
    unseal(kRec, NONCE, aadFor(PRINCIPAL, ENVELOPE_VERSION, rPub, 'done/devicelock/v1'), ct),
  );

  // --- step-up (§5): one worked assertion, then the negatives -------------------

  const wanted = { v: STEPUP_VERSION, intentId: INTENT_ID, nonce: STEPUP_NONCE };
  const stepUpChallengeBytes = await stepUpChallenge(wanted);
  const stepUpAssertion = await assertOver(ACCOUNT_CREDENTIAL.seed, stepUpChallengeBytes);

  // The keypair is checked by use rather than asserted: this verify is against
  // the *published* public key, so a seed that is not its partner fails here
  // instead of shipping a vector nobody can reproduce.
  await verifyStepUp({ wanted, assertion: stepUpAssertion });

  await refuses('stepup-other-passkey', async () =>
    verifyStepUp({
      wanted,
      assertion: await assertOver(OTHER_PASSKEY.seed, stepUpChallengeBytes),
    }),
  );

  /** Collected over `over`, then presented as though it were `wanted`. */
  const misboundAs = async (over) =>
    presentedAs(
      await assertOver(ACCOUNT_CREDENTIAL.seed, await stepUpChallenge(over)),
      await stepUpChallenge(wanted),
    );

  await refuses('aad-only-stepup-label', async () =>
    verifyStepUp({ wanted, assertion: await misboundAs({ ...wanted, label: UNLOCK_LABEL }) }),
  );
  await refuses('aad-only-stepup-version', async () =>
    verifyStepUp({ wanted, assertion: await misboundAs({ ...wanted, v: 0 }) }),
  );
  await refuses('aad-only-stepup-intent', async () =>
    verifyStepUp({ wanted, assertion: await misboundAs({ ...wanted, intentId: RIVAL_INTENT_ID }) }),
  );
  await refuses('aad-only-stepup-nonce', async () =>
    verifyStepUp({ wanted, assertion: await misboundAs({ ...wanted, nonce: RETIRED_NONCE }) }),
  );

  // A demonstration rather than a negative, because it fails for a reason that
  // is not the one being tested. The naive replay -- the retired assertion
  // presented unmodified -- is refused by the string comparison in the
  // verifier, which would refuse it just as readily if the challenge were
  // signed by nobody. Publishing where it stops is what keeps the four
  // negatives above honest about why they stop somewhere else.
  const naiveReplay = await assertOver(
    ACCOUNT_CREDENTIAL.seed,
    await stepUpChallenge({ ...wanted, nonce: RETIRED_NONCE }),
  );
  let naiveStop = null;
  try {
    await verifyStepUp({ wanted, assertion: naiveReplay });
  } catch (e) {
    naiveStop = e.message;
  }
  // Guarded, because this is an assertion that two challenges *differ*: with the
  // nonce elided they are the same challenge and the replay verifies, which is
  // the audit working rather than the demonstration breaking.
  if (!eliding() && naiveStop !== 'challenge is not the one issued') {
    throw new Error(
      `The naive replay must stop at the challenge comparison, and stopped at: ${naiveStop ?? 'nothing'}`,
    );
  }

  // The published list and the executed checks must be the same list, in both
  // directions. An entry that is published but never run is as invisible as one
  // that has quietly stopped failing.
  const published = new Set(MUST_FAIL.map((m) => m.name));
  const asserted = assertedNames();
  const sealAsserted = asserted.filter((n) => !n.startsWith('rejected: '));
  const unrun = [...published].filter((n) => !asserted.includes(n));
  const unpublished = sealAsserted.filter((n) => !published.has(n));
  if (unrun.length > 0)
    throw new Error(`Negatives published but never asserted: ${unrun.join(', ')}`);
  if (unpublished.length > 0)
    throw new Error(`Negatives asserted but not published: ${unpublished.join(', ')}`);

  reportAudit(MUST_FAIL.map((m) => m.name));

  const doc = {
    $schema: 'https://done.invalid/vectors/recovery-code/1',
    generated_by: 'scripts/generate-recovery-vectors.mjs',
    selection: 'docs/selections/row-14-recovery-code.md',
    trd_row: 14,
    construction: {
      entropy: '125 bits — 25 symbols of 5 bits, generated, never chosen by a human',
      alphabet: `Crockford Base32: ${ALPHABET} (no I, L, O, U)`,
      generation:
        '25 bytes from crypto.getRandomValues(); symbol i = ALPHABET[byte_i & 0x1f]. 256 = 8 x 32, so the mask is uniform: no rejection sampling, no modulo bias',
      display: 'Five groups of five, hyphen-separated, uppercase',
      normalization:
        'Drop hyphens and whitespace, uppercase, then O->0 and I->1 and L->1. U is rejected rather than folded. Exactly 25 symbols',
      stretching:
        'None. No Argon2id, no PBKDF2. At 125 generated bits an offline attack on the service-held envelope is infeasible without a work factor, and a work factor would make the argument conditional on hardware',
      kdf: 'K_rec = HKDF-SHA256(ikm = utf8(canonical code), salt = salt[16], info = LP("done/recovery/v1") || LP(principal_id), L = 32)',
      aad: 'LP("done/recovery/v1") || LP(principal_id) || LP(decimal v) || LP(hex r_pub)',
      length_prefix: 'uint16be(byteLength) || utf8 — injective, so no field can shift another',
      envelope:
        'RecoveryEnvelope = { v: 1, salt: 16 bytes, nonce: 12 bytes, ct: AES-256-GCM over the 32-byte X25519 scalar, tag included }',
      nonce_note:
        'The salt is fresh per seal, so K_rec is fresh per seal and exactly one message is ever encrypted under it. Nonce reuse is structurally unreachable rather than avoided by discipline',
      step_up:
        'Replacement requires content access proven by use, plus a single-use service challenge SHA-256( LP("done/recovery-replace/v1") || LP(dec v) || LP(hex intent_id) || LP(hex nonce) ) answered by an assertion from the account credential. No freshness window: the challenge is bound to the operation. See step_up below',
      not_carried:
        'The code is never sent to the service, never persisted by the client, and never re-displayed once the account exists',
    },
    keypair_kat: KEYPAIR_KAT,
    encoding_vectors: encodingVectors,
    normalization_vectors: normalizationVectors,
    rejected_inputs: REJECTED,
    seal_vectors: sealVectors,
    must_fail: MUST_FAIL,
    step_up: {
      why: 'PRD §7.6 requires replacement to run "from a device that already has content access: after fresh account authentication and an explicit confirmation", and leaves the mechanism here. Three gates, and two of them are free.',
      gates: {
        content_access:
          'Proven by use rather than by a flag. Replacement must rewrap every required content-key generation to the new R_pub, so it has already opened them; checking a permission and then doing the work is two things that can disagree, and requiring the work is the check.',
        device_lock:
          'Implied, not a second prompt. §13.3 makes the lock the gate on opening K_g envelopes and gate 1 opens them, so an implementation that adds a prompt has misread where the lock sits.',
        account_authentication:
          'This construction, and the only one of the three that needed designing.',
      },
      challenge:
        'challenge = SHA-256( LP("done/recovery-replace/v1") || LP(dec v) || LP(hex intent_id) || LP(hex nonce) )',
      answered_by:
        "An assertion from the account credential (row 12) over that challenge. The relying party, the origin and the credential are row 12's; only the challenge is this row's.",
      nonce:
        "32 fresh bytes per attempt, issued by the service and retired on use. Without it the challenge is a pure function of the operation, so an assertion collected for a replacement that never completed would stay presentable forever -- row 9's standing artifact, replayable with no key at all.",
      no_freshness_window:
        'A five-minute window is a parameter with no principled value, and the thing it approximates is "this assertion was collected for this operation". The operation is bound directly instead. No clock, nothing to tune, nothing to get wrong on a device whose clock is off.',
      binds_the_transition_id:
        "Not the new public key, which is a change from the selection's §5 draft and is row 15's doing: when §5 was written the operation had no name. The id covers kind, lineage, parent epoch and the payload -- the new public key among them -- so binding the key beside it would be a second binding of a fact already inside it. It also means a replace-recovery step-up cannot be redirected to a retire, which is PRD §6.10's requirement one level further out.",
      not_bound:
        "No principal id and no credential id, where §13.9's slot-unlock challenge binds both. The two have opposite provenance: that one is client-constructed for a device-local gate and names device-local things; this one is service-issued for a service operation and names the operation as the service knows it. Binding a credential id would also forbid answering from a second passkey the account has registered.",
      old_code_not_required:
        'Deliberately. Replacement exists for the user who still holds their devices and has lost or exposed the code, so demanding the lost object is the one requirement guaranteed to be unmeetable exactly when the flow is needed.',
      residual:
        "Someone holding a device and the account credential can replace the recovery envelope and destroy the legitimate owner's recovery path. That party already has content access, so this widens no confidentiality boundary: it is an availability loss, strictly less than what the same party can already do by deleting the account, and the explicit confirmation is where it is surfaced.",
      keys: { account_credential: ACCOUNT_CREDENTIAL, other_passkey: OTHER_PASSKEY },
      transition_ids: {
        note: "Row 15 transition ids, opaque 32-byte digests to this construction. Their structure is row 15's and is tested there.",
        intent_id: INTENT_ID,
        rival_intent_id: RIVAL_INTENT_ID,
      },
      vector: {
        name: 'replacement-step-up',
        why: "Fully pinned: Ed25519 is deterministic, so the signature is a fact about the construction rather than about this generator's RNG. The generator verifies it against the published public key before writing the file, so the seed and the key are checked by use.",
        inputs: {
          v: STEPUP_VERSION,
          intent_id: INTENT_ID,
          nonce: STEPUP_NONCE,
          rp_id: RP_ID,
          origin: ORIGIN,
          flags: `0x${(FLAG_UP | FLAG_UV).toString(16).padStart(2, '0')} (UP | UV)`,
          sign_count: 0,
        },
        derived: {
          challenge: hex(stepUpChallengeBytes),
          challenge_b64url: b64url(stepUpChallengeBytes),
          authenticator_data: hex(stepUpAssertion.authData),
          client_data_json: new TextDecoder().decode(stepUpAssertion.clientData),
          signed_bytes: hex(
            await signedBytes(stepUpAssertion.authData, stepUpAssertion.clientData),
          ),
        },
        expected: { signature: hex(stepUpAssertion.signature), verifies: true },
      },
      demonstration: {
        name: 'naive-replay-stops-at-the-comparison',
        why: 'A demonstration rather than a negative, because it fails for a reason that is not the one being tested. The retired assertion presented unmodified is refused by a string comparison between the challenge it carries and the one the service issued -- a comparison that would refuse it just as readily if the challenge were signed by nobody. Every aad-only-stepup negative rewrites clientDataJSON to carry the wanted challenge, which forces the refusal onto the signature and is also what a real attacker would do.',
        retired_nonce: RETIRED_NONCE,
        stops_at: 'challenge is not the one issued',
        asserted: 'The generator requires that message on every run.',
      },
    },
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/recovery-code.json is stale. Run: node scripts/generate-recovery-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('recovery-code.json is current; the alphabet and keypair checks pass.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${encodingVectors.length} encoding, ${normalizationVectors.length} normalization and ${sealVectors.length} seal vectors, ${REJECTED.length} rejected inputs and ${MUST_FAIL.length} negatives to test/vectors/recovery-code.json`,
  );
};

await main();
