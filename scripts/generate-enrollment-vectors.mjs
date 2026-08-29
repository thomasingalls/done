/**
 * Test vectors for the device-to-device enrollment ceremony (TRD §15 row 11, §13.6).
 *
 * The construction is specified in docs/selections/row-11-enrollment-ceremony.md.
 * This script is the executable half of that document: it emits
 * test/vectors/enrollment-ceremony.json, which Stage 4's client must reproduce
 * byte for byte on both devices.
 *
 * What the ceremony is for, in one sentence, because every field below follows
 * from it: §13.6's second gate says service authorization alone must never make
 * an existing device release a content key, so the existing device has to learn
 * the new device's wrapping public key through a channel the service does not
 * control. The channel here is a person reading five characters off one screen
 * and typing them into the other.
 *
 * Three objects:
 *
 *   - The *commitment* to each side's nonce, exchanged before either is
 *     revealed. Without it the second revealer grinds its nonce until the short
 *     string comes out however it likes, and the whole ceremony is decoration.
 *     §5's grinding demonstration is in the emitted file, with a real count.
 *   - The *transcript*, which binds what is being authenticated — the new
 *     device's wrapping key — to the epoch and both credentials.
 *   - The *short authentication string*, five Crockford Base32 symbols derived
 *     from the transcript, using row 14's alphabet and its uniform mask.
 *
 * The wrap itself is not here. HPKE is row 1's primitive and row 4's framing;
 * what this row pins is the `info` that binds a wrap to the ceremony that
 * authorized it, so a wrap made for one transcript opens under no other.
 *
 * Usage: node scripts/generate-enrollment-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto, createPrivateKey, createPublicKey } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/enrollment-ceremony.json', import.meta.url);

const COMMIT_LABEL = 'done/enroll-commit/v1';
const TRANSCRIPT_LABEL = 'done/enroll/v1';
const SAS_LABEL = 'done/enroll-sas/v1';
const WRAP_LABEL = 'done/enroll-wrap/v1';

/** Row 14's alphabet, reused rather than reinvented. I, L, O and U are absent. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Five symbols, 25 bits. §4 of the selection document argues the number. */
const SAS_SYMBOLS = 5;

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

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const u32be = (n) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

// --- the three constructions ---------------------------------------------------

/**
 * c_r = SHA-256( LP("done/enroll-commit/v1") || LP(role) || LP(hex nonce) )
 *
 * `role` is bound because it costs nothing and removes a class: without it the
 * two commitments are structurally identical, so one side's can be echoed back
 * as the other's. Row 3 took the same trade for `purpose`.
 */
const commit = async (role, nonce, label = COMMIT_LABEL) =>
  hex(await sha256(concat(...aadFields('nonce commitment', { label, role, nonce }).map(lp))));

/**
 * T = LP("done/enroll/v1") || LP(workspace_id) || LP(dec epoch) || LP(hex epoch_head)
 *     || LP(existing_credential_id) || LP(new_credential_id)
 *     || LP(hex new_wrapping_key) || LP(hex new_signing_key)
 *     || LP(hex recovery_state_digest)
 *     || LP(hex nonce_existing) || LP(hex nonce_new)
 *
 * `new_wrapping_key` is the field the whole ceremony exists to authenticate.
 * The two credential ids are bound in fixed positions, which is what makes the
 * transcript role-ordered: swapping the devices is a different ceremony.
 *
 * **`epoch_head` is here because row 9 asked for it.** §13.5 records that a
 * brand-new client trusts the service to identify the current head, with no
 * mechanism to fix it — and a device enrolling through this ceremony is talking
 * to one that already knows. Binding the head costs nothing on either side and
 * makes the five typed symbols authenticate *where the lineage is* as well as
 * *whose key this is*, so a service that feeds the new device a stale head gets
 * a mismatch. Both the number and the digest are bound although the head commits
 * to the number: two bytes, and a current-looking number can never be paired
 * with an older head.
 *
 * **`new_signing_key` arrived with `P-1`'s ratified rule (the `S0-2` return).**
 * The successor's member entry is `(credential_id ‖ W_pub ‖ S_pub)` and set
 * approvals verify under member `S_pub`s, so the one place a person vouches for
 * a key across the out-of-band channel must vouch for the signing key too — or
 * the service substitutes it in the entry the honest existing device certifies
 * and holds the approval authority the set exists to withhold from it.
 */
const transcript = ({
  workspace,
  epoch,
  epochHead,
  existingCredential,
  newCredential,
  wrappingKey,
  signingKey,
  recoveryStateDigest,
  nonceExisting,
  nonceNew,
  label = TRANSCRIPT_LABEL,
}) =>
  concat(
    ...aadFields('enrollment transcript', {
      label,
      workspace_id: workspace,
      epoch: String(epoch),
      epoch_head: epochHead,
      existing_credential_id: existingCredential,
      new_credential_id: newCredential,
      new_wrapping_key: wrappingKey,
      new_signing_key: signingKey,
      recovery_state_digest: recoveryStateDigest,
      nonce_existing: nonceExisting,
      nonce_new: nonceNew,
    }).map(lp),
  );

/**
 * SAS = five symbols of HKDF-SHA256(ikm = T, salt = "", info = LP(sas label), L = 5),
 * mapped ALPHABET[byte & 0x1f].
 *
 * The mask is uniform because 256 = 8 x 32, which checkAlphabet() asserts by
 * counting preimages rather than by saying so — row 14's rule, and the reason
 * its alphabet is reused here instead of a second one being invented.
 */
const sasFrom = async (t) => {
  const ikm = await crypto.subtle.importKey('raw', t, 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: lp(SAS_LABEL) },
      ikm,
      SAS_SYMBOLS * 8,
    ),
  );
  let out = '';
  for (const b of bits) out += ALPHABET[b & 0x1f];
  return out;
};

const sasFor = async (fields) => sasFrom(transcript(fields));

/** The `info` that binds an HPKE wrap to the ceremony that authorized it. */
const wrapInfo = (transcriptHash) => concat(lp(WRAP_LABEL), lp(transcriptHash));

// --- what each side actually checks --------------------------------------------

/** Opening the peer's commitment once the nonce is revealed. */
const openCommitment = async (published, role, nonce, label) => {
  if ((await commit(role, nonce, label)) !== published) {
    throw new Error(`the ${role} commitment does not open to the revealed nonce`);
  }
};

/**
 * The existing device's decision. The person read five symbols off the new
 * device and typed them here; this is the only thing standing between a
 * malicious service and a content key.
 */
const acceptTyped = (typed, computed) => {
  if (typed !== computed) throw new Error(`SAS mismatch: typed ${typed}, computed ${computed}`);
};

// --- the alphabet, asserted rather than described -------------------------------

/**
 * Row 14's check, applied to the same alphabet for the same reason: a changed
 * alphabet or a modulo where a mask belongs produces a SAS that still displays
 * and still compares, while quietly carrying fewer than 25 bits.
 */
const checkAlphabet = () => {
  if (ALPHABET.length !== 32) throw new Error(`Alphabet is ${ALPHABET.length} symbols, not 32`);
  if (new Set(ALPHABET).size !== 32) throw new Error('Alphabet has a duplicate symbol');
  for (const ch of 'ILOU') {
    if (ALPHABET.includes(ch)) throw new Error(`Alphabet must not contain ${ch}`);
  }
  const preimages = new Map();
  for (let b = 0; b < 256; b += 1) {
    const s = ALPHABET[b & 0x1f];
    preimages.set(s, (preimages.get(s) ?? 0) + 1);
  }
  for (const [s, n] of preimages) {
    if (n !== 8) throw new Error(`Symbol ${s} has ${n} preimages, not 8 — the mask is biased`);
  }
};

// --- the keypairs ---------------------------------------------------------------

const PKCS8_X25519_PREFIX = unhex('302e020100300506032b656e04220420');

/** Derive the X25519 public key from a raw scalar, through Node's key objects. */
const publicFromScalar = (scalar) => {
  const priv = createPrivateKey({
    key: Buffer.from(concat(PKCS8_X25519_PREFIX, scalar)),
    format: 'der',
    type: 'pkcs8',
  });
  return new Uint8Array(
    createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32),
  );
};

/**
 * RFC 7748 §6.1's two keypairs. Alice is the new device's wrapping key — the
 * value the ceremony authenticates. Bob is the substitution: a key the service
 * controls, offered in Alice's place.
 *
 * Row 14's rule again: the generator derives each public key from its own
 * scalar and refuses to write the file unless they match, because a vector
 * binding a public key to a private one proves nothing if its own halves are
 * unrelated.
 */
/**
 * The recovery recipient the new device will install, as one digest.
 *
 * **It is in the transcript because `new_wrapping_key` alone was not enough.**
 * The ceremony authenticates whose wrapping key receives `K_g` now; it said
 * nothing about which recovery key that device would wrap *future* generations
 * to. A service that hands the new device an attacker-controlled `R_pub` and a
 * matching opaque envelope therefore gets the honest, correctly-enrolled device
 * to do the wrapping for it -- the same attack as `substituted-wrapping-key`,
 * one carrier along, and invisible to a transcript that stops at `W_pub`.
 *
 * Binding the digest rather than the parts keeps the typed string five symbols:
 * the existing device already holds this state and is comparing, not learning.
 */
const RECOVERY_STATE = {
  counter: 1,
  r_pub: 'ab'.repeat(32),
  recovery_envelope_digest: 'cd'.repeat(32),
  root_commitment: '7c'.repeat(32),
  // The recovery-bootstrap verification key the state commits (TRD §13.8, P-1's
  // factor-carried edge; the S0-2 return). Its signing half is sealed beside
  // R_priv, and head-discovery.json exercises the acceptance that consumes it.
  bootstrap_signer: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
};
const SUBSTITUTED_RECOVERY_STATE = { ...RECOVERY_STATE, r_pub: 'ef'.repeat(32) };

/** Both digests, computed once in `main` and read by `HONEST` and its negatives. */
let honestRecoveryDigest;
let substitutedRecoveryDigest;

const recoveryStateDigest = async (state) =>
  hex(
    await sha256(
      concat(
        ...[
          'done/recovery-state/v1',
          String(state.counter),
          state.r_pub,
          state.recovery_envelope_digest,
          state.root_commitment,
          state.bootstrap_signer,
        ].map(lp),
      ),
    ),
  );

const KEYPAIRS = {
  new_device: {
    role: 'The new device’s wrapping keypair. Its public half is what the SAS authenticates.',
    source: 'RFC 7748 §6.1, Alice',
    scalar: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    public_key: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  },
  substituted: {
    role: 'A key the service controls, offered in the new device’s place. §11.2 test 7’s attack, as a value.',
    source: 'RFC 7748 §6.1, Bob',
    scalar: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
    public_key: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
  },
};

/**
 * The new device's Ed25519 signing keypair, and the one the service would offer
 * in its place — the transcript's `new_signing_key` (P-1, the S0-2 return). The
 * SAS binds the public half; the private halves never sign in this file, and
 * the seeds are here so the halves can be checked rather than trusted, which is
 * row 14's rule at a second curve.
 */
const SIGNING_KEYPAIRS = {
  new_device_signing: {
    role: 'The new device’s Ed25519 signing credential. The successor’s member entry carries it, and set approvals verify under it — which is why the SAS must vouch for it.',
    source: 'RFC 8032 §7.1, TEST 1024',
    seed: 'f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5',
    public_key: '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
  },
  substituted_signing: {
    role: 'A signing key the service controls, offered in the new device’s place — the approval-authority half of §11.2 test 7’s attack.',
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  },
};

const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

const checkKeypairs = async () => {
  for (const [name, k] of Object.entries(KEYPAIRS)) {
    const derived = hex(publicFromScalar(unhex(k.scalar)));
    if (derived !== k.public_key) {
      throw new Error(`${name}: scalar yields ${derived}, not ${k.public_key}`);
    }
  }
  const probe = utf8('keypair self-check');
  for (const [name, k] of Object.entries(SIGNING_KEYPAIRS)) {
    const signer = await crypto.subtle.importKey(
      'pkcs8',
      unhex(ED25519_PKCS8_PREFIX + k.seed),
      { name: 'Ed25519' },
      false,
      ['sign'],
    );
    const verifier = await crypto.subtle.importKey(
      'raw',
      unhex(k.public_key),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, signer, probe);
    if (!(await crypto.subtle.verify({ name: 'Ed25519' }, verifier, sig, probe))) {
      throw new Error(`${name}: seed and public key are not one keypair.`);
    }
  }
};

// --- the ceremony ---------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const EPOCH = 9;
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';

/**
 * The authorization head at epoch 9, and its ancestor. Deliberately the same two
 * digests row 9's file uses, so the two records are visibly about one lineage.
 * Their construction is §13.5's and row 7's; this ceremony consumes them as
 * opaque digests, which is all it needs.
 */
const HEAD_9 = '2b7f0a9c14e6d3850fa2c51e86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36';
const HEAD_8 = 'c4e1a6b3d0f295847e3b1c0d9a8f7e6d5c4b3a29180f7e6d5c4b3a2918f0e7d6';

/**
 * Nonces are inputs here. In production each is 32 fresh bytes from
 * crypto.getRandomValues(); a vector has to fix one to be a vector at all, and
 * that fixing is not the discipline — the discipline is the commitment.
 */
const NONCE_EXISTING = '5f0e1d2c3b4a59687786958493a2b1c0cfdeed0c1b2a39485766758493a2b1c0';
const NONCE_NEW = 'a0b1c2d3e4f50617283949596a7b8c9dae0f1e2d3c4b5a69788796a5b4c3d2e1';

const HONEST = {
  workspace: WORKSPACE,
  epoch: EPOCH,
  epochHead: HEAD_9,
  existingCredential: LAPTOP,
  newCredential: PHONE,
  wrappingKey: KEYPAIRS.new_device.public_key,
  signingKey: SIGNING_KEYPAIRS.new_device_signing.public_key,
  recoveryStateDigest: null, // filled in main(), since the digest is computed
  nonceExisting: NONCE_EXISTING,
  nonceNew: NONCE_NEW,
};

const NEGATIVES = [
  // The commitment. Three fields, three negatives.
  {
    name: 'commitment-opened-with-wrong-nonce',
    mutate:
      'Reveal a nonce other than the one committed to. This is the whole point of the commit phase: whoever reveals second cannot choose.',
  },
  {
    name: 'commitment-role-echoed',
    mutate:
      'Present the existing device’s commitment as the new device’s. Without `role` in the commitment the two are structurally identical and this succeeds.',
  },
  {
    name: 'aad-only-renumbered-commit-label',
    isolates: 'nonce commitment.label',
    mutate: 'Open the commitment under "done/enroll-commit/v2".',
  },

  // The transcript. Every field, one at a time, against the SAS the person read
  // off the honest new device.
  {
    name: 'substituted-wrapping-key',
    mutate:
      'The service offers its own X25519 public key in the new device’s place. **This is §11.2 test 7**, and the SAS not matching is the whole of §13.6’s second gate.',
  },
  {
    name: 'substituted-signing-key',
    mutate:
      'The service offers its own Ed25519 signing key in the new device’s place. The successor’s member entry is (credential_id ‖ W_pub ‖ S_pub) and set approvals verify under member S_pub’s (P-1, ratified 2026-08-28), so an unbound signing key would hand the service the approval authority the certified set exists to withhold from it — §11.2 test 7’s attack against the entry’s third field.',
  },
  {
    name: 'wrong-workspace',
    mutate: 'Run the ceremony against a different workspace id.',
  },
  {
    name: 'wrong-epoch',
    mutate:
      'Replay the transcript under a later epoch. An authorization successor does not carry a completed ceremony forward with it.',
  },
  {
    name: 'stale-epoch-head',
    mutate:
      'The current epoch number paired with the previous epoch’s head — what a service feeds a new device that has no history of its own. **This is row 9 discharged through the person**: the existing device knows where the lineage is, so the five symbols disagree.',
  },
  {
    name: 'wrong-existing-credential',
    mutate: 'Name a different existing device as the one releasing the key.',
  },
  {
    name: 'wrong-new-credential',
    mutate:
      'Name a different credential as the one enrolling. The credential id is minted per enrollment, so this is what stops a whole ceremony being replayed.',
  },
  { name: 'wrong-existing-nonce', mutate: 'Substitute the existing device’s revealed nonce.' },
  { name: 'wrong-new-nonce', mutate: 'Substitute the new device’s revealed nonce.' },
  {
    name: 'transposed-nonces',
    mutate:
      'Exchange the two nonces. The transcript binds them in fixed positions, so the ceremony is role-ordered and swapping the devices is a different ceremony.',
  },
  {
    name: 'substituted-recovery-state',
    falsifies: ['f-a073574-enrollment-recovery-key-unbound'],
    why: 'The wrapping-key substitution one carrier along, and the one the transcript could not see. The service admits the genuine new device, authenticates its genuine W_pub, and hands it an attacker-controlled R_pub with a matching opaque envelope. Every symbol of the SAS matches, the enrollment succeeds, and the honestly-enrolled device wraps every future generation to a key the service holds. Binding the recovery state the new device installs is what makes the existing device unable to certify a recipient it does not itself hold.',
    // The concrete values, filled in main() once the digests are computed —
    // FU-05's repair: a negative naming no original and no substituted value is
    // not independently checkable, whatever its prose says.
    values: null,
  },
  {
    name: 'aad-only-renumbered-transcript-label',
    isolates: 'enrollment transcript.label',
    mutate:
      'Derive the SAS under "done/enroll/v2". The label is where this carrier authenticates its own version (row 1).',
  },
];

// --- verification ----------------------------------------------------------------

const verify = async (honestSas, honestCommitments) => {
  // Positive: both commitments open, and both devices compute the same string.
  await openCommitment(honestCommitments.existing, 'existing', NONCE_EXISTING);
  await openCommitment(honestCommitments.new, 'new', NONCE_NEW);
  acceptTyped(honestSas, await sasFor(HONEST));

  // --- commitment negatives ------------------------------------------------------

  await refuses('commitment-opened-with-wrong-nonce', () =>
    openCommitment(honestCommitments.new, 'new', NONCE_EXISTING),
  );
  await refuses('commitment-role-echoed', () =>
    openCommitment(honestCommitments.existing, 'new', NONCE_EXISTING),
  );
  await refuses('aad-only-renumbered-commit-label', () =>
    openCommitment(honestCommitments.new, 'new', NONCE_NEW, 'done/enroll-commit/v2'),
  );

  // --- transcript negatives: the person types the honest SAS, the existing
  //     device computes under the mutation, and the two must not agree ----------

  for (const [name, patch] of [
    ['substituted-wrapping-key', { wrappingKey: KEYPAIRS.substituted.public_key }],
    ['substituted-signing-key', { signingKey: SIGNING_KEYPAIRS.substituted_signing.public_key }],
    ['substituted-recovery-state', { recoveryStateDigest: substitutedRecoveryDigest }],
    ['wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['wrong-epoch', { epoch: EPOCH + 1 }],
    ['stale-epoch-head', { epochHead: HEAD_8 }],
    ['wrong-existing-credential', { existingCredential: 'cred_01HZXR0000000000000000DESK' }],
    ['wrong-new-credential', { newCredential: 'cred_01HZXR0000000000000000TABL' }],
    ['wrong-existing-nonce', { nonceExisting: NONCE_NEW }],
    ['wrong-new-nonce', { nonceNew: NONCE_EXISTING }],
    ['transposed-nonces', { nonceExisting: NONCE_NEW, nonceNew: NONCE_EXISTING }],
    ['aad-only-renumbered-transcript-label', { label: 'done/enroll/v2' }],
  ]) {
    await refuses(name, async () => acceptTyped(honestSas, await sasFor({ ...HONEST, ...patch })));
  }

  // The published list and the executed checks must be the same list, in both
  // directions. A "must fail" entry that quietly stops failing is the defect
  // this file exists to prevent; one that is published but never run is the
  // same defect a level up, and it is invisible without this comparison.
  const published = new Set(NEGATIVES.map((n) => n.name));
  const asserted = assertedNames();
  const unrun = [...published].filter((n) => !asserted.includes(n));
  const unpublished = asserted.filter((n) => !published.has(n));
  if (unrun.length > 0)
    throw new Error(`Negatives published but never asserted: ${unrun.join(', ')}`);
  if (unpublished.length > 0)
    throw new Error(`Negatives asserted but not published: ${unpublished.join(', ')}`);
};

// --- why the nonces are committed before they are revealed ------------------------

/**
 * The argument for the commit phase, run rather than asserted.
 *
 * A service that substitutes its own wrapping key and reveals its nonce second
 * can search that nonce until the SAS comes out as it likes. Here it searches
 * for the first two symbols of the honest ceremony's SAS — 10 bits, so a
 * thousand-odd tries — with the substituted key in place. Forcing all five is
 * the same search at 2^25, which is seconds of work on the machine that runs
 * this file.
 *
 * The search is deterministic: candidate i is SHA-256("done/grind-demo" || i),
 * so the count below is a fact about the construction and not about this run.
 * Nothing here is production code — it is the reason the ceremony has a phase
 * that would otherwise look like ceremony.
 */
const CAP = 1 << 20;

const grind = async (honestSas, symbols) => {
  const target = honestSas.slice(0, symbols);
  for (let i = 0; i < CAP; i += 1) {
    const candidate = hex(await sha256(concat(utf8('done/grind-demo'), u32be(i))));
    const sas = await sasFor({
      ...HONEST,
      wrappingKey: KEYPAIRS.substituted.public_key,
      nonceNew: candidate,
    });
    if (sas.startsWith(target)) return { tries: i + 1, nonce: candidate, sas };
  }
  throw new Error(`No ${symbols}-symbol collision found in ${CAP} tries.`);
};

// --- assembly ---------------------------------------------------------------------

const main = async () => {
  checkAlphabet();
  await checkKeypairs();

  honestRecoveryDigest = await recoveryStateDigest(RECOVERY_STATE);
  substitutedRecoveryDigest = await recoveryStateDigest(SUBSTITUTED_RECOVERY_STATE);
  HONEST.recoveryStateDigest = honestRecoveryDigest;
  if (honestRecoveryDigest === substitutedRecoveryDigest) {
    throw new Error('The two recovery states digest identically; the negative proves nothing.');
  }

  // FU-05's repair, at the negative: the substitution names its exact values.
  const substituted = NEGATIVES.find((n) => n.name === 'substituted-recovery-state');
  substituted.values = {
    original_recovery_state: RECOVERY_STATE,
    original_digest: honestRecoveryDigest,
    substituted_r_pub: SUBSTITUTED_RECOVERY_STATE.r_pub,
    substituted_digest: substitutedRecoveryDigest,
  };

  const honestCommitments = {
    existing: await commit('existing', NONCE_EXISTING),
    new: await commit('new', NONCE_NEW),
  };
  const t = transcript(HONEST);
  const transcriptHash = hex(await sha256(t));
  const honestSas = await sasFrom(t);

  await verify(honestSas, honestCommitments);
  reportAudit(NEGATIVES);

  const forced = await grind(honestSas, 2);

  const doc = {
    $schema: 'https://done.invalid/vectors/enrollment-ceremony/1',
    generated_by: 'scripts/generate-enrollment-vectors.mjs',
    selection: 'docs/selections/row-11-enrollment-ceremony.md',
    trd_row: 11,
    construction: {
      shape:
        'Short authentication string over an in-band agreement, committed before revealed, typed rather than compared',
      commitment:
        'SHA-256( LP("done/enroll-commit/v1") || LP(role) || LP(hex nonce) ), role in {existing, new}',
      transcript:
        'LP("done/enroll/v1") || LP(workspace_id) || LP(dec epoch) || LP(hex epoch_head) || LP(existing_credential_id) || LP(new_credential_id) || LP(hex new_wrapping_key) || LP(hex new_signing_key) || LP(hex recovery_state_digest) || LP(hex nonce_existing) || LP(hex nonce_new)',
      epoch_head:
        'Bound because row 9 asked for it. A device enrolling here is talking to one that already knows where the lineage is, so the typed symbols authenticate the head as well as the wrapping key — and row 9 never reaches this arrival path.',
      new_signing_key:
        'Bound because the successor’s member entry is (credential_id ‖ W_pub ‖ S_pub) and set approvals verify under member S_pub’s (P-1, ratified 2026-08-28): the SAS vouches for the signing key as well as the wrapping key.',
      recovery_state_digest:
        'SHA-256( LP("done/recovery-state/v1") || LP(dec counter) || LP(hex R_pub) || LP(hex recovery_envelope_digest) || LP(hex root_commitment) || LP(hex bootstrap_signer) ) — the recovery recipient the new device installs, inside what the typed symbols authenticate (TRD §§13.5/13.8). Its preimage is published in the honest vector’s inputs, so the digest — and therefore the transcript — reconstructs from published values alone (FU-05).',
      transcript_hash: 'SHA-256(T). The ceremony’s identity, and what a wrap is bound to.',
      sas: 'HKDF-SHA256(ikm = T, salt = "", info = LP("done/enroll-sas/v1"), L = 5); symbol i = ALPHABET[byte_i & 0x1f]',
      alphabet: `Crockford Base32: ${ALPHABET} (no I, L, O, U) — row 14’s, reused`,
      entropy:
        '25 bits. One guess per admitted credential, not per attempt; see the selection document §4.',
      direction:
        'Displayed on the new device, typed into the existing one. The existing device is the one deciding whether to release a content key, so it is the one that must be given evidence.',
      wrap_info: 'LP("done/enroll-wrap/v1") || LP(hex transcript_hash), as HPKE base-mode info',
      length_prefix: 'uint16be(byteLength) || utf8 — injective, so no field can shift another',
      nonce_caveat:
        'Nonces are fixed inputs in these vectors so the composition is testable. Production generates 32 fresh bytes per side; the fixed nonce is not the discipline, the commitment is.',
      not_here: {
        primitives:
          'SHA-256, HKDF and X25519 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        wrap: 'The HPKE seal itself is row 1’s primitive and row 4’s framing. This row pins only its `info`.',
        admission:
          'Admitting the new credential and signing the successor epoch is §13.6’s first gate, and rows 9 and 12.',
      },
    },
    keypairs: KEYPAIRS,
    signing_keypairs: SIGNING_KEYPAIRS,
    vectors: [
      {
        name: 'honest-enrollment',
        why: 'A laptop enrolling a phone at epoch 9. Both sides derive this transcript and this string. Every transcript input is published here — FU-05 found recovery_state_digest inserted by generator internals only, so the artifact could not be independently reconstructed for its new load-bearing field.',
        inputs: {
          workspace_id: WORKSPACE,
          epoch: EPOCH,
          epoch_head: HEAD_9,
          existing_credential_id: LAPTOP,
          new_credential_id: PHONE,
          new_wrapping_key: KEYPAIRS.new_device.public_key,
          new_signing_key: SIGNING_KEYPAIRS.new_device_signing.public_key,
          recovery_state: RECOVERY_STATE,
          recovery_state_digest: honestRecoveryDigest,
          nonce_existing: NONCE_EXISTING,
          nonce_new: NONCE_NEW,
        },
        derived: {
          commitment_existing: honestCommitments.existing,
          commitment_new: honestCommitments.new,
          transcript: hex(t),
          transcript_hash: transcriptHash,
          wrap_info: hex(wrapInfo(transcriptHash)),
        },
        expected: { sas: honestSas },
      },
    ],
    grinding_demonstration: {
      why: 'The reason the nonces are committed before they are revealed. A service that reveals second and is not committed can search its nonce until the string comes out as it likes.',
      method:
        'Candidate i is SHA-256("done/grind-demo" || uint32be(i)), so the count is a fact about the construction rather than about this run. The substituted wrapping key is in place throughout.',
      target_symbols: 2,
      target: honestSas.slice(0, 2),
      tries: forced.tries,
      nonce_found: forced.nonce,
      sas_produced: forced.sas,
      extrapolation:
        'Forcing all five symbols is the same search at 2^25 — seconds of work. The commitment is what makes 25 bits mean 25 bits.',
    },
    must_fail: NEGATIVES,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/enrollment-ceremony.json is stale. Run: node scripts/generate-enrollment-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('enrollment-ceremony.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote the ceremony, ${NEGATIVES.length} negatives and a ${forced.tries}-try grinding demonstration to test/vectors/enrollment-ceremony.json`,
  );
};

await main();
