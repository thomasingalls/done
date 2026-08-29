/**
 * Test vectors for interrupted transitions and downgrade (TRD §15 row 15, §13.7,
 * §14.4, PRD §6.10).
 *
 * The construction is specified in docs/selections/row-15-transitions.md. This
 * script is the executable half of that document: it emits
 * test/vectors/transition.json, which the implementation must reproduce byte for
 * byte.
 *
 * The row's subject is a class rather than an operation. Every item in §11.2
 * test 11 -- interrupted enrollment, duplicate recovery, concurrent
 * authorization changes, a half-completed deletion -- is a multi-step
 * transition whose interrupted middle can be mistaken for a *completed lesser
 * transition*. So there is one intent-and-outcome protocol, instantiated three
 * times, and `kind` is bound in both messages: PRD §6.10's "deliberate
 * downgrade must not silently become account deletion" is a binding
 * requirement rather than an interface one, and it is row 3's editable-`kind`
 * finding at a third object.
 *
 * Three kinds of vector:
 *
 *   - The *intent* vectors pin what a client persists before its first network
 *     byte, and the digest that is its idempotency key. A retry is the same
 *     bytes, so the generator builds each intent twice from shuffled inputs and
 *     fails if the two disagree.
 *   - The *outcome* vectors pin the only artifact that licenses a client to
 *     discard a live content key. Row 6 established that a definite refusal
 *     licenses a re-mint and silence does not; it did not say the refusal must
 *     be authenticated, and if it is not, forging one is the attack.
 *   - The *demonstrations* are behaviours that succeed and are meant to: an
 *     outcome re-served forever is not a replay, and a rotation and a
 *     retirement differ in one field.
 *
 * The primitives' known-answer tests are not repeated: Ed25519 and SHA-256 are
 * row 1's selections and row 1's vectors carry their published KATs.
 *
 * Usage: node scripts/generate-transition-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, eliding, refuses, reportAudit } from './lib/aad-coverage.mjs';
import { claims, falsifies } from './lib/traceability.mjs';

const OUT = new URL('../test/vectors/transition.json', import.meta.url);
const ROW_1 = new URL('../test/vectors/algorithm-suite.json', import.meta.url);
/** Row 9's emitted bootstrap — the fixture P-1 falsifier 17's composition consumes by value. */
const HEAD_DISCOVERY = new URL('../test/vectors/head-discovery.json', import.meta.url);

const INTENT_LABEL = 'done/transition/v1';
const OUTCOME_LABEL = 'done/transition-out/v1';
const PAYLOAD_LABEL = 'done/transition-payload/v1';
const VERSION = 1;

/** The PKCS#8 prefix for a raw Ed25519 seed, as row 1's generator uses. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

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
 * row 14's rule, which rows 4, 5, 9 and 12 all follow.
 */
const KEYS = {
  authorization: {
    role: "The lineage's authorization key (§13.5). Signs epochs, and signs the outcome that settles a transition.",
    source: 'RFC 8032 §7.1, TEST 3',
    seed: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
    public_key: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
  },
  owner: {
    role: "The rotating device's signing credential (§13.4). Produces the intent; §13.7 forbids the service producing the key.",
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  impostor: {
    role: 'Neither. A relay that can withhold can also fabricate, and a fabricated refusal is what this row has to refuse.',
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  },
};

const signer = (seedHex) =>
  crypto.subtle.importKey(
    'pkcs8',
    unhex(ED25519_PKCS8_PREFIX + seedHex),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

const sign = async (seedHex, message) =>
  new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await signer(seedHex), message));

const verify = async (publicHex, sig, message) =>
  crypto.subtle.verify(
    { name: 'Ed25519' },
    await crypto.subtle.importKey('raw', unhex(publicHex), { name: 'Ed25519' }, false, ['verify']),
    sig,
    message,
  );

const checkKeypairs = async () => {
  const probe = utf8('keypair self-check');
  for (const [name, k] of Object.entries(KEYS)) {
    if (!(await verify(k.public_key, await sign(k.seed, probe), probe))) {
      throw new Error(`${name}: seed and public key are not one keypair.`);
    }
  }
};

/** Row 1 selects the primitive both messages rest on. The two must fail apart, not drift apart. */
const checkAgainstRow1 = () => {
  const row1 = JSON.parse(readFileSync(ROW_1, 'utf8'));
  if (!/^Ed25519$/u.test(row1.suites?.['1']?.roles?.['mutation-signature']?.primitive ?? '')) {
    throw new Error('Row 1 no longer selects Ed25519 for signatures.');
  }
};

// --- the scenario ----------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_WORKSPACE = 'ws_01J0000000000000000000000A';
const LINEAGE = 'ln_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_LINEAGE = 'ln_01J0000000000000000000000A';

/**
 * The authorization key does not change between these epochs -- §13.5 rotates
 * the hot acceptance key `K_accept` and certifies it under the authorization
 * key, which is the lineage's. That matters for the negatives: it is what lets
 * `epoch` be varied without also varying which key verifies, so the field can
 * be isolated at all.
 */
const PARENT_EPOCH = 7;
const COMMIT_EPOCH = 8;
const LATER_EPOCH = 9;

/**
 * There is no `from_gen`, and its absence is the third instance of one rule.
 * §13.5's epoch already binds the current content-key generation, so the
 * generation being rotated *from* is a function of `parent_epoch`. Row 10 left
 * out a part count for the same reason and row 12 left out an algorithm field;
 * a second binding of a derivable fact is a thing that can disagree with it.
 */
const TO_GEN = 5;

const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR00000000000000000PHN';
const TABLET = 'cred_01HZXR000000000000000TABL';

/** A wrap, as bytes. Its content is row 10's; what this row binds is that the set is the one intended. */
const WRAP = {
  [LAPTOP]: '0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  [PHONE]: 'f9e8d7c6b5a4938271605f4e3d2c1b0a',
};
const RECOVERY_WRAP = '00112233445566778899aabbccddeeff';

/**
 * What a `replace-recovery` actually replaces, as bytes rather than as a count.
 *
 * **The row-14 envelope is 140 bytes** -- 16 salt, 12 nonce, the 96-byte
 * plaintext (the 32-byte `R_priv` scalar, the 32-byte bootstrap signing seed
 * sealed beside it since the `S0-2` return, and §14.2's 32-byte root
 * commitment) and a 16-byte tag -- and every one of them is the thing "exactly
 * the old or exactly the new" is a claim about. Sealing a fresh signer here is
 * what retires the old bootstrap capability (TRD §13.8, row 14). `REWRAPPED`
 * is the same at the other carrier: one exact wrap per retained generation,
 * not the list `1|2|3|4|5` that named them.
 */
const NEW_R_PUB = 'ab'.repeat(32);
const RECOVERY_ENVELOPE =
  '0f1e2d3c4b5a69788796a5b4c3d2e1f0' +
  '112233445566778899aabbcc' +
  '4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36' +
  '833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42' +
  '7c'.repeat(32) +
  'fedcba98765432100123456789abcdef';
const ROOT_COMMITMENT = '7c'.repeat(32);
const REWRAPPED = {
  1: '1a'.repeat(16),
  2: '2b'.repeat(16),
  3: '3c'.repeat(16),
  4: '4d'.repeat(16),
  5: '5e'.repeat(16),
};
const SUCCESSOR_GEN = 6;

/**
 * A credential the service admitted and no person enrolled.
 *
 * **It is in the epoch and it is not a recipient, and that gap is the row.** The
 * epoch enumerates every admitted credential, which is what made it usable as a
 * roster -- and what let account authorization alone cause *delayed* key
 * delivery: nothing distinguished this credential, at the next unrelated
 * rotation, from one whose ceremony had actually succeeded.
 */
const INTRUDER = 'cred_01HZXR000000000000INTRUDR';

/** Every credential the service-signed epoch enumerates. */
const ROSTER = [LAPTOP, PHONE, TABLET, INTRUDER];

/**
 * The member entries each ceremony authenticated: the wrapping key a rotator
 * encrypts to, and — since the `S0-2` return, `P-1` ratified — the signing key
 * a set approval verifies under. The intruder has neither. `LAPTOP`'s signing
 * key is `KEYS.owner`'s, because the owner device is the approver whose lookup
 * the negatives below exercise; the others' halves are not held here.
 */
const MEMBER_KEYS = {
  [LAPTOP]: { w_pub: '11'.repeat(32), s_pub: KEYS.owner.public_key },
  [PHONE]: {
    w_pub: '22'.repeat(32),
    s_pub: '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e', // RFC 8032 §7.1, TEST 1024
  },
  [TABLET]: {
    w_pub: '33'.repeat(32),
    s_pub: 'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf', // RFC 8032 §7.1, TEST SHA(abc)
  },
};

const CERTIFIED_MEMBERS = { ...MEMBER_KEYS };

/**
 * The PARENT certified set's members — the ratified home an approval's
 * verifier resolves from (`P-1`, option A). The successor under approval here
 * carries the same three members; what the negatives vary is who signs and who
 * is named, never where the verifier looks.
 */
const PARENT_MEMBERS = { ...MEMBER_KEYS };
const RECOVERY_STATE_DIGEST = 'cd'.repeat(32);

/**
 * `members_digest` binds the credential to the exact key a rotator encrypts to
 * and the exact key its approvals verify under.
 *
 * **Credential-to-key, never credential-to-boolean.** The roster was never what
 * was missing; the service does enumerate credentials. What was missing is an
 * approval of the *key*, so an admitted-but-uncertified credential has no
 * approved pair and there is nothing to wrap to. The third field is the same
 * repair one authority along: without `S_pub` in the entry, the only
 * credential-to-signing-key certification was the service-signed epoch — the
 * object this construction exists to dethrone — and round 1 showed the
 * approval's own verifier falling back on it.
 */
const membersDigest = async (members) =>
  hex(
    await sha256(
      concat(
        lp('done/certified-members/v1'),
        ...Object.entries(members)
          .toSorted(([a], [b]) => (a < b ? -1 : 1))
          .flatMap(([cred, k]) => [lp(cred), lp(k.w_pub), lp(k.s_pub)]),
      ),
    ),
  );

const certifiedSetMessage = ({
  label = 'done/certified-set/v1',
  v = VERSION,
  workspace = WORKSPACE,
  lineage = LINEAGE,
  parentEpoch = PARENT_EPOCH,
  nextEpoch = PARENT_EPOCH + 1,
  members,
  recoveryStateDigest = RECOVERY_STATE_DIGEST,
}) =>
  // Registered with the AAD audit (S0-8, the registration P-1 reserved): round 1
  // found the construction in no audit at all, five of its eight fields isolated
  // by nothing. The encoding stays this file's own — aadFields moves the field
  // list, not the length-prefix concatenation.
  concat(
    ...aadFields('certified set', {
      label,
      v: String(v),
      workspace_id: workspace,
      lineage_id: lineage,
      parent_epoch: String(parentEpoch),
      next_epoch: String(nextEpoch),
      members_digest: members,
      recovery_state_digest: recoveryStateDigest,
    }).map(lp),
  );

/**
 * An approval names its approver in its signed bytes (`P-1`, ratified
 * 2026-08-28): flipping the name breaks the signature, so one eligible member
 * cannot replay another's approval as its own, and an approval naming nobody is
 * malformed — the pre-return shape, refused below by construction.
 */
const APPROVAL_LABEL = 'done/certified-set-approval/v1';
const approvalMessage = (approver, setBytes) => concat(lp(APPROVAL_LABEL), lp(approver), setBytes);

/**
 * The lookup round 1's mutation proved missing: the named approver's `S_pub`
 * resolves from the parent certified set's member entry — never from the
 * service-signed epoch, which certifies no recipient-authority key. A named
 * approver outside the parent set refuses here, before any signature runs,
 * which is the eligibility rule as a lookup rather than as prose.
 */
const resolveApprover = (parentMembers, approver) => {
  const entry = parentMembers[approver];
  if (entry === undefined) {
    throw new Error(`the named approver ${approver} is not a member of the parent certified set`);
  }
  return entry.s_pub;
};

/** Who a rotation may wrap to: the certified members, less those it excludes. */
const recipientsOf = (members, excluded) =>
  Object.keys(members)
    .filter((c) => !excluded.includes(c))
    .toSorted();

/** Row 5's accepted heads at the cutoff -- `(credential, position, link)`. */
const CUTOFF = [
  { credential: LAPTOP, seq: 41, link: 'aa'.repeat(32) },
  { credential: PHONE, seq: 12, link: 'bb'.repeat(32) },
  { credential: TABLET, seq: 7, link: 'cc'.repeat(32) },
];

// --- the payload digests ---------------------------------------------------------

/**
 * Each kind's own parts, digested under one label and sorted by name.
 *
 * **Sorted, and the sort is load-bearing rather than tidy** -- row 7's finding
 * at a different object. Two devices that build the same rotation must produce
 * the same idempotency key, and a map in insertion order would not: the retry
 * after a lost response would submit a *different* intent, which is exactly the
 * state this row exists to make unreachable.
 *
 * It is one field in the signed message rather than a registered field list,
 * for row 10's reason: its members are variable in number, so a negative
 * isolating any one of them would also be isolated by the digest carrying it.
 * What the coverage audit checks is that the digest is bound; what the
 * determinism assertion below checks is that it means one thing.
 */
const payloadDigest = async (entries) =>
  sha256(
    concat(
      lp(PAYLOAD_LABEL),
      ...[...entries]
        .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .flatMap(({ name, value }) => [lp(name), lp(value)]),
    ),
  );

/**
 * `replace-recovery`'s parts, and every value is bytes.
 *
 * **This mirrors `rotationPayload` deliberately, because it did not.** Rotation
 * has always bound the exact wrap for every recipient and the exact recovery
 * wrap; replacement bound `new-recovery-public-key` and the string
 * `"1|2|3|4|5"`. So a signed replacement said *which* generations were
 * rewrapped and never *to what* -- and two replacements that differ in the
 * sealed envelope, or in any single generation's wrap, produced the same
 * digest. Atomicity cannot mean "one exact complete set won" when the set's
 * contents are outside the signature.
 *
 * `successor-generation` is the other half. Resealing leaves `K_g` unchanged,
 * so an exposed `R_priv` still opens current content after a replacement that
 * only re-encrypts it. Row 14 offers this flow to the user who has lost *or
 * exposed* the code, so the successor is in the signed payload and the only
 * way not to rotate is to say so in it.
 */
const replacementPayload = ({ counter, rPub, envelope, rootCommitment, wraps, successor }) => [
  { name: 'counter', value: String(counter) },
  { name: 'new-recovery-public-key', value: rPub },
  { name: 'recovery-envelope', value: envelope },
  { name: 'root-commitment', value: rootCommitment },
  { name: 'successor-generation', value: String(successor) },
  {
    name: 'wraps',
    value: Object.entries(wraps)
      .toSorted(([a], [b]) => Number(a) - Number(b))
      .map(([g, w]) => `${g}:${w}`)
      .join('|'),
  },
];

const rotationPayload = ({ excluded, wraps, recoveryWrap, cutoff }) => [
  {
    name: 'cutoff',
    value: cutoff
      .map((c) => `${c.credential}:${c.seq}:${c.link}`)
      .toSorted()
      .join('|'),
  },
  { name: 'excluded', value: [...excluded].toSorted().join('|') },
  { name: 'recovery-wrap', value: recoveryWrap },
  {
    name: 'wraps',
    value: Object.entries(wraps)
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([c, w]) => `${c}:${w}`)
      .join('|'),
  },
];

// --- the two bound field lists ---------------------------------------------------

/**
 * The intent: what a client writes down before its first network byte.
 *
 *   Intent = LP("done/transition/v1") || LP(dec v) || LP(kind) || LP(workspace_id)
 *            || LP(lineage_id) || LP(dec parent_epoch) || LP(dec target)
 *            || LP(hex payload_digest)
 *
 * **`kind` is bound, and PRD §6.10 is why.** *Deliberate downgrade must not
 * silently become account deletion* reads as an interface requirement and is a
 * binding one: `rotate`, `replace-recovery` and `retire` are otherwise the same
 * eight fields, and an unbound `kind` is a way to submit one and commit
 * another. Row 3 found the same thing about a `StoredRecord`'s `kind` and the
 * trim path; this is that finding at a third object, where the consequence is
 * that a lapse retires a lineage.
 *
 * `id = SHA-256(Intent)` is the idempotency key, and `(lineage_id, kind,
 * target)` is what the service commits at most once.
 *
 * There is no `from_gen`: §13.5's epoch already binds the current generation, so
 * the generation being rotated *from* is a function of `parent_epoch`.
 */
const intentMessage = ({
  label = INTENT_LABEL,
  v,
  kind,
  workspace,
  lineage,
  parentEpoch,
  target,
  payload,
}) =>
  concat(
    ...aadFields('transition intent', {
      label,
      v: String(v),
      kind,
      workspace_id: workspace,
      lineage_id: lineage,
      parent_epoch: String(parentEpoch),
      target: String(target),
      payload_digest: payload,
    }).map(lp),
  );

/**
 * The outcome: the only artifact that licenses a client to discard a live
 * content key, and therefore the one this row exists to authenticate.
 *
 *   Outcome = LP("done/transition-out/v1") || LP(dec v) || LP(kind)
 *             || LP(workspace_id) || LP(lineage_id) || LP(dec target)
 *             || LP(dec epoch) || LP(hex committed_id)
 *
 * **There is no `state` field**, and leaving it out is row 10's rule rather
 * than economy. Whether you won is `committed_id == your id`; a second binding
 * of the same fact could disagree with it, and an implementation reading the
 * flag rather than comparing would discard a key that is live.
 *
 * **There is no nonce either, and the contrast with row 9 is the point.** Row
 * 9's head assertion needed one because a head is a statement about a moving
 * lineage, so re-serving it is a replay. `(lineage, kind, target)` names an
 * immutable pair: generations are monotone and a target is reached once, so an
 * outcome re-served forever is not stale, it is the truth. Published as a
 * demonstration.
 */
const outcomeMessage = ({
  label = OUTCOME_LABEL,
  v,
  kind,
  workspace,
  lineage,
  target,
  epoch,
  committedId,
}) =>
  concat(
    ...aadFields('transition outcome', {
      label,
      v: String(v),
      kind,
      workspace_id: workspace,
      lineage_id: lineage,
      target: String(target),
      epoch: String(epoch),
      committed_id: committedId,
    }).map(lp),
  );

// --- the client rule -------------------------------------------------------------

/**
 * Three cases, and the third exists only because a transition carries an
 * exclusion set. Row 6's outbound rule is the first two.
 *
 *   silence                       wait, then resubmit the identical bytes
 *   outcome, committed_id == id   committed; apply
 *   outcome, committed_id != id   superseded; discard and rebuild against the
 *                                 new epoch -- NOT resubmit, because the
 *                                 exclusion set was computed against an epoch
 *                                 that has moved
 *
 * Everything that is not a verified outcome is silence. A timeout is silence, a
 * connection reset is silence, and an unsigned error body is silence -- because
 * the third case discards a live content key, and anything that can withhold
 * can also fabricate.
 */
const settle = async ({ intent, intentId, outcome, outcomeSig, authorizationPublicKey }) => {
  if (!(await verify(authorizationPublicKey, outcomeSig, outcomeMessage(outcome)))) {
    throw new Error('outcome does not verify: this is silence, not a refusal');
  }
  if (outcome.kind !== intent.kind) throw new Error('outcome answers a different kind');
  if (outcome.workspace !== intent.workspace)
    throw new Error('outcome answers a different workspace');
  if (outcome.lineage !== intent.lineage) throw new Error('outcome answers a different lineage');
  if (outcome.target !== intent.target) throw new Error('outcome answers a different target');
  if (outcome.epoch <= intent.parentEpoch)
    throw new Error('outcome is not newer than the intent parent');
  return outcome.committedId === intentId ? 'committed' : 'superseded';
};

// --- the negatives ---------------------------------------------------------------

const MUST_FAIL = [
  {
    name: 'certified-set-approved-by-an-impostor',
    falsifies: ['f-c611666-rotation-reader-eligibility-missing'],
    why: "The approval is the whole difference between a roster and a recipient set, and this is round 1's mutation inverted into the permanent shape of the negative (P-1 falsifier 12): the verifier resolves the named approver's S_pub from the parent certified set's member entry — a real lookup, not a constant — so a hostile service that publishes an epoch substituting a member's signing key gets an approval that does not verify. The epoch certifies no recipient-authority key, and the verifier never asks it.",
  },
  {
    name: 'approval-presented-as-another-members',
    why: "P-1 falsifier 13: the approver is named inside the approval's signed bytes, so presenting one member's approval under another member's name changes the message the signature was taken over — flipping the name breaks the signature, and one eligible member cannot replay another's approval as its own.",
  },
  {
    name: 'approval-without-a-named-approver',
    why: 'The pre-return approval shape — a signature over the bare set bytes, naming nobody — is malformed by construction: the verifier only accepts the labeled, approver-prefixed message, so an approval that does not say who approved cannot verify under anyone.',
  },
  {
    name: 'approval-by-an-admitted-non-member',
    why: "The eligibility rule as a lookup. The intruder is in the service's roster and not in the parent certified set, so an approval naming it refuses at resolution — before any signature runs. Admission is the service's to grant and approval authority is not: criterion 10's authorized-but-unkeyed credential stays outside, now for approvals as well as wraps.",
  },
  {
    name: 'certified-set-from-another-epoch',
    isolates: 'certified set.parent_epoch',
    falsifies: ['f-c611666-rotation-reader-eligibility-missing'],
    why: 'A set approved against one parent epoch, presented at a later one. Without the parent binding, an approval collected when a credential was legitimately a member survives its removal, and a rotator replays a stale membership as a current one.',
  },
  {
    name: 'certified-set-with-an-added-member',
    isolates: 'certified set.members_digest',
    falsifies: ['f-c611666-rotation-reader-eligibility-missing'],
    why: 'The row, as a signature check. The service adds a credential it admitted to the members and presents the honest approval beside it. The approval covers `members_digest`, so the added member changes the message the signature was taken over.',
  },
  {
    name: 'certified-set-with-substituted-recovery-state',
    isolates: 'certified set.recovery_state_digest',
    falsifies: ['f-a073574-enrollment-recovery-key-unbound'],
    why: 'The same at the recovery carrier: the approval covers `recovery_state_digest`, so a substituted R_pub cannot ride an honest approval. This is what stops a correctly-enrolled device wrapping future generations to a key the service holds.',
  },
  {
    name: 'aad-only-certified-set-label',
    isolates: 'certified set.label',
    why: 'The domain-separation label, isolated. It is what stops a signed statement of another kind — or a later certified-set format — being read as this one.',
  },
  {
    name: 'aad-only-certified-set-version',
    isolates: 'certified set.v',
    why: "Row 1's rule at the recipient-authority carrier: the version selects the format, so a renumbered set must fail rather than parse as a weaker one.",
  },
  {
    name: 'aad-only-certified-set-workspace-id',
    isolates: 'certified set.workspace_id',
    why: "A certified set lifted between workspaces on one profile. The approval must not survive the move: recipient authority is per workspace, and an approver eligible in one says nothing about the other.",
  },
  {
    name: 'aad-only-certified-set-lineage-id',
    isolates: 'certified set.lineage_id',
    why: 'The lineage a migration replaces (§14.1). Unbound, a pre-migration certified set could carry its members into the successor lineage without re-approval.',
  },
  {
    name: 'aad-only-certified-set-next-epoch',
    isolates: 'certified set.next_epoch',
    why: 'Which epoch the set certifies into. Unbound, an approval collected for one rotation could be presented for a different one that happens to share its parent.',
  },
  {
    name: 'retire-intent-without-the-erasure-acceptance',
    falsifies: ['f-4259822-retirement-safe-survivor-gate-undefined'],
    why: "P-4 falsifier 15, the creation half: the erasure acceptance is intrinsic to every retire, so a payload without it in its signed bytes is malformed and refuses at the mint — before any signature, settlement or clock. No acceptance-less retirement exists for the ceiling to arbitrate, and the boundary never has to decide what an absent acceptance meant. The in-transit half is the acceptance-in-the-signed-payload demonstration: stripping the acceptance changes payload_digest, which sits inside the signed intent message, so the signature no longer covers what arrived.",
  },
  {
    name: 'fabricated-refusal',
    why: "The attack row 6 left open. A definite refusal licenses discarding a live content key and rebuilding; silence does not. Row 6 stated the rule and did not say the refusal must be authenticated -- so anything that can withhold an outcome can fabricate one, and induce a rotation to be thrown away and rebuilt against an epoch of the attacker's choosing. Signed by a key that is not the lineage's authorization key.",
  },
  {
    name: 'unsigned-outcome',
    why: 'The same at its most ordinary: an error body with no signature at all. It is silence, and the client waits.',
  },
  {
    name: 'outcome-from-an-older-epoch',
    why: 'An outcome whose epoch is at or below the intent parent. It cannot be settling this intent, because the intent was built against that parent.',
  },
  {
    name: 'flipped-signature-bit',
    why: 'The signature doing its own job.',
  },
  {
    name: 'aad-only-intent-label',
    isolates: 'transition intent.label',
    why: 'The domain-separation label, isolated. It is the whole of what stops a signed statement of another kind being read as a transition intent.',
  },
  {
    name: 'aad-only-intent-version',
    isolates: 'transition intent.v',
    why: "Row 1's rule: a carrier version selects the suite, so a renumbered intent must fail rather than select a weaker one.",
  },
  {
    name: 'aad-only-intent-kind',
    isolates: 'transition intent.kind',
    why: "PRD §6.10 as bytes. A rotate and a retire are otherwise the same eight fields; unbound, `kind` is how a deliberate downgrade commits as an account deletion. Row 3's editable-`kind` finding at a third object.",
  },
  {
    name: 'aad-only-intent-workspace-id',
    isolates: 'transition intent.workspace_id',
    why: 'An intent lifted between workspaces on one profile -- PRD §6.7s two-principal case, not an attack.',
  },
  {
    name: 'aad-only-intent-lineage-id',
    isolates: 'transition intent.lineage_id',
    why: 'The lineage a migration replaces (§14.1). Unbound, a pre-migration intent could commit against the successor lineage, which is exactly what §14.2 forbids replaying.',
  },
  {
    name: 'aad-only-intent-parent-epoch',
    isolates: 'transition intent.parent_epoch',
    why: 'Which epoch the exclusion set was computed against. It is what makes a stale intent detectable rather than merely wrong.',
  },
  {
    name: 'aad-only-intent-target',
    isolates: 'transition intent.target',
    why: 'The generation being rotated to, and half the idempotency key. Unbound, a retry could commit at a different generation than the one it was built for.',
  },
  {
    name: 'aad-only-intent-payload-digest',
    isolates: 'transition intent.payload_digest',
    why: 'The wraps, the exclusion set and the cutoff. Unbound, the service commits an epoch whose excluded set is not the one the client signed -- a revocation that revokes someone else.',
  },
  {
    name: 'aad-only-outcome-label',
    isolates: 'transition outcome.label',
    why: 'The same isolation for the outcome, and the two labels differ so an intent can never be presented as its own settlement.',
  },
  {
    name: 'aad-only-outcome-version',
    isolates: 'transition outcome.v',
    why: 'The outcome carrier version, isolated from the intent version, because they are separate carriers.',
  },
  {
    name: 'aad-only-outcome-kind',
    isolates: 'transition outcome.kind',
    why: 'An outcome for a retire presented as the settlement of a rotate. The client would apply a generation switch on the strength of a signature over something else.',
  },
  {
    name: 'aad-only-outcome-workspace-id',
    isolates: 'transition outcome.workspace_id',
    why: "Another workspace's settlement on the same device.",
  },
  {
    name: 'aad-only-outcome-lineage-id',
    isolates: 'transition outcome.lineage_id',
    why: 'The same across lineages, which is the migration boundary.',
  },
  {
    name: 'aad-only-outcome-target',
    isolates: 'transition outcome.target',
    why: 'Which generation was settled. Unbound, an old settlement licenses discarding a key for a rotation still in flight.',
  },
  {
    name: 'aad-only-outcome-epoch',
    isolates: 'transition outcome.epoch',
    why: 'Which epoch committed it. Isolated by using two epochs the same authorization key signs -- §13.5 rotates `K_accept` and not the authorization key, which is what makes the field varyable without varying the verifier.',
  },
  {
    name: 'aad-only-outcome-committed-id',
    isolates: 'transition outcome.committed_id',
    why: 'The field the whole three-way rule turns on. Unbound, an attacker flips a commit into a supersede and the client discards a content key the service holds wraps for -- the interrupted state masquerading as a completed lesser one, which is this rows whole subject. The substituted id is another kinds intent rather than the rival rotations, because the rival differs in one field and eliding that field would rescue this negative for the wrong reason.',
  },
];

// --- main ------------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();
  checkAgainstRow1();

  // --- the certified recipient set, and what a rotator is allowed to read -------

  const honestMembers = await membersDigest(CERTIFIED_MEMBERS);
  const honestSet = certifiedSetMessage({ members: honestMembers });
  const approval = await sign(KEYS.owner.seed, approvalMessage(LAPTOP, honestSet));

  /**
   * The verifier, with the lookup real (P-1 falsifier 12). The named approver's
   * key comes from the parent certified set's member entry and from nowhere
   * else; round 1's mutation made the pre-return verifier do this lookup and
   * `certified-set-approved-by-an-impostor` succeeded when it must not, because
   * the epoch was the only signing-key home. Now the member entry is.
   */
  const approves = async (over, { approver = LAPTOP, sig = approval } = {}) => {
    const sPub = resolveApprover(PARENT_MEMBERS, approver);
    const ok = await verify(
      sPub,
      sig,
      approvalMessage(approver, certifiedSetMessage({ members: honestMembers, ...over })),
    );
    if (!ok) throw new Error('the approval does not cover this set');
    return ok;
  };
  if (!(await approves({}))) throw new Error('the honest approval does not verify.');
  if (resolveApprover(PARENT_MEMBERS, LAPTOP) !== KEYS.owner.public_key) {
    throw new Error('the fixture resolves the approver to a key it does not sign with.');
  }

  // The service publishes an epoch substituting LAPTOP's signing key with one
  // it holds, and approves the set under it, naming LAPTOP. The lookup never
  // consults the epoch: LAPTOP's member entry resolves the genuine key, and
  // the impostor's approval does not verify.
  await refuses('certified-set-approved-by-an-impostor', async () =>
    approves({}, { sig: await sign(KEYS.impostor.seed, approvalMessage(LAPTOP, honestSet)) }),
  );
  // LAPTOP's honest approval, presented as PHONE's: the name is in the signed
  // bytes, so the flip breaks the signature.
  await refuses('approval-presented-as-another-members', () => approves({}, { approver: PHONE }));
  // The pre-return shape: a signature over the bare set bytes, naming nobody.
  await refuses('approval-without-a-named-approver', async () =>
    approves({}, { sig: await sign(KEYS.owner.seed, honestSet) }),
  );
  // The intruder is admitted and is not a member, so resolution refuses before
  // any signature runs.
  await refuses('approval-by-an-admitted-non-member', async () =>
    approves({}, {
      approver: INTRUDER,
      sig: await sign(KEYS.impostor.seed, approvalMessage(INTRUDER, honestSet)),
    }),
  );
  await refuses('certified-set-from-another-epoch', () => approves({ parentEpoch: LATER_EPOCH }));
  await refuses('certified-set-with-an-added-member', async () =>
    approves({
      members: await membersDigest({
        ...CERTIFIED_MEMBERS,
        [INTRUDER]: { w_pub: '44'.repeat(32), s_pub: '55'.repeat(32) },
      }),
    }),
  );
  await refuses('certified-set-with-substituted-recovery-state', () =>
    approves({ recoveryStateDigest: 'ef'.repeat(32) }),
  );

  // The five fields round 1 found isolated by nothing (D-2), one at a time,
  // each against the honest approval. The audit's elision holds each name to
  // its declared field: remove that field from the preimage and exactly this
  // negative must verify again.
  await refuses('aad-only-certified-set-label', () => approves({ label: 'done/certified-set/v2' }));
  await refuses('aad-only-certified-set-version', () => approves({ v: VERSION + 1 }));
  await refuses('aad-only-certified-set-workspace-id', () => approves({ workspace: OTHER_WORKSPACE }));
  await refuses('aad-only-certified-set-lineage-id', () => approves({ lineage: OTHER_LINEAGE }));
  await refuses('aad-only-certified-set-next-epoch', () => approves({ nextEpoch: PARENT_EPOCH + 2 }));

  /**
   * The rotation wraps to the certified set, and this is the assertion that says so.
   *
   * `INTRUDER` sits in `ROSTER` and not in `CERTIFIED_MEMBERS`. A rotator that
   * read the epoch -- which is what §13.7 said before `S0-2` -- would build a
   * wrap for it, and the service would hold a wrap it can open. A rotator that
   * reads the certified set cannot: there is no approved pair to encrypt to.
   */
  const recipients = recipientsOf(CERTIFIED_MEMBERS, [TABLET]);
  const wrapped = Object.keys(WRAP).toSorted();
  if (wrapped.join('|') !== recipients.join('|')) {
    throw new Error(
      `The rotation wraps to ${wrapped.join(', ')} but the certified set licenses ${recipients.join(', ')}.`,
    );
  }
  if (!ROSTER.includes(INTRUDER)) throw new Error('the intruder is not in the roster it exploits.');
  if (wrapped.includes(INTRUDER)) {
    throw new Error('A service-admitted credential received a wrap. The rotator read the roster.');
  }
  if (recipientsOf(CERTIFIED_MEMBERS, []).includes(INTRUDER)) {
    throw new Error('The intruder is a certified member; the fixture proves nothing.');
  }

  // --- P-1 falsifier 17: bootstrap output becomes rotation capability ------------
  //
  // The rule TRD §13.8 states, run: an accepted RecoveryBootstrap's binding IS
  // the replacement certified set — one member entry (new_credential_id ‖
  // new_W_pub ‖ new_S_pub) with new_recovery_state_digest, at parent_epoch =
  // observed_epoch — and a subsequent rotation by the recovered credential
  // succeeds, its approval resolving through that set's member entry. Round 1
  // D-3 found the composition existed nowhere: §13.7's rotator consumed the
  // certified set of its parent epoch, after a total loss that set named only
  // dead credentials, and no rule turned the bootstrap's binding into one — so
  // the recovered credential could read and could not rotate. The fixture is
  // head-discovery.json's own accepted bootstrap, so the two carriers compose
  // by value rather than by two copies of one story.
  const HD = JSON.parse(readFileSync(HEAD_DISCOVERY, 'utf8'));
  const boot = HD.recovery_bootstrap.fields;
  if (boot.workspace !== WORKSPACE || boot.lineage !== LINEAGE) {
    throw new Error('the bootstrap fixture is not this workspace; the composition proves nothing.');
  }
  if (boot.newSigningKey !== HD.keys.new_credential.public_key) {
    throw new Error('the bootstrap does not carry the countersigning credential’s key.');
  }
  const replacementMembers = {
    [boot.newCredential]: { w_pub: boot.newWrappingKey, s_pub: boot.newSigningKey },
  };
  const replacementMembersDigest = await membersDigest(replacementMembers);
  const replacementSet = certifiedSetMessage({
    parentEpoch: boot.observedEpoch,
    nextEpoch: boot.observedEpoch + 1,
    members: replacementMembersDigest,
    recoveryStateDigest: boot.newRecoveryStateDigest,
  });
  const successorSet = certifiedSetMessage({
    parentEpoch: boot.observedEpoch + 1,
    nextEpoch: boot.observedEpoch + 2,
    members: replacementMembersDigest,
    recoveryStateDigest: boot.newRecoveryStateDigest,
  });
  const successorApproval = await sign(
    HD.keys.new_credential.seed,
    approvalMessage(boot.newCredential, successorSet),
  );
  const recoveredKey = resolveApprover(replacementMembers, boot.newCredential);
  if (!(await verify(recoveredKey, successorApproval, approvalMessage(boot.newCredential, successorSet)))) {
    throw new Error(
      'the recovered credential cannot rotate: its approval does not verify through the replacement set.',
    );
  }

  const auth = KEYS.authorization;
  const owner = KEYS.owner;

  // --- payloads, and the determinism the idempotency key rests on --------------

  const rotateParts = rotationPayload({
    excluded: [TABLET],
    wraps: WRAP,
    recoveryWrap: RECOVERY_WRAP,
    cutoff: CUTOFF,
  });
  const rotatePayload = hex(await payloadDigest(rotateParts));

  // A retry builds the payload again, from inputs in a different order. If the
  // two disagree, the retry submits a different intent -- which is precisely
  // the state the pending record exists to make unreachable.
  const shuffled = rotationPayload({
    excluded: [TABLET],
    wraps: Object.fromEntries(Object.entries(WRAP).toReversed()),
    recoveryWrap: RECOVERY_WRAP,
    cutoff: [...CUTOFF].toReversed(),
  });
  if (hex(await payloadDigest(shuffled)) !== rotatePayload) {
    throw new Error('The payload digest depends on input order. A retry would not be idempotent.');
  }

  /**
   * The retire payload carries the erasure acceptance **in its signed bytes**
   * (`P-4`, option B with intrinsic acceptance, ratified 2026-08-28; landed at
   * the `S0-7` return). Asking for deletion is accepting deletion: if no
   * receiver completes a `TerminalHandoff` by the destructive boundary —
   * `retired_at + RETENTION`, written once at the `cause` overwrite — the
   * hosted classes are erased anyway, and the record then says
   * `deleted-without-receipt`, never that someone received them. A payload
   * without the acceptance is malformed and refused at creation, before any
   * signature or settlement, so no acceptance-less retirement exists for the
   * ceiling to arbitrate; and because `payload_digest` sits inside the signed
   * intent message, flipping the acceptance in transit breaks the intent's
   * signature — demonstrated below rather than asserted.
   */
  const RETIRE_ACCEPTANCE = 'delete-unreceipted-classes-at-the-boundary';
  const retireParts = [
    { name: 'erasure-acceptance', value: RETIRE_ACCEPTANCE },
    { name: 'reason', value: 'account-deletion' },
    { name: 'terminal-head', value: 'de'.repeat(32) },
  ];
  const mintRetirePayload = async (parts) => {
    if (!parts.some((p) => p.name === 'erasure-acceptance' && p.value === RETIRE_ACCEPTANCE)) {
      throw new Error(
        'a retire payload without the erasure acceptance is malformed: refused at creation, ' +
          'before any signature or settlement (P-4 falsifier 15).',
      );
    }
    return hex(await payloadDigest(parts));
  };
  const retirePayload = await mintRetirePayload(retireParts);

  // The acceptance is bound, proved as a difference rather than asserted: the
  // acceptance-less digest differs, so an intent whose acceptance was stripped
  // in transit is a different signed message and the signature no longer
  // covers it.
  const acceptancelessDigest = hex(
    await payloadDigest(retireParts.filter((p) => p.name !== 'erasure-acceptance')),
  );
  if (!eliding() && acceptancelessDigest === retirePayload) {
    throw new Error(
      'stripping the erasure acceptance produced the selected retire payload digest. ' +
        'The acceptance is not bound, and the ceiling would arbitrate an intent nobody accepted.',
    );
  }

  await refuses('retire-intent-without-the-erasure-acceptance', () =>
    mintRetirePayload(retireParts.filter((p) => p.name !== 'erasure-acceptance')),
  );
  const replaceInputs = {
    counter: 1,
    rPub: NEW_R_PUB,
    envelope: RECOVERY_ENVELOPE,
    rootCommitment: ROOT_COMMITMENT,
    wraps: REWRAPPED,
    successor: SUCCESSOR_GEN,
  };
  const replaceParts = replacementPayload(replaceInputs);
  const replacePayload = hex(await payloadDigest(replaceParts));

  // Same idempotency requirement as the rotation above: a retry that builds the
  // wraps in a different order must reproduce the digest exactly.
  if (
    hex(
      await payloadDigest(
        replacementPayload({
          ...replaceInputs,
          wraps: Object.fromEntries(Object.entries(REWRAPPED).toReversed()),
        }),
      ),
    ) !== replacePayload
  ) {
    throw new Error('The replacement payload digest depends on input order.');
  }

  /**
   * The bytes are bound, and this is what proves it rather than asserting it.
   *
   * Each variant below is a *complete, well-formed* replacement that differs
   * from the selected one in exactly one place. Under the superseded
   * construction -- `new-recovery-public-key` plus `"1|2|3|4|5"` -- the first
   * three produced an identical digest, because none of them changes which
   * generations were rewrapped or the public key they were rewrapped to. They
   * are difference assertions, so they guard on the elision driver: eliding the
   * field two constructions differ in would otherwise crash the subprocess
   * instead of rescuing a negative.
   */
  const replaceVariants = {
    'one-byte-of-the-sealed-envelope': {
      ...replaceInputs,
      envelope: RECOVERY_ENVELOPE.slice(0, -2) + (RECOVERY_ENVELOPE.endsWith('ef') ? 'ee' : 'ef'),
    },
    'one-generations-wrap': { ...replaceInputs, wraps: { ...REWRAPPED, 3: '99'.repeat(16) } },
    'a-generation-dropped-from-the-set': {
      ...replaceInputs,
      wraps: Object.fromEntries(Object.entries(REWRAPPED).filter(([g]) => g !== '5')),
    },
    'the-successor-generation': { ...replaceInputs, successor: SUCCESSOR_GEN + 1 },
    'the-root-commitment': { ...replaceInputs, rootCommitment: '8d'.repeat(32) },
  };
  // The forward-rotation claim is partial and says so. What is falsified here is
  // the *binding*: `successor` is inside the signed payload digest, so a
  // replacement cannot be re-served with a different one. That the exposed code
  // then **opens nothing** is a runtime property of the generation switch, and
  // it belongs to `L-2` rather than to a vector.
  falsifies('the replacement-payload variants', [
    'f-4259822-recovery-replacement-payload-bytes-unbound',
    'f-4259822-recovery-replacement-no-forward-rotation -> L-2',
  ]);
  const replaceVariantDigests = {};
  for (const [what, inputs] of Object.entries(replaceVariants)) {
    replaceVariantDigests[what] = hex(await payloadDigest(replacementPayload(inputs)));
    if (!eliding() && replaceVariantDigests[what] === replacePayload) {
      throw new Error(
        `A replacement differing in ${what} produced the selected payload digest. ` +
          'The bytes are not bound, and "exactly the old or exactly the new" means nothing.',
      );
    }
  }

  // What the superseded construction bound, kept only to be compared against.
  const numbersOnlyPayload = hex(
    await payloadDigest([
      { name: 'new-recovery-public-key', value: NEW_R_PUB },
      { name: 'rewrapped-generations', value: Object.keys(REWRAPPED).join('|') },
    ]),
  );
  if (!eliding() && numbersOnlyPayload === replacePayload) {
    throw new Error('The corrected replacement payload is the superseded one.');
  }

  // --- intent vectors ----------------------------------------------------------

  const INTENTS = [
    {
      name: 'rotate',
      why: "The row's central case: a fresh generation, its wraps, the excluded credential and row 5s cutoff. Persisted before the first network byte, which is what makes the crash resolvable rather than ambiguous.",
      kind: 'rotate',
      target: TO_GEN,
      payload: rotatePayload,
      parts: rotateParts,
    },
    {
      name: 'retire',
      why: 'Account deletion (§14.4). **Identical to the rotate above in every field but `kind` and its payload**, which is why PRD §6.10s warning is a binding requirement rather than an interface one. The payload carries the erasure acceptance in its signed bytes (P-4, intrinsic acceptance): asking for deletion is accepting deletion, and a payload without it is refused at creation as malformed.',
      kind: 'retire',
      target: TO_GEN,
      payload: retirePayload,
      parts: retireParts,
    },
    {
      name: 'replace-recovery',
      why: 'The atomic replace §13.8 requires and row 14 §5 handed to this review. Same shape: an interruption must leave exactly the old envelope or exactly the new, because two live recovery envelopes means the old code still opens content.',
      kind: 'replace-recovery',
      target: 1,
      payload: replacePayload,
      parts: replaceParts,
    },
  ];

  const intentVectors = [];
  const built = [];
  for (const i of INTENTS) {
    const intent = {
      v: VERSION,
      kind: i.kind,
      workspace: WORKSPACE,
      lineage: LINEAGE,
      parentEpoch: PARENT_EPOCH,
      target: i.target,
      payload: i.payload,
    };
    const message = intentMessage(intent);
    const id = hex(await sha256(message));
    const sig = await sign(owner.seed, message);
    if (!(await verify(owner.public_key, sig, message))) {
      throw new Error(`Intent "${i.name}" does not verify under the owner credential.`);
    }
    intentVectors.push({
      name: i.name,
      why: i.why,
      inputs: {
        v: VERSION,
        kind: i.kind,
        workspace_id: WORKSPACE,
        lineage_id: LINEAGE,
        parent_epoch: PARENT_EPOCH,
        target: i.target,
        payload_digest: i.payload,
        ...(i.parts ? { payload_parts: i.parts } : {}),
      },
      derived: { message: hex(message) },
      expected: { id, signature: hex(sig), signed_by: owner.public_key },
    });
    built.push({ intent, id, message });
  }

  // --- outcome vectors ---------------------------------------------------------

  const outcomeVectors = [];
  const outcomes = [];
  for (const [i, b] of built.entries()) {
    const outcome = {
      v: VERSION,
      kind: b.intent.kind,
      workspace: b.intent.workspace,
      lineage: b.intent.lineage,
      target: b.intent.target,
      epoch: COMMIT_EPOCH,
      committedId: b.id,
    };
    const message = outcomeMessage(outcome);
    const sig = await sign(auth.seed, message);
    outcomeVectors.push({
      name: `${intentVectors[i].name}--committed`,
      why: 'The settlement that licenses applying the transition. Signed by the lineage authorization key, because discarding or applying a content key on the strength of an unsigned answer is what this row refuses.',
      inputs: {
        v: VERSION,
        kind: outcome.kind,
        workspace_id: outcome.workspace,
        lineage_id: outcome.lineage,
        target: outcome.target,
        epoch: COMMIT_EPOCH,
        committed_id: outcome.committedId,
      },
      derived: { message: hex(message) },
      expected: { signature: hex(sig), signed_by: auth.public_key, verdict: 'committed' },
    });
    outcomes.push({ outcome, sig });
  }

  // The superseded case: a concurrent rotation won, and the outcome names its id.
  const base0 = built[0];
  const rivalIntent = {
    ...base0.intent,
    payload: hex(
      await payloadDigest(
        rotationPayload({
          excluded: [PHONE],
          wraps: { [LAPTOP]: WRAP[LAPTOP] },
          recoveryWrap: RECOVERY_WRAP,
          cutoff: CUTOFF,
        }),
      ),
    ),
  };
  const rivalId = hex(await sha256(intentMessage(rivalIntent)));
  const supersededOutcome = { ...outcomes[0].outcome, committedId: rivalId };
  const supersededSig = await sign(auth.seed, outcomeMessage(supersededOutcome));
  outcomeVectors.push({
    name: 'rotate--superseded',
    why: 'The third case, and the one that only exists because a transition carries an exclusion set. Another owner device rotated to the same generation first and excluded a *different* credential. The loser must not resubmit -- its exclusion set was computed against an epoch that has moved -- so this is the one answer that licenses discarding a live key, and the one an attacker would forge.',
    inputs: {
      v: VERSION,
      kind: supersededOutcome.kind,
      workspace_id: supersededOutcome.workspace,
      lineage_id: supersededOutcome.lineage,
      target: supersededOutcome.target,
      epoch: COMMIT_EPOCH,
      committed_id: rivalId,
      note: 'The rival intent differs from ours only in its excluded set, which is why its id differs and its payload digest is published beside it.',
      rival_payload_digest: rivalIntent.payload,
    },
    derived: { message: hex(outcomeMessage(supersededOutcome)) },
    expected: { signature: hex(supersededSig), signed_by: auth.public_key, verdict: 'superseded' },
  });

  // Every published vector runs the real rule.
  for (const [i, o] of outcomes.entries()) {
    const verdict = await settle({
      intent: built[i].intent,
      intentId: built[i].id,
      outcome: o.outcome,
      outcomeSig: o.sig,
      authorizationPublicKey: auth.public_key,
    });
    if (verdict !== 'committed') throw new Error(`Vector ${i} did not settle as committed.`);
  }
  // The rival must actually be one. This is the unconditional half of the check
  // and it does not depend on which fields reach the message.
  if (rivalIntent.payload === base0.intent.payload) {
    throw new Error('The rival rotation carries the same payload; it is not a rival.');
  }
  const supersededVerdict = await settle({
    intent: base0.intent,
    intentId: base0.id,
    outcome: supersededOutcome,
    outcomeSig: supersededSig,
    authorizationPublicKey: auth.public_key,
  });
  // `rivalId === base0.id` is reachable only under the coverage audit's elision
  // of `payload_digest`: with that field out of the message the two intents are
  // the same bytes, which is the finding the audit is looking for rather than a
  // defect here. An ordinary run cannot reach it, because the assertion above
  // has already established that the payloads differ.
  if (rivalId !== base0.id && supersededVerdict !== 'superseded') {
    throw new Error(`The superseded vector settled as ${supersededVerdict}.`);
  }

  // --- the negatives -----------------------------------------------------------

  const base = base0;
  const baseOutcome = outcomes[0];

  /** One call shape, so a negative differs from the honest vector only where it says it does. */
  const attempt = (over = {}) =>
    settle({
      intent: base.intent,
      intentId: base.id,
      outcome: baseOutcome.outcome,
      outcomeSig: baseOutcome.sig,
      authorizationPublicKey: auth.public_key,
      ...over,
    });

  await refuses('fabricated-refusal', async () => {
    const forged = { ...baseOutcome.outcome, committedId: rivalId };
    return attempt({
      outcome: forged,
      outcomeSig: await sign(KEYS.impostor.seed, outcomeMessage(forged)),
    });
  });
  await refuses('unsigned-outcome', () => attempt({ outcomeSig: new Uint8Array(64) }));
  await refuses('outcome-from-an-older-epoch', async () => {
    const old = { ...baseOutcome.outcome, epoch: PARENT_EPOCH };
    return attempt({ outcome: old, outcomeSig: await sign(auth.seed, outcomeMessage(old)) });
  });
  const flipped = Uint8Array.from(baseOutcome.sig);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-signature-bit', () => attempt({ outcomeSig: flipped }));

  // --- the intent's eight fields, one at a time --------------------------------
  //
  // The intent is not re-verified by `settle`; what it contributes is its id,
  // which is SHA-256 of the message. So each of these changes one field of the
  // message the id was taken over, and the verdict flips from committed to
  // superseded -- a refusal in the sense that matters, since the client would
  // discard a live key. Under the matching elision the id is unchanged and the
  // verdict is committed again.

  /**
   * `settle` compares kind, workspace, lineage and target between the two
   * messages, so a negative that changes one of them in the intent alone fails
   * twice -- once on the comparison and once on the id -- and isolates nothing.
   * Where the field is shared, the matching outcome is supplied and re-signed,
   * leaving the id as the only thing that can refuse it. Row 12's finding.
   */
  const withIntent = async (over, shared = {}) => {
    const intent = { ...base.intent, ...over };
    const outcome = { ...baseOutcome.outcome, ...shared };
    return attempt({
      intent,
      intentId: hex(await sha256(intentMessage(intent))),
      outcome,
      outcomeSig: await sign(auth.seed, outcomeMessage(outcome)),
    });
  };
  const mustNotSupersede = async (name, over, shared) =>
    refuses(name, async () => {
      const verdict = await withIntent(over, shared);
      if (verdict !== 'committed') throw new Error(`verdict ${verdict}`);
      return verdict;
    });

  await mustNotSupersede('aad-only-intent-label', { label: 'done/transition/v2' });
  await mustNotSupersede('aad-only-intent-version', { v: 0 });
  await mustNotSupersede('aad-only-intent-kind', { kind: 'retire' }, { kind: 'retire' });
  await mustNotSupersede(
    'aad-only-intent-workspace-id',
    { workspace: OTHER_WORKSPACE },
    { workspace: OTHER_WORKSPACE },
  );
  await mustNotSupersede(
    'aad-only-intent-lineage-id',
    { lineage: OTHER_LINEAGE },
    { lineage: OTHER_LINEAGE },
  );
  await mustNotSupersede('aad-only-intent-parent-epoch', { parentEpoch: PARENT_EPOCH - 1 });
  await mustNotSupersede('aad-only-intent-target', { target: TO_GEN + 1 }, { target: TO_GEN + 1 });
  await mustNotSupersede('aad-only-intent-payload-digest', { payload: rivalIntent.payload });

  // --- the outcome's eight fields, one at a time -------------------------------
  //
  // Each keeps the honest signature and changes one field, so each fails on the
  // signature. Where the field is *also* read downstream -- kind, workspace,
  // lineage, target and epoch are all compared against the intent -- the
  // negative supplies a matching intent, or it would fail twice and isolate
  // nothing (row 12's finding).

  const withOutcome = async (over, intentOver = {}) => {
    const outcome = { ...baseOutcome.outcome, ...over };
    const intent = { ...base.intent, ...intentOver };
    return attempt({
      outcome,
      intent,
      intentId: hex(await sha256(intentMessage(intent))),
    });
  };

  await refuses('aad-only-outcome-label', () => withOutcome({ label: 'done/transition-out/v2' }));
  await refuses('aad-only-outcome-version', () => withOutcome({ v: 0 }));
  await refuses('aad-only-outcome-kind', () => withOutcome({ kind: 'retire' }, { kind: 'retire' }));
  await refuses('aad-only-outcome-workspace-id', () =>
    withOutcome({ workspace: OTHER_WORKSPACE }, { workspace: OTHER_WORKSPACE }),
  );
  await refuses('aad-only-outcome-lineage-id', () =>
    withOutcome({ lineage: OTHER_LINEAGE }, { lineage: OTHER_LINEAGE }),
  );
  await refuses('aad-only-outcome-target', () =>
    withOutcome({ target: TO_GEN + 1 }, { target: TO_GEN + 1 }),
  );
  await refuses('aad-only-outcome-epoch', () => withOutcome({ epoch: LATER_EPOCH }));
  // No inner check on the verdict here, and that is the point. `committed_id` is
  // read from the record rather than recomputed, so eliding it from the signed
  // message cannot change the verdict -- what changes is whether the signature
  // refuses the edit at all. The negative asserts the refusal; the wrong verdict
  // is the consequence of losing it.
  // The substituted id is the *retire* intent's rather than the rival rotation's,
  // and that is a coverage consequence worth keeping: the rival differs from the
  // base in `payload_digest` alone, so eliding that one field collapses the two
  // ids and rescues this negative for the wrong reason. The retire intent
  // differs in two fields, so no single elision can make them equal.
  await refuses('aad-only-outcome-committed-id', () => withOutcome({ committedId: built[1].id }));

  // --- demonstrations, which succeed and are meant to --------------------------

  const reserved = await settle({
    intent: base.intent,
    intentId: base.id,
    outcome: baseOutcome.outcome,
    outcomeSig: baseOutcome.sig,
    authorizationPublicKey: auth.public_key,
  });

  const rotateMsg = intentVectors[0].derived.message;
  const retireMsg = intentVectors[1].derived.message;

  const demonstrations = [
    {
      name: 'the-erasure-acceptance-is-inside-the-signed-payload',
      why: "P-4 falsifier 15, the in-transit half. The retire payload's erasure acceptance is one of its sorted, length-prefixed parts, so stripping or flipping it yields a different payload digest — and payload_digest sits inside the signed intent message, so the stripped intent is a different message the published signature no longer covers. Published as digests rather than asserted, beside the creation-half negative (retire-intent-without-the-erasure-acceptance).",
      selected: retirePayload,
      acceptanceless: acceptancelessDigest,
      acceptance: { name: 'erasure-acceptance', value: RETIRE_ACCEPTANCE },
      expected: 'the digests differ, so the signature over the intent no longer covers a stripped payload',
    },
    {
      name: 'an-outcome-re-served-is-not-a-replay',
      why: "Row 9's head assertion needed a nonce because a head is a statement about a moving lineage, so re-serving one is a replay. `(lineage, kind, target)` names an immutable pair -- generations are monotone and a target is reached once -- so this statement does not go stale and there is nothing to bind freshness to. Verifying the same outcome a second time yields the same verdict, deliberately.",
      verdict: reserved,
      expected: 'the same verdict, forever',
    },
    {
      name: 'a-retry-is-the-same-bytes',
      why: 'The idempotency key is SHA-256 of the intent message, and the payload digest sorts its parts, so rebuilding the intent from inputs in a different order reproduces it exactly. That is what makes "resubmit on silence" safe: the resubmission cannot accidentally be a second, different transition.',
      intent_id: base.id,
      expected: 'byte-identical to the first submission',
    },
    {
      name: 'a-replacement-is-bound-to-its-exact-bytes',
      why: 'Row 14 offers replacement as the answer to a lost -- or exposed -- code, and row 15 says an interruption leaves exactly the old envelope or exactly the new. Both sentences are claims about bytes. The superseded payload bound the new public key and the string "1|2|3|4|5", so it said which generations were rewrapped and never to what: each variant below is a complete, well-formed replacement differing from the selected one in one place, and the first three collided with it. Published as digests rather than asserted in prose, because the collision is the whole finding.',
      selected: replacePayload,
      differing: replaceVariantDigests,
      superseded_construction: {
        bound: ['new-recovery-public-key', 'rewrapped-generations'],
        digest: numbersOnlyPayload,
        note: 'What the first three variants above could not be distinguished from.',
      },
      expected: 'every variant differs from the selected digest',
    },
    {
      name: 'a-rotation-and-a-retirement-differ-in-one-field',
      why: 'PRD §6.10 says a deliberate downgrade must not silently become account deletion. These two intents are the same workspace, lineage, parent epoch and target; the messages diverge at `kind` and again at the payload it selects. Published side by side because the sentence reads as interface guidance and is a binding requirement.',
      rotate_message: rotateMsg,
      retire_message: retireMsg,
      first_difference_byte: (() => {
        for (let i = 0; i < Math.min(rotateMsg.length, retireMsg.length); i += 2) {
          if (rotateMsg.slice(i, i + 2) !== retireMsg.slice(i, i + 2)) return i / 2;
        }
        return null;
      })(),
      expected: 'neither message opens as the other',
    },
  ];

  // The published list and the asserted list must agree in both directions.
  const published = MUST_FAIL.map((m) => m.name).toSorted();
  const actual = assertedNames().toSorted();
  if (published.join('|') !== actual.join('|')) {
    throw new Error(
      `must_fail and the assertions disagree.\n  published: ${published.join(', ')}\n  asserted:  ${actual.join(', ')}`,
    );
  }

  reportAudit(MUST_FAIL);

  const doc = {
    $schema: 'https://done.invalid/vectors/transition/1',
    generated_by: 'scripts/generate-transition-vectors.mjs',
    falsifies: claims(),
    selection: 'docs/selections/row-15-transitions.md',
    trd_row: 15,
    certified_recipient_set: {
      why: 'A rotator wraps to the certified set, never to the epoch roster. The roster enumerates every credential the service admitted; the certified set names the exact (credential_id ‖ W_pub ‖ S_pub) member triples a person enrolled, and the exact recovery recipient. Without it, account authorization alone causes delayed content-key delivery: at the next unrelated rotation nothing distinguishes an admitted credential from one whose ceremony succeeded.',
      message:
        'CertifiedSet = LP("done/certified-set/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(dec parent_epoch) || LP(dec next_epoch) || LP(hex members_digest) || LP(hex recovery_state_digest)',
      members_digest:
        'SHA-256( LP("done/certified-members/v1") || ( LP(credential_id) || LP(hex W_pub) || LP(hex S_pub) )* sorted by credential_id )',
      approval_message:
        'approval = Ed25519( the named approver’s signing credential ; LP("done/certified-set-approval/v1") || LP(approver_credential_id) || CertifiedSet )',
      approved_by:
        'One eligible content-holding client (P-1, single-owner). approvals[] is a list of (approver_credential_id, approval) entries, so a threshold is later a verifier policy change rather than a format migration.',
      approver_resolution:
        'The verifier resolves the named approver’s S_pub from the PARENT certified set’s member entry and nothing else — the genesis set under the creating credential’s key, a bootstrap-minted replacement under the factor-resolved signer. The service-signed epoch resolves no recipient-authority key (P-1, ratified 2026-08-28).',
      parent_certified_members: PARENT_MEMBERS,
      roster: ROSTER,
      certified_members: CERTIFIED_MEMBERS,
      admitted_but_uncertified: INTRUDER,
      excluded_by_this_rotation: [TABLET],
      licensed_recipients: recipientsOf(CERTIFIED_MEMBERS, [TABLET]),
      wrapped_by_this_rotation: Object.keys(WRAP).toSorted(),
      members_digest_value: honestMembers,
      recovery_state_digest: RECOVERY_STATE_DIGEST,
      message_hex: hex(honestSet),
      approver: LAPTOP,
      approval: hex(approval),
      approver_public_key: KEYS.owner.public_key,
      expected:
        'licensed_recipients equals wrapped_by_this_rotation, and admitted_but_uncertified appears in roster and in neither',
    },
    bootstrap_composition: {
      why: 'P-1 falsifier 17, run: an accepted RecoveryBootstrap’s binding IS the replacement certified set, and a subsequent rotation by the recovered credential succeeds — its approval resolving through the replacement set’s member entry, the same lookup every approval uses. Round 1 D-3 found this composed nowhere: the recovered credential could read and could not rotate.',
      rule: 'replacement set = one member entry (new_credential_id ‖ new_W_pub ‖ new_S_pub) with new_recovery_state_digest, at parent_epoch = observed_epoch, verifying under the factor-resolved bootstrap signer (TRD §13.8, S0-2/A-schemas.md §2)',
      consumes: 'test/vectors/head-discovery.json recovery_bootstrap.fields — the composition is by value, not by a second copy of the story',
      replacement_members: replacementMembers,
      replacement_set_hex: hex(replacementSet),
      subsequent_rotation: {
        successor_set_hex: hex(successorSet),
        approver: boot.newCredential,
        approval: hex(successorApproval),
        resolved_through: 'the replacement set’s member entry — resolveApprover(replacement_members, approver)',
      },
      expected: 'the recovered credential’s successor approval verifies through the replacement set',
    },
    construction: {
      kinds: ['rotate', 'replace-recovery', 'retire'],
      one_protocol:
        'One intent-and-outcome protocol at three kinds -- rotate, replace-recovery, retire -- because §11.2 test 11s list is one class: a multi-step transition whose interrupted middle can be mistaken for a completed *lesser* transition.',
      intent:
        'Intent = LP("done/transition/v1") || LP(dec v) || LP(kind) || LP(workspace_id) || LP(lineage_id) || LP(dec parent_epoch) || LP(dec target) || LP(hex payload_digest), signed by the requesting device credential. id = SHA-256(Intent).',
      outcome:
        'Outcome = LP("done/transition-out/v1") || LP(dec v) || LP(kind) || LP(workspace_id) || LP(lineage_id) || LP(dec target) || LP(dec epoch) || LP(hex committed_id), signed by the lineage authorization key.',
      kind_binding:
        'PRD §6.10s "deliberate downgrade must not silently become account deletion" is a binding requirement rather than an interface one. rotate and retire are otherwise the same eight fields, and an unbound kind is a way to submit one and commit the other. Row 3s editable-kind finding at a third object.',
      lapse_is_not_a_kind:
        'What the binding above closes is the rotate/retire pair, and not lapse (S0-7). No field of a rotation expresses a payment lapse, a synchronization stop or a retention deadline, so binding kind cannot protect a state this grammar has no way to say. TRD §14.7 carries it, on a second axis, under a signer that is not the lineage authorization key. scripts/check-retention.mjs enforces that the two vocabularies stay disjoint.',
      no_from_gen:
        'There is no from_gen field. §13.5s epoch binds the current content-key generation, so the generation being rotated from is a function of parent_epoch. Row 10 left out a part count and row 12 an algorithm field on the same rule: a second binding of a derivable fact is a thing that can disagree with it.',
      idempotency:
        'The service commits at most one intent per (lineage_id, kind, target). A retry is the same bytes: the payload digest sorts its parts, so rebuilding from inputs in a different order reproduces the id exactly.',
      three_way_rule:
        'Silence: wait, then resubmit the identical bytes. Outcome with committed_id == id: committed, apply. Outcome with committed_id != id: superseded, discard and rebuild against the new epoch -- never resubmit, because the exclusion set was computed against an epoch that has moved. Everything that is not a verified outcome is silence.',
      authenticated_refusal:
        'Row 6 established that a definite refusal licenses a re-mint and silence does not, and did not say the refusal must be authenticated. Here it must: the third case discards a live content key, and anything that can withhold an outcome can fabricate one.',
      no_state_field:
        'Whether you won is committed_id == your id. A state flag would be a second binding of the same fact that could disagree with it, and an implementation reading the flag rather than comparing would discard a live key. Row 10s rule about the part count.',
      no_nonce:
        '(lineage, kind, target) names an immutable pair, so an outcome re-served forever is the truth rather than a replay. The contrast with row 9s head assertion, which needed a nonce because a head moves.',
      local_order:
        'The pending intent is persisted before the first network byte. No content is written under the target generation before a verified committed outcome, and none under the previous generation after it -- the commit is one transition point and neither half may precede it. On restart a pending intent is resubmitted, never rebuilt.',
      retention:
        'The previous generation is retained until the outcome is committed, a checkpoint under the new generation is admitted (row 7), and the local trim holds a state record under it (§6.1). Dropping on fewer than three is the failure found at a restore rather than at a review.',
      length_prefix: 'uint16be(byteLength) || utf8 -- injective, so no field can shift another.',
    },
    keys: KEYS,
    intent_vectors: intentVectors,
    outcome_vectors: outcomeVectors,
    demonstrations,
    must_fail: MUST_FAIL,
    primitive_kats:
      "Ed25519 and SHA-256 KATs are row 1's, in test/vectors/algorithm-suite.json. This generator checks that row 1 still selects Ed25519 for signatures, so the two documents fail apart rather than drift apart.",
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/transition.json is stale. Run: node scripts/generate-transition-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('transition.json is current; the keypair and row 1 cross-checks pass.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${intentVectors.length} intent and ${outcomeVectors.length} outcome vectors, ${demonstrations.length} demonstrations and ${MUST_FAIL.length} negatives to test/vectors/transition.json`,
  );
};

await main();
