/**
 * Test vectors for the account credential and the local slot verifier
 * (TRD §15 row 12, §13.9).
 *
 * The construction is specified in docs/selections/row-12-account-credential.md.
 * This script is the executable half of that document: it emits
 * test/vectors/account-credential.json, which the implementation must reproduce
 * byte for byte.
 *
 * Three kinds of vector, and the first is where the row's finding lives:
 *
 *   - The *binding* vectors pin the service-signed statement that anchors a
 *     credential to a slot. The verifier is asymmetric, so the profile holds a
 *     public key rather than a secret -- which removes the thing §13.10's
 *     Argon2id candidate existed to slow down, and replaces it with a public
 *     key an attacker can *substitute*. A public key in a structured clone is
 *     exactly as editable as row 3's `kind`. The service signature is what
 *     makes it not be.
 *   - The *assertion* vectors pin the WebAuthn ceremony the verifier checks:
 *     the challenge preimage, the authenticator data, the client data, and the
 *     bytes the credential actually signs.
 *   - The *demonstrations* are behaviours that succeed and are meant to. The
 *     signature counter is the one that matters: a verifier enforcing
 *     monotonicity would refuse every synced passkey there is.
 *
 * The primitives' known-answer tests are not repeated: Ed25519, SHA-256 and
 * HKDF are row 1's selections and row 1's vectors carry their published KATs.
 * ES256 is the one primitive this row adds to the suite, and it is added
 * because the authenticator chooses it rather than because the project did --
 * see §4 of the selection document.
 *
 * Usage: node scripts/generate-account-credential-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';
import {
  FLAG_UP,
  FLAG_UV,
  authenticatorData,
  b64url,
  checkEmbedding,
  clientDataJSON,
  signedBytes,
} from './lib/webauthn.mjs';

const OUT = new URL('../test/vectors/account-credential.json', import.meta.url);
const ROW_1 = new URL('../test/vectors/algorithm-suite.json', import.meta.url);

const BIND_LABEL = 'done/slotbind/v1';
const UNLOCK_LABEL = 'done/slotunlock/v1';
const BIND_VERSION = 1;
const UNLOCK_VERSION = 1;

/** The PKCS#8 prefix for a raw Ed25519 seed, as row 1's generator uses. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

/**
 * The compiled-in set of accepted public-key encodings, and it is a *set* --
 * two entries, matched by prefix, everything else refused.
 *
 * A credential's public key is stored as SubjectPublicKeyInfo, which is what
 * `PublicKeyCredential.getPublicKey()` returns and what WebCrypto imports. The
 * encoding names its own algorithm, so there is no separate `alg` field to
 * bind -- see the note on `bindingMessage`, which is where an earlier draft had
 * one and the coverage audit took it out.
 *
 * Refusing an unrecognized prefix rather than guessing is row 1's rule about
 * carrier versions, one level along: a reader knows a fixed compiled-in set and
 * accepts exactly that.
 */
const SPKI = {
  ed25519: { prefix: '302a300506032b6570032100', alg: { name: 'Ed25519' }, cose: -8 },
  es256: {
    prefix: '3059301306072a8648ce3d020106082a8648ce3d030107034200',
    alg: { name: 'ECDSA', namedCurve: 'P-256' },
    verify: { name: 'ECDSA', hash: 'SHA-256' },
    cose: -7,
  },
};

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

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- keys ------------------------------------------------------------------------

/**
 * RFC 8032 §7.1's keypairs, so the halves can be checked rather than trusted --
 * row 14's rule, which rows 4, 5 and 9 all follow.
 *
 * TEST 3 is the service's authorization key, because the anchor for this whole
 * construction is a service signature. TEST 2 is the account's Ed25519 passkey.
 * TEST 1 is neither: it is the attacker's own passkey, and the key they sign a
 * substituted binding with.
 */
const ED_KEYS = {
  authorization: {
    role: "The service's authorization key for this epoch (§13.5). Signs slot bindings; holds no content key.",
    source: 'RFC 8032 §7.1, TEST 3',
    seed: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
    public_key: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
  },
  passkey: {
    role: 'The account credential, where the authenticator offers Ed25519 (COSE -8).',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  attacker: {
    role: "The attacker's own passkey. Whoever can edit the slot index can enroll one of these with their own authenticator; what they cannot do is get the service to sign for it.",
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  },
};

/**
 * A fixed P-256 keypair for the ES256 credential.
 *
 * Its halves check themselves the way row 14's X25519 pair does: the generator
 * signs with `d` and verifies with `(x, y)`, so an unrelated pair fails here
 * rather than producing a vector that proves nothing.
 */
const ES256_KEY = {
  d: 'l492hLPlShm0PWkokZJOMVi1OlaxCLBtu_muXLkXsac',
  x: 'P9NDWNTU6acBtFhSUYajz15eBFtyXlu3mpEJmMqyUF8',
  y: '8cqjhcbUxCWRSfRFI0Qdf7D9_sWi6MrP_ltKbeY7gn8',
  /** SEC1 uncompressed, which is the bit string an EC SubjectPublicKeyInfo carries. */
  raw: '043fd34358d4d4e9a701b458525186a3cf5e5e045b725e5bb79a910998cab2505ff1caa385c6d4c4259149f44523441d7fb0fdfec5a2e8cacffe5b4a6de63b827f',
};

const edSpki = (publicHex) => SPKI.ed25519.prefix + publicHex;
const esSpki = (rawHex) => SPKI.es256.prefix + rawHex;

const edSigner = (seedHex) =>
  crypto.subtle.importKey(
    'pkcs8',
    unhex(ED25519_PKCS8_PREFIX + seedHex),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

const edSign = async (seedHex, message) =>
  new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await edSigner(seedHex), message));

const edVerify = async (publicHex, sig, message) =>
  crypto.subtle.verify(
    { name: 'Ed25519' },
    await crypto.subtle.importKey('raw', unhex(publicHex), { name: 'Ed25519' }, false, ['verify']),
    sig,
    message,
  );

const es256Signer = () =>
  crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: ES256_KEY.d, x: ES256_KEY.x, y: ES256_KEY.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

const es256Sign = async (message) =>
  new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await es256Signer(), message),
  );

/**
 * Verify an assertion against a stored SubjectPublicKeyInfo.
 *
 * The algorithm comes out of the encoding rather than out of a field beside it.
 * An unrecognized prefix is refused, never guessed at and never tried against
 * each candidate in turn.
 */
const verifyBySpki = async (spkiHex, sig, message) => {
  const spki = unhex(spkiHex);
  if (spkiHex.startsWith(SPKI.ed25519.prefix)) {
    const key = await crypto.subtle.importKey('spki', spki, SPKI.ed25519.alg, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, sig, message);
  }
  if (spkiHex.startsWith(SPKI.es256.prefix)) {
    const key = await crypto.subtle.importKey('spki', spki, SPKI.es256.alg, false, ['verify']);
    return crypto.subtle.verify(SPKI.es256.verify, key, sig, message);
  }
  throw new Error('credential public key is not one of the two accepted encodings');
};

/** Both key kinds, checked rather than trusted. */
const checkKeypairs = async () => {
  const probe = utf8('keypair self-check');
  for (const [name, k] of Object.entries(ED_KEYS)) {
    if (!(await edVerify(k.public_key, await edSign(k.seed, probe), probe))) {
      throw new Error(`${name}: seed and public key are not one keypair.`);
    }
    if (!(await verifyBySpki(edSpki(k.public_key), await edSign(k.seed, probe), probe))) {
      throw new Error(`${name}: the SPKI framing does not carry the same key.`);
    }
  }
  if (!(await verifyBySpki(esSpki(ES256_KEY.raw), await es256Sign(probe), probe))) {
    throw new Error('ES256: d and (x, y) are not one keypair.');
  }
};

/**
 * Row 1 selects the primitive this row's anchor is built on. Checked here so the
 * two documents fail apart rather than drift apart, as rows 13 and 14 do.
 */
const checkAgainstRow1 = () => {
  const row1 = JSON.parse(readFileSync(ROW_1, 'utf8'));
  const signature = row1.suites?.['1']?.roles?.['mutation-signature'];
  if (!/^Ed25519$/u.test(signature?.primitive ?? '')) {
    throw new Error(
      `Row 1 no longer selects Ed25519 for signatures: ${signature?.primitive}. ` +
        'Every slot binding here is anchored under that primitive.',
    );
  }
  if (!(row1.primitive_kats ?? []).some((k) => /ed25519/iu.test(k.primitive ?? ''))) {
    throw new Error('Row 1 no longer publishes an Ed25519 known-answer test behind the anchor.');
  }
};

// --- the scenario ----------------------------------------------------------------

const ACCOUNT = 'acc_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_ACCOUNT = 'acc_01J0000000000000000000000A';

/** Row 3's principal, so a reader can line the two slots up across documents. */
const PRINCIPAL = 'pr_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_PRINCIPAL = 'pr_01J0000000000000000000000A';

const RP_ID = 'app.done.invalid';
const OTHER_RP_ID = 'done.invalid';
const ORIGIN = 'https://app.done.invalid';
const OTHER_ORIGIN = 'https://done.invalid';

const EPOCH = 7;

const CRED_LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const CRED_PHONE = 'cred_01HZXR00000000000000000PHN';
const CRED_UNBOUND = 'cred_01J000000000000000000FAKE';

/** 32 bytes from the client's CSPRNG at each unlock attempt. Fixed here because a vector needs bytes. */
const NONCE = unhex('a4f1c07b2e59d3860a1f4c7b9e2d5038a6b1c4d7e0f3a695c8db2e4f70135a9c');
const OTHER_NONCE = unhex('0f2e4d6c8b0a9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706');

/** The counter a real authenticator reports. Synced passkeys report zero, forever. */
const SIGN_COUNT = 0;

/**
 * An X25519 SubjectPublicKeyInfo: valid DER, right length, wrong job. It is a
 * key-agreement key presented where a verification key belongs, which is the
 * shape a compiled-in set exists to refuse.
 */
const X25519_SPKI = '302a300506032b656e032100' + ED_KEYS.passkey.public_key;

// --- the two bound field lists ---------------------------------------------------

/**
 * The slot binding's signed message.
 *
 * message = LP("done/slotbind/v1") || LP(dec v) || LP(account_id)
 *           || LP(principal_id) || LP(rp_id) || LP(dec epoch)
 *           || LP(cred_id) || LP(hex public_key)
 *
 * **One binding per credential, deliberately flat.** An earlier shape signed a
 * digest over a credential *set*, which put the fields a reader trusts one
 * level below the signed message and left them isolatable only through the
 * digest carrying them -- two fields rescuing one negative, which the coverage
 * audit refuses and is right to. Flattening costs a signature per credential,
 * of which an account has a handful, once.
 *
 * **There is no `alg` field, and the coverage audit is why.** An earlier draft
 * bound the COSE algorithm beside the key. No negative can isolate it: the
 * algorithm is a function of the key encoding, so changing it alone leaves a
 * key that verifies nothing, and changing it consistently changes the key too.
 * A field that cannot be varied independently is not an independent binding.
 * Storing SubjectPublicKeyInfo puts the algorithm inside the bytes already
 * bound, and the audit went from complaining to silent without anything being
 * argued at it.
 */
const bindingMessage = ({
  label = BIND_LABEL,
  v,
  account,
  principal,
  rpId,
  epoch,
  credId,
  publicKey,
}) =>
  concat(
    ...aadFields('slot binding', {
      label,
      v: String(v),
      account_id: account,
      principal_id: principal,
      rp_id: rpId,
      epoch: String(epoch),
      cred_id: credId,
      public_key: publicKey,
    }).map(lp),
  );

/**
 * The unlock challenge preimage.
 *
 * challenge = SHA-256( LP("done/slotunlock/v1") || LP(dec v) || LP(principal_id)
 *                      || LP(cred_id) || LP(hex nonce) )
 *
 * Row 14 §5's rule at the other end of the design: bind the assertion to the
 * operation rather than to a clock. No freshness window, no skew, nothing to
 * tune. The label *is* the purpose, and it is what stops a slot-unlock
 * assertion from being presented to the service as a sign-in -- published as
 * `aad-only-challenge-label`.
 *
 * The binding's fields are deliberately **not** hashed in wholesale. A
 * binding-digest field would be a function of all eight, so any negative
 * isolating it would also be isolated by whichever of those eight it varied.
 */
const unlockChallenge = async ({ label = UNLOCK_LABEL, v, principal, credId, nonce }) =>
  sha256(
    concat(
      ...aadFields('unlock challenge', {
        label,
        v: String(v),
        principal_id: principal,
        cred_id: credId,
        nonce,
      }).map(lp),
    ),
  );

// --- the ceremony ----------------------------------------------------------------

/**
 * The verifier, and every vector in this file runs through it.
 *
 * The order is the specification's, and it matters: the binding is checked
 * *first*, because everything after it trusts a public key that came out of a
 * structured clone.
 */
const verifyUnlock = async ({
  binding,
  bindingSig,
  authorizationPublicKey,
  returnedCredId,
  authData,
  clientData,
  signature,
  expect,
}) => {
  // 1. The anchor. Without it the rest verifies against whatever key the profile
  //    happens to contain, which an attacker with write access chose.
  if (!(await edVerify(authorizationPublicKey, bindingSig, bindingMessage(binding)))) {
    throw new Error('slot binding does not verify under the epoch authorization key');
  }

  // 2. The assertion came from the credential this binding names. The returned
  //    id is outside the signature -- row 4's problem one level along -- and it
  //    is answered by the binding rather than by a second signed list.
  if (returnedCredId !== binding.credId) throw new Error('assertion is from an unbound credential');

  // 3. Client data. Parsed, never rebuilt.
  const cd = JSON.parse(new TextDecoder().decode(clientData));
  if (cd.type !== 'webauthn.get') throw new Error(`client data type ${cd.type}`);
  if (cd.origin !== ORIGIN) throw new Error(`client data origin ${cd.origin}`);
  // Same-origin only, and it is two checks. The shared helper holds the policy
  // because row 14 §5's step-up needs the same one and had the same omission.
  checkEmbedding(cd);
  const wanted = await unlockChallenge({
    v: expect.challengeVersion,
    principal: expect.principal,
    credId: expect.credId,
    nonce: expect.nonce,
    ...(expect.challengeLabel === undefined ? {} : { label: expect.challengeLabel }),
  });
  if (cd.challenge !== b64url(wanted)) throw new Error('challenge is not the one minted');

  // 4. Authenticator data. rpIdHash and the flags are inside the signature, so
  //    reading them here and verifying below are the same check twice by
  //    construction -- which is why this row needs no second bound field list.
  if (hex(authData.subarray(0, 32)) !== hex(await sha256(utf8(binding.rpId)))) {
    throw new Error('rpIdHash is not this relying party');
  }
  const flags = authData[32];
  if (!(flags & FLAG_UP)) throw new Error('user presence not asserted');
  if (!(flags & FLAG_UV)) throw new Error('user verification not asserted');
  // signCount is read and ignored. See the demonstration.

  // 5. The assertion signature, under the algorithm the stored encoding names.
  if (
    !(await verifyBySpki(binding.publicKey, signature, await signedBytes(authData, clientData)))
  ) {
    throw new Error('assertion signature does not verify');
  }
  return true;
};

// --- the negatives ---------------------------------------------------------------

const MUST_FAIL = [
  {
    name: 'forged-binding-under-other-key',
    why: 'The whole attack, executed competently: substitute your own public key into the slot index, assert with your own authenticator, and re-sign the binding so the record is internally consistent. It fails on the one thing in the profile a profile holder cannot produce.',
  },
  {
    name: 'unknown-key-algorithm',
    why: 'A service-signed binding carrying an X25519 SubjectPublicKeyInfo -- valid DER, right length, key-agreement rather than verification. The accepted encodings are a compiled-in set of two, and anything outside it is refused rather than guessed at. Row 1s rule about carrier versions, at the one place this design has a key type to choose.',
  },
  {
    name: 'unbound-credential',
    why: 'An assertion from a credential the binding does not name -- an attacker enrolling their own passkey on this device.',
  },
  {
    name: 'uv-flag-clear',
    why: 'User presence without user verification. The gate is *verification*: a UP-only assertion is a click, and a click is what the person at a shared keyboard already has.',
  },
  {
    name: 'wrong-rp-id-hash',
    why: 'An assertion collected for another relying party, presented with an honest binding. This is what a phishing origin obtains, and it fails before any signature is checked.',
  },
  {
    name: 'wrong-origin',
    why: 'The same from the client-data side. The two are checked separately because they can disagree.',
  },
  {
    name: 'wrong-client-data-type',
    why: 'A registration ceremony presented as an assertion. webauthn.create and webauthn.get sign the same shape.',
  },
  {
    name: 'framed-ceremony',
    why: 'A complete, correctly signed assertion collected in a delegated iframe: this origin, this RP ID, this challenge, crossOrigin true. The origin check does not cover it -- in a cross-origin frame the caller IS the legitimate app origin while the top-level one differs -- and the policy is same-origin only (S0-1, P-5). CSP frame-ancestors none makes the frame unreachable and is row 17s; this is the half the repository can verify.',
  },
  {
    name: 'embedding-origin-claimed',
    why: 'Client data carrying crossOrigin false AND a topOrigin, signed over its own bytes. The specification emits topOrigin only when crossOrigin is true, so this is a client contradicting itself -- and a verifier reading only the boolean accepts an embedding recorded in the bytes it just hashed. Separate from the one above on purpose: a negative setting both would pass with either check present and prove neither.',
  },
  { name: 'flipped-signature-bit', why: 'The signature doing its own job.' },
  {
    name: 'challenge-rewritten-to-match',
    why: 'Row 9s lesson, and the reason the challenge negatives below are not enough alone. They fail on a string comparison, which fails whether or not the signature covers the challenge. This one rewrites clientDataJSON to carry the challenge the verifier wants, so the comparison passes and only the signature can refuse it -- which is also the real attack, since clientDataJSON arrives from the same place the assertion does.',
  },
  {
    name: 'aad-only-binding-label',
    why: 'The domain-separation label, isolated. It is the whole of what stops a service signature of another kind being read as a slot binding.',
  },
  {
    name: 'aad-only-binding-version',
    why: 'Row 1s rule: a carrier version selects the suite, so a renumbered binding must fail rather than select a weaker one.',
  },
  {
    name: 'aad-only-binding-account-id',
    why: "Another account's binding on the same device. PRD §6.7s two-principal profile is the ordinary case, not an attack.",
  },
  {
    name: 'aad-only-binding-principal-id',
    why: 'A binding lifted between slots on one profile, which is the substitution that needs no forgery if the slot is not named.',
  },
  {
    name: 'aad-only-binding-rp-id',
    why: 'A consistent assertion for another relying party, presented with a binding edited to name it. The obvious negative fails on the rpIdHash comparison whether or not the binding covers rp_id; this one satisfies that comparison, so only the binding can refuse it.',
  },
  {
    name: 'aad-only-binding-epoch',
    why: 'Which authorization epoch admitted this credential (§13.5). It is what bounds a binding naming a since-revoked credential.',
  },
  {
    name: 'aad-only-binding-cred-id',
    why: 'The credential id, isolated from the key beside it: an implementation binding the key and not the id accepts a rebound identifier.',
  },
  {
    name: 'aad-only-binding-public-key',
    why: 'The field this row exists to bind, and the negative that shows what its absence costs: the attackers key in the record *and* the attackers assertion, with the honest service signature left in place. Without public_key in the signed message this opens, because the attacker supplies a consistent pair. IndexedDB holds a structured clone, so that pair is one property edit away.',
  },
  {
    name: 'aad-only-challenge-label',
    why: 'The cross-protocol negative. The same credential authenticates to the service, so an assertion is a proof two different verifiers read. The label is the purpose, and without it a slot-unlock assertion has the shape of a sign-in.',
  },
  {
    name: 'aad-only-challenge-version',
    why: 'The challenge carrier version, isolated from the binding version, because they are separate carriers and an implementation can bind one and not the other.',
  },
  {
    name: 'aad-only-challenge-principal-id',
    why: 'An assertion minted to open one slot, presented at another on the same profile.',
  },
  {
    name: 'aad-only-challenge-cred-id',
    why: 'An assertion minted naming one credential, presented as another. The account has several and they are equally able to assert.',
  },
  {
    name: 'aad-only-challenge-nonce',
    why: 'Replay. Without the nonce the challenge is a constant per slot, and one captured assertion opens it forever.',
  },
];

// --- main ------------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();
  checkAgainstRow1();

  const auth = ED_KEYS.authorization;
  const signBinding = async (binding) => {
    const message = bindingMessage(binding);
    const sig = await edSign(auth.seed, message);
    if (!(await edVerify(auth.public_key, sig, message))) {
      throw new Error('A binding this generator just signed does not verify.');
    }
    return { message, sig };
  };

  /** The two credentials the account holds, one per algorithm the RP offers. */
  const CREDENTIALS = [
    {
      name: 'laptop-ed25519',
      why: 'The preferred case: an authenticator offering COSE -8, so the credential adds no primitive to row 1s suite.',
      credId: CRED_LAPTOP,
      publicKey: edSpki(ED_KEYS.passkey.public_key),
      cose: SPKI.ed25519.cose,
      sign: (m) => edSign(ED_KEYS.passkey.seed, m),
      deterministic: true,
    },
    {
      name: 'phone-es256',
      why: 'The ordinary case, and the reason ES256 is in the suite at all: the authenticator chose it. Verified in WebCrypto with no polyfill.',
      credId: CRED_PHONE,
      publicKey: esSpki(ES256_KEY.raw),
      cose: SPKI.es256.cose,
      sign: (m) => es256Sign(m),
      deterministic: false,
    },
  ];

  // --- binding vectors ---------------------------------------------------------

  const bindingVectors = [];
  /** The working half: what the negatives mutate, kept beside the published half rather than inside it. */
  const bindings = [];
  for (const c of CREDENTIALS) {
    const binding = {
      v: BIND_VERSION,
      account: ACCOUNT,
      principal: PRINCIPAL,
      rpId: RP_ID,
      epoch: EPOCH,
      credId: c.credId,
      publicKey: c.publicKey,
    };
    const { message, sig } = await signBinding(binding);
    bindingVectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        v: BIND_VERSION,
        account_id: ACCOUNT,
        principal_id: PRINCIPAL,
        rp_id: RP_ID,
        epoch: EPOCH,
        cred_id: c.credId,
        public_key: c.publicKey,
        public_key_note: `SubjectPublicKeyInfo, as PublicKeyCredential.getPublicKey() returns. The algorithm (COSE ${c.cose}) is inside these bytes and is not a separate bound field`,
      },
      derived: { message: hex(message) },
      expected: { signature: hex(sig), verifies_under: auth.public_key },
    });
    bindings.push({ binding, sig, sign: c.sign, deterministic: c.deterministic });
  }

  // --- assertion vectors -------------------------------------------------------

  const assertionVectors = [];
  /** The same split, for the ceremony half. */
  const assertions = [];
  for (const b of bindings) {
    const { binding } = b;
    const challenge = await unlockChallenge({
      v: UNLOCK_VERSION,
      principal: binding.principal,
      credId: binding.credId,
      nonce: hex(NONCE),
    });
    const authData = await authenticatorData({
      rpId: binding.rpId,
      flags: FLAG_UP | FLAG_UV,
      signCount: SIGN_COUNT,
    });
    const clientData = clientDataJSON({ type: 'webauthn.get', challenge, origin: ORIGIN });
    const message = await signedBytes(authData, clientData);
    const signature = await b.sign(message);

    assertionVectors.push({
      name: binding.credId === CRED_LAPTOP ? 'laptop-ed25519' : 'phone-es256',
      why: b.deterministic
        ? 'Fully pinned: Ed25519 is deterministic, so the signature is a fact about the construction.'
        : "Pinned except the signature. ECDSA's is randomized, so publishing one would pin this generator's RNG rather than the construction. The generator mints and verifies one on every run instead, and the file carries the bytes that are actually specified.",
      inputs: {
        v: UNLOCK_VERSION,
        principal_id: binding.principal,
        cred_id: binding.credId,
        nonce: hex(NONCE),
        rp_id: binding.rpId,
        origin: ORIGIN,
        flags: `0x${(FLAG_UP | FLAG_UV).toString(16).padStart(2, '0')} (UP | UV)`,
        sign_count: SIGN_COUNT,
      },
      derived: {
        challenge: hex(challenge),
        challenge_b64url: b64url(challenge),
        authenticator_data: hex(authData),
        client_data_json: new TextDecoder().decode(clientData),
        signed_bytes: hex(message),
      },
      expected: b.deterministic
        ? { signature: hex(signature), verifies: true }
        : { verifies: true },
    });
    assertions.push({ authData, clientData, signature });
  }

  // Every published vector runs the real verifier, in both key kinds.
  await Promise.all(
    bindings.map(({ binding, sig }, i) =>
      verifyUnlock({
        binding,
        bindingSig: sig,
        authorizationPublicKey: auth.public_key,
        returnedCredId: binding.credId,
        ...assertions[i],
        expect: {
          challengeVersion: UNLOCK_VERSION,
          principal: binding.principal,
          credId: binding.credId,
          nonce: hex(NONCE),
        },
      }),
    ),
  );

  // --- the base case the negatives mutate --------------------------------------

  const baseBinding = bindings[0].binding;
  const baseSig = bindings[0].sig;
  const baseAssertion = assertions[0];
  const baseExpect = {
    challengeVersion: UNLOCK_VERSION,
    principal: baseBinding.principal,
    credId: baseBinding.credId,
    nonce: hex(NONCE),
  };

  /** One call shape, so a negative differs from the honest vector only where it says it does. */
  const attempt = (over = {}) =>
    verifyUnlock({
      binding: baseBinding,
      bindingSig: baseSig,
      authorizationPublicKey: auth.public_key,
      returnedCredId: baseBinding.credId,
      authData: baseAssertion.authData,
      clientData: baseAssertion.clientData,
      signature: baseAssertion.signature,
      expect: baseExpect,
      ...over,
    });

  /** Mint a complete, internally consistent ceremony. Used where a negative must fail on one check only. */
  const ceremony = async ({
    rpId = RP_ID,
    principal = PRINCIPAL,
    credId = CRED_LAPTOP,
    nonce = NONCE,
    seed = ED_KEYS.passkey.seed,
    signCount = SIGN_COUNT,
    crossOrigin = false,
    topOrigin = null,
  }) => {
    const challenge = await unlockChallenge({
      v: UNLOCK_VERSION,
      principal,
      credId,
      nonce: hex(nonce),
    });
    const authData = await authenticatorData({ rpId, flags: FLAG_UP | FLAG_UV, signCount });
    const clientData = clientDataJSON({
      type: 'webauthn.get',
      challenge,
      origin: ORIGIN,
      crossOrigin,
      topOrigin,
    });
    const signature = await edSign(seed, await signedBytes(authData, clientData));
    return { authData, clientData, signature };
  };

  // --- the anchor --------------------------------------------------------------

  {
    const forged = { ...baseBinding, publicKey: edSpki(ED_KEYS.attacker.public_key) };
    const theirs = await ceremony({ seed: ED_KEYS.attacker.seed });
    await refuses('forged-binding-under-other-key', async () =>
      attempt({
        binding: forged,
        bindingSig: await edSign(ED_KEYS.attacker.seed, bindingMessage(forged)),
        ...theirs,
      }),
    );
  }

  {
    const odd = { ...baseBinding, publicKey: X25519_SPKI };
    const { sig } = await signBinding(odd);
    await refuses('unknown-key-algorithm', () => attempt({ binding: odd, bindingSig: sig }));
  }

  // --- the ceremony ------------------------------------------------------------

  await refuses('unbound-credential', () => attempt({ returnedCredId: CRED_UNBOUND }));
  await refuses('uv-flag-clear', async () =>
    attempt({
      authData: await authenticatorData({
        rpId: baseBinding.rpId,
        flags: FLAG_UP,
        signCount: SIGN_COUNT,
      }),
    }),
  );
  await refuses('wrong-rp-id-hash', async () =>
    attempt({
      authData: await authenticatorData({
        rpId: OTHER_RP_ID,
        flags: FLAG_UP | FLAG_UV,
        signCount: SIGN_COUNT,
      }),
    }),
  );
  await refuses('wrong-origin', () =>
    attempt({
      clientData: clientDataJSON({
        type: 'webauthn.get',
        challenge: unhex(assertionVectors[0].derived.challenge),
        origin: OTHER_ORIGIN,
      }),
    }),
  );
  await refuses('wrong-client-data-type', () =>
    attempt({
      clientData: clientDataJSON({
        type: 'webauthn.create',
        challenge: unhex(assertionVectors[0].derived.challenge),
        origin: ORIGIN,
      }),
    }),
  );
  // --- the embedding policy, same-origin only (`S0-1`) --------------------------
  //
  // Each is a COMPLETE ceremony signed over its own hostile client data, so the
  // signature verifies and only the policy can refuse it. Presenting rewritten
  // bytes under the original signature would refuse at step 5 whether or not
  // step 3 read these members at all -- failing twice and isolating nothing.
  //
  // And they are separated. A negative carrying `crossOrigin: true` AND a
  // `topOrigin` would pass with either check present and neither would be
  // proved.
  {
    const framed = await ceremony({ crossOrigin: true });
    await refuses('framed-ceremony', () =>
      attempt({ clientData: framed.clientData, signature: framed.signature }),
    );

    const claimed = await ceremony({ crossOrigin: false, topOrigin: OTHER_ORIGIN });
    await refuses('embedding-origin-claimed', () =>
      attempt({ clientData: claimed.clientData, signature: claimed.signature }),
    );

    // Absent is not false: the member is optional and a missing one is the
    // ordinary same-origin ceremony, so the policy must accept it.
    const omitted = await ceremony({ crossOrigin: null });
    if (JSON.parse(new TextDecoder().decode(omitted.clientData)).crossOrigin !== undefined) {
      throw new Error('the omitted-crossOrigin ceremony still carries the member');
    }
    await attempt({ clientData: omitted.clientData, signature: omitted.signature });
  }

  const flipped = Uint8Array.from(baseAssertion.signature);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-signature-bit', () => attempt({ signature: flipped }));

  // Row 9's isolating negative: mint under a wrong nonce, then rewrite the client
  // data to carry the challenge the verifier wants. The comparison now passes
  // and only the signature can refuse it.
  {
    const minted = await ceremony({ nonce: OTHER_NONCE });
    const rewritten = clientDataJSON({
      type: 'webauthn.get',
      challenge: unhex(assertionVectors[0].derived.challenge),
      origin: ORIGIN,
    });
    await refuses('challenge-rewritten-to-match', () =>
      attempt({ clientData: rewritten, signature: minted.signature }),
    );
  }

  // --- the binding's eight fields, one at a time -------------------------------
  //
  // Each keeps the honest service signature and changes one field of the message,
  // so each fails on the binding rather than on anything downstream. Where a
  // field is *also* read downstream -- rp_id by the rpIdHash check, public_key by
  // the assertion check -- the negative supplies a consistent ceremony for the
  // substituted value, or it would be failing twice and isolating nothing.

  await refuses('aad-only-binding-label', () =>
    attempt({ binding: { ...baseBinding, label: 'done/slotbind/v2' } }),
  );
  await refuses('aad-only-binding-version', () => attempt({ binding: { ...baseBinding, v: 0 } }));
  await refuses('aad-only-binding-account-id', () =>
    attempt({ binding: { ...baseBinding, account: OTHER_ACCOUNT } }),
  );
  await refuses('aad-only-binding-principal-id', () =>
    attempt({ binding: { ...baseBinding, principal: OTHER_PRINCIPAL } }),
  );
  await refuses('aad-only-binding-rp-id', async () =>
    attempt({
      binding: { ...baseBinding, rpId: OTHER_RP_ID },
      ...(await ceremony({ rpId: OTHER_RP_ID })),
    }),
  );
  await refuses('aad-only-binding-epoch', () =>
    attempt({ binding: { ...baseBinding, epoch: EPOCH + 1 } }),
  );
  await refuses('aad-only-binding-cred-id', async () =>
    attempt({
      binding: { ...baseBinding, credId: CRED_PHONE },
      returnedCredId: CRED_PHONE,
      expect: { ...baseExpect, credId: CRED_PHONE },
      ...(await ceremony({ credId: CRED_PHONE })),
    }),
  );
  await refuses('aad-only-binding-public-key', async () =>
    attempt({
      binding: { ...baseBinding, publicKey: edSpki(ED_KEYS.attacker.public_key) },
      ...(await ceremony({ seed: ED_KEYS.attacker.seed })),
    }),
  );

  // --- the challenge's five fields, one at a time ------------------------------

  await refuses('aad-only-challenge-label', () =>
    attempt({ expect: { ...baseExpect, challengeLabel: 'done/accountauth/v1' } }),
  );
  await refuses('aad-only-challenge-version', () =>
    attempt({ expect: { ...baseExpect, challengeVersion: 0 } }),
  );
  await refuses('aad-only-challenge-principal-id', () =>
    attempt({ expect: { ...baseExpect, principal: OTHER_PRINCIPAL } }),
  );
  await refuses('aad-only-challenge-cred-id', () =>
    attempt({ expect: { ...baseExpect, credId: CRED_PHONE } }),
  );
  await refuses('aad-only-challenge-nonce', () =>
    attempt({ expect: { ...baseExpect, nonce: hex(OTHER_NONCE) } }),
  );

  // --- demonstrations, which succeed and are meant to --------------------------

  const rewound = await ceremony({ signCount: 3 });
  await attempt(rewound);

  const demonstrations = [
    {
      name: 'sign-count-is-read-and-ignored',
      why: "An assertion reporting signCount 3 where the last one reported 0 verifies, deliberately. WebAuthn's counter exists to detect a cloned authenticator, and a synced passkey -- iCloud Keychain, Google Password Manager, any credential that follows the person rather than the device -- cannot maintain one and reports zero forever. A verifier enforcing monotonicity refuses the ordinary case while detecting nothing, so this row does not enforce it, and says so here rather than leaving the omission to look like an oversight.",
      authenticator_data: hex(rewound.authData),
      sign_count: 3,
      previous_sign_count: SIGN_COUNT,
      expected: 'opens',
    },
    {
      name: 'binding-outlives-a-revocation-this-device-has-not-seen',
      why: "A binding signed in epoch 7 still verifies on a device that has never seen epoch 8, so a credential revoked while this slot was closed still reopens it offline. That is a bound rather than a defect, and §13.9 is what bounds it: reopening grants no relay token, no account session and no authorization change, so what a stale binding opens is already-local state and nothing else. §13.5's lineage closes it the moment the device is online.",
      epoch: EPOCH,
      expected: 'opens, and grants nothing on the network',
    },
  ];

  // The published list and the asserted list must agree in both directions, or a
  // "must fail" entry can quietly stop being tested.
  const published = MUST_FAIL.map((m) => m.name).toSorted();
  const actual = assertedNames().toSorted();
  if (published.join('|') !== actual.join('|')) {
    throw new Error(
      `must_fail and the assertions disagree.\n  published: ${published.join(', ')}\n  asserted:  ${actual.join(', ')}`,
    );
  }

  reportAudit(MUST_FAIL.map((m) => m.name));

  const doc = {
    $schema: 'https://done.invalid/vectors/account-credential/1',
    generated_by: 'scripts/generate-account-credential-vectors.mjs',
    selection: 'docs/selections/row-12-account-credential.md',
    trd_row: 12,
    construction: {
      credential:
        'The account credential is a WebAuthn discoverable credential on the account services RP ID, created at account creation. It is asymmetric, so the service stores public material only -- which is what §16.1s inventory row already said it stored.',
      alg_list:
        'pubKeyCredParams is fixed and ordered and is part of the carrier version: -8 (Ed25519) then -7 (ES256). RS256 is declined. Both offered algorithms verify in WebCrypto, so the offline verifier needs no polyfill.',
      no_stretching:
        'None, for the third time and on the strongest of the three arguments. Rows 13 and 14 answered "Argon2id or none" with none because a generated 125-bit code leaves no entropy deficit for a work factor to cover. Here there is no secret in the profile at all: the private key is in the authenticator, so a profile holder holds a public key and a verification routine, and grinding it means forging a signature.',
      extensions:
        'None. This role uses no WebAuthn extension, which is why it can root on the authenticator where §13.3s device lock could not: PRF is an extension whose availability is a matrix of OS, browser and authenticator kind, and a signature is the core of the API.',
      binding:
        'One service-signed binding per credential, stored in the device-local slot index (§6.5). message = LP("done/slotbind/v1") || LP(dec v) || LP(account_id) || LP(principal_id) || LP(rp_id) || LP(dec epoch) || LP(cred_id) || LP(hex public_key), signed with Ed25519 by the epochs authorization key.',
      public_key_encoding:
        'SubjectPublicKeyInfo, matched against a compiled-in set of two prefixes -- Ed25519 and P-256. The algorithm is inside the bound bytes rather than in a field beside them, so there is no separate alg to bind and nothing to renegotiate.',
      anchor:
        'The service signature is the constructions load-bearing part. An asymmetric verifier removes the guessable secret and introduces a substitutable public key, and a public key in a structured clone is exactly as editable as row 3s kind. Verified against the lineage the client already retains (§13.5), a substitution needs the services private key rather than write access to IndexedDB.',
      challenge:
        'challenge = SHA-256( LP("done/slotunlock/v1") || LP(dec v) || LP(principal_id) || LP(cred_id) || LP(hex nonce) ), with 32 fresh random nonce bytes per attempt. Row 14 §5s rule: bind the assertion to the operation, not to a clock.',
      verification_order:
        'Binding signature, then bound credential id, then client data (parsed, never rebuilt), then authenticator data with UV required, then the assertion signature under the algorithm the stored encoding names. The binding is first because everything after it trusts a public key that came out of a structured clone.',
      sign_count: 'Read and ignored. See the demonstrations.',
      grants:
        'Nothing on the network. No relay token, no account session, no authorization change (§13.9). The service never issued this challenge, so the assertion is not one it will accept.',
      length_prefix: 'uint16be(byteLength) || utf8 -- injective, so no field can shift another.',
    },
    keys: {
      ...ED_KEYS,
      es256_credential: {
        role: 'The account credential where the authenticator offers ES256 (COSE -7).',
        source:
          'Generated for this file; d and (x, y) are checked against each other on every run.',
        jwk: { kty: 'EC', crv: 'P-256', x: ES256_KEY.x, y: ES256_KEY.y },
        spki: esSpki(ES256_KEY.raw),
      },
    },
    binding_vectors: bindingVectors,
    assertion_vectors: assertionVectors,
    demonstrations,
    must_fail: MUST_FAIL,
    primitive_kats:
      "Ed25519, SHA-256 and HKDF KATs are row 1's, in test/vectors/algorithm-suite.json. This generator checks that row 1 still selects Ed25519 for signatures and still publishes its known-answer test, so the two documents fail apart rather than drift apart.",
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/account-credential.json is stale. Run: node scripts/generate-account-credential-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('account-credential.json is current; the keypair and row 1 cross-checks pass.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${bindingVectors.length} binding and ${assertionVectors.length} assertion vectors, ${demonstrations.length} demonstrations and ${MUST_FAIL.length} negatives to test/vectors/account-credential.json`,
  );
};

await main();
