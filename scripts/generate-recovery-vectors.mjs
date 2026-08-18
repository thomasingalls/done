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

const OUT = new URL('../test/vectors/recovery-code.json', import.meta.url);

const LABEL = 'done/recovery/v1';
const REPLACE_LABEL = 'done/recovery-replace/v1';
const ENVELOPE_VERSION = 1;
const SYMBOLS = 25;
const GROUP = 5;

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
const aadFor = (principalId, v, rPub) =>
  concat(lp(LABEL), lp(principalId), lp(String(v)), lp(hex(rPub)));

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

/**
 * The step-up challenge the service issues for a replacement (selection §4).
 *
 * It binds the operation to the new public key, so an assertion collected for
 * an ordinary sign-in cannot be presented for a replacement and an assertion
 * collected for one replacement cannot be redirected to another. That is what
 * removes the need for a freshness window, which would be a parameter with a
 * number in it and no way to pick the number.
 */
const replacementChallenge = async (principalId, newRPub) => {
  const digest = await crypto.subtle.digest('SHA-256', newRPub);
  return new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      concat(lp(REPLACE_LABEL), lp(principalId), lp(hex(new Uint8Array(digest)))),
    ),
  );
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
  { name: 'wrong-principal', mutate: 'Derive and authenticate against a second principal id.' },
  {
    name: 'rebound-public-key',
    mutate:
      "Authenticate with Bob's public key in the AAD — the envelope re-paired with a public key that is not its own.",
  },
  { name: 'downgraded-version', mutate: 'Authenticate with v=0 in the AAD.' },
  { name: 'flipped-tag-bit', mutate: 'Flip the low bit of the final tag byte.' },
  { name: 'truncated-ciphertext', mutate: 'Drop the final byte of the sealed envelope.' },
];

// RFC 7748 §6.1 Bob, used only as a public key that is not ours.
const OTHER_PUB = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
const OTHER_PRINCIPAL = 'pr_01J0000000000000000000000A';

const refuses = async (label, fn) => {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error(`Negative vector "${label}" succeeded when it must not.`);
};

const main = async () => {
  checkAlphabet();
  checkKeypairKat();

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

  const challenge = await replacementChallenge(PRINCIPAL, OTHER_PUB);

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
        'Replacement requires content access proven by use, plus a single-use service challenge SHA-256( LP("done/recovery-replace/v1") || LP(principal_id) || LP(hex SHA-256(new r_pub)) ) answered by the account credential. No freshness window: the challenge is bound to the operation',
      not_carried:
        'The code is never sent to the service, never persisted by the client, and never re-displayed once the account exists',
    },
    keypair_kat: KEYPAIR_KAT,
    encoding_vectors: encodingVectors,
    normalization_vectors: normalizationVectors,
    rejected_inputs: REJECTED,
    seal_vectors: sealVectors,
    must_fail: MUST_FAIL,
    replacement_challenge_example: {
      why: 'One worked challenge, so the binding is testable without a service.',
      principal_id: PRINCIPAL,
      new_r_pub: hex(OTHER_PUB),
      challenge: hex(challenge),
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
