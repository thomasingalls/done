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
 * T = LP("done/enroll/v1") || LP(workspace_id) || LP(dec epoch)
 *     || LP(existing_credential_id) || LP(new_credential_id)
 *     || LP(hex new_wrapping_key) || LP(hex nonce_existing) || LP(hex nonce_new)
 *
 * `new_wrapping_key` is the field the whole ceremony exists to authenticate.
 * The two credential ids are bound in fixed positions, which is what makes the
 * transcript role-ordered: swapping the devices is a different ceremony.
 */
const transcript = ({
  workspace,
  epoch,
  existingCredential,
  newCredential,
  wrappingKey,
  nonceExisting,
  nonceNew,
  label = TRANSCRIPT_LABEL,
}) =>
  concat(
    ...aadFields('enrollment transcript', {
      label,
      workspace_id: workspace,
      epoch: String(epoch),
      existing_credential_id: existingCredential,
      new_credential_id: newCredential,
      new_wrapping_key: wrappingKey,
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

const checkKeypairs = () => {
  for (const [name, k] of Object.entries(KEYPAIRS)) {
    const derived = hex(publicFromScalar(unhex(k.scalar)));
    if (derived !== k.public_key) {
      throw new Error(`${name}: scalar yields ${derived}, not ${k.public_key}`);
    }
  }
};

// --- the ceremony ---------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const EPOCH = 9;
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';

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
  existingCredential: LAPTOP,
  newCredential: PHONE,
  wrappingKey: KEYPAIRS.new_device.public_key,
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
    name: 'wrong-workspace',
    mutate: 'Run the ceremony against a different workspace id.',
  },
  {
    name: 'wrong-epoch',
    mutate:
      'Replay the transcript under a later epoch. An authorization successor does not carry a completed ceremony forward with it.',
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
    name: 'aad-only-renumbered-transcript-label',
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
    ['wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['wrong-epoch', { epoch: EPOCH + 1 }],
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
  checkKeypairs();

  const honestCommitments = {
    existing: await commit('existing', NONCE_EXISTING),
    new: await commit('new', NONCE_NEW),
  };
  const t = transcript(HONEST);
  const transcriptHash = hex(await sha256(t));
  const honestSas = await sasFrom(t);

  await verify(honestSas, honestCommitments);
  reportAudit(NEGATIVES.map((n) => n.name));

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
        'LP("done/enroll/v1") || LP(workspace_id) || LP(dec epoch) || LP(existing_credential_id) || LP(new_credential_id) || LP(hex new_wrapping_key) || LP(hex nonce_existing) || LP(hex nonce_new)',
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
    vectors: [
      {
        name: 'honest-enrollment',
        why: 'A laptop enrolling a phone at epoch 9. Both sides derive this transcript and this string.',
        inputs: {
          workspace_id: WORKSPACE,
          epoch: EPOCH,
          existing_credential_id: LAPTOP,
          new_credential_id: PHONE,
          new_wrapping_key: KEYPAIRS.new_device.public_key,
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
