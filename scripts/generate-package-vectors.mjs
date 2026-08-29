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
const ARCHIVE_ROOT_LABEL = 'done/archive-root/v1';
const HANDOFF_LABEL = 'done/handoff/v1';
const CATCHUP_LABEL = 'done/catchup/v1';

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
 *
 * **What `catchup_digest` commits was the `S0-9` conviction (`FU-03`/`A-05`),
 * and the transcript below is the repair.** The pre-return value was
 * `SHA-256(LP(priorHead) || LP(terminalHead))` -- two public heads, computable
 * by the very receiver whose completeness was in question -- beside a bare
 * non-negative count, so a stale receiver could self-assert its way through the
 * gate on hosted destruction. The digest now commits the full bytes of a
 * `CatchupTranscript`, and the gate verifies the transcript itself: its signer
 * resolves from the lineage's certification in force (`FU-06`'s rule -- an
 * input, never the answer), its links chain from the receiver's authenticated
 * prior head to the terminal head, and its absences are exact identifiers whose
 * count must equal the count the receiver signed. Self-assertion has no move
 * left: the receiver cannot mint the transcript, and the source cannot sign for
 * having received it.
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

/**
 * The exact authenticated catch-up carrier (`FU-03`).
 *
 * T = LP("done/catchup/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
 *     || LP(dec source_epoch)
 *     || LP(dec link_count) || for each link: LP(hex prior) || LP(hex head)
 *     || LP(dec absence_count) || for each: LP(absence_id)
 *
 *   sig_T = Ed25519( the lineage's certification in force at source_epoch ; T )
 *   catchup_digest = SHA-256(T), committed in the receiver's signed H
 *
 * Each link stands for a signed accepted-head record naming its predecessor,
 * so "verifiable transcript" is a chain property rather than a vibe:
 * `links[0].prior` must be the prior head the receiver authenticated,
 * `links[i].prior` must be `links[i-1].head`, and the last head must be the
 * terminal head. The absences are the objects the source could not deliver,
 * each named -- the receiver countersigns their exact count, so "some things
 * are missing" cannot pass as an enumeration.
 */
const transcriptMessage = ({ v = 1, workspace, lineage, sourceEpoch, links, absences }) =>
  concat(
    ...[CATCHUP_LABEL, String(v), workspace, lineage, String(sourceEpoch)].map(lp),
    lp(String(links.length)),
    ...links.flatMap((l) => [lp(l.prior), lp(l.head)]),
    lp(String(absences.length)),
    ...absences.map(lp),
  );

/**
 * The hosted deletion classes, deleted one at a time so a partial run resumes.
 *
 * **One domain, one order — §14.7's, all six** (`P-4` falsifier 17, the `S0-7`
 * return). This list previously held a five-entry copy that omitted
 * `recovery-anchor`, so the gate and the retention model stated *the same
 * predicate over different domains* and both passed. It is now published with
 * the vectors and cross-checked by `scripts/check-retention.mjs` against
 * §14.7's class table and the executable model's own declaration — drift in
 * the list fails a build rather than passing twice. The cause still selects
 * the set: expiry never reaches `recovery-anchor`; retirement reaches all six.
 */
const DELETION_CLASSES = [
  'primary',
  'replicas',
  'checkpoints',
  'wraps',
  'backups',
  'recovery-anchor',
];

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
 * A workspace holds one archive **identity** (`P-6`): an X25519 keypair that
 * opens the wraps *and* an Ed25519 keypair that signs the manifest, both
 * private halves sealed under one generated code beside the same root
 * commitment §14.2 uses. There is no external authority for a
 * never-established workspace and there never was; the code is the only one it
 * has ever had, and this makes that structural.
 *
 * **The signing half is the `S0-9` return (`FU-02`/`A-04`/`ST-01`).** The
 * pre-return construction factor-sealed only the encryption half, and the
 * published package positive was signed by the laptop's device key -- a key the
 * factor never bound -- so the code authenticated an HPKE recipient while a
 * disconnected authority authenticated the manifest that names every part. An
 * attacker who signed fabricated parts with their own key and wrapped their own
 * generation key to the genuine public `archive_pub` reproduced the fresh-rewrap
 * substitution under Local custody. Now `auth_root` for a never-established
 * package is a digest committing **both** public halves, the sealed commitment
 * covers it, and the manifest verifies only under the committed signing
 * identity -- never under whatever key the package offers.
 */
const ARCHIVE_WORKSPACE = 'ws_01HZXQ9LOCAL0000000000000';
const ARCHIVE_SCALAR = unhex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
const ARCHIVE_PUB = hex(x25519PublicFrom(ARCHIVE_SCALAR));
/** The archive's manifest-signing half. RFC 8032 §7.1 TEST 1024's keypair. */
const ARCHIVE_SIGN = {
  seed: 'f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5',
  public_key: '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
};
const ARCHIVE_CODE = 'AZC52QK9FEHC6M7VS01JDA3NY';
const ARCHIVE_WRONG_CODE = 'AZC52QK9FEHC6M7VS01JDA3NZ';
const ARCHIVE_SALT = unhex('000102030405060708090a0b0c0d0e0f');
const ARCHIVE_NONCE = unhex('202122232425262728292a2b');
const K_ARCHIVE_GEN = unhex('9e0b2f4c7a1d8e364a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a6375');
const ARCHIVE_WRAP_EPHEMERAL = unhex('7c'.repeat(32));

/**
 * The never-established `auth_root`: one digest committing both halves of the
 * archive identity, in the slot a lineage's trust root would fill.
 *
 * auth_root = SHA-256( LP("done/archive-root/v1")
 *                      || LP(hex archive_pub) || LP(hex archive_sign_pub) )
 *
 * The commitment formula and the wrap `info` are unchanged -- they bind this
 * digest exactly as an account package's bind `K_auth` -- so one importer
 * serves all three lineage states. The signing half deliberately rides the
 * commitment rather than the envelope's AAD: the commitment is the one value
 * the attacker cannot seal, and keeping it the sole carrier is what lets the
 * fresh-mint negative isolate it.
 */
const archiveAuthRoot = async (encPub, signPub) =>
  hex(await sha256(concat(lp(ARCHIVE_ROOT_LABEL), lp(encPub), lp(signPub))));

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

/**
 * The envelope's AAD, registered with the coverage audit like every other
 * construction here. It binds the encryption public half so the sealed private
 * half cannot be offered beside somebody else's public half (the row-14
 * negative a mutation found missing); the signing public half is bound through
 * `auth_root` inside the sealed commitment instead, on purpose -- see
 * `archiveAuthRoot` above.
 */
const archiveAad = ({ pub = ARCHIVE_PUB, workspace = ARCHIVE_WORKSPACE, v = '1', label = ARCHIVE_LABEL } = {}) =>
  concat(
    ...aadFields('archive envelope', {
      label,
      workspace_id: workspace,
      v,
      archive_pub: pub,
    }).map(lp),
  );

const sealArchive = async (keyBytes, plaintext, aad = {}) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ARCHIVE_NONCE, additionalData: archiveAad(aad), tagLength: 128 },
      key,
      plaintext,
    ),
  );
};

const openArchive = async (keyBytes, ct, aad = {}) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ARCHIVE_NONCE, additionalData: archiveAad(aad), tagLength: 128 },
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
  const sig = await crypto.subtle.sign(
    { name: 'Ed25519' },
    await importSigner(ARCHIVE_SIGN.seed),
    probe,
  );
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importVerifier(ARCHIVE_SIGN.public_key),
    sig,
    probe,
  );
  if (!ok) throw new Error('archive signing identity: seed and public key are not one keypair.');
};

// --- the scenario -------------------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const LINEAGE = 'lin_01HZXS0000000000000000OLDS';
const OTHER_LINEAGE = 'lin_01J00000000000000000FORGE';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const K_G3 = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const EPHEMERAL = unhex('a621b0d7f8e94c3b25a6f0184d7c39be5028f1a6c4d739e0b8154a2c6f03d97e');

// --- the deletion-gate scenario, shared by the model and the published receipt --

const TERMINAL_HEAD = 'aa'.repeat(32);
const PRIOR_HEAD = 'bb'.repeat(32);
const MID_HEAD = 'ee'.repeat(32);
const RECEIVER = 'cred_01HZXR0000000000000000LAPT';
const PACKAGE_DIGEST = hex(await sha256(concat(lp('retired-package'))));

/**
 * The worked catch-up: two links from the receiver's authenticated prior head
 * to the terminal head, and two absences, each named. Published with the
 * vectors so the accepted receipt reconstructs from its inputs (`FU-05`'s
 * rule) -- the pre-return `caughtUp` object claimed two absences while
 * carrying zero entries, and nothing published could have shown it.
 */
const CAUGHT_UP_TRANSCRIPT = {
  v: 1,
  workspace: WORKSPACE,
  lineage: LINEAGE,
  sourceEpoch: 10,
  links: [
    { prior: PRIOR_HEAD, head: MID_HEAD },
    { prior: MID_HEAD, head: TERMINAL_HEAD },
  ],
  absences: ['env_01HZXT00000000000000000AAA', 'env_01HZXT00000000000000000BBB'],
};

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
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'The gate. No hosted class is destroyed on an elapsed window, a request, or a terminal record the service wrote itself. Something a receiver signed has to exist first.',
  },
  {
    name: 'handoff-from-a-receiver-behind-the-terminal-head',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: "A receiver whose accepted head is not the terminal head is not current, and saying so is the whole point -- otherwise 'verified-current' means 'was reachable recently'. It may still qualify, but only by presenting a transcript.",
  },
  {
    name: 'catchup-of-public-endpoints-alone',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: "The pre-return acceptance, kept as the permanent negative (FU-03/A-05). catchup_digest used to be SHA-256(LP(priorHead) || LP(terminalHead)) -- two public values any stale receiver can hash -- beside a bare count, so the actor whose completeness was in question could self-assert it. That exact receipt, digest and knownAbsences: 0 and all, is now refused: a digest with no transcript behind it commits nothing.",
  },
  {
    name: 'handoff-with-an-unverifiable-catchup',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'A receipt whose catchup_digest does not commit the transcript presented beside it. The receiver signed for verifying one thing and is showing another, and the gate reads only what the signature covers.',
  },
  {
    name: 'catchup-transcript-signed-by-the-receiver',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: "The self-assertion attack with a real transcript: the stale receiver writes its own catch-up and signs it with its own credential. The signature is genuine -- that is asserted before the negative runs -- and it verifies under nothing the gate consults, because the transcript's verifier resolves from the lineage's certification in force, never from the answer (FU-06's rule, at this gate).",
  },
  {
    name: 'catchup-transcript-not-from-the-prior-head',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'A genuinely signed transcript that chains from somewhere else. Without links[0].prior bound to the prior head the receiver authenticated, any transcript would do, and the catch-up would be a formality.',
  },
  {
    name: 'catchup-transcript-with-a-broken-link',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'An interior link that does not name its predecessor. A chain proof is only a proof at every link; a gap in the middle is the same unreceived content as a gap at the ends, wearing continuity.',
  },
  {
    name: 'catchup-transcript-short-of-the-terminal-head',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'A genuinely signed transcript that stops before the terminal head. Caught up to almost the end is behind, and a receiver that verified it is not current in either of the two forms the gate accepts.',
  },
  {
    name: 'handoff-with-unenumerated-absences',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: "The pre-return positive's own numbers, kept as the detected negative: a count of two beside an empty list. 'Some updates could not be recovered' is not a known-absence list, and a deletion authorized on it destroys the only copy of what was never enumerated. The count the receiver signs must equal the list the transcript carries.",
  },
  {
    name: 'catchup-absence-without-an-identifier',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'An absence entry that names nothing. The count-to-list check alone would accept two empty strings as two absences, so each entry must be an identifier -- the gaps are named rather than counted.',
  },
  {
    name: 'handoff-for-another-retired-package',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'The receipt binds the exact package digest, so acknowledging one retirement does not authorize deleting the bytes of another.',
  },
  {
    name: 'handoff-signed-by-a-non-receiver',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: 'The receiver is named in the message, so a service that can assemble the package cannot also sign for having received it.',
  },
];

const RETIRED_NEGATIVES = [
  {
    name: 'live-manifest-relabelled-as-retired',
    falsifies: ['f-745e332-live-retired-package-resigning-undefined'],
    why: 'Row 10 said a live package is UPGRADED to a retired one by importing the terminal record, and not replaced. There was never an upgrade to verify: lineage_state is inside the message the assembler signs, so relabelling it leaves a signature that no longer covers what it names. This is that claim, executed -- the honest live signature against a manifest calling itself retired.',
  },
  {
    name: 'retired-manifest-under-the-assembling-credential',
    falsifies: ['f-745e332-live-retired-package-resigning-undefined'],
    why: 'And the other direction. A complete retired package is signed by the terminal authority, so it does not verify under the device that assembled the live one -- which is what makes "complete package" mean something rather than being a label on the same bytes.',
  },
];

const ARCHIVE_NEGATIVES = [
  {
    name: 'archive-under-a-wrong-code',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The archive identity is sealed under the code and nothing else. A wrong code opens neither keypair nor the commitment beside them, which is what "the code that opens it" has to mean once it is a construction rather than a sentence.',
  },
  {
    name: 'archive-envelope-repaired-with-another-identity',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: "Row 14's own negative, at the archive: an envelope presented alongside a public key that is not the one it was sealed for. The identity is in the envelope's AAD, so the pairing is authenticated rather than assumed -- without it, an archive's sealed private half could be offered beside somebody else's public half.",
  },
  {
    name: 'aad-only-archive-envelope-workspace',
    isolates: 'archive envelope.workspace_id',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: "The AAD's workspace binding, isolated from the key derivation's. The HKDF info binds the workspace too, so a negative that changed both would be rescued by neither; this one opens with the genuine derived key and an AAD claiming another workspace, so only the AAD can refuse it.",
  },
  {
    name: 'aad-only-archive-envelope-version',
    isolates: 'archive envelope.v',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The envelope version, bound so a v1 envelope cannot be presented as a later one whose rules differ.',
  },
  {
    name: 'aad-only-renumbered-archive-label',
    isolates: 'archive envelope.label',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The construction label, the same discipline as every other AAD here.',
  },
  {
    name: 'freshly-minted-archive-under-an-attacker-root',
    falsifies: [
      'f-745e332-local-archive-portable-wrap-undefined',
      'f-745e332-package-root-rewrap-substitution',
    ],
    why: "The account path's fresh-mint attack, at the state S0-9 convicted (FU-02/A-04/ST-01). HPKE base mode needs only archive_pub, which travels in the archive; Ed25519 verification needs only the signing key the manifest names, and the attacker names their own. So the package is internally consistent end to end -- its wrap round-trips under the genuine archive scalar and its manifest verifies under the signing key its auth_root commits, both asserted before the negative runs. Only the commitment sealed under the code separates it from a real archive, because the attacker's auth_root commits a signing identity the factor never sealed.",
  },
  {
    name: 'archive-refused-before-any-unwrap',
    falsifies: [
      'f-745e332-local-archive-portable-wrap-undefined',
      'f-745e332-package-root-rewrap-substitution',
    ],
    why: 'Order, observed rather than inferred, exactly as the account path observes it: the commitment is checked before the manifest signer is consulted and before a single generation unwrap runs, so an attacker-rooted archive is refused without opening any attacker-chosen content.',
  },
  {
    name: 'archive-manifest-signed-by-the-archiving-device',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: "The pre-return world, kept as the permanent negative (FU-02): the shipped positive verified the archive manifest under the laptop's device key, an authority the archive factor never bound. Here the device's signature over otherwise-genuine fields -- genuine, and asserted to be -- is refused, because the manifest verifies only under the signing identity the sealed commitment carries, never under whatever key the package offers.",
  },
  {
    name: 'archive-signing-identity-not-committed-by-the-root',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The second door the same conviction opens, closed by the same resolution rule: keep the genuine auth_root so the commitment agrees, and present your own signing key beside it. The manifest signer must be the identity the commitment-checked auth_root itself commits, so a signing key the root does not derive verifies nothing -- however genuine its signature, and that it is genuine is asserted first.',
  },
  {
    name: 'archive-parts-not-the-manifests',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The composed importer checks the parts against the manifest the factor-committed identity signed, on the Local path -- the check the pre-return isolated opener never made, because it never met the manifest at all.',
  },
  {
    name: 'archive-wrap-from-another-workspace',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'The generation wrap binds the workspace, so an archive of one Local workspace opens no generation of another. The envelope and manifest agree with the mutated workspace on purpose -- sealed and signed for it -- so the refusal is the wrap’s alone rather than one check wearing four hats.',
  },
  {
    name: 'archive-wrap-of-another-generation',
    falsifies: ['f-745e332-local-archive-portable-wrap-undefined'],
    why: 'And the generation, for the same reason.',
  },
];

const ROOT_NEGATIVES = [
  {
    name: 'freshly-minted-package-under-an-attacker-root',
    falsifies: ['f-745e332-package-root-rewrap-substitution'],
    why: 'The attack `substituted-trust-root` cannot reach, and the reason this row needed reopening. HPKE base mode is anonymous: the attacker needs only R_pub, which travels in the package. So they pick their own auth_root, sign a fabricated history under it, and wrap their OWN generation key to the GENUINE R_pub with info naming their own root. Every signature verifies, under a root they minted, and the wrap opens -- nothing in the ciphertext is wrong. What refuses it is the root commitment sealed beside R_priv, which the attacker cannot produce without the code.',
  },
  {
    name: 'attacker-root-refused-before-any-unwrap',
    falsifies: ['f-745e332-package-root-rewrap-substitution'],
    why: 'Order, not just outcome. The commitment is checked against the manifest before a single generation is unwrapped, so a package whose root is wrong is refused without exercising HPKE at all. An implementation that unwrapped first and checked afterwards would still have opened attacker-chosen content before noticing.',
  },
  {
    name: 'root-commitment-for-another-lineage',
    falsifies: ['f-745e332-package-root-rewrap-substitution'],
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
    isolates: 'generation wrap info.label',
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
    isolates: 'package manifest.label',
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

  // --- the Local archive: one composed importer over the published package -------

  /**
   * The case §9.3 exists for: total device loss, no account, no provider.
   *
   * The restore below consumes the **published vector** and the user's code,
   * and nothing else -- the reconstruction rule `FU-05` set, at the package
   * whose two halves `S0-9` caught living apart (`FU-02`/`A-04`/`ST-01`): the
   * pre-return generator proved envelope-to-wrap opening in one block and
   * verified a device-signed manifest in another, and no rule joined the
   * authorities. This is the join, executed: one importer, §5's order, run
   * over the exact bytes the vector publishes.
   */
  const aIn = archive.inputs;
  const aId = aIn.archive;

  // The identity's root digest recomputes from the published halves, and the
  // published artifacts recompute from the published inputs.
  const aAuthRoot = await archiveAuthRoot(aId.archive_pub, aId.archive_sign_pub);
  if (aAuthRoot !== archive.derived.auth_root) {
    throw new Error("the published auth_root is not the archive identity's own digest.");
  }
  const archiveManifest = {
    v: aIn.v,
    workspace: aIn.workspace_id,
    lineage: aIn.lineage_id,
    lineageState: aIn.lineage_state,
    authRoot: archive.derived.auth_root,
    lineageHeadDigest: aIn.lineage_head_digest,
    epoch: aIn.epoch,
    parts: archive.derived.parts_digest,
    assembledBy: aIn.assembled_by,
  };
  const archiveBase = {
    workspace: aIn.workspace_id,
    lineage: aIn.lineage_id,
    authRoot: archive.derived.auth_root,
    gen: aId.generation.gen,
  };
  const archiveSalt = unhex(aId.hkdf_salt);
  const rebuiltEnvelope = await sealArchive(
    await archiveKeyFrom(aId.code, { salt: archiveSalt }),
    concat(
      unhex(aId.encryption_scalar),
      unhex(aId.signing_seed),
      unhex(await rootCommitment(archiveBase)),
    ),
    { pub: aId.archive_pub },
  );
  if (hex(rebuiltEnvelope) !== archive.expected.envelope_ct) {
    throw new Error('the archive envelope does not reconstruct from its published inputs.');
  }
  const rebuiltWrap = await hpkeSeal(
    unhex(aId.hpke_ephemeral_scalar),
    unhex(aId.archive_pub),
    wrapInfo(archiveBase),
    unhex(aId.generation.k_g),
  );
  if (
    rebuiltWrap.enc !== archive.expected.generation_wrap.enc ||
    rebuiltWrap.ct !== archive.expected.generation_wrap.ct
  ) {
    throw new Error('the archive generation wrap does not reconstruct from its published inputs.');
  }

  const signManifest = async (seed, fields) =>
    hex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          await importSigner(seed),
          manifestMessage(fields),
        ),
      ),
    );

  /**
   * The one importer §5 orders, at the never-established state.
   *
   * The verification key for the manifest is **resolved, not read**: the code
   * opens the envelope, the envelope carries the commitment, the commitment
   * covers `auth_root`, and `auth_root` is the digest of the two public
   * halves -- so the signing identity the manifest must verify under is
   * factor-authenticated before the signature is ever checked. A key the
   * package offers on its own authority is consulted by nothing.
   */
  const importLocalArchive = async ({
    code = aId.code,
    encPub = aId.archive_pub,
    signPub = aId.archive_sign_pub,
    envelope = archive.expected.envelope_ct,
    fields = archiveManifest,
    signature = archive.expected.manifest_signature,
    parts = aIn.parts,
    wrap = archive.expected.generation_wrap,
    gen = aId.generation.gen,
    observe = null,
  } = {}) => {
    // 1. The code opens the identity. The AAD binds the encryption half.
    const unsealed = await openArchive(
      await archiveKeyFrom(code, { salt: archiveSalt, workspace: fields.workspace }),
      unhex(envelope),
      { pub: encPub, workspace: fields.workspace },
    );
    const scalar = unsealed.subarray(0, 32);
    const signSeed = hex(unsealed.subarray(32, 64));
    const sealedCommitment = hex(unsealed.subarray(64));
    // 2. The commitment is the check -- before the manifest's signer is
    //    consulted and before any unwrap is attempted.
    const claimed = await rootCommitment({
      workspace: fields.workspace,
      lineage: fields.lineage,
      authRoot: fields.authRoot,
    });
    if (claimed !== sealedCommitment) {
      throw new Error('archive root commitment does not match the manifest; refused before unwrap');
    }
    if ((await archiveAuthRoot(encPub, signPub)) !== fields.authRoot) {
      throw new Error("the manifest's auth_root is not the archive identity's digest");
    }
    // 3. The manifest verifies under the committed signing identity alone.
    if (observe) observe.signerConsulted = true;
    await verifyManifest(fields, signature, signPub);
    // 4. Every part is what the manifest says it is.
    if ((await partsDigest(parts)) !== fields.parts) {
      throw new Error('archive parts digest does not match the manifest');
    }
    // 5. Only now, the unwrap.
    if (observe) observe.unwrapped = true;
    const key = await hpkeOpen(
      wrap.enc,
      scalar,
      wrapInfo({
        workspace: fields.workspace,
        lineage: fields.lineage,
        authRoot: fields.authRoot,
        gen,
      }),
      wrap.ct,
    );
    return { key, signSeed };
  };

  const restored = await importLocalArchive();
  if (hex(restored.key) !== aId.generation.k_g) {
    throw new Error('the archive does not restore from its code and the published bytes alone.');
  }
  if (restored.signSeed !== aId.signing_seed) {
    throw new Error('the archive identity does not restore whole: the signing half is missing.');
  }

  await refuses('archive-under-a-wrong-code', () =>
    importLocalArchive({ code: ARCHIVE_WRONG_CODE }),
  );

  const archiveKey = await archiveKeyFrom(aId.code, { salt: archiveSalt });
  const archiveEnvelopeBytes = unhex(archive.expected.envelope_ct);
  await refuses('archive-envelope-repaired-with-another-identity', () =>
    openArchive(archiveKey, archiveEnvelopeBytes, {
      pub: hex(x25519PublicFrom(unhex('4c'.repeat(32)))),
    }),
  );
  await refuses('aad-only-archive-envelope-workspace', () =>
    openArchive(archiveKey, archiveEnvelopeBytes, {
      pub: aId.archive_pub,
      workspace: 'ws_01J0000000000000000000000A',
    }),
  );
  await refuses('aad-only-archive-envelope-version', () =>
    openArchive(archiveKey, archiveEnvelopeBytes, { pub: aId.archive_pub, v: '2' }),
  );
  await refuses('aad-only-renumbered-archive-label', () =>
    openArchive(archiveKey, archiveEnvelopeBytes, {
      pub: aId.archive_pub,
      label: 'done/archive/v2',
    }),
  );

  /**
   * The attacker's archive, built end to end and asserted to be internally
   * consistent -- because a negative that refuses a malformed package proves
   * nothing. The wrap round-trips under the genuine restored scalar, and the
   * manifest verifies under the signing key its own `auth_root` commits. Only
   * the commitment sealed under the code separates it from a real archive.
   */
  const attackerArchiveRoot = await archiveAuthRoot(aId.archive_pub, KEYS.forged_root.public_key);
  const attackerArchiveFields = { ...archiveManifest, authRoot: attackerArchiveRoot };
  const attackerArchiveBase = { ...archiveBase, authRoot: attackerArchiveRoot };
  const attackerArchiveKey = unhex('0d'.repeat(32));
  const attackerArchiveWrap = await hpkeSeal(
    unhex('5e'.repeat(32)),
    unhex(aId.archive_pub), // the GENUINE archive identity. It is public.
    wrapInfo(attackerArchiveBase),
    attackerArchiveKey,
  );
  const attackerOpenedArchive = await hpkeOpen(
    attackerArchiveWrap.enc,
    unhex(aId.encryption_scalar),
    wrapInfo(attackerArchiveBase),
    attackerArchiveWrap.ct,
  );
  if (hex(attackerOpenedArchive) !== hex(attackerArchiveKey)) {
    throw new Error('the attacker archive does not round-trip; the negative would prove nothing.');
  }
  const attackerArchiveSignature = await signManifest(
    KEYS.forged_root.seed,
    attackerArchiveFields,
  );
  const attackerSigOk = await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importVerifier(KEYS.forged_root.public_key),
    unhex(attackerArchiveSignature),
    manifestMessage(attackerArchiveFields),
  );
  if (!attackerSigOk) {
    throw new Error('the attacker manifest is not genuinely signed; the negative would prove nothing.');
  }
  const attackerArchivePackage = {
    signPub: KEYS.forged_root.public_key,
    fields: attackerArchiveFields,
    signature: attackerArchiveSignature,
    wrap: attackerArchiveWrap,
  };
  await refuses('freshly-minted-archive-under-an-attacker-root', () =>
    importLocalArchive(attackerArchivePackage),
  );

  /**
   * Order, observed rather than inferred, as the account path observes it: the
   * probes below flip only if the importer reaches the signer or the unwrap,
   * and the assertion is that a refused archive reached neither.
   */
  const observedArchive = { signerConsulted: false, unwrapped: false };
  await refuses('archive-refused-before-any-unwrap', () =>
    importLocalArchive({ ...attackerArchivePackage, observe: observedArchive }),
  );
  if (observedArchive.signerConsulted || observedArchive.unwrapped) {
    throw new Error(
      'The archive importer consulted the package signer or ran an unwrap before the commitment ' +
        'was checked. An archive under an attacker-chosen root would have been trusted before ' +
        'anything noticed.',
    );
  }

  // The pre-return world, kept as the permanent negative: the archiving
  // device's own signature over otherwise-genuine fields -- genuine, and
  // asserted to be, under the key the factor never bound.
  const deviceSignature = await signManifest(KEYS.laptop.seed, archiveManifest);
  const deviceSigOk = await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importVerifier(KEYS.laptop.public_key),
    unhex(deviceSignature),
    manifestMessage(archiveManifest),
  );
  if (!deviceSigOk) {
    throw new Error('the device-signed manifest is not genuinely signed; the negative would prove nothing.');
  }
  await refuses('archive-manifest-signed-by-the-archiving-device', () =>
    importLocalArchive({ signature: deviceSignature }),
  );

  /**
   * The second door: keep the genuine `auth_root` so the commitment agrees,
   * and present an uncommitted signing key beside it, with a manifest signed
   * by that key and a fresh wrap agreeing with the genuine root. Everything
   * verifies under the keys it names -- asserted below -- and the one rule
   * that refuses it is that the signer must be the identity the auth_root
   * itself commits.
   */
  const uncommittedSignature = await signManifest(KEYS.forged_root.seed, archiveManifest);
  const uncommittedSigOk = await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importVerifier(KEYS.forged_root.public_key),
    unhex(uncommittedSignature),
    manifestMessage(archiveManifest),
  );
  if (!uncommittedSigOk) {
    throw new Error('the uncommitted-signer manifest is not genuinely signed; the negative would prove nothing.');
  }
  const uncommittedWrap = await hpkeSeal(
    unhex('6f'.repeat(32)),
    unhex(aId.archive_pub),
    wrapInfo(archiveBase), // the GENUINE root: the commitment must agree
    attackerArchiveKey,
  );
  const uncommittedOpened = await hpkeOpen(
    uncommittedWrap.enc,
    unhex(aId.encryption_scalar),
    wrapInfo(archiveBase),
    uncommittedWrap.ct,
  );
  if (hex(uncommittedOpened) !== hex(attackerArchiveKey)) {
    throw new Error('the uncommitted-signer wrap does not round-trip; the negative would prove nothing.');
  }
  await refuses('archive-signing-identity-not-committed-by-the-root', () =>
    importLocalArchive({
      signPub: KEYS.forged_root.public_key,
      signature: uncommittedSignature,
      wrap: uncommittedWrap,
    }),
  );

  await refuses('archive-parts-not-the-manifests', () =>
    importLocalArchive({
      parts: aIn.parts.map((p) => (p.name === 'generations' ? { ...p, count: 2 } : p)),
    }),
  );

  /**
   * These two carry an envelope sealed for and a manifest signed for the
   * mutated package on purpose, so the commitment and the signature agree and
   * the refusal is the wrap's alone. Row 12's finding, at a fourth object --
   * and the inverse of the same discipline is what the fresh-mint negative
   * needed: there the wrap agrees and only the commitment refuses.
   */
  const composedFor = async (fields, gen) => ({
    fields,
    gen,
    envelope: hex(
      await sealArchive(
        await archiveKeyFrom(aId.code, { salt: archiveSalt, workspace: fields.workspace }),
        concat(
          unhex(aId.encryption_scalar),
          unhex(aId.signing_seed),
          unhex(
            await rootCommitment({
              workspace: fields.workspace,
              lineage: fields.lineage,
              authRoot: fields.authRoot,
            }),
          ),
        ),
        { pub: aId.archive_pub, workspace: fields.workspace },
      ),
    ),
    signature: await signManifest(aId.signing_seed, fields),
  });
  await refuses('archive-wrap-from-another-workspace', async () =>
    importLocalArchive(
      await composedFor(
        { ...archiveManifest, workspace: 'ws_01J0000000000000000000000A' },
        aId.generation.gen,
      ),
    ),
  );
  await refuses('archive-wrap-of-another-generation', async () =>
    importLocalArchive(await composedFor(archiveManifest, 2)),
  );

  // --- the deletion gate ---------------------------------------------------------

  const signHandoff = async (fields, seed = KEYS.laptop.seed) =>
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(seed),
        handoffMessage(fields),
      ),
    );
  const signTranscript = async (t, seed = KEYS.k_auth.seed) =>
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(seed),
        transcriptMessage(t),
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
   *
   * For a behind receiver, the receipt is only as good as the transcript it
   * commits (`FU-03`). `certificationInForce` is the transcript's verifier,
   * resolved by the caller from the lineage's client-authenticated
   * certification -- an input, never a key read out of the answer (`FU-06`'s
   * rule, at this gate). The receiver's own credential can never fill it: the
   * receiver signs `H` for having verified the transcript, and the source
   * authority signs the transcript itself, so neither actor can play both
   * parts.
   */
  const authorizeDeletion = async (
    klass,
    handoff,
    sig,
    {
      verifierKey = KEYS.laptop.public_key,
      transcript = null,
      transcriptSig = null,
      certificationInForce = KEYS.k_auth.public_key,
    } = {},
  ) => {
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
      if (transcript === null || transcriptSig === null)
        throw new Error('a catch-up digest with no transcript behind it is a self-assertion');
      const committed = hex(await sha256(transcriptMessage(transcript)));
      if (handoff.catchupDigest !== committed)
        throw new Error('the receipt does not commit the transcript presented beside it');
      const tOk = await crypto.subtle.verify(
        { name: 'Ed25519' },
        await importVerifier(certificationInForce),
        transcriptSig,
        transcriptMessage(transcript),
      );
      if (!tOk)
        throw new Error("the transcript does not verify under the lineage's certification in force");
      if (transcript.links.length === 0 || transcript.links[0].prior !== handoff.priorHead)
        throw new Error('the transcript does not chain from the prior head the receiver authenticated');
      for (let i = 1; i < transcript.links.length; i += 1) {
        if (transcript.links[i].prior !== transcript.links[i - 1].head)
          throw new Error('a transcript link does not chain from its predecessor');
      }
      if (transcript.links[transcript.links.length - 1].head !== handoff.terminalHead)
        throw new Error('the transcript stops short of the terminal head');
      if (transcript.absences.some((a) => a === ''))
        throw new Error('an absence without an identifier is a summary, not an enumeration');
      if (handoff.knownAbsences !== transcript.absences.length)
        throw new Error('the signed absence count does not match the enumerated list');
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

  // Form two: behind, with a transcript that is signed by the certification in
  // force, chains from the receiver's own prior head to the terminal head, and
  // names both of its absences -- the count the receiver signs is checked
  // against the list.
  const caughtUpSig = await signTranscript(CAUGHT_UP_TRANSCRIPT);
  const caughtUp = {
    ...currentHandoff,
    priorHead: PRIOR_HEAD,
    catchupDigest: hex(await sha256(transcriptMessage(CAUGHT_UP_TRANSCRIPT))),
    knownAbsences: CAUGHT_UP_TRANSCRIPT.absences.length,
  };
  await authorizeDeletion('primary', caughtUp, await signHandoff(caughtUp), {
    transcript: CAUGHT_UP_TRANSCRIPT,
    transcriptSig: caughtUpSig,
  });

  /** A receipt whose H commits the given transcript, receiver-signed. */
  const receiptFor = async (t, knownAbsences = t.absences.length) => {
    const h = {
      ...currentHandoff,
      priorHead: PRIOR_HEAD,
      catchupDigest: hex(await sha256(transcriptMessage(t))),
      knownAbsences,
    };
    return { h, hSig: await signHandoff(h), transcript: t, transcriptSig: await signTranscript(t) };
  };

  await refuses('deletion-without-a-handoff', () =>
    authorizeDeletion('primary', null, new Uint8Array(64)),
  );
  await refuses('handoff-from-a-receiver-behind-the-terminal-head', async () => {
    const behind = { ...currentHandoff, priorHead: PRIOR_HEAD };
    return authorizeDeletion('primary', behind, await signHandoff(behind));
  });
  await refuses('catchup-of-public-endpoints-alone', async () => {
    // The pre-return acceptance, byte for byte: a digest over two public
    // heads, a bare count, and nothing else -- computable by the receiver.
    const selfAsserted = {
      ...currentHandoff,
      priorHead: PRIOR_HEAD,
      catchupDigest: hex(await sha256(concat(lp(PRIOR_HEAD), lp(TERMINAL_HEAD)))),
      knownAbsences: 0,
    };
    return authorizeDeletion('primary', selfAsserted, await signHandoff(selfAsserted));
  });
  await refuses('handoff-with-an-unverifiable-catchup', async () => {
    const bad = { ...caughtUp, catchupDigest: 'cc'.repeat(32) };
    return authorizeDeletion('primary', bad, await signHandoff(bad), {
      transcript: CAUGHT_UP_TRANSCRIPT,
      transcriptSig: caughtUpSig,
    });
  });

  // The receiver-signed transcript is a genuine signature, and that is
  // asserted before the negative runs -- the refusal must be about whose key
  // it is, not whether it verifies.
  const receiverSignedTranscript = await signTranscript(CAUGHT_UP_TRANSCRIPT, KEYS.laptop.seed);
  const receiverSigGenuine = await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importVerifier(KEYS.laptop.public_key),
    receiverSignedTranscript,
    transcriptMessage(CAUGHT_UP_TRANSCRIPT),
  );
  if (!receiverSigGenuine) {
    throw new Error('the receiver-signed transcript is not genuine; the negative would prove nothing.');
  }
  await refuses('catchup-transcript-signed-by-the-receiver', async () =>
    authorizeDeletion('primary', caughtUp, await signHandoff(caughtUp), {
      transcript: CAUGHT_UP_TRANSCRIPT,
      transcriptSig: receiverSignedTranscript,
    }),
  );

  await refuses('catchup-transcript-not-from-the-prior-head', async () => {
    const t = {
      ...CAUGHT_UP_TRANSCRIPT,
      links: [
        { prior: '99'.repeat(32), head: MID_HEAD },
        { prior: MID_HEAD, head: TERMINAL_HEAD },
      ],
    };
    const { h, hSig, transcript, transcriptSig } = await receiptFor(t);
    return authorizeDeletion('primary', h, hSig, { transcript, transcriptSig });
  });
  await refuses('catchup-transcript-with-a-broken-link', async () => {
    const t = {
      ...CAUGHT_UP_TRANSCRIPT,
      links: [
        { prior: PRIOR_HEAD, head: MID_HEAD },
        { prior: '99'.repeat(32), head: TERMINAL_HEAD },
      ],
    };
    const { h, hSig, transcript, transcriptSig } = await receiptFor(t);
    return authorizeDeletion('primary', h, hSig, { transcript, transcriptSig });
  });
  await refuses('catchup-transcript-short-of-the-terminal-head', async () => {
    const t = { ...CAUGHT_UP_TRANSCRIPT, links: [{ prior: PRIOR_HEAD, head: MID_HEAD }] };
    const { h, hSig, transcript, transcriptSig } = await receiptFor(t);
    return authorizeDeletion('primary', h, hSig, { transcript, transcriptSig });
  });
  await refuses('handoff-with-unenumerated-absences', async () => {
    // The pre-return positive's own numbers: two claimed, none named.
    const t = { ...CAUGHT_UP_TRANSCRIPT, absences: [] };
    const { h, hSig, transcript, transcriptSig } = await receiptFor(t, 2);
    return authorizeDeletion('primary', h, hSig, { transcript, transcriptSig });
  });
  await refuses('catchup-absence-without-an-identifier', async () => {
    const t = { ...CAUGHT_UP_TRANSCRIPT, absences: [CAUGHT_UP_TRANSCRIPT.absences[0], ''] };
    const { h, hSig, transcript, transcriptSig } = await receiptFor(t);
    return authorizeDeletion('primary', h, hSig, { transcript, transcriptSig });
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
  // The Local archive's whole authority chain, assembled here so the vector
  // publishes every input the composed importer consumes (S0-6 return, FU-02):
  // the code seals both private halves beside the commitment, auth_root is the
  // identity's own digest, and the manifest is signed by the archive's signing
  // half rather than by any device key.
  const archiveRoot = await archiveAuthRoot(ARCHIVE_PUB, ARCHIVE_SIGN.public_key);
  const archiveBase = { workspace: ARCHIVE_WORKSPACE, lineage: '', authRoot: archiveRoot, gen: 1 };
  const archiveCommitment = await rootCommitment(archiveBase);
  const archiveEnvelope = await sealArchive(
    await archiveKeyFrom(ARCHIVE_CODE),
    concat(ARCHIVE_SCALAR, unhex(ARCHIVE_SIGN.seed), unhex(archiveCommitment)),
  );
  const archiveWrap = await hpkeSeal(
    ARCHIVE_WRAP_EPHEMERAL,
    unhex(ARCHIVE_PUB),
    wrapInfo(archiveBase),
    K_ARCHIVE_GEN,
  );
  const archiveSigner = await importSigner(ARCHIVE_SIGN.seed);
  const archiveFields = {
    v: 1,
    workspace: ARCHIVE_WORKSPACE,
    lineage: '',
    lineageState: 'never-established',
    authRoot: archiveRoot,
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
      why: '§9.3’s fidelity archive of a Local workspace, which is §13.5’s third lineage state rather than a fourth artifact. No epochs, no head, no suffix and an empty lineage; the archiving device is the assembler, and **what authenticates it is the code that opens it** — now for the manifest too (`S0-6` return, `FU-02`): `auth_root` is the digest of both public halves of the factor-sealed archive identity, the manifest verifies only under the committed signing half, and the composed importer is run over exactly this published package.',
      inputs: {
        v: 1,
        workspace_id: ARCHIVE_WORKSPACE,
        lineage_id: '',
        lineage_state: 'never-established',
        lineage_head_digest: '',
        epoch: 0,
        assembled_by: LAPTOP,
        parts: ARCHIVE_PARTS,
        archive: {
          code: ARCHIVE_CODE,
          hkdf_salt: hex(ARCHIVE_SALT),
          nonce: hex(ARCHIVE_NONCE),
          encryption_scalar: hex(ARCHIVE_SCALAR),
          signing_seed: ARCHIVE_SIGN.seed,
          archive_pub: ARCHIVE_PUB,
          archive_sign_pub: ARCHIVE_SIGN.public_key,
          generation: { gen: 1, k_g: hex(K_ARCHIVE_GEN) },
          hpke_ephemeral_scalar: hex(ARCHIVE_WRAP_EPHEMERAL),
        },
      },
      derived: {
        auth_root: archiveRoot,
        root_commitment: archiveCommitment,
        parts_digest: archiveParts,
        manifest_message: hex(manifestMessage(archiveFields)),
      },
      expected: {
        envelope_ct: hex(archiveEnvelope),
        generation_wrap: archiveWrap,
        manifest_signature: await sign(archiveSigner, archiveFields),
      },
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
          '§9.3’s Local archive has no lineage, so the lineage field is empty and `auth_root` is the archive identity’s own digest — SHA-256 over LP("done/archive-root/v1") || LP(hex archive_pub) || LP(hex archive_sign_pub) — committed under the code beside both private halves (`S0-6` return, `FU-02`). What authenticates a Local archive is the code that opens it, for the manifest as well as the wraps: the signing half verifies the manifest, the encryption half opens the generations, and neither authority is resolvable from anything the package alone offers. The archive still answers *does ciphertext still exist* for a holder without the code',
      },
      local_archive: {
        why: 'The S0-9 conviction (FU-02/A-04/ST-01): the factor sealed an HPKE recipient while a separate device key, never bound by the factor, authenticated the manifest — so a fresh wrap to the genuine public archive_pub could open an independently chosen generation key under a fabricated manifest. The identity now has two halves under one code, and the composed importer refuses the fresh mint at the commitment, before its signer is consulted and before any unwrap.',
        identity:
          'X25519 archive_pub/archive_priv opens the wraps; Ed25519 archive_sign_pub/archive_sign_priv signs the manifest. One identity per workspace (P-6), minted at first archive, retired to legacy at promotion.',
        auth_root:
          'SHA-256( LP("done/archive-root/v1") || LP(hex archive_pub) || LP(hex archive_sign_pub) ) — in the manifest slot a lineage’s trust root would fill, so the commitment formula and the wrap info are unchanged and one importer serves all three lineage states',
        envelope:
          'K_archive = HKDF-SHA256(ikm = utf8(code), salt, info = LP("done/archive/v1") || LP(workspace_id)); ct seals archive_priv || archive_sign_priv || RootCommitment under AES-256-GCM; AAD = LP("done/archive/v1") || LP(workspace_id) || LP(dec v) || LP(hex archive_pub)',
        aad_note:
          'The AAD binds the encryption half so the sealed private halves cannot be offered beside somebody else’s public key. The signing half is bound through auth_root inside the sealed commitment instead, deliberately: the commitment is the one value the attacker cannot seal, and keeping it the sole carrier of the signing identity is what lets the fresh-mint negative isolate it.',
        importer:
          'One path, §5’s order: the code opens the envelope; the sealed commitment is checked against the manifest before anything the package says is trusted; the manifest verifies only under the committed signing identity — never under a key the package offers; the parts digest is checked; only then are generations unwrapped.',
      },
      terminal_handoff: {
        why: 'The S0-9 conviction (FU-03/A-05): catchup_digest was SHA-256 over two public heads beside a bare count, so a stale receiver could self-assert completeness and authorize hosted destruction. The digest now commits the full bytes of a signed CatchupTranscript, and the gate verifies the transcript itself.',
        receipt:
          'H = LP("done/handoff/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(hex terminal_head_digest) || LP(hex retired_package_digest) || LP(receiver_credential) || LP(hex receiver_prior_head) || LP(hex catchup_digest) || LP(dec known_absence_count); sig = Ed25519(the receiving client’s signing credential; H)',
        transcript:
          'T = LP("done/catchup/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(dec source_epoch) || LP(dec link_count) || for each link: LP(hex prior) || LP(hex head) || LP(dec absence_count) || for each: LP(absence_id); sig_T = Ed25519(the lineage’s certification in force at source_epoch; T); catchup_digest = SHA-256(T)',
        authority:
          'The transcript’s verifier resolves from the lineage’s client-authenticated certification in force — an input, never a key read out of the answer (FU-06’s rule at this gate). The receiver’s own credential can never fill it, so neither actor signs both parts of the receipt.',
        verified_current:
          'Two forms and neither is a timer: the receiver’s accepted head is the terminal head and catchup_digest is empty, or the receipt commits a transcript that verifies under the certification in force, chains link by link from the receiver’s authenticated prior head to the terminal head, and enumerates every known absence by identifier — with the count the receiver signed equal to the list the transcript carries.',
        deletion_authority: {
          why: 'One gate, one domain (P-4 falsifier 17, the S0-7 return): this gate and the retention model state the same predicate over the same six classes, and scripts/check-retention.mjs cross-checks this published statement against §14.7’s table and the executable model — drift in the class list or the time semantics fails a build rather than passing both. The five-entry copy that omitted recovery-anchor died here.',
          classes: DELETION_CLASSES,
          before_the_boundary:
            'a class deletes only with a durable per-class TerminalHandoff — S0-6’s gate, untouched',
          destructive_boundary:
            'retired_at + RETENTION, written exactly once at the cause overwrite and never earlier than an inherited deadline',
          at_the_boundary:
            'erasure executes the owner’s intrinsic acceptance, carried in the signed retire payload, and terminates in deleted-without-receipt — a terminal state no reader can take for a receipt; elapsed time is never an authority',
        },
        accepted_receipt: {
          handoff: {
            v: 1,
            workspace_id: WORKSPACE,
            lineage_id: LINEAGE,
            terminal_head_digest: TERMINAL_HEAD,
            retired_package_digest: PACKAGE_DIGEST,
            receiver_credential: RECEIVER,
            receiver_prior_head: PRIOR_HEAD,
            catchup_digest: hex(await sha256(transcriptMessage(CAUGHT_UP_TRANSCRIPT))),
            known_absence_count: CAUGHT_UP_TRANSCRIPT.absences.length,
          },
          transcript: {
            v: CAUGHT_UP_TRANSCRIPT.v,
            workspace_id: CAUGHT_UP_TRANSCRIPT.workspace,
            lineage_id: CAUGHT_UP_TRANSCRIPT.lineage,
            source_epoch: CAUGHT_UP_TRANSCRIPT.sourceEpoch,
            links: CAUGHT_UP_TRANSCRIPT.links,
            absences: CAUGHT_UP_TRANSCRIPT.absences,
            message: hex(transcriptMessage(CAUGHT_UP_TRANSCRIPT)),
            signed_by: 'the lineage’s certification in force — modeled by k_auth',
          },
        },
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
  reportAudit(NEGATIVES);

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
