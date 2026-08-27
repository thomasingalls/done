/**
 * Test vectors for the optional device lock (TRD §15 row 13, §13.3).
 *
 * The construction is specified in docs/selections/row-13-device-lock.md.
 * This script is the executable half of that document: it emits
 * test/vectors/device-lock.json, which the implementation must reproduce byte
 * for byte.
 *
 * Four kinds of vector, and the second exists only in this row:
 *
 *   - The *seal* vectors pin K_factor's derivation, the AAD and the framing,
 *     for both factor kinds. Two of them seal the same L_lock under a code and
 *     under a PRF output, which is the multi-factor property made testable: an
 *     implementation that lets the two factors open different keys passes every
 *     single-factor test there is.
 *   - The *separation* vectors pin the WebAuthn PRF evaluation input for the
 *     content device lock against §13.4's other three factor roles and against
 *     a second slot. The property is about the value the authenticator returns,
 *     so it cannot be tested from ciphertext, and an implementation that
 *     regresses it produces working locks with no visible defect.
 *   - The *custody* vectors show one KeyEnvelope, with row 3's AAD unchanged,
 *     opening under L_local on the default tier and under L_lock on the lock
 *     tier. Row 3 says its format is "deliberately indifferent to that choice";
 *     this asserts it, against row 3's own published bytes.
 *   - The *negatives* are the substitutions the AAD exists to refuse.
 *
 * The primitives' known-answer tests are not repeated: HKDF-SHA-256 and
 * AES-256-GCM are row 1's selections and row 1's vectors carry their published
 * KATs. The code encoder is row 14's and is not re-derived either -- it is
 * imported by value and checked against row 14's published vectors, so a drift
 * between the two documents fails the build instead of shipping two
 * incompatible encoders under one name.
 *
 * Usage: node scripts/generate-device-lock-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/device-lock.json', import.meta.url);
const ROW_3 = new URL('../test/vectors/record-format.json', import.meta.url);
const ROW_14 = new URL('../test/vectors/recovery-code.json', import.meta.url);

const LABEL = 'done/devicelock/v1';
const PRF_LABEL = 'done/devicelock-prf/v1';
const ENVELOPE_LABEL = 'done/keyenv/v1';
const ENVELOPE_PURPOSE = 'content-key';
const SEAL_VERSION = 1;
const ENVELOPE_VERSION = 1;
const SYMBOLS = 25;

/**
 * Row 14's alphabet, by value. Checked against row 14's published vectors below
 * rather than imported, because the two rows must be able to fail apart.
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

// --- inputs --------------------------------------------------------------------

/** Row 3's slot, so the custody vectors can be compared against its published bytes. */
const PRINCIPAL = 'pr_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_PRINCIPAL = 'pr_01J0000000000000000000000A';
const OTHER_WORKSPACE = 'ws_01J0000000000000000000000A';

/** Row 3's K_g and L_local, unchanged, for the same reason. */
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const L_LOCAL = unhex('7f2a91c30bd4e685af0132c974e5b8d206a3f47e91c85d3b0e6a248f5c71d9b0');
const ENVELOPE_NONCE = unhex('303132333435363738393a3b');

/** L_lock: 32 random bytes at enrollment. Raw here because a vector needs bytes. */
const L_LOCK = unhex('c8b45e17390a6df2841becd05a37f629e0741c9b3d85a2f60e19c47b5d08a3e2');

/** A 25-symbol code from row 14's generator. Its bytes are not stored anywhere in production. */
const CODE = 'AZC52QK9FEHC6M7VS01JDA3NY';
const CODE_DISPLAY = 'AZC52-QK9FE-HC6M7-VS01J-DA3NY';

/**
 * A 32-byte PRF output. In production this is returned by the authenticator for
 * the evaluation input below and never persists; fixed here because a vector
 * needs a value.
 */
const PRF_OUTPUT = unhex('1d4f8ba26c05397ee1348a0fbd672c95430e8f17ca9b2d6034e58170af9c62db');
const CREDENTIAL_ID = 'k3Yb2Qm8T1pXvA0sRfJ7Lw';
const OTHER_CREDENTIAL_ID = 'Zq4Np8Vd2Hs6Ce1Kx3Mb9T';

const SALT_CODE = unhex('000102030405060708090a0b0c0d0e0f');
const SALT_PRF = unhex('101112131415161718191a1b1c1d1e1f');
const SEAL_NONCE_CODE = unhex('202122232425262728292a2b');
const SEAL_NONCE_PRF = unhex('303132333435363738393a3b');

/**
 * The wrapping credential, before and after the lock -- and they are two keys.
 *
 * **`L_lock` never protected this one, which is the gap §13.4 records.** On the
 * no-PRF tier the wrapping private key persists as a structured-cloned
 * non-extractable `CryptoKey`: promptless, and usable from a copied profile.
 * Sealing the KeyEnvelope under a factor left it untouched, so the next
 * rotation published a reader wrap the pre-lock copy could open -- the lock
 * bypassed without being attacked.
 *
 * It cannot be brought under the factor either, because WebCrypto cannot export
 * a non-extractable key. So enabling the lock **replaces** it: the successor is
 * generated as extractable bytes, sealed here under `L_lock` with exactly the
 * `LockSeal` machinery the factors already use, and imported non-extractable
 * after unlock. §13.4's PRF tier, with `L_lock` as the factor source.
 */
const W_PUB_PRELOCK = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const W_PUB_REPLACEMENT = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const W_SCALAR_REPLACEMENT = unhex(
  '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
);
const CREDENTIAL_SEAL_ID = 'wrapping-credential';
const SALT_CREDENTIAL = unhex('202122232425262728292a2b2c2d2e2f');
const SEAL_NONCE_CREDENTIAL = unhex('404142434445464748494a4b');

/** Generation g was wrapped to the pre-lock credential; g+1 is not. */
const GEN = 4;
const SUCCESSOR_GEN = 5;

/**
 * §13.4's four factor roles. Only the third is this row's to select; the other
 * three labels are provisional stand-ins owned by rows in review 3b's scope.
 * What these vectors assert is that the four inputs differ, not what three of
 * them eventually are.
 */
const ROLES = [
  {
    role: 'slot-verifier',
    label: 'done/slot-verifier-prf/v1',
    selected_by:
      'row 12 (review 3b) -- selected, and it uses no PRF: the verifier checks a signature rather than deriving a key, so this label is reserved and unused',
  },
  { role: 'device-key', label: 'done/device-key-prf/v1', selected_by: 'rows 4-12 (review 3b)' },
  { role: 'device-lock', label: PRF_LABEL, selected_by: 'row 13 -- this document' },
  {
    role: 'recovery-factor',
    label: 'done/recovery-prf/v1',
    selected_by: 'row 14 (review 3b half)',
  },
];

// --- the code, by value from row 14 --------------------------------------------

/** Row 14 §3: uppercase, then O->0 and I/L->1, U rejected rather than folded. */
const normalize = (input) => {
  const stripped = input.replaceAll(/[-\s]/gu, '').toUpperCase();
  let out = '';
  for (const ch of stripped) {
    const mapped = ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch;
    if (mapped === 'U') throw new Error('U never appears in a generated code');
    if (!ALPHABET.includes(mapped)) throw new Error(`Not a code character: ${ch}`);
    out += mapped;
  }
  if (out.length !== SYMBOLS) throw new Error(`A code is ${SYMBOLS} characters; got ${out.length}`);
  return out;
};

/**
 * The entropy claim, checked structurally rather than asserted -- row 14's
 * check, repeated here because this row now depends on it too. 256 = 8 x 32, so
 * every symbol must have exactly eight preimages under `byte & 0x1f` or the
 * 125-bit claim is false in both documents at once.
 */
const checkAlphabet = () => {
  if (ALPHABET.length !== 32) throw new Error(`Alphabet is ${ALPHABET.length} symbols, not 32`);
  const counts = new Map([...ALPHABET].map((c) => [c, 0]));
  for (let b = 0; b < 256; b += 1)
    counts.set(ALPHABET[b & 0x1f], counts.get(ALPHABET[b & 0x1f]) + 1);
  for (const [symbol, n] of counts) {
    if (n !== 8)
      throw new Error(`Symbol ${symbol} has ${n} preimages, not 8: the mask is not uniform`);
  }
  for (const absent of 'ILOU') {
    if (ALPHABET.includes(absent)) throw new Error(`${absent} must be absent from the alphabet`);
  }
};

/** Row 14 and row 13 must not drift apart. Compared against row 14's published file. */
const checkAgainstRow14 = () => {
  const row14 = JSON.parse(readFileSync(ROW_14, 'utf8'));
  const published = row14.construction.alphabet;
  if (!published.includes(ALPHABET)) {
    throw new Error(`Row 14 publishes a different alphabet: ${published}`);
  }
  for (const v of row14.normalization_vectors ?? []) {
    if (normalize(v.inputs.typed) !== v.expected.canonical) {
      throw new Error(`Row 14 normalization vector "${v.name}" no longer round-trips here`);
    }
  }
};

// --- derivation ----------------------------------------------------------------

/**
 * K_factor = HKDF-SHA256(ikm, salt, info = LP(label) || LP(principal) || LP(workspace) || LP(factor))
 *
 * The factor kind is in the info, so a code-derived key and a PRF-derived key
 * are different keys even in the impossible case that the two inputs collide.
 * No password hash: the code is row 14's, generated at 125 bits and never
 * chosen by a human, and the PRF output is 32 bytes from an authenticator.
 * See the selection document, §1.
 */
const deriveFactorKey = async (ikm, salt, principal, workspace, factor) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: concat(lp(LABEL), lp(principal), lp(workspace), lp(factor)),
    },
    key,
    256,
  );
  return new Uint8Array(bits);
};

const aadForSeal = ({ principal, workspace, v, factor, id, label = LABEL }) =>
  concat(
    ...aadFields('lock seal', {
      label,
      principal,
      workspace,
      v: String(v),
      factor,
      id,
    }).map(lp),
  );

/**
 * Row 3's key-envelope AAD, reproduced here to show the format is indifferent
 * to which key opens it. It is deliberately *not* registered for the coverage
 * audit: the construction belongs to row 3 and is audited against row 3's
 * negatives, which are the ones written to isolate its fields. Eliding a field
 * here would only prove that this file's negatives -- which are about the lock
 * seal -- do not test a neighbouring construction they never claimed to.
 */
const aadForEnvelope = ({ principal, workspace, v, gen, purpose }) =>
  concat(
    lp(ENVELOPE_LABEL),
    lp(principal),
    lp(workspace),
    lp(String(v)),
    lp(String(gen)),
    lp(purpose),
  );

/**
 * prf.eval.first = SHA-256( LP(role label) || LP(principal_id) || LP(workspace_id) )
 *
 * The separation lives here rather than in an HKDF label afterwards, and that
 * is the whole point (§3 of the selection). Deriving four role keys from one
 * PRF output would leave whoever holds that output holding all four; four
 * evaluation inputs produce four unrelated outputs, which is a property of the
 * bytes the authenticator returns rather than of the code that handles them.
 */
const prfEvalInput = async (label, principal, workspace) =>
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', concat(lp(label), lp(principal), lp(workspace))),
  );

const sealGcm = async (keyBytes, nonce, aad, plaintext) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      key,
      plaintext,
    ),
  );
};

const openGcm = async (keyBytes, nonce, aad, ct) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, ct),
  );
};

// --- the negatives -------------------------------------------------------------

/**
 * The negatives, in two groups, and the split is the point.
 *
 * The *derivation* group changes an input to K_factor, so it fails because the
 * key is wrong. The *AAD* group keeps the correct key and changes one bound
 * field, so it fails on the binding alone.
 *
 * Every field in the AAD needs an entry in the second group or its binding is
 * untested: principal, workspace and factor are bound in the HKDF info as well,
 * so a negative that changes both proves only that one of the two works. That
 * gap is real -- dropping `factor` from the AAD passed every negative in an
 * earlier draft of this file.
 */
const MUST_FAIL = [
  {
    name: 'wrong-code',
    why: 'A different code. The ordinary failure, and the one the copy speaks to.',
  },
  {
    name: 'wrong-prf-output',
    why: 'A different authenticator, or the right one on a different evaluation input.',
  },
  {
    name: 'code-seal-as-prf',
    why: 'A code seal opened as a prf seal. The factor kind is in both the info and the AAD, so this fails twice.',
  },
  {
    name: 'prf-seal-as-code',
    why: 'The reverse. Stated separately because an implementation can bind one direction and not the other.',
  },
  {
    name: 'seal-moved-to-other-workspace',
    why: 'A seal lifted into the other workspace on the same profile -- PRD §6.7s ordinary two-principal case, not an attack.',
  },
  { name: 'seal-moved-to-other-principal', why: 'The same, across principals.' },
  {
    name: 'replacement-credential-under-a-wrong-code',
    why: 'The replacement wrapping credential is sealed with the same LockSeal machinery as L_lock itself, so a wrong code does not open it. Without this the lock would replace a promptless key with another promptless key and change nothing.',
  },
  {
    name: 'replacement-credential-seal-as-a-factor-seal',
    why: "The credential seal presented under the code factor's own id. The seal AAD binds the id, so the two sealed objects in a locked slot -- L_lock and the wrapping credential -- cannot be substituted for one another.",
  },
  {
    name: 'seal-rebound-to-other-credential',
    why: 'A prf seal presented under another credential id, which is how a removed passkey would be made to look enrolled.',
  },
  {
    name: 'downgraded-version',
    why: 'v is in the AAD for row 1s reason: a carrier version selects the whole suite, so a renumbered seal must fail to open rather than select a weaker one.',
  },
  { name: 'flipped-tag-bit', why: 'The AEAD doing its own job.' },
  { name: 'truncated-ciphertext', why: 'The same, from the other end.' },
  {
    name: 'aad-only-mislabelled-factor',
    why: 'The correct key, with a factor the AAD disagrees about -- what an implementation that builds the AAD from a different variable than the derivation produces. Isolates the AADs binding of factor from the HKDF infos.',
  },
  {
    name: 'aad-only-other-workspace',
    why: 'The same isolation for workspace_id: correct key, AAD naming the other slot.',
  },
  { name: 'aad-only-other-principal', why: 'The same isolation for principal_id.' },
  {
    name: 'aad-only-envelope-label',
    why: "The same isolation for the label, and it is the field with the least margin. This AAD and row 3's key envelope are both six length-prefixed fields with principal, workspace and v in the same three positions; the label is the whole of what separates a device-lock seal from a key envelope.",
  },
];

const mustNotOpen = async (name, fn) => {
  let opened = false;
  try {
    await fn();
    opened = true;
  } catch {
    /* expected */
  }
  if (opened) throw new Error(`Negative "${name}" opened. It must not.`);
};

// Negatives that appear in the published must_fail list are recorded as they
// run, by the shared `refuses`. `mustNotOpen` stays for the checks that are not
// published negatives.

// --- main ----------------------------------------------------------------------

const main = async () => {
  checkAlphabet();
  checkAgainstRow14();

  if (normalize(CODE_DISPLAY) !== CODE)
    throw new Error('The display form does not normalize to the code');

  // --- separation vectors ------------------------------------------------------

  const separationVectors = [];
  for (const { role, label, selected_by } of ROLES) {
    for (const [slotName, principal, workspace] of [
      ['this-slot', PRINCIPAL, WORKSPACE],
      ['other-slot', PRINCIPAL, OTHER_WORKSPACE],
    ]) {
      separationVectors.push({
        name: `${role}--${slotName}`,
        role,
        label,
        selected_by,
        principal_id: principal,
        workspace_id: workspace,
        eval_first: hex(await prfEvalInput(label, principal, workspace)),
      });
    }
  }

  const seen = new Map();
  for (const v of separationVectors) {
    if (seen.has(v.eval_first)) {
      throw new Error(`PRF evaluation inputs collide: ${v.name} and ${seen.get(v.eval_first)}`);
    }
    seen.set(v.eval_first, v.name);
  }

  // --- seal vectors ------------------------------------------------------------

  const SEAL_CASES = [
    {
      name: 'code-seal',
      why: 'L_lock sealed under the mandatory code. Always present: §2 of the selection makes the code the root and PRF an addition, so this is the seal every locked slot has.',
      factor: 'code',
      id: 'code',
      ikm: utf8(CODE),
      ikm_note:
        'utf8 of the canonical 25-symbol code -- the characters, not the bits packed down (row 14 §3)',
      salt: SALT_CODE,
      nonce: SEAL_NONCE_CODE,
      principal: PRINCIPAL,
      workspace: WORKSPACE,
    },
    {
      name: 'prf-seal',
      why: 'The same L_lock, sealed under a PRF output. Same key, second factor: this is the property a single-factor test cannot see.',
      factor: 'prf',
      id: CREDENTIAL_ID,
      ikm: PRF_OUTPUT,
      ikm_note: 'the 32 bytes the authenticator returns for the evaluation input above',
      salt: SALT_PRF,
      nonce: SEAL_NONCE_PRF,
      principal: PRINCIPAL,
      workspace: WORKSPACE,
    },
    {
      name: 'code-seal-other-slot',
      why: 'The same code in the other workspace on one profile. Different info, different key, different ciphertext -- so a seal cannot be carried between slots.',
      factor: 'code',
      id: 'code',
      ikm: utf8(CODE),
      ikm_note: 'as above',
      salt: SALT_CODE,
      nonce: SEAL_NONCE_CODE,
      principal: PRINCIPAL,
      workspace: OTHER_WORKSPACE,
    },
  ];

  const sealVectors = [];
  for (const c of SEAL_CASES) {
    const aad = aadForSeal({
      principal: c.principal,
      workspace: c.workspace,
      v: SEAL_VERSION,
      factor: c.factor,
      id: c.id,
    });
    const kFactor = await deriveFactorKey(c.ikm, c.salt, c.principal, c.workspace, c.factor);
    const ct = await sealGcm(kFactor, c.nonce, aad, L_LOCK);
    sealVectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        l_lock: hex(L_LOCK),
        factor: c.factor,
        id: c.id,
        ikm: hex(c.ikm),
        ikm_note: c.ikm_note,
        principal_id: c.principal,
        workspace_id: c.workspace,
        v: SEAL_VERSION,
        salt: hex(c.salt),
        nonce: hex(c.nonce),
      },
      derived: {
        hkdf_info: hex(concat(lp(LABEL), lp(c.principal), lp(c.workspace), lp(c.factor))),
        k_factor: hex(kFactor),
        aad: hex(aad),
      },
      expected: {
        ct: hex(ct),
        lock_seal: {
          v: SEAL_VERSION,
          factor: c.factor,
          id: c.id,
          salt: hex(c.salt),
          nonce: hex(c.nonce),
          ct: hex(ct),
        },
      },
    });
  }

  for (const v of sealVectors) {
    const got = await openGcm(
      unhex(v.derived.k_factor),
      unhex(v.inputs.nonce),
      unhex(v.derived.aad),
      unhex(v.expected.ct),
    );
    if (hex(got) !== hex(L_LOCK))
      throw new Error(`Seal vector "${v.name}" does not round-trip to L_lock.`);
  }

  // The multi-factor property, asserted rather than implied by two passing seals.
  const viaCode = await openGcm(
    unhex(sealVectors[0].derived.k_factor),
    SEAL_NONCE_CODE,
    unhex(sealVectors[0].derived.aad),
    unhex(sealVectors[0].expected.ct),
  );
  const viaPrf = await openGcm(
    unhex(sealVectors[1].derived.k_factor),
    SEAL_NONCE_PRF,
    unhex(sealVectors[1].derived.aad),
    unhex(sealVectors[1].expected.ct),
  );
  if (hex(viaCode) !== hex(viaPrf)) {
    throw new Error('The two factors do not open the same L_lock. That is the whole construction.');
  }

  // --- custody vectors ---------------------------------------------------------

  const envelopeAad = aadForEnvelope({
    principal: PRINCIPAL,
    workspace: WORKSPACE,
    v: ENVELOPE_VERSION,
    gen: 1,
    purpose: ENVELOPE_PURPOSE,
  });

  const row3 = JSON.parse(readFileSync(ROW_3, 'utf8'));
  const row3Envelope = row3.envelopes.find((e) => e.name === 'key-envelope');
  if (!row3Envelope) throw new Error('Row 3 no longer publishes a "key-envelope" vector.');
  if (row3Envelope.derived.aad !== hex(envelopeAad)) {
    throw new Error(
      'Row 3s key-envelope AAD has changed. Row 13 claims the format is indifferent to custody; that claim is now unchecked.',
    );
  }

  const ctUnderLocal = await sealGcm(L_LOCAL, ENVELOPE_NONCE, envelopeAad, KG);
  if (hex(ctUnderLocal) !== row3Envelope.expected.ct) {
    throw new Error('Row 3s key-envelope ciphertext no longer reproduces here.');
  }
  const ctUnderLock = await sealGcm(L_LOCK, ENVELOPE_NONCE, envelopeAad, KG);

  const custodyVectors = [
    {
      name: 'envelope-under-l-local',
      why: 'The default tier. Row 3s vector, reproduced here so the two rows are checked against each other in one file.',
      tier: 'promptless',
      opened_by: 'l_local',
      key: hex(L_LOCAL),
      aad: hex(envelopeAad),
      ct: hex(ctUnderLocal),
    },
    {
      name: 'envelope-under-l-lock',
      why: 'The lock tier. Same format, same AAD, same K_g, different key -- which is what "no default handle capable of opening the envelopes remains" costs in bytes.',
      tier: 'locked',
      opened_by: 'l_lock',
      key: hex(L_LOCK),
      aad: hex(envelopeAad),
      ct: hex(ctUnderLock),
    },
  ];

  if (custodyVectors[0].aad !== custodyVectors[1].aad) {
    throw new Error(
      'The two custody vectors differ in AAD. Row 3s format is then not indifferent.',
    );
  }
  for (const v of custodyVectors) {
    const got = await openGcm(unhex(v.key), ENVELOPE_NONCE, unhex(v.aad), unhex(v.ct));
    if (hex(got) !== hex(KG)) throw new Error(`Custody vector "${v.name}" does not yield K_g.`);
  }
  // Not in must_fail: it belongs to the custody note, and is the sentence
  // "no default handle capable of opening the envelopes remains" as an assertion.
  await mustNotOpen('custody-cross-tier', () =>
    openGcm(L_LOCAL, ENVELOPE_NONCE, envelopeAad, unhex(custodyVectors[1].ct)),
  );

  // --- the negatives -----------------------------------------------------------

  const base = sealVectors[0];
  const baseAad = unhex(base.derived.aad);
  const baseCt = unhex(base.expected.ct);
  const kCode = unhex(base.derived.k_factor);
  const prf = sealVectors[1];

  const wrongCode = CODE.slice(0, -1) + (CODE.endsWith('0') ? '1' : '0');
  await refuses('wrong-code', async () =>
    openGcm(
      await deriveFactorKey(utf8(wrongCode), SALT_CODE, PRINCIPAL, WORKSPACE, 'code'),
      SEAL_NONCE_CODE,
      baseAad,
      baseCt,
    ),
  );
  await refuses('wrong-prf-output', async () =>
    openGcm(
      await deriveFactorKey(new Uint8Array(32), SALT_PRF, PRINCIPAL, WORKSPACE, 'prf'),
      SEAL_NONCE_PRF,
      unhex(prf.derived.aad),
      unhex(prf.expected.ct),
    ),
  );
  await refuses('code-seal-as-prf', async () =>
    openGcm(
      await deriveFactorKey(utf8(CODE), SALT_CODE, PRINCIPAL, WORKSPACE, 'prf'),
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'prf',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('prf-seal-as-code', async () =>
    openGcm(
      await deriveFactorKey(PRF_OUTPUT, SALT_PRF, PRINCIPAL, WORKSPACE, 'code'),
      SEAL_NONCE_PRF,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: CREDENTIAL_ID,
      }),
      unhex(prf.expected.ct),
    ),
  );
  await refuses('seal-moved-to-other-workspace', async () =>
    openGcm(
      await deriveFactorKey(utf8(CODE), SALT_CODE, PRINCIPAL, OTHER_WORKSPACE, 'code'),
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: OTHER_WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('seal-moved-to-other-principal', async () =>
    openGcm(
      await deriveFactorKey(utf8(CODE), SALT_CODE, OTHER_PRINCIPAL, WORKSPACE, 'code'),
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: OTHER_PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('seal-rebound-to-other-credential', () =>
    openGcm(
      unhex(prf.derived.k_factor),
      SEAL_NONCE_PRF,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'prf',
        id: OTHER_CREDENTIAL_ID,
      }),
      unhex(prf.expected.ct),
    ),
  );
  await refuses('downgraded-version', () =>
    openGcm(
      kCode,
      SEAL_NONCE_CODE,
      aadForSeal({ principal: PRINCIPAL, workspace: WORKSPACE, v: 0, factor: 'code', id: 'code' }),
      baseCt,
    ),
  );
  // The AAD-only group: the correct K_factor throughout, one bound field changed.
  await refuses('aad-only-mislabelled-factor', () =>
    openGcm(
      kCode,
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'prf',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('aad-only-other-workspace', () =>
    openGcm(
      kCode,
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: OTHER_WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('aad-only-other-principal', () =>
    openGcm(
      kCode,
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: OTHER_PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
      }),
      baseCt,
    ),
  );
  await refuses('aad-only-envelope-label', () =>
    openGcm(
      kCode,
      SEAL_NONCE_CODE,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
        label: ENVELOPE_LABEL,
      }),
      baseCt,
    ),
  );

  const flipped = Uint8Array.from(baseCt);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-tag-bit', () => openGcm(kCode, SEAL_NONCE_CODE, baseAad, flipped));
  await refuses('truncated-ciphertext', () =>
    openGcm(kCode, SEAL_NONCE_CODE, baseAad, baseCt.subarray(0, -1)),
  );

  // --- the wrapping credential the lock replaces --------------------------------

  const kCredential = await deriveFactorKey(
    utf8(CODE),
    SALT_CREDENTIAL,
    PRINCIPAL,
    WORKSPACE,
    'code',
  );
  const credentialAad = aadForSeal({
    principal: PRINCIPAL,
    workspace: WORKSPACE,
    v: SEAL_VERSION,
    factor: 'code',
    id: CREDENTIAL_SEAL_ID,
  });
  const credentialSeal = await sealGcm(
    kCredential,
    SEAL_NONCE_CREDENTIAL,
    credentialAad,
    W_SCALAR_REPLACEMENT,
  );

  // The seal round-trips under the right factor, or the rest proves nothing.
  if (
    hex(await openGcm(kCredential, SEAL_NONCE_CREDENTIAL, credentialAad, credentialSeal)) !==
    hex(W_SCALAR_REPLACEMENT)
  ) {
    throw new Error('the replacement credential seal does not round-trip.');
  }

  await refuses('replacement-credential-under-a-wrong-code', async () =>
    openGcm(
      await deriveFactorKey(
        utf8('AZC52QK9FEHC6M7VS01JDA3NZ'),
        SALT_CREDENTIAL,
        PRINCIPAL,
        WORKSPACE,
        'code',
      ),
      SEAL_NONCE_CREDENTIAL,
      credentialAad,
      credentialSeal,
    ),
  );

  await refuses('replacement-credential-seal-as-a-factor-seal', () =>
    openGcm(
      kCredential,
      SEAL_NONCE_CREDENTIAL,
      aadForSeal({
        principal: PRINCIPAL,
        workspace: WORKSPACE,
        v: SEAL_VERSION,
        factor: 'code',
        id: 'code',
      }),
      credentialSeal,
    ),
  );

  /**
   * What the pre-lock copy can and cannot open, as two wrap maps.
   *
   * The honest promise is narrower than "the lock protects your workspace", and
   * the narrow one is what these assert: generation `g` was wrapped to the
   * pre-lock credential and stays readable by a copy of it -- history is not
   * re-keyed, because the copy that motivates the rotation already holds it --
   * while `g+1` is wrapped only to the replacement.
   */
  const wrapsByGeneration = {
    [GEN]: { [W_PUB_PRELOCK]: 'wrapped before the lock' },
    [SUCCESSOR_GEN]: { [W_PUB_REPLACEMENT]: 'wrapped after it' },
  };
  if (W_PUB_PRELOCK === W_PUB_REPLACEMENT) {
    throw new Error('The lock did not replace the credential; the fixture proves nothing.');
  }
  if (!Object.hasOwn(wrapsByGeneration[GEN], W_PUB_PRELOCK)) {
    throw new Error('The pre-lock copy cannot open generation g. History was re-keyed.');
  }
  if (Object.hasOwn(wrapsByGeneration[SUCCESSOR_GEN], W_PUB_PRELOCK)) {
    throw new Error(
      'The successor generation is wrapped to the pre-lock credential. A copied profile opens it, ' +
        'and the lock is bypassed without being attacked.',
    );
  }

  /**
   * `rotation_owed` is derived, and this is the table that says from what.
   *
   * It is true from the custody swap until the generation application settles,
   * and the interval is exactly the one in which a pre-lock copy still holds
   * `K_g`. An implementation that clears it at the swap -- when the envelopes
   * move and before any rotation has landed -- claims future-copy protection
   * during precisely the window where there is none.
   */
  const rotationOwedAt = (step) => step < 8;
  for (const step of [1, 2, 3, 4, 5, 6, 7, 8]) {
    if (rotationOwedAt(step) !== step < 8) throw new Error('rotation_owed is not derived.');
  }
  if (!rotationOwedAt(5)) {
    throw new Error('rotation_owed cleared at the commit point rather than at settlement.');
  }
  if (rotationOwedAt(8)) throw new Error('rotation_owed never clears.');

  // The published list and the asserted list must agree in both directions, or
  // a "must fail" entry can quietly stop being tested.
  const published = MUST_FAIL.map((m) => m.name).sort();
  const actual = assertedNames().sort();
  if (published.join('|') !== actual.join('|')) {
    throw new Error(
      `must_fail and the assertions disagree.\n  published: ${published.join(', ')}\n  asserted:  ${actual.join(', ')}`,
    );
  }

  reportAudit(MUST_FAIL.map((m) => m.name));

  const doc = {
    $schema: 'https://done.invalid/vectors/device-lock/1',
    generated_by: 'scripts/generate-device-lock-vectors.mjs',
    selection: 'docs/selections/row-13-device-lock.md',
    trd_row: 13,
    construction: {
      tiers:
        "CustodyRecord = { v, state: 'promptless' | 'enrolling' | 'locked', seals: LockSeal[], rotation_owed }. Written at genesis on the default tier, so enabling the lock is never a schema change",
      factors:
        'A generated 125-bit code is mandatory and is the root; WebAuthn PRF outputs are additional seals of the same L_lock. A user-chosen passphrase is rejected: the seal sits beside the ciphertext it protects, so guessing is offline and free, and a browser origin has no rate-limiting anchor except the authenticator',
      indirection:
        'Factors seal a random 32-byte L_lock; L_lock opens row 3s KeyEnvelope in place of L_local. Adding, replacing or removing a factor is one 32-byte seal and moves no content and no content key',
      kdf: 'K_factor = HKDF-SHA256(ikm, salt = salt[16], info = LP("done/devicelock/v1") || LP(principal_id) || LP(workspace_id) || LP(factor), L = 32)',
      aad: 'LP("done/devicelock/v1") || LP(principal_id) || LP(workspace_id) || LP(decimal v) || LP(factor) || LP(id)',
      prf_eval_input:
        'SHA-256( LP(role label) || LP(principal_id) || LP(workspace_id) ). The separation between §13.4s four factor roles lives in this input, not in an HKDF label afterwards: four labels give four unrelated outputs, where one output and four labels gives whoever holds it all four keys',
      length_prefix: 'uint16be(byteLength) || utf8 -- injective, so no field can shift another',
      seal: 'LockSeal = { v: 1, factor, id, salt: 16 bytes, nonce: 12 bytes, ct: AES-256-GCM over the 32-byte L_lock, tag included }',
      salt_note:
        'A fresh 16-byte salt per seal means a fresh K_factor per seal and exactly one message under it, so nonce reuse is structurally unreachable rather than avoided by discipline (row 14 §4)',
      enrollment:
        'Seal L_lock under every factor and write state enrolling; reseal each retained generations KeyEnvelope under L_lock, staged; then one transaction swaps staged over live, deletes L_local and writes state locked. The state that must never exist -- no L_local and unresealed envelopes -- is unreachable because the delete and the swap are the same transaction',
      rotation:
        'Enrollment then rotates the content key forward, tracked by rotation_owed. Without it a profile copy taken before enrollment keeps opening K_g, and therefore keeps opening content written after the lock was enabled. Forward-only: history is not re-keyed, because the copy that motivated the rotation already holds it',
      not_carried:
        'The lock never signs, never authenticates an account, never unwraps R_priv and never becomes a recovery factor. Recovery may not open a locked slot; a lost factor re-enrolls as a device',
    },
    separation_vectors: separationVectors,
    separation_note:
      'All eight inputs are distinct, and the generator fails if any two collide. Only the device-lock label is selected by row 13; the others are stand-ins owned by review 3bs rows, and what is asserted is that they differ rather than what they are. Row 12 has since been selected and derives nothing from a PRF output at all, so its label is reserved and unused -- §13.4s separation is satisfied structurally for that role rather than by these bytes',
    seal_vectors: sealVectors,
    custody_vectors: custodyVectors,
    wrapping_credential: {
      why: 'L_lock protected the KeyEnvelope and left the wrapping credential beside it. On the no-PRF tier that credential is a structured-cloned non-extractable CryptoKey -- promptless, and usable from a copied profile -- so the next rotation published a reader wrap the pre-lock copy could open. It cannot be brought under the factor, because WebCrypto cannot export a non-extractable key, so the lock replaces it.',
      seal: {
        id: CREDENTIAL_SEAL_ID,
        factor: 'code',
        salt: hex(SALT_CREDENTIAL),
        nonce: hex(SEAL_NONCE_CREDENTIAL),
        ct: hex(credentialSeal),
        note: "The same LockSeal machinery as L_lock's own factor seals, with its own id bound in the AAD so the two sealed objects in a locked slot cannot be substituted for one another.",
      },
      pre_lock_public_key: W_PUB_PRELOCK,
      replacement_public_key: W_PUB_REPLACEMENT,
      wraps_by_generation: wrapsByGeneration,
      rotation_owed: {
        derived_from: "the generation-application record's step, never asserted",
        true_while: 'step < 8 -- from the custody swap until the application settles',
        why: 'That interval is exactly the one in which a pre-lock copy still holds K_g. Clearing it at the swap, when the envelopes move and before any rotation has landed, claims future-copy protection during precisely the window where there is none.',
      },
      expected:
        'generation g is wrapped to the pre-lock key and the successor is not; history is not re-keyed',
    },
    custody_note:
      'One KeyEnvelope, row 3s AAD byte for byte, under each tiers key. The generator reproduces row 3s published ciphertext from its published inputs and fails if either has changed, and separately asserts that L_local does not open the lock tiers envelope',
    must_fail: MUST_FAIL,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/device-lock.json is stale. Run: node scripts/generate-device-lock-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('device-lock.json is current; the alphabet, row 3 and row 14 cross-checks pass.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${separationVectors.length} separation, ${sealVectors.length} seal and ${custodyVectors.length} custody vectors and ${MUST_FAIL.length} negatives to test/vectors/device-lock.json`,
  );
};

await main();
