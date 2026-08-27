/**
 * Test vectors for the portable package format (TRD §15 row 10, §14.2, §14.4,
 * §9.3).
 *
 * The construction is specified in docs/selections/row-10-portable-package.md.
 * This script is the executable half of that document: it emits
 * test/vectors/package.json.
 *
 * **§15 asked for two formats and there is one.** §14.4 does not describe a
 * second artifact; it describes the service populating the portable package
 * before deletion — *"every participating replica **and the verified portable
 * package** receive that record plus ..."* — and §14.4's offline replica
 * *"keeps its last signed **live** head"* until *"importing the package later
 * upgrades its knowledge"*. Those are one artifact at two of §13.5's three
 * lineage states, and the third state is §9.3's fidelity archive of a
 * never-established workspace. One format, one importer, three states.
 *
 * **The one thing here that is not an encoding is the trust-root anchor.**
 * §14.2 requires the vanished service's authorization key to be *"bound so it
 * cannot be substituted"*, because otherwise whoever can write the archive can
 * rewrite who wrote what. Every link below that is service-signed and therefore
 * re-signable by a forger who supplies their own root. The chain has to
 * terminate in something the user holds, and there is exactly one such thing:
 * the recovery code.
 *
 *   code (row 14) -> R_priv -> a generation wrap whose HPKE `info` binds the
 *   trust root -> the content key -> the content root -> row 8's attribution
 *   claims -> the credentials that signed them, resolved through the epochs the
 *   root verifies.
 *
 * So the anchor costs two fields in an `info` that had none specified, and no
 * new key, signature scheme or secret. It is bound in `info` rather than in the
 * per-message AAD deliberately: `info` is never transmitted, so a reader must
 * *supply* the root it believes, and a wrong belief fails to open rather than
 * failing to match.
 *
 * **The anchor is only needed by the one reader who has no other.** Row 9's
 * three arrival paths again: a surviving device knows the root from its own
 * enrollment, and a device enrolled through row 11 receives it through the
 * person. Recovery with no surviving device is the case that asks — and it is
 * exactly the case that must hold the code.
 *
 * HPKE base mode is implemented here rather than pinned as a string, because
 * this row's whole claim is a binding inside it and a pinned string would be
 * the claim asserted rather than tested. It reproduces RFC 9180 A.1.1 before it
 * is used for anything, on every invocation — the same discipline row 2's
 * benchmark used when it bundled a construction that did not exist yet.
 *
 * The primitive KATs are otherwise row 1's.
 *
 * Usage: node scripts/generate-package-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto, createPrivateKey, createPublicKey, diffieHellman } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/package.json', import.meta.url);

const WRAP_LABEL = 'done/gen-wrap/v1';
const MANIFEST_LABEL = 'done/pkg/v1';
const PARTS_LABEL = 'done/pkg-parts/v1';

const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';
const PKCS8_X25519_PREFIX = '302e020100300506032b656e04220420';
const SPKI_X25519_PREFIX = '302a300506032b656e032100';

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

/** Length-prefixed field: uint16be(byteLength) || utf8. Row 3's convention. */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const u16 = (n) => new Uint8Array([n >> 8, n & 0xff]);
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- HPKE base mode, RFC 9180 -------------------------------------------------------
//
// Row 11 pinned only its `info` and said so, because the ceremony's claim was
// about the transcript rather than about the seal. This row's claim *is* inside
// the seal, so the seal is here — and it is checked against A.1.1 before use.

const hmacExtract = async (salt, ikm) => {
  const key = await crypto.subtle.importKey(
    'raw',
    salt.length ? salt : new Uint8Array(32),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
};

const hmacExpand = async (prk, info, length) => {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  let block = new Uint8Array(0);
  let out = new Uint8Array(0);
  for (let i = 1; out.length < length; i++) {
    block = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, concat(block, info, new Uint8Array([i]))),
    );
    out = concat(out, block);
  }
  return out.slice(0, length);
};

const HPKE_VERSION = utf8('HPKE-v1');
const labeledExtract = (suiteId, salt, label, ikm) =>
  hmacExtract(salt, concat(HPKE_VERSION, suiteId, utf8(label), ikm));
const labeledExpand = (suiteId, prk, label, info, length) =>
  hmacExpand(prk, concat(u16(length), HPKE_VERSION, suiteId, utf8(label), info), length);

const KEM_ID = 0x0020; // DHKEM(X25519, HKDF-SHA256)
const KDF_ID = 0x0001; // HKDF-SHA256
const kemSuiteId = concat(utf8('KEM'), u16(KEM_ID));
const hpkeSuiteId = (aeadId) => concat(utf8('HPKE'), u16(KEM_ID), u16(KDF_ID), u16(aeadId));

const x25519Private = (raw) =>
  createPrivateKey({
    key: Buffer.from(concat(unhex(PKCS8_X25519_PREFIX), raw)),
    format: 'der',
    type: 'pkcs8',
  });
const x25519Public = (raw) =>
  createPublicKey({
    key: Buffer.from(concat(unhex(SPKI_X25519_PREFIX), raw)),
    format: 'der',
    type: 'spki',
  });
const x25519PublicFrom = (scalar) =>
  new Uint8Array(
    createPublicKey(x25519Private(scalar)).export({ format: 'der', type: 'spki' }),
  ).slice(-32);
const x25519 = (scalar, peer) =>
  new Uint8Array(
    diffieHellman({ privateKey: x25519Private(scalar), publicKey: x25519Public(peer) }),
  );

const extractAndExpand = async (dh, kemContext) => {
  const eaePrk = await labeledExtract(kemSuiteId, new Uint8Array(0), 'eae_prk', dh);
  return labeledExpand(kemSuiteId, eaePrk, 'shared_secret', kemContext, 32);
};

/** Deterministic encapsulation: the ephemeral scalar is supplied, so vectors reproduce. */
const encap = async (ephemeralScalar, recipientPublic) => {
  const enc = x25519PublicFrom(ephemeralScalar);
  const shared = await extractAndExpand(
    x25519(ephemeralScalar, recipientPublic),
    concat(enc, recipientPublic),
  );
  return { enc, shared };
};

const decap = async (enc, recipientScalar) =>
  extractAndExpand(x25519(recipientScalar, enc), concat(enc, x25519PublicFrom(recipientScalar)));

const keySchedule = async (shared, info, aeadId, keyLength) => {
  const suiteId = hpkeSuiteId(aeadId);
  const pskIdHash = await labeledExtract(
    suiteId,
    new Uint8Array(0),
    'psk_id_hash',
    new Uint8Array(0),
  );
  const infoHash = await labeledExtract(suiteId, new Uint8Array(0), 'info_hash', info);
  const context = concat(new Uint8Array([0]), pskIdHash, infoHash); // mode_base
  const secret = await labeledExtract(suiteId, shared, 'secret', new Uint8Array(0));
  return {
    key: await labeledExpand(suiteId, secret, 'key', context, keyLength),
    baseNonce: await labeledExpand(suiteId, secret, 'base_nonce', context, 12),
  };
};

/** Seal one message under HPKE base mode with AES-256-GCM. Sequence number 0. */
const hpkeSeal = async (ephemeralScalar, recipientPublic, info, plaintext) => {
  const { enc, shared } = await encap(ephemeralScalar, recipientPublic);
  const { key, baseNonce } = await keySchedule(shared, info, 0x0002, 32);
  const aeadKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: baseNonce, additionalData: new Uint8Array(0), tagLength: 128 },
      aeadKey,
      plaintext,
    ),
  );
  return { enc: hex(enc), ct: hex(ct) };
};

const hpkeOpen = async (enc, recipientScalar, info, ct) => {
  const shared = await decap(unhex(enc), recipientScalar);
  const { key, baseNonce } = await keySchedule(shared, info, 0x0002, 32);
  const aeadKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: baseNonce, additionalData: new Uint8Array(0), tagLength: 128 },
      aeadKey,
      unhex(ct),
    ),
  );
};

/**
 * RFC 9180 A.1.1, reproduced before anything here is used.
 *
 * The published vector is base mode over DHKEM(X25519, HKDF-SHA256),
 * HKDF-SHA256 and **AES-128-GCM**, while this row's suite is row 1's
 * AES-256-GCM. That difference is the reason to run it rather than a reason not
 * to: the AEAD identifier is inside `suite_id`, so reproducing A.1.1 exercises
 * every label, every length prefix and the whole key schedule, and the only
 * thing left unchecked by it is the constant this file passes for its own AEAD.
 */
const A_1_1 = {
  skEm: '52c4a758a802cd8b936eceea314432798d5baf2d7e9235dc084ab1b9cfa2f736',
  pkRm: '3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d',
  skRm: '4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8',
  info: '4f6465206f6e2061204772656369616e2055726e',
  enc: '37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431',
  shared_secret: 'fe0e18c9f024ce43799ae393c7e8fe8fce9d218875e8227b0187c04e7d2ea1fc',
  key: '4531685d41d65f03dc48f6b8302c05b0',
  base_nonce: '56d890e5accaaf011cff4b7d',
  pt: '4265617574792069732074727574682c20747275746820626561757479',
  aad: '436f756e742d30',
  ct: 'f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a',
};

const checkHpkeAgainstRfc9180 = async () => {
  const { enc, shared } = await encap(unhex(A_1_1.skEm), unhex(A_1_1.pkRm));
  if (hex(enc) !== A_1_1.enc) throw new Error('HPKE: A.1.1 encapsulation does not reproduce.');
  if (hex(shared) !== A_1_1.shared_secret) {
    throw new Error('HPKE: A.1.1 shared secret does not reproduce.');
  }
  const back = await decap(unhex(A_1_1.enc), unhex(A_1_1.skRm));
  if (hex(back) !== A_1_1.shared_secret) throw new Error('HPKE: A.1.1 decapsulation disagrees.');

  const { key, baseNonce } = await keySchedule(shared, unhex(A_1_1.info), 0x0001, 16);
  if (hex(key) !== A_1_1.key) throw new Error('HPKE: A.1.1 key schedule does not reproduce.');
  if (hex(baseNonce) !== A_1_1.base_nonce) throw new Error('HPKE: A.1.1 base nonce disagrees.');

  const aeadKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: baseNonce, additionalData: unhex(A_1_1.aad), tagLength: 128 },
      aeadKey,
      unhex(A_1_1.pt),
    ),
  );
  if (hex(ct) !== A_1_1.ct) throw new Error('HPKE: A.1.1 ciphertext does not reproduce.');
};

// --- the two constructions this row selects ------------------------------------------

/**
 * The generation wrap's HPKE `info`, and the trust-root anchor with it.
 *
 * info = LP("done/gen-wrap/v1") || LP(workspace_id) || LP(lineage_id)
 *        || LP(hex auth_root) || LP(dec gen)
 *
 * `lineage_id` and `auth_root` are the two fields this row adds. A wrap made
 * under one lineage opens under no other, so a package presenting a substituted
 * authorization key yields no content key at all — and a forger who leaves the
 * real key in place is left with history that does not verify under it.
 *
 * The binding is **per generation**, which is the correct granularity rather
 * than a convenience: §14.1 rotates to a fresh generation under the replacement
 * lineage, so generations written before a migration stay anchored to the root
 * that was in force when they were written, which is exactly the root their
 * attribution should be verified against.
 *
 * For a never-established workspace (§9.3) both fields are empty. There is no
 * lineage to bind and saying so with an empty field is better than omitting
 * one, because an omitted field would make the two shapes encode differently
 * for a reader that has not been told which it is holding.
 */
const wrapInfo = ({ workspace, lineage, authRoot, gen, label = WRAP_LABEL }) =>
  concat(
    ...aadFields('generation wrap info', {
      label,
      workspace_id: workspace,
      lineage_id: lineage,
      auth_root: authRoot,
      gen: String(gen),
    }).map(lp),
  );

/**
 * parts_digest = SHA-256( LP("done/pkg-parts/v1")
 *                  || for each part ASCENDING BY NAME:
 *                       LP(name) || LP(dec count) || LP(hex digest) )
 *
 * The sort is row 7's canonicalization rule at a second carrier, and for the
 * same reason: two devices assembling a package over the same material must
 * produce the same digest.
 *
 * **There is no separate part count in the manifest**, and its absence is a
 * decision. Each part's own count is inside this digest, so dropping a whole
 * part and truncating one both change it; a second count field would restate a
 * fact already bound and introduce the possibility of the two disagreeing.
 */
const partsDigest = async (parts) =>
  hex(
    await sha256(
      concat(
        lp(PARTS_LABEL),
        ...[...parts]
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
          .flatMap((p) => [lp(p.name), lp(String(p.count)), lp(p.digest)]),
      ),
    ),
  );

/**
 * The package manifest's signed message.
 *
 * `lineage_state` is bound because it is the discriminant of the whole format,
 * and because retired must not be presentable as live: §14.4 is explicit that a
 * replica which never received the terminal package *"cannot locally claim to
 * have observed retirement"*, and the converse — a package that hides a
 * retirement it did carry — is the direction an attacker wants.
 *
 * `assembled_by` names a credential resolvable from the epochs this package
 * carries, or the trust root itself when the service assembled it before
 * deletion (§14.4), or the archiving device when there is no lineage (§9.3).
 */
const manifestMessage = ({
  v,
  workspace,
  lineage,
  lineageState,
  authRoot,
  lineageHeadDigest,
  epoch,
  parts,
  assembledBy,
  label = MANIFEST_LABEL,
}) =>
  concat(
    ...aadFields('package manifest', {
      label,
      v: String(v),
      workspace_id: workspace,
      lineage_id: lineage,
      lineage_state: lineageState,
      auth_root: authRoot,
      lineage_head_digest: lineageHeadDigest,
      epoch: String(epoch),
      parts_digest: parts,
      assembled_by: assembledBy,
    }).map(lp),
  );

// --- keys -------------------------------------------------------------------------------

/**
 * The trust root, committed behind the code rather than only bound in `info`.
 *
 * **HPKE base mode is anonymous, and that is the whole finding.** Sealing needs
 * only the recipient's public key, and `R_pub` travels in the package; every
 * field of `info` is public or attacker-chosen. So binding the root there stops
 * a wrap being *reinterpreted* under a different root and does nothing about
 * one being *minted*. The published `substituted-trust-root` negative mutates
 * `info` on an existing ciphertext, which of course fails -- and never tries the
 * fresh wrap, which is why `--check` has always passed.
 *
 * This digest is sealed beside `R_priv` in row 14's envelope. The importer
 * opens it with the user's code, recomputes it from the manifest's own three
 * fields, and refuses a mismatch **before attempting a single unwrap**. Sealing
 * it requires the code, which the attacker does not have.
 */
const ROOT_LABEL = 'done/pkg-root/v1';
const ARCHIVE_LABEL = 'done/archive/v1';
const HANDOFF_LABEL = 'done/handoff/v1';

/**
 * The receipt that authorizes destroying hosted bytes.
 *
 * §14.4 required *"a verified-current device or a fresh export before the
 * lineage and hosted copy are retired, and a catch-up window"* -- and nothing
 * proved a survivor had **received** terminal state. A window that has merely
 * elapsed is time being read as evidence, which §10.4 refuses elsewhere in this
 * same document.
 *
 * Verified-current has two forms and neither is a timer: the receiver's own
 * accepted head **is** the terminal head, or it verifies a transcript from its
 * authenticated prior head with **exact known absences enumerated**. A summary
 * is not an enumeration, which is what `known_absence_count` is for.
 */
const handoffMessage = ({
  v = 1,
  workspace,
  lineage,
  terminalHead,
  packageDigest,
  receiver,
  priorHead,
  catchupDigest,
  knownAbsences,
  label = HANDOFF_LABEL,
}) =>
  concat(
    ...[
      label,
      String(v),
      workspace,
      lineage,
      terminalHead,
      packageDigest,
      receiver,
      priorHead,
      catchupDigest,
      String(knownAbsences),
    ].map(lp),
  );

/** The hosted classes, deleted one at a time so a partial run resumes. */
const DELETION_CLASSES = ['primary', 'replicas', 'wraps', 'checkpoints', 'backups'];

/**
 * The Local archive's own opener, which §9.3 required and nothing constructed.
 *
 * §9.3 says a purely Local archive *"needs its own explicit portable wrap rather
 * than one it does not have"*, and that *"what authenticates a Local archive is
 * the code that opens it."* The never-established vector's own prose repeats
 * that sentence. **There was no code and no wrap.** The generator produced one
 * HPKE wrap, to the *account* `R_pub`, and the archive positive checked a
 * manifest signature -- so `--check` passed while the archive's load-bearing
 * case, total device loss, was unopenable.
 *
 * A workspace holds one archive keypair (`P-6`), its private half sealed under
 * a generated code beside the same root commitment §14.2 uses, with the archive
 * identity's own public key in the slot a lineage would fill. There is no
 * external authority for a never-established workspace and there never was; the
 * code is the only one it has ever had, and this makes that structural.
 */
const ARCHIVE_WORKSPACE = 'ws_01HZXQ9LOCAL0000000000000';
const ARCHIVE_SCALAR = unhex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
const ARCHIVE_PUB = hex(x25519PublicFrom(ARCHIVE_SCALAR));
const ARCHIVE_CODE = 'AZC52QK9FEHC6M7VS01JDA3NY';
const ARCHIVE_WRONG_CODE = 'AZC52QK9FEHC6M7VS01JDA3NZ';
const ARCHIVE_SALT = unhex('000102030405060708090a0b0c0d0e0f');
const ARCHIVE_NONCE = unhex('202122232425262728292a2b');
const K_ARCHIVE_GEN = unhex('9e0b2f4c7a1d8e364a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a6375');

const archiveKeyFrom = async (code) => {
  const ikm = await crypto.subtle.importKey('raw', utf8(code), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: ARCHIVE_SALT,
        info: concat(lp(ARCHIVE_LABEL), lp(ARCHIVE_WORKSPACE)),
      },
      ikm,
      256,
    ),
  );
};

const archiveAad = (pub = ARCHIVE_PUB) =>
  concat(lp(ARCHIVE_LABEL), lp(ARCHIVE_WORKSPACE), lp('1'), lp(pub));

const sealArchive = async (keyBytes, plaintext, pub = ARCHIVE_PUB) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ARCHIVE_NONCE, additionalData: archiveAad(pub), tagLength: 128 },
      key,
      plaintext,
    ),
  );
};

const openArchive = async (keyBytes, ct, pub = ARCHIVE_PUB) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ARCHIVE_NONCE, additionalData: archiveAad(pub), tagLength: 128 },
      key,
      ct,
    ),
  );
};

const rootCommitment = async ({ workspace, lineage, authRoot }) =>
  hex(await sha256(concat(...[ROOT_LABEL, workspace, lineage, authRoot].map(lp))));

const KEYS = {
  k_auth: {
    role: "The vanished service's authorization signing key — §14.2's trust root, and the thing this row exists to bind. It also signs a terminal package's own manifest.",
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  forged_root: {
    role: "A forger's own authorization key, offered in the trust root's place so the substitution is a value rather than a description.",
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  },
  laptop: {
    role: 'The restoring credential, which assembles a live cutover package and signs its manifest.',
    source: 'RFC 8032 §7.1, TEST 3',
    seed: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
    public_key: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
  },
  recovery: {
    role: "The account recovery keypair. `R_pub` wraps every generation; `R_priv` is what row 14's code opens, and it is where this row's anchor terminates.",
    source: 'RFC 7748 §6.1 — Alice',
    r_priv: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    r_pub: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  },
};

const importSigner = (seedHex) =>
  crypto.subtle.importKey(
    'pkcs8',
    unhex(ED25519_PKCS8_PREFIX + seedHex),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

const importVerifier = (publicHex) =>
  crypto.subtle.importKey('raw', unhex(publicHex), { name: 'Ed25519' }, false, ['verify']);

/**
 * Every published keypair proves it is one keypair before it is used. Row 14's
 * rule: an AAD binding a public key to a private one proves nothing if the
 * vector's own halves are unrelated.
 */
const checkKeypairs = async () => {
  const probe = utf8('keypair self-check');
  for (const [name, k] of Object.entries(KEYS)) {
    if (!k.seed) continue;
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, await importSigner(k.seed), probe);
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importVerifier(k.public_key),
      sig,
      probe,
    );
    if (!ok) throw new Error(`${name}: seed and public key are not one keypair.`);
  }
  const derived = hex(x25519PublicFrom(unhex(KEYS.recovery.r_priv)));
  if (derived !== KEYS.recovery.r_pub) {
    throw new Error('recovery: R_priv does not derive R_pub.');
  }
};

// --- the scenario -------------------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const LINEAGE = 'lin_01HZXS0000000000000000OLDS';
const OTHER_LINEAGE = 'lin_01J00000000000000000FORGE';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const K_G3 = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const EPHEMERAL = unhex('a621b0d7f8e94c3b25a6f0184d7c39be5028f1a6c4d739e0b8154a2c6f03d97e');

/** The signed live head row 9 requires the package to carry, as a digest of that object. */
const LIVE_HEAD_DIGEST = '2b7f0a9c14e6d3850fa2c51e86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36';
const TERMINAL_RECORD_DIGEST = 'd1c4b7a0938e2f56174b0c9d8a3f7e6d5c4b3a29180f7e6d5c4b3a2918f0e7d6';

/**
 * The parts, and one absence worth reading.
 *
 * **There is no attribution part**, and there was going to be. Row 8 put the
 * attribution claims in the content root, so they are inside the checkpoint
 * this package already carries — which deletes a part, its digest, its
 * retention rule and the question of what to do when it disagrees with the
 * snapshot beside it. §7.6 had already required exactly that ("portable
 * workspace material, checkpointed and restored with the workspace rather than
 * held in a separate channel"), and this is where the saving is collected.
 */
const LIVE_PARTS = [
  { name: 'checkpoint', count: 1, digest: '11'.repeat(32) },
  { name: 'epochs', count: 9, digest: '22'.repeat(32) },
  { name: 'generations', count: 3, digest: '33'.repeat(32) },
  { name: 'head', count: 1, digest: LIVE_HEAD_DIGEST },
  { name: 'recovery', count: 1, digest: '44'.repeat(32) },
  { name: 'suffix', count: 17, digest: '55'.repeat(32) },
];

const RETIRED_PARTS = [
  ...LIVE_PARTS.filter((p) => p.name !== 'head'),
  { name: 'head', count: 1, digest: TERMINAL_RECORD_DIGEST },
];

/** §9.3's Local archive: no lineage, so no epochs, no head and no suffix. */
const ARCHIVE_PARTS = [
  { name: 'checkpoint', count: 1, digest: '66'.repeat(32) },
  { name: 'generations', count: 1, digest: '77'.repeat(32) },
  { name: 'recovery', count: 1, digest: '88'.repeat(32) },
];

const HANDOFF_NEGATIVES = [
  {
    name: 'deletion-without-a-handoff',
    why: 'The gate. No hosted class is destroyed on an elapsed window, a request, or a terminal record the service wrote itself. Something a receiver signed has to exist first.',
  },
  {
    name: 'handoff-from-a-receiver-behind-the-terminal-head',
    why: "A receiver whose accepted head is not the terminal head is not current, and saying so is the whole point -- otherwise 'verified-current' means 'was reachable recently'. It may still qualify, but only by presenting a transcript.",
  },
  {
    name: 'handoff-with-an-unverifiable-catchup',
    why: 'A transcript that does not chain from the prior head the receiver authenticated. Without the prior head bound, any transcript would do, and the catch-up would be a formality.',
  },
  {
    name: 'handoff-with-unenumerated-absences',
    why: "A transcript that admits things are missing without naming them. 'Some updates could not be recovered' is not a known-absence list, and a deletion authorized on it destroys the only copy of what was never enumerated.",
  },
  {
    name: 'handoff-for-another-retired-package',
    why: 'The receipt binds the exact package digest, so acknowledging one retirement does not authorize deleting the bytes of another.',
  },
  {
    name: 'handoff-signed-by-a-non-receiver',
    why: 'The receiver is named in the message, so a service that can assemble the package cannot also sign for having received it.',
  },
];

const RETIRED_NEGATIVES = [
  {
    name: 'live-manifest-relabelled-as-retired',
    why: 'Row 10 said a live package is UPGRADED to a retired one by importing the terminal record, and not replaced. There was never an upgrade to verify: lineage_state is inside the message the assembler signs, so relabelling it leaves a signature that no longer covers what it names. This is that claim, executed -- the honest live signature against a manifest calling itself retired.',
  },
  {
    name: 'retired-manifest-under-the-assembling-credential',
    why: 'And the other direction. A complete retired package is signed by the terminal authority, so it does not verify under the device that assembled the live one -- which is what makes "complete package" mean something rather than being a label on the same bytes.',
  },
];

const ARCHIVE_NEGATIVES = [
  {
    name: 'archive-under-a-wrong-code',
    why: 'The archive keypair is sealed under the code and nothing else. A wrong code opens neither the identity nor the commitment beside it, which is what "the code that opens it" has to mean once it is a construction rather than a sentence.',
  },
  {
    name: 'archive-envelope-repaired-with-another-identity',
    why: "Row 14's own negative, at the archive: an envelope presented alongside a public key that is not the one it was sealed for. The identity is in the envelope's AAD, so the pairing is authenticated rather than assumed -- without it, an archive's sealed private half could be offered beside somebody else's public half.",
  },
  {
    name: 'archive-root-commitment-mismatch',
    why: "The same anchor as an account package, at the state that has no external authority to appeal to. The archive identity's own public key fills the slot a lineage would, so a manifest naming a different identity does not match the commitment the code unsealed.",
  },
  {
    name: 'archive-wrap-from-another-workspace',
    why: 'The generation wrap binds the workspace, so an archive of one Local workspace opens no generation of another. Independent of the factor and of the root, which is what makes the four failures separable rather than one check wearing four hats.',
  },
  {
    name: 'archive-wrap-of-another-generation',
    why: 'And the generation, for the same reason.',
  },
];

const ROOT_NEGATIVES = [
  {
    name: 'freshly-minted-package-under-an-attacker-root',
    why: 'The attack `substituted-trust-root` cannot reach, and the reason this row needed reopening. HPKE base mode is anonymous: the attacker needs only R_pub, which travels in the package. So they pick their own auth_root, sign a fabricated history under it, and wrap their OWN generation key to the GENUINE R_pub with info naming their own root. Every signature verifies, under a root they minted, and the wrap opens -- nothing in the ciphertext is wrong. What refuses it is the root commitment sealed beside R_priv, which the attacker cannot produce without the code.',
  },
  {
    name: 'attacker-root-refused-before-any-unwrap',
    why: 'Order, not just outcome. The commitment is checked against the manifest before a single generation is unwrapped, so a package whose root is wrong is refused without exercising HPKE at all. An implementation that unwrapped first and checked afterwards would still have opened attacker-chosen content before noticing.',
  },
  {
    name: 'root-commitment-for-another-lineage',
    why: 'The commitment binds all three fields, so a genuine commitment from one lineage does not authenticate a package claiming another.',
  },
];

const NEGATIVES = [
  {
    name: 'substituted-trust-root',
    mutate:
      "Open a generation wrap while claiming the forger's authorization key as the trust root. **This is the row.** §14.2 requires the root *bound so it cannot be substituted*; binding it in the wrap's HPKE `info` means a substituted root derives a different key schedule and the wrap yields no content key — so a package with rewritten history has nothing to rewrite it over.",
  },
  {
    name: 'substituted-lineage',
    mutate:
      'Open a generation wrap under another lineage identifier. A migration establishes a new lineage rather than succeeding the old one (§14.1), so a wrap must not carry across one.',
  },
  {
    name: 'wrap-from-another-workspace',
    mutate: 'Open a generation wrap as though it belonged to another workspace.',
  },
  {
    name: 'wrap-of-another-generation',
    mutate:
      'Open generation 3’s wrap claiming generation 2. The binding is per generation because §14.1 rotates forward at migration, so old generations stay anchored to the root in force when they were written.',
  },
  {
    name: 'aad-only-renumbered-wrap-label',
    mutate: 'Open a generation wrap under "done/gen-wrap/v2".',
  },
  {
    name: 'retired-presented-as-live',
    mutate:
      'A retired package’s manifest presented with `lineage_state` reading `live`. §14.4 lets an offline replica keep a stale **live** head and forbids it claiming to have observed retirement; hiding a retirement that the package does carry is the same rule pointed the other way.',
  },
  {
    name: 'substituted-lineage-head',
    mutate:
      'A manifest whose lineage-head digest is changed while everything else stands. This is the field row 9 added to §14.2’s list, and it is what stops a restoring device having to ask a replacement service where the old lineage stood.',
  },
  {
    name: 'parts-digest-substituted',
    mutate:
      'The parts digest replaced, with no part changed. Isolates the field; the demonstration below is what a real truncation does to it.',
  },
  {
    name: 'assembled-by-another-credential',
    mutate:
      'A well-formed manifest signed by a different credential. The assembler is named in the message, so this fails on the binding and not only on the key.',
  },
  { name: 'manifest-wrong-workspace', mutate: 'Verify the manifest against another workspace.' },
  { name: 'manifest-wrong-lineage', mutate: 'Move the manifest to another lineage.' },
  {
    name: 'manifest-substituted-trust-root',
    mutate:
      'The manifest’s own trust-root field changed. The signature half of the anchor: the wrap makes a substituted root useless, and this makes it detectable before anyone tries.',
  },
  { name: 'manifest-wrong-epoch', mutate: 'Move the manifest to another epoch number.' },
  { name: 'manifest-wrong-version', mutate: 'Claim manifest version 2 for a version-1 manifest.' },
  {
    name: 'aad-only-renumbered-manifest-label',
    mutate: 'Verify the manifest under "done/pkg/v2".',
  },
];

// --- verification -----------------------------------------------------------------------------

const verify = async (doc) => {
  await checkHpkeAgainstRfc9180();

  const rPriv = unhex(KEYS.recovery.r_priv);
  const live = doc.vectors.find((v) => v.name === 'live-cutover-package');
  const retired = doc.vectors.find((v) => v.name === 'retired-terminal-package');
  const archive = doc.vectors.find((v) => v.name === 'never-established-archive');

  const base = {
    workspace: WORKSPACE,
    lineage: LINEAGE,
    authRoot: KEYS.k_auth.public_key,
    gen: 3,
  };
  const wrap = live.expected.generation_wrap;

  // The positive: the code-holder opens R_priv (row 14), R_priv opens the wrap,
  // and the wrap yields the generation key. Every step below this one is
  // service-signed and therefore re-signable; this step is not.
  const opened = await hpkeOpen(wrap.enc, rPriv, wrapInfo(base), wrap.ct);
  if (hex(opened) !== hex(K_G3)) throw new Error('the generation wrap does not round-trip.');

  /**
   * The attack the existing negative cannot reach, built end to end.
   *
   * Nothing here is malformed. The attacker's package is internally consistent,
   * its wrap opens under the genuine `R_priv`, and its history verifies under
   * the root it names. That is the point: **the ciphertext is not the problem
   * and no amount of checking it will help.** Only a value the attacker cannot
   * seal -- because sealing needs the user's code -- separates this from a real
   * package.
   */
  const honestCommitment = await rootCommitment(base);
  const attackerBase = { ...base, authRoot: KEYS.forged_root.public_key };
  const attackerKey = unhex('0f'.repeat(32));
  const attackerWrap = await hpkeSeal(
    unhex('5d'.repeat(32)),
    unhex(KEYS.recovery.r_pub), // the GENUINE recovery key. It is public.
    wrapInfo(attackerBase),
    attackerKey,
  );

  // It opens. That is not in dispute and is asserted rather than assumed, or
  // the negative below would be proving the wrong thing.
  const attackerOpened = await hpkeOpen(
    attackerWrap.enc,
    rPriv,
    wrapInfo(attackerBase),
    attackerWrap.ct,
  );
  if (hex(attackerOpened) !== hex(attackerKey)) {
    throw new Error('the attacker package does not round-trip; the negative would prove nothing.');
  }

  /** The importer: commitment first, unwrap second. */
  const importPackage = async (manifestFields, sealedCommitment, unwrap) => {
    const claimed = await rootCommitment(manifestFields);
    if (claimed !== sealedCommitment) {
      throw new Error('root commitment does not match the manifest; refused before unwrap');
    }
    return unwrap();
  };

  await refuses('freshly-minted-package-under-an-attacker-root', () =>
    importPackage(attackerBase, honestCommitment, () =>
      hpkeOpen(attackerWrap.enc, rPriv, wrapInfo(attackerBase), attackerWrap.ct),
    ),
  );

  /**
   * Order, and it has to be observed rather than inferred.
   *
   * A negative whose unwrap *throws* proves nothing about ordering: it refuses
   * either way, and an implementation that unwrapped first would satisfy it
   * while opening attacker-chosen content. So the unwrap here **succeeds**, and
   * what is asserted is that it never ran.
   */
  let unwrapReached = false;
  await refuses('attacker-root-refused-before-any-unwrap', () =>
    importPackage(attackerBase, honestCommitment, () => {
      unwrapReached = true;
      return true;
    }),
  );
  if (unwrapReached) {
    throw new Error(
      'The unwrap ran before the commitment was checked. A package under an attacker-chosen root ' +
        'would have been opened before anything noticed.',
    );
  }

  await refuses('root-commitment-for-another-lineage', async () =>
    importPackage(
      base,
      await rootCommitment({ ...base, lineage: 'lin_01J000000000000000000OTHR' }),
      () => true,
    ),
  );

  // The honest package still imports, or the check is simply refusing everything.
  if (!(await importPackage(base, honestCommitment, () => true))) {
    throw new Error('the honest package no longer imports.');
  }

  // --- the Local archive, restored from a code and nothing else ------------------

  /**
   * The case §9.3 exists for: total device loss, no account, no provider.
   *
   * Everything below is derived from the archive bytes and the user's code.
   * There is deliberately no `KEYS` lookup in this block -- if a value could be
   * fetched from somewhere else, the restore would not be proving what it
   * claims to prove.
   */
  const archiveBase = { workspace: ARCHIVE_WORKSPACE, lineage: '', authRoot: ARCHIVE_PUB, gen: 1 };
  const archiveCommitment = await rootCommitment(archiveBase);
  const archiveEnvelope = await sealArchive(
    await archiveKeyFrom(ARCHIVE_CODE),
    concat(ARCHIVE_SCALAR, unhex(archiveCommitment)),
  );
  const archiveWrap = await hpkeSeal(
    unhex('7c'.repeat(32)),
    unhex(ARCHIVE_PUB),
    wrapInfo(archiveBase),
    K_ARCHIVE_GEN,
  );

  /**
   * A clean device: the code and the archive bytes, and nothing else at all.
   *
   * `sealedFor` exists so the four failures are genuinely separable. The
   * commitment and the wrap's `info` bind overlapping fields, so changing the
   * workspace refuses at *both* -- which is defence in depth in production and
   * a negative that isolates nothing in a test. Supplying an envelope sealed
   * for the mutated manifest lets the commitment agree, forcing the refusal
   * onto the wrap alone. Row 12's finding, at a fourth object.
   */
  const restoreArchive = async ({
    code = ARCHIVE_CODE,
    manifest = archiveBase,
    archiveWrapIn = archiveWrap,
    sealedFor = null,
  } = {}) => {
    const envelope =
      sealedFor === null
        ? archiveEnvelope
        : await sealArchive(
            await archiveKeyFrom(ARCHIVE_CODE),
            concat(ARCHIVE_SCALAR, unhex(await rootCommitment(sealedFor))),
          );
    const unsealed = await openArchive(await archiveKeyFrom(code), envelope);
    const scalar = unsealed.subarray(0, 32);
    const sealedCommitment = hex(unsealed.subarray(32));
    if ((await rootCommitment(manifest)) !== sealedCommitment) {
      throw new Error('archive root commitment does not match the manifest');
    }
    return hpkeOpen(archiveWrapIn.enc, scalar, wrapInfo(manifest), archiveWrapIn.ct);
  };

  const restored = await restoreArchive();
  if (hex(restored) !== hex(K_ARCHIVE_GEN)) {
    throw new Error('the archive does not restore from its code alone.');
  }

  await refuses('archive-under-a-wrong-code', () => restoreArchive({ code: ARCHIVE_WRONG_CODE }));
  await refuses('archive-envelope-repaired-with-another-identity', async () =>
    openArchive(
      await archiveKeyFrom(ARCHIVE_CODE),
      archiveEnvelope,
      hex(x25519PublicFrom(unhex('4c'.repeat(32)))),
    ),
  );
  await refuses('archive-root-commitment-mismatch', () =>
    restoreArchive({ manifest: { ...archiveBase, authRoot: KEYS.forged_root.public_key } }),
  );
  // These two carry a matching commitment on purpose, so the refusal is the
  // wrap's and not the anchor's a second time.
  const otherWorkspace = { ...archiveBase, workspace: 'ws_01J0000000000000000000000A' };
  await refuses('archive-wrap-from-another-workspace', () =>
    restoreArchive({ manifest: otherWorkspace, sealedFor: otherWorkspace }),
  );
  const otherGen = { ...archiveBase, gen: 2 };
  await refuses('archive-wrap-of-another-generation', () =>
    restoreArchive({ manifest: otherGen, sealedFor: otherGen }),
  );

  for (const [name, patch] of [
    ['substituted-trust-root', { authRoot: KEYS.forged_root.public_key }],
    ['substituted-lineage', { lineage: OTHER_LINEAGE }],
    ['wrap-from-another-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['wrap-of-another-generation', { gen: 2 }],
    ['aad-only-renumbered-wrap-label', { label: 'done/gen-wrap/v2' }],
  ]) {
    await refuses(name, () => hpkeOpen(wrap.enc, rPriv, wrapInfo({ ...base, ...patch }), wrap.ct));
  }

  // The three manifests, one per lineage state, each verified under the key its
  // own state names as the assembler.
  const verifyManifest = async (fields, signature, publicKey) => {
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importVerifier(publicKey),
      unhex(signature),
      manifestMessage(fields),
    );
    if (!ok) throw new Error('package manifest does not verify');
  };

  const liveFields = {
    v: 1,
    workspace: WORKSPACE,
    lineage: LINEAGE,
    lineageState: 'live',
    authRoot: KEYS.k_auth.public_key,
    lineageHeadDigest: LIVE_HEAD_DIGEST,
    epoch: 9,
    parts: live.derived.parts_digest,
    assembledBy: LAPTOP,
  };
  await verifyManifest(liveFields, live.expected.manifest_signature, KEYS.laptop.public_key);

  const retiredFields = {
    ...liveFields,
    lineageState: 'retired',
    lineageHeadDigest: TERMINAL_RECORD_DIGEST,
    epoch: 10,
    parts: retired.derived.parts_digest,
    assembledBy: 'service',
  };
  await verifyManifest(retiredFields, retired.expected.manifest_signature, KEYS.k_auth.public_key);

  // --- the deletion gate ---------------------------------------------------------

  const TERMINAL_HEAD = 'aa'.repeat(32);
  const PACKAGE_DIGEST = hex(await sha256(concat(lp('retired-package'))));
  const RECEIVER = 'cred_01HZXR0000000000000000LAPT';
  const PRIOR_HEAD = 'bb'.repeat(32);

  const signHandoff = async (fields, seed = KEYS.laptop.seed) =>
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(seed),
        handoffMessage(fields),
      ),
    );

  /**
   * What a deletion worker is allowed to act on.
   *
   * One class at a time, so a partial run resumes rather than restarting or
   * over-deleting -- and a lost acknowledgement keeps the bytes, deliberately.
   * Retaining data nobody wanted is recoverable; deleting data somebody needed
   * is not, so the ambiguous case keeps it and the record says the handoff
   * never completed rather than claiming it did.
   */
  const authorizeDeletion = async (klass, handoff, sig, verifierKey = KEYS.laptop.public_key) => {
    if (!DELETION_CLASSES.includes(klass)) throw new Error(`unknown deletion class ${klass}`);
    if (handoff === null) throw new Error('no terminal handoff: bytes retained');
    if (handoff.packageDigest !== PACKAGE_DIGEST) throw new Error('handoff names another package');
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importVerifier(verifierKey),
      sig,
      handoffMessage(handoff),
    );
    if (!ok) throw new Error('handoff does not verify under the receiver it names');
    const current = handoff.priorHead === handoff.terminalHead;
    if (!current) {
      if (handoff.catchupDigest === '')
        throw new Error('receiver is behind and presented no catch-up');
      const expected = hex(await sha256(concat(lp(handoff.priorHead), lp(handoff.terminalHead))));
      if (handoff.catchupDigest !== expected)
        throw new Error('catch-up does not chain from the prior head');
      if (handoff.knownAbsences < 0)
        throw new Error('absences are summarised rather than enumerated');
    }
    return klass;
  };

  // Form one: the receiver already holds the terminal head. No transcript.
  const currentHandoff = {
    workspace: WORKSPACE,
    lineage: LINEAGE,
    terminalHead: TERMINAL_HEAD,
    packageDigest: PACKAGE_DIGEST,
    receiver: RECEIVER,
    priorHead: TERMINAL_HEAD,
    catchupDigest: '',
    knownAbsences: 0,
  };
  const currentSig = await signHandoff(currentHandoff);
  for (const klass of DELETION_CLASSES) {
    if ((await authorizeDeletion(klass, currentHandoff, currentSig)) !== klass) {
      throw new Error(`class ${klass} was not authorized by a current receiver.`);
    }
  }

  // Form two: behind, but with a transcript that chains and enumerates.
  const caughtUp = {
    ...currentHandoff,
    priorHead: PRIOR_HEAD,
    catchupDigest: hex(await sha256(concat(lp(PRIOR_HEAD), lp(TERMINAL_HEAD)))),
    knownAbsences: 2,
  };
  await authorizeDeletion('primary', caughtUp, await signHandoff(caughtUp));

  await refuses('deletion-without-a-handoff', () =>
    authorizeDeletion('primary', null, new Uint8Array(64)),
  );
  await refuses('handoff-from-a-receiver-behind-the-terminal-head', async () => {
    const behind = { ...currentHandoff, priorHead: PRIOR_HEAD };
    return authorizeDeletion('primary', behind, await signHandoff(behind));
  });
  await refuses('handoff-with-an-unverifiable-catchup', async () => {
    const bad = { ...caughtUp, catchupDigest: 'cc'.repeat(32) };
    return authorizeDeletion('primary', bad, await signHandoff(bad));
  });
  await refuses('handoff-with-unenumerated-absences', async () => {
    const vague = { ...caughtUp, knownAbsences: -1 };
    return authorizeDeletion('primary', vague, await signHandoff(vague));
  });
  await refuses('handoff-for-another-retired-package', async () => {
    const other = { ...currentHandoff, packageDigest: 'dd'.repeat(32) };
    return authorizeDeletion('primary', other, await signHandoff(other));
  });
  await refuses('handoff-signed-by-a-non-receiver', async () =>
    authorizeDeletion(
      'primary',
      currentHandoff,
      await signHandoff(currentHandoff, KEYS.k_auth.seed),
    ),
  );

  // There is no in-place upgrade, and these two say so from both sides.
  await refuses('live-manifest-relabelled-as-retired', () =>
    verifyManifest(
      { ...liveFields, lineageState: 'retired' },
      live.expected.manifest_signature,
      KEYS.laptop.public_key,
    ),
  );
  await refuses('retired-manifest-under-the-assembling-credential', () =>
    verifyManifest(retiredFields, retired.expected.manifest_signature, KEYS.laptop.public_key),
  );

  const archiveFields = {
    v: 1,
    workspace: 'ws_01HZXQ9LOCAL0000000000000',
    lineage: '',
    lineageState: 'never-established',
    authRoot: KEYS.laptop.public_key,
    lineageHeadDigest: '',
    epoch: 0,
    parts: archive.derived.parts_digest,
    assembledBy: LAPTOP,
  };
  await verifyManifest(archiveFields, archive.expected.manifest_signature, KEYS.laptop.public_key);

  await refuses('retired-presented-as-live', () =>
    verifyManifest(
      { ...retiredFields, lineageState: 'live' },
      retired.expected.manifest_signature,
      KEYS.k_auth.public_key,
    ),
  );
  await refuses('assembled-by-another-credential', () =>
    verifyManifest(
      { ...liveFields, assembledBy: 'cred_01HZXR0000000000000000PHON' },
      live.expected.manifest_signature,
      KEYS.laptop.public_key,
    ),
  );

  for (const [name, patch] of [
    ['substituted-lineage-head', { lineageHeadDigest: 'ab'.repeat(32) }],
    ['parts-digest-substituted', { parts: 'cd'.repeat(32) }],
    ['manifest-wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['manifest-wrong-lineage', { lineage: OTHER_LINEAGE }],
    ['manifest-substituted-trust-root', { authRoot: KEYS.forged_root.public_key }],
    ['manifest-wrong-epoch', { epoch: 10 }],
    ['manifest-wrong-version', { v: 2 }],
    ['aad-only-renumbered-manifest-label', { label: 'done/pkg/v2' }],
  ]) {
    await refuses(name, () =>
      verifyManifest(
        { ...liveFields, ...patch },
        live.expected.manifest_signature,
        KEYS.laptop.public_key,
      ),
    );
  }

  // The demonstration: a real truncation. It moves the parts digest, so it is
  // caught by `parts-digest-substituted`'s field rather than by a count field
  // that would have to agree with the digest.
  const truncated = await partsDigest(
    LIVE_PARTS.map((p) => (p.name === 'epochs' ? { ...p, count: 8 } : p)),
  );
  if (truncated === live.derived.parts_digest) {
    throw new Error('truncating the epoch list left the parts digest unchanged.');
  }
  const dropped = await partsDigest(LIVE_PARTS.filter((p) => p.name !== 'suffix'));
  if (dropped === live.derived.parts_digest) {
    throw new Error('dropping a whole part left the parts digest unchanged.');
  }

  const published = new Set(
    [
      ...NEGATIVES,
      ...ROOT_NEGATIVES,
      ...ARCHIVE_NEGATIVES,
      ...RETIRED_NEGATIVES,
      ...HANDOFF_NEGATIVES,
    ].map((n) => n.name),
  );
  const asserted = assertedNames();
  const unrun = [...published].filter((n) => !asserted.includes(n));
  const unpublished = asserted.filter((n) => !published.has(n));
  if (unrun.length > 0)
    throw new Error(`Negatives published but never asserted: ${unrun.join(', ')}`);
  if (unpublished.length > 0)
    throw new Error(`Negatives asserted but not published: ${unpublished.join(', ')}`);
};

// --- assembly ---------------------------------------------------------------------------------

const main = async () => {
  await checkHpkeAgainstRfc9180();
  await checkKeypairs();

  const rPub = unhex(KEYS.recovery.r_pub);
  const laptopSigner = await importSigner(KEYS.laptop.seed);
  const serviceSigner = await importSigner(KEYS.k_auth.seed);

  const base = { workspace: WORKSPACE, lineage: LINEAGE, authRoot: KEYS.k_auth.public_key, gen: 3 };
  const info = wrapInfo(base);
  const wrap = await hpkeSeal(EPHEMERAL, rPub, info, K_G3);

  const sign = async (signer, fields) =>
    hex(
      new Uint8Array(
        await crypto.subtle.sign({ name: 'Ed25519' }, signer, manifestMessage(fields)),
      ),
    );

  const liveParts = await partsDigest(LIVE_PARTS);
  const retiredParts = await partsDigest(RETIRED_PARTS);
  const archiveParts = await partsDigest(ARCHIVE_PARTS);

  const liveFields = {
    v: 1,
    workspace: WORKSPACE,
    lineage: LINEAGE,
    lineageState: 'live',
    authRoot: KEYS.k_auth.public_key,
    lineageHeadDigest: LIVE_HEAD_DIGEST,
    epoch: 9,
    parts: liveParts,
    assembledBy: LAPTOP,
  };
  const retiredFields = {
    ...liveFields,
    lineageState: 'retired',
    lineageHeadDigest: TERMINAL_RECORD_DIGEST,
    epoch: 10,
    parts: retiredParts,
    assembledBy: 'service',
  };
  const archiveFields = {
    v: 1,
    workspace: 'ws_01HZXQ9LOCAL0000000000000',
    lineage: '',
    lineageState: 'never-established',
    authRoot: KEYS.laptop.public_key,
    lineageHeadDigest: '',
    epoch: 0,
    parts: archiveParts,
    assembledBy: LAPTOP,
  };

  const vectors = [
    {
      name: 'live-cutover-package',
      why: '§14.2’s package: the old service is unreachable and a restoring laptop carries the workspace to a replacement. Everything §14.2 enumerates is a part, and the fifth thing row 9 added — the old lineage’s signed head — is the `head` part.',
      inputs: {
        v: 1,
        workspace_id: WORKSPACE,
        lineage_id: LINEAGE,
        lineage_state: 'live',
        auth_root: KEYS.k_auth.public_key,
        lineage_head_digest: LIVE_HEAD_DIGEST,
        epoch: 9,
        assembled_by: LAPTOP,
        parts: LIVE_PARTS,
        generation: { gen: 3, k_g: hex(K_G3), wrapped_to: KEYS.recovery.r_pub },
        hpke_ephemeral_scalar: hex(EPHEMERAL),
      },
      derived: {
        wrap_info: hex(info),
        parts_digest: liveParts,
        manifest_message: hex(manifestMessage(liveFields)),
      },
      expected: {
        generation_wrap: wrap,
        manifest_signature: await sign(laptopSigner, liveFields),
      },
    },
    {
      name: 'retired-terminal-package',
      why: '§14.4’s package, which is the same artifact after the service committed a terminal record: `lineage_state` moves to retired, the `head` part becomes that record, and the service signs the manifest because it is the assembler. Nothing else about the format changes, which is the claim this row makes.',
      inputs: {
        ...retiredFields,
        lineage_state: 'retired',
        assembled_by: 'service',
        parts: RETIRED_PARTS,
      },
      derived: {
        parts_digest: retiredParts,
        manifest_message: hex(manifestMessage(retiredFields)),
      },
      expected: { manifest_signature: await sign(serviceSigner, retiredFields) },
    },
    {
      name: 'never-established-archive',
      why: '§9.3’s fidelity archive of a Local workspace, which is §13.5’s third lineage state rather than a fourth artifact. No epochs, no head, no suffix and an empty lineage; the archiving device is the assembler, and **what authenticates it is the code that opens it** rather than any authority, because there is none to appeal to.',
      inputs: {
        ...archiveFields,
        lineage_state: 'never-established',
        assembled_by: LAPTOP,
        parts: ARCHIVE_PARTS,
      },
      derived: {
        parts_digest: archiveParts,
        manifest_message: hex(manifestMessage(archiveFields)),
      },
      expected: { manifest_signature: await sign(laptopSigner, archiveFields) },
    },
  ];

  const doc = {
    $schema: 'https://done.invalid/vectors/package/1',
    generated_by: 'scripts/generate-package-vectors.mjs',
    selection: 'docs/selections/row-10-portable-package.md',
    trd_row: 10,
    root_commitment: {
      why: 'info binds the root and cannot stop it being minted. HPKE base mode is anonymous -- sealing needs only R_pub, which travels in the package -- so an attacker picks their own auth_root, signs a fabricated history under it, and wraps their own generation key to the GENUINE R_pub. Every signature verifies and the wrap opens. The published substituted-trust-root negative mutates info on existing ciphertext and never attempts this.',
      digest:
        'RootCommitment = SHA-256( LP("done/pkg-root/v1") || LP(workspace_id) || LP(lineage_id) || LP(hex auth_root) )',
      sealed: "beside R_priv in row 14's envelope, under the same recovery code",
      checked: 'recomputed from the manifest and compared BEFORE any generation unwrap',
      honest: await rootCommitment(base),
      under_attacker_root: await rootCommitment({ ...base, authRoot: KEYS.forged_root.public_key }),
      the_attackers_package: {
        note: 'Internally consistent, and it opens. That is the point: the ciphertext is not the problem, and no amount of checking it helps. Only a value the attacker cannot seal separates this from a real package.',
        auth_root: KEYS.forged_root.public_key,
        wrap_opens_under_genuine_r_priv: true,
      },
      expected: 'the commitment differs, and the refusal happens before HPKE is exercised at all',
    },
    construction: {
      one_format:
        "§14.2's cutover package, §14.4's terminal package and §9.3's fidelity archive are one format at §13.5's three lineage states — never-established, live, retired. §14.4 describes the service *populating the portable package* rather than producing a second artifact, and a live package is upgraded to a retired one by importing the terminal record",
      manifest:
        'Ed25519( assembler ; LP("done/pkg/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(lineage_state) || LP(hex auth_root) || LP(hex lineage_head_digest) || LP(dec epoch) || LP(hex parts_digest) || LP(assembled_by) )',
      parts_digest:
        'SHA-256( LP("done/pkg-parts/v1") || for each part ASCENDING BY NAME: LP(name) || LP(dec count) || LP(hex digest) ). No separate part count: each part\'s count is already inside this digest, and a second field would restate it and could disagree with it',
      parts: [
        'checkpoint — row 7’s ciphertext and manifest. **Row 8’s attribution claims are inside it**, because they live in the content root, so there is no attribution part',
        'epochs — enough signed authorization history to resolve credential to capability at any referenced epoch (§14.2 item 2)',
        'suffix — envelopes after the checkpoint, to row 6’s depth',
        'generations — the historical content keys, wrapped (§14.2 item 4)',
        'head — the signed live head, or the signed terminal record (§14.2 item 5, §15 row 9)',
        'recovery — R_pub and the code-sealed R_priv (row 14)',
      ],
      trust_root_anchor: {
        info: 'LP("done/gen-wrap/v1") || LP(workspace_id) || LP(lineage_id) || LP(hex auth_root) || LP(dec gen), as HPKE base-mode info',
        why: "§14.2 requires the old trust root *bound so it cannot be substituted*. Every other link in the chain is service-signed, so a forger supplying their own root can re-sign all of it; the chain has to terminate in user-held material, and the recovery code is the only such thing. Binding the root in the wrap's `info` means a substituted root opens no generation, so there is no content to re-attribute",
        why_info_not_aad:
          '`info` is never transmitted. A reader must supply the root it believes rather than read one out of the package, so a wrong belief fails to open instead of failing to match',
        granularity:
          'Per generation, which §14.1 makes correct rather than convenient: migration rotates to a fresh generation under the new lineage, so pre-migration generations stay anchored to the root that was in force when they were written',
        never_established:
          '§9.3’s Local archive has no lineage, so both fields are empty and the auth root names the archiving device. Nothing external authenticates it, and §9.3 already says so — the archive answers *does ciphertext still exist*, never *can you decrypt it*',
      },
      hpke: 'RFC 9180 base mode, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM (row 1). Implemented in the generator rather than pinned as a string, because this row’s claim is a binding inside it; it reproduces RFC 9180 A.1.1 on every invocation before it is used',
      not_here: {
        primitives: 'SHA-256, HKDF, AES-256-GCM, Ed25519 and X25519 KATs are row 1’s.',
        checkpoint: 'The checkpoint and its manifest are row 7’s.',
        attribution: 'The claims inside the checkpoint are row 8’s.',
        recovery_seal: 'The code-sealed R_priv envelope is row 14’s, unchanged by this row.',
        suffix_depth: 'How deep the suffix part reaches is row 6’s.',
      },
    },
    keys: KEYS,
    rfc9180_a_1_1: A_1_1,
    vectors,
    demonstrations: {
      truncation_moves_the_parts_digest: {
        why: 'A real truncation changes a part’s count and therefore the digest that binds it. It is published as a demonstration rather than as an isolating negative because it changes two things at once, and a negative that changes two things tests neither.',
        epochs_truncated_to_8: await partsDigest(
          LIVE_PARTS.map((p) => (p.name === 'epochs' ? { ...p, count: 8 } : p)),
        ),
        suffix_part_dropped: await partsDigest(LIVE_PARTS.filter((p) => p.name !== 'suffix')),
        intact: liveParts,
      },
    },
    must_fail: [
      ...NEGATIVES,
      ...ROOT_NEGATIVES,
      ...ARCHIVE_NEGATIVES,
      ...RETIRED_NEGATIVES,
      ...HANDOFF_NEGATIVES,
    ],
  };

  await verify(doc);
  reportAudit(NEGATIVES.map((n) => n.name));

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/package.json is stale. Run: node scripts/generate-package-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('package.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} package vectors and ${NEGATIVES.length + ROOT_NEGATIVES.length + ARCHIVE_NEGATIVES.length + RETIRED_NEGATIVES.length + HANDOFF_NEGATIVES.length} negatives to test/vectors/package.json`,
  );
};

await main();
