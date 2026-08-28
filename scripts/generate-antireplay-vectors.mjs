/**
 * Test vectors for the anti-replay rule and envelope retention depth
 * (TRD §15 row 6, §7.4, §7.5, §6.1).
 *
 * The construction is specified in docs/selections/row-6-antireplay-retention.md.
 * This script is the executable half of that document: it emits
 * test/vectors/antireplay.json.
 *
 * **One theorem and one carrier, and the theorem is why the carrier is small.**
 *
 *   - The theorem: a chain replayed from genesis and the same chain replayed
 *     from a checkpoint's head vector reach **the same link** at the same
 *     position. That equality is what makes a checkpoint a retention floor
 *     rather than a convenience — everything below it may be dropped without
 *     weakening anything. The first vector is that equality.
 *   - The carrier: the local head vector, one `(seq, link)` per credential,
 *     which a device must persist because it cannot recompute it. Row 5's links
 *     are functions of envelope digests, and §7.4 retains a device's **own**
 *     outbound envelopes only — an inbound envelope is opened, applied and
 *     gone. There is no other copy of `link` on the device.
 *
 * **The mark carries a link and not just a number, and one negative below is
 * the whole argument for that.** §7.5 says a numeric high-water mark is not a
 * finalization boundary; one position down, a numeric mark is not an
 * anti-replay state either. A client that advanced its counter without keeping
 * the link cannot tell a chain it actually replayed from one it did not.
 *
 * The carrier is row 3's record format with a third `kind`, which is worth
 * pausing on: row 3 bound `kind` in the AAD because IndexedDB holds a
 * structured clone whose properties the load path trusts, and a `state` record
 * supersedes everything before it. That binding is what lets a third kind be
 * added here with no format change and no sixth subkey — and it is what stops a
 * heads record being reinterpreted as a `state` record and swept into the trim.
 *
 * **One thing is published as a demonstration rather than as a negative,
 * because it succeeds.** A heads record can be rolled back to an earlier,
 * genuinely sealed one; an AAD authenticates a record and cannot order two
 * valid ones. It opens, the vector shows it opening, and the selection document
 * states the bound instead of claiming a guarantee the construction lacks.
 *
 * Row 5's link and head constructions are reused verbatim and are audited in
 * test/vectors/finalization.json rather than again here. Row 7's head-vector
 * serialization is likewise reused, so a device compares its own position
 * against a checkpoint's baseline with one digest comparison.
 *
 * The primitive KATs are not here; SHA-256, HKDF, AES-256-GCM and Ed25519 are
 * row 1's.
 *
 * Usage: node scripts/generate-antireplay-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/antireplay.json', import.meta.url);

/** Row 5's labels, reused unchanged. */
const LINK_LABEL = 'done/accept/v1';
const HEAD_LABEL = 'done/accept-head/v1';
/** Row 7's head-vector label, reused unchanged so the digests are comparable. */
const HEADVEC_LABEL = 'done/headvec/v1';
/** Row 3's store label, reused: the heads record is a row 3 record. */
const STORE_LABEL = 'done/store/v1';
/** This row's only new label, and it names a plaintext body rather than a key. */
const HEADS_LABEL = 'done/heads/v1';
/** The other answer `K_accept` gives (`S0-4`, TRD §7.5, §15 rows 4 and 6). */
const REFUSE_LABEL = 'done/position-refuse/v1';

/** The empty chain. Row 5's. */
const EMPTY_CHAIN = '00'.repeat(32);

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

/** Length-prefixed field: uint16be(byteLength) || utf8. Row 3's convention. */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- row 5's constructions, reused --------------------------------------------------

/**
 * link_n = SHA-256( LP(label) || LP(workspace) || LP(credential) || LP(dec n)
 *                   || LP(dec epoch) || LP(hex digest) || LP(hex link_{n-1}) )
 *
 * Not registered with the coverage audit here. It is row 5's construction and
 * its fields are isolated in test/vectors/finalization.json; registering it
 * again would duplicate that coverage without adding information, and would
 * make a failure in this file point at the wrong document.
 */
const link = async ({ workspace, credential, seq, epoch, digest, prev }) =>
  hex(
    await sha256(
      concat(
        ...[LINK_LABEL, workspace, credential, String(seq), String(epoch), digest, prev].map(lp),
      ),
    ),
  );

/** Row 5's signed head message, reused unchanged. */
const headMessage = ({ workspace, credential, seq, link: lnk, epoch, final }) =>
  concat(
    ...[
      HEAD_LABEL,
      workspace,
      credential,
      String(seq),
      lnk,
      String(epoch),
      final ? 'true' : 'false',
    ].map(lp),
  );

/**
 * The refusal message, and why every field is in it (`S0-4`).
 *
 * §7.4 makes a definite refusal the only license to re-mint a position and
 * requires it be authenticated; until `S0-4` nothing could express one. Row 15's
 * transition `Outcome` names a `(kind, workspace, lineage, target)` — a
 * transition, not an envelope — so it cannot say which credential, which
 * position, or which exact digest was never accepted.
 *
 * **`refused_digest` is what makes it permanent rather than a status.** A
 * refusal closes that exact digest forever, so a delayed original cannot be
 * accepted behind a licensed successor and leave two links at one position.
 *
 * **`parent_refusal` is what makes the chain linear.** One refusal licenses one
 * successor; a successor names the refusal that licensed it, and the first
 * attempt at a position names zeros.
 */
const refuseMessage = ({
  workspace,
  credential,
  v,
  position,
  digest,
  epoch,
  reason,
  parent,
  label = REFUSE_LABEL,
}) =>
  concat(
    ...aadFields('position refusal', {
      label,
      v: String(v),
      workspace,
      credential,
      position: String(position),
      refused_digest: digest,
      epoch: String(epoch),
      reason,
      parent_refusal: parent,
    }).map(lp),
  );

/**
 * What a client does with a response, which is §7.4's three-way rule at a third
 * object — row 15 selected it for transitions, row 6 for positions.
 *
 * **Everything that is not a verified answer over your own envelope is silence**,
 * and silence resubmits the identical bytes rather than re-minting. That is safe
 * whichever unknown it was: at most one digest is ever accepted at a position,
 * so a request lost before arrival and a reply lost after acceptance need not be
 * told apart.
 *
 * **The verifier is resolved, never received** (`FU-06`, the `S0-4` return).
 * The client verifies under the `K_accept` certified in the epoch in force in
 * its authenticated lineage — the same certification the acceptance heads
 * resolve through — and the subject comparison covers all five fields, the
 * refused envelope's own epoch included. Before the return the verifier was
 * injected beside the answer and the epoch was signed but read by nobody, so a
 * genuine refusal under a stale certified `K_accept` could name a current
 * envelope's other fields and license a re-mint (`A-03`). Now a retired key
 * fails the signature and a wrong epoch fails the subject; both are silence.
 */
const decide = async ({ mine, response, lineage }) => {
  if (response.kind === 'unsigned') return 'resubmit';
  if (response.kind === 'refusal') {
    const certified = lineage.certified[lineage.tip];
    if (certified === undefined) return 'resubmit';
    const verifier = await importVerifier(certified);
    const message = refuseMessage(response.refusal);
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      verifier,
      unhex(response.signature),
      message,
    );
    if (!ok) return 'resubmit';
    const r = response.refusal;
    // A genuine signature over somebody else's subject is still not an answer
    // about mine. These are separate from the field-binding negatives: there the
    // signature breaks, here it verifies and the fields do not match.
    if (r.workspace !== mine.workspace || r.credential !== mine.credential) return 'resubmit';
    if (r.position !== mine.position || r.digest !== mine.digest) return 'resubmit';
    if (r.epoch !== mine.epoch) return 'resubmit';
    return 're-mint';
  }
  if (response.kind === 'head') {
    return response.digest === mine.digest ? 'accepted' : 'equivocation';
  }
  return 'resubmit';
};

// --- row 7's head-vector serialization, reused ----------------------------------------

/**
 * head_vector = for each credential ASCENDING BY ID:
 *                 LP(credential_id) || LP(dec seq) || LP(hex link)
 *
 * Byte-identical to row 7's, on purpose. A device asking *have I reached this
 * checkpoint's baseline?* then answers with one digest comparison against a
 * field row 7's manifest already signs, rather than with a field-by-field walk
 * whose disagreements would have to be interpreted.
 */
const headVector = (heads) =>
  concat(
    ...[...heads]
      .sort((a, b) => (a.credential < b.credential ? -1 : a.credential > b.credential ? 1 : 0))
      .flatMap((h) => [lp(h.credential), lp(String(h.seq)), lp(h.link)]),
  );

const headVectorDigest = async (heads) =>
  hex(await sha256(concat(lp(HEADVEC_LABEL), headVector(heads))));

// --- this row's carrier: row 3's record with a third kind ------------------------------

/**
 * Row 3's store subkey, unchanged — the heads record shares it, and `kind` in
 * the AAD is what makes that safe rather than merely economical.
 *
 * Derivation names the key's scope (a workspace generation); the AAD names the
 * record's home. Row 3's rule, and the principal stays in the AAD here for the
 * same reason it does there.
 */
const deriveStoreKey = async (kg, workspaceId) => {
  const ikm = await crypto.subtle.importKey('raw', kg, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: concat(lp(STORE_LABEL), lp(workspaceId)),
    },
    ikm,
    256,
  );
  return crypto.subtle.importKey('raw', new Uint8Array(bits), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
};

/**
 * Row 3's record AAD, with `kind` carrying a third value.
 *
 * AAD = LP(label) || LP(principal) || LP(workspace) || LP(dec v) || LP(dec gen)
 *       || LP(dec seq) || LP(kind)
 */
const recordAad = ({ principal, workspace, v, gen, seq, kind, label = STORE_LABEL }) =>
  concat(
    ...aadFields('heads record', {
      label,
      principal,
      workspace,
      v: String(v),
      gen: String(gen),
      seq: String(seq),
      kind,
    }).map(lp),
  );

/** plaintext = LP("done/heads/v1") || head_vector */
const headsBody = (heads) => concat(lp(HEADS_LABEL), headVector(heads));

const sealRecord = async (key, nonce, aad, plaintext) =>
  new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: unhex(nonce), additionalData: aad, tagLength: 128 },
      key,
      plaintext,
    ),
  );

const openRecord = async (key, nonce, aad, ct) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unhex(nonce), additionalData: aad, tagLength: 128 },
      key,
      ct,
    ),
  );

// --- the client's rule, as code -----------------------------------------------------

/**
 * Extend the chain by one position, or throw. Conditions 2 and 3.
 *
 * **The fifth condition an earlier draft had is not here, because it is
 * implied.** "No second link at a position already held" needs no state of its
 * own: a second envelope at position n arrives when the mark is already at n or
 * beyond, and condition 2 refuses anything that is not exactly one past the
 * mark. That is why the carrier can be a high-water mark rather than a log of
 * every link ever admitted — which is what the rule sounds like it needs.
 *
 * `held` is what the persisted heads record holds for this credential. At a
 * fresh baseline it is the adopted checkpoint's entry, which is why replaying
 * from a checkpoint is the same operation as replaying from genesis rather than
 * a special case with its own code path.
 *
 * @param {{seq: number, link: string}} held
 * @param {{seq: number, epoch: number, digest: string}} arriving
 * @param {{workspace: string, credential: string}} ctx
 */
const extend = async (held, arriving, { workspace, credential }) => {
  // 1. The envelope verifies. Row 4's AAD and signature, not repeated here.

  // 2. Gap-free, and exactly one past the mark. Row 4 made `seq` the
  //    credential's own outbound position *and* its accepted position, so a
  //    client computes this itself and a skip is not something a service can
  //    grant it.
  if (arriving.seq !== held.seq + 1) {
    throw new Error(`position ${arriving.seq} does not follow the held position ${held.seq}`);
  }

  // 3. Compute the link from the one we hold, never from one we were handed.
  return {
    seq: arriving.seq,
    link: await link({
      workspace,
      credential,
      seq: arriving.seq,
      epoch: arriving.epoch,
      digest: arriving.digest,
      prev: held.link,
    }),
  };
};

/**
 * Condition 4: a signed head closes the run, verified against the link the
 * client replayed — never the link the head carries.
 *
 * **Evidence is per run rather than per envelope, and that falls out of row 5
 * rather than being a relaxation of §7.5.** A head at position n covers every
 * position beneath it through the chain, so a client walks a run to n, verifies
 * one signature there, and applies the whole run or none of it. Nothing is
 * applied without evidence; the evidence just is not one signature per update,
 * which is the client-side face of row 5's *heads amortized over a batch*.
 *
 * @param {{seq: number, link: string}} mark
 * @param {{seq: number, epoch: number, final: boolean, link: string, signature: string}} signedHead
 * @param {object} ctx
 * @param {boolean} [ctx.checkCarriedLink] The defective implementation, for the demonstration.
 */
const close = async (
  mark,
  signedHead,
  { workspace, credential, verifier, checkCarriedLink = false },
) => {
  if (signedHead.seq !== mark.seq) {
    throw new Error(`the signed head is at ${signedHead.seq} and the run reached ${mark.seq}`);
  }
  const message = headMessage({
    ...signedHead,
    workspace,
    credential,
    link: checkCarriedLink ? signedHead.link : mark.link,
  });
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signedHead.signature),
    message,
  );
  if (!ok) throw new Error('signed head does not cover the link the client replayed');
  return mark;
};

/** Walk a run from a starting mark and close it with the head. Apply, or nothing. */
const replayFrom = async (held, run, ctx) => {
  let at = held;
  for (const arriving of run) at = await extend(at, arriving, ctx);
  return close(at, ctx.signedHead, ctx);
};

// --- keys -----------------------------------------------------------------------------

const KEYS = {
  k_accept: {
    role: "The service's hot acceptance-signing key (row 5), certified at epoch 9 — the certification in force. It signs heads and refusals and nothing else.",
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  k_accept_retired: {
    role: 'The acceptance key epoch 8 certified, rotated away at epoch 9 (an ordinary epoch event, §7.5). Genuinely certified once, currently certified nowhere — the delayed old-key compromise FU-06 closes signs with exactly this key.',
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
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

const checkKeypairs = async () => {
  const probe = utf8('keypair self-check');
  for (const [name, k] of Object.entries(KEYS)) {
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, await importSigner(k.seed), probe);
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importVerifier(k.public_key),
      sig,
      probe,
    );
    if (!ok) throw new Error(`${name}: seed and public key are not one keypair.`);
  }
};

// --- the scenario -----------------------------------------------------------------------

const PRINCIPAL = 'prn_01HZXP5T3J8W1Q4X7Z9C2M6K0B';
const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_WORKSPACE = 'ws_01J0000000000000000000000A';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const NONCE = '505152535455565758595a5b';
const OLD_NONCE = '404142434445464748494a4b';

/**
 * The phone's twelve accepted positions, epochs 8 then 9 — a rotation lands
 * between 9 and 10, which is also where the checkpoint is taken. That placement
 * is deliberate rather than arbitrary: row 7 forces a checkpoint under the new
 * generation before the old one may be dropped, so the checkpoint a device
 * adopts is very often the one immediately after a rotation.
 */
const PHONE_RUN = Array.from({ length: 12 }, (_, i) => ({
  seq: i + 1,
  epoch: i + 1 <= 9 ? 8 : 9,
  digest: hex(new Uint8Array(32).fill(i + 1)),
}));

/** The checkpoint is taken at position 9 — the last position of the old epoch. */
const BASELINE_AT = 9;

/** Where the laptop's own chain had got to when the checkpoint was made. */
const LAPTOP_BASELINE = {
  credential: LAPTOP,
  seq: 12,
  link: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
};

/** The same position 7, with a different update. Row 5's equivocation, self-inflicted. */
const EQUIVOCATED_7 = { seq: 7, epoch: 8, digest: hex(new Uint8Array(32).fill(0xee)) };

const BASE_RECORD = { principal: PRINCIPAL, workspace: WORKSPACE, v: 1, gen: 3, seq: 4102 };

const NEGATIVES = [
  {
    name: 'position-does-not-follow',
    mutate:
      'Offer position 12 while the mark is at 10. Refused before any hashing. **Row 4 is what makes this a refusal rather than a policy**: `seq` is the credential’s own outbound position and its accepted position as one number, so a client computes every link itself and cannot be told where a chain got to.',
  },
  {
    name: 'numeric-mark-without-its-link',
    mutate:
      'A mark whose *number* is 11 and whose *link* is position 10’s — a client that advanced a counter without keeping what it replayed. The position check passes and the computed link is wrong, so no signed head covers it. **This is the argument for the carrier’s shape**: §7.5 says a numeric high-water mark is not a finalization boundary, and one level down it is not an anti-replay state either.',
  },
  {
    name: 'equivocated-position-below-the-mark',
    mutate:
      'The equivocated position 7 offered while the mark is at 12. Refused by the position check alone — which is why *no second link at a held position* needs no state of its own and the carrier can be a mark rather than a log.',
  },
  {
    name: 'equivocated-position-at-the-mark',
    mutate:
      'The equivocated position 7 offered while the mark is at 6, so the position check passes and the link is computed honestly. It differs from the accepted one, and the service signed a head over the accepted one. **This is also the shape an honest client produces if it re-mints at a position it never learned was refused**, which is why the outbound rule waits rather than retries.',
  },
  {
    name: 'baseline-from-another-checkpoint',
    mutate:
      'Replay positions 10 through 12 from a head vector that is not the adopted checkpoint’s. The links diverge from the first position onward, so a substituted baseline cannot be walked forward into agreement with a signed head.',
  },
  {
    name: 'heads-record-read-as-state',
    mutate:
      'Open the heads record with `kind` claimed as `state`. **Row 3’s attack with a second victim**: a `state` record supersedes everything before it, so a heads record reinterpretable as one would be a way to make the trim delete content through its own path — and, here, to drop the anti-replay baseline while doing it.',
  },
  {
    name: 'heads-aad-only-principal',
    mutate: 'Open the heads record as though it belonged to another principal on the same profile.',
  },
  {
    name: 'heads-aad-only-workspace',
    mutate: 'Open it as though it belonged to another workspace.',
  },
  { name: 'heads-aad-only-version', mutate: 'Open it claiming another record format version.' },
  { name: 'heads-aad-only-generation', mutate: 'Open it claiming another content-key generation.' },
  {
    name: 'heads-aad-only-seq',
    mutate:
      'Open it claiming another store sequence number. `seq` is shared with the content store rather than restarting here, so row 3’s per-generation nonce budget stays one comparison over one sequence.',
  },
  { name: 'heads-aad-only-renumbered-label', mutate: 'Open it under "done/store/v2".' },
  {
    name: 'wrong-store-subkey',
    mutate:
      'Derive the store subkey for another workspace. The AAD half is `heads-aad-only-workspace`.',
  },

  // --- the refusal (`S0-4`) ---------------------------------------------------
  //
  // Nine bound fields, one at a time, with the client's own envelope following
  // each patch so the subject agrees and only the signature can refuse it. Four
  // of these are read twice -- once by the signature and once by *is this about
  // me?* -- and a negative that changed only the message would refuse on the
  // mismatch and prove nothing about the binding.
  {
    name: 'aad-only-refusal-label',
    mutate: 'Renumber the message label to "done/position-refuse/v2".',
  },
  { name: 'aad-only-refusal-version', mutate: 'Claim v = 2.' },
  { name: 'aad-only-refusal-workspace', mutate: 'A refusal minted for another workspace.' },
  { name: 'aad-only-refusal-credential', mutate: "Another credential's position." },
  { name: 'aad-only-refusal-position', mutate: 'Position 14 rather than 13.' },
  {
    name: 'aad-only-refusal-digest',
    mutate:
      'Another envelope digest. This is the field that makes the refusal permanent rather than a status, so it is the one an attacker would move.',
  },
  { name: 'aad-only-refusal-epoch', mutate: 'Claim a later epoch.' },
  { name: 'aad-only-refusal-reason', mutate: '"policy" rather than "stale-epoch".' },
  {
    name: 'aad-only-refusal-parent',
    mutate:
      'Name a parent refusal that was never issued. Binding it is what makes a re-mint require a licence at all, and what stops a licence for position n being spent at n+1.',
  },

  // Genuine signatures, wrong subject: the service really did sign these, and
  // they are not about this envelope. The field negatives above cannot reach
  // this case, because there the signature is what breaks.
  {
    name: 'refusal-for-another-position',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      'A validly signed refusal for position 14, presented to a client waiting at 13. It verifies, and it licenses nothing here.',
  },
  {
    name: 'refusal-for-another-digest',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      'A validly signed refusal for a different digest at this position — the shape a service would produce for an attempt this client never made.',
  },
  {
    name: 'refusal-for-another-credential',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate: "A validly signed refusal for another credential's position 13.",
  },
  {
    name: 'refusal-for-another-workspace',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      "A validly signed refusal for the same credential's position 13 in another workspace. The S0-9 follow-up found genuine workspace substitution un-isolated; this is the case (S0-4 return).",
  },
  {
    name: 'refusal-for-another-epoch',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      "A validly signed refusal naming epoch 9 against the attempt that referenced epoch 8 — this envelope's other fields, another envelope's epoch. It verifies under the certification in force, and the fifth subject field is what refuses it (FU-06, S0-4 return).",
  },

  {
    name: 'unsigned-error-body',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      'An error body with no signature, which §7.4 calls silence in as many words. The client resubmits the identical bytes from its spool rather than re-minting — and that is safe whichever unknown it was, because at most one digest is ever accepted at a position.',
  },
  {
    name: 'refusal-under-an-uncertified-key',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      'The same refusal signed by a key no epoch certifies. Anything that can withhold an answer can manufacture one, which is why §7.4 requires the refusal be authenticated rather than merely definite.',
  },
  {
    name: 'refusal-under-a-retired-epoch-key',
    falsifies: ['f-745e332-envelope-refusal-carrier-missing'],
    mutate:
      "The same refusal — every subject field this envelope's own — signed by the key epoch 8 certified and the rotation at 9 retired. A perfect subject under a genuinely once-certified key licenses nothing, because the verifier resolves from the lineage's current certification and never from the answer. This is A-03's delayed old-key compromise, refused (FU-06, S0-4 return).",
  },
];

// --- verification -------------------------------------------------------------------------

const verify = async (doc) => {
  const verifier = await importVerifier(KEYS.k_accept.public_key);
  const key = await deriveStoreKey(KG, WORKSPACE);
  const v = doc.vectors[0];
  const head = {
    ...v.inputs.signed_head,
    link: v.expected.link_at_12,
    signature: v.expected.head_signature,
  };
  const head7 = {
    seq: 7,
    epoch: 8,
    final: false,
    link: v.derived.link_at_7,
    signature: v.expected.head_signature_at_7,
  };
  const ctx = { workspace: WORKSPACE, credential: PHONE, verifier, signedHead: head };
  const genesis = { seq: 0, link: EMPTY_CHAIN };
  const baseline = { seq: BASELINE_AT, link: v.derived.link_at_baseline };

  // The theorem, both ways round: from genesis through all twelve, and from the
  // checkpoint's baseline through the last three. The same link at position 12,
  // and one signed head closes either run.
  const fromGenesis = await replayFrom(genesis, PHONE_RUN, ctx);
  const fromBaseline = await replayFrom(baseline, PHONE_RUN.slice(BASELINE_AT), ctx);
  if (fromGenesis.link !== fromBaseline.link) {
    throw new Error('replaying from the checkpoint baseline does not reach the same link.');
  }
  if (fromGenesis.link !== v.expected.link_at_12) {
    throw new Error('the published link at position 12 is not what the replay produces.');
  }

  // The heads record round-trips, and its digest is the one row 7's manifest
  // binds — so *have I reached this checkpoint?* is one comparison.
  const heads = [
    LAPTOP_BASELINE,
    { credential: PHONE, seq: fromGenesis.seq, link: fromGenesis.link },
  ];
  const aad = recordAad({ ...BASE_RECORD, kind: 'heads' });
  const opened = await openRecord(key, NONCE, aad, unhex(v.expected.heads_record_ct));
  if (hex(opened) !== hex(headsBody(heads))) throw new Error('heads record does not round-trip.');
  if ((await headVectorDigest(heads)) !== v.derived.head_vector_digest) {
    throw new Error('the head-vector digest is not row 7\u2019s over the same entries.');
  }

  await refuses('position-does-not-follow', () =>
    replayFrom({ seq: 10, link: v.derived.link_at_10 }, [PHONE_RUN[11]], ctx),
  );
  await refuses('numeric-mark-without-its-link', () =>
    replayFrom({ seq: 11, link: v.derived.link_at_10 }, [PHONE_RUN[11]], ctx),
  );
  await refuses('equivocated-position-below-the-mark', () =>
    replayFrom({ seq: 12, link: v.expected.link_at_12 }, [EQUIVOCATED_7], ctx),
  );
  await refuses('equivocated-position-at-the-mark', () =>
    replayFrom({ seq: 6, link: v.derived.link_at_6 }, [EQUIVOCATED_7], {
      ...ctx,
      signedHead: head7,
    }),
  );
  await refuses('baseline-from-another-checkpoint', () =>
    replayFrom(
      { seq: BASELINE_AT, link: hex(new Uint8Array(32).fill(0xa7)) },
      PHONE_RUN.slice(BASELINE_AT),
      ctx,
    ),
  );

  for (const [name, patch] of [
    ['heads-record-read-as-state', { kind: 'state' }],
    ['heads-aad-only-principal', { principal: 'prn_01J0000000000000000000000A' }],
    ['heads-aad-only-workspace', { workspace: OTHER_WORKSPACE }],
    ['heads-aad-only-version', { v: 2 }],
    ['heads-aad-only-generation', { gen: 4 }],
    ['heads-aad-only-seq', { seq: 4103 }],
    ['heads-aad-only-renumbered-label', { label: 'done/store/v2' }],
  ]) {
    await refuses(name, () =>
      openRecord(
        key,
        NONCE,
        recordAad({ ...BASE_RECORD, kind: 'heads', ...patch }),
        unhex(v.expected.heads_record_ct),
      ),
    );
  }

  const otherKey = await deriveStoreKey(KG, OTHER_WORKSPACE);
  await refuses('wrong-store-subkey', () =>
    openRecord(otherKey, NONCE, aad, unhex(v.expected.heads_record_ct)),
  );

  // --- the refusal, which is the answer row 6 required and nothing could send --
  //
  // Position 13 is the one after the signed head at 12, so the envelope under
  // discussion is the credential's next write rather than a settled one — and
  // it was minted under epoch 8, in flight across the rotation, which is the
  // refusal's ordinary occasion (stale-epoch). The subject carries THAT epoch;
  // the verifier is the tip's. The two are visibly different here on purpose:
  // the epoch in the message says which envelope, never which key (FU-06).
  const { refusal, signature: refusalSig, wrong_subject: wrongSubject, lineage } = doc.refusal;
  const refusedDigest = refusal.digest;
  const mine = {
    workspace: WORKSPACE,
    credential: PHONE,
    position: 13,
    digest: refusedDigest,
    epoch: 8,
  };
  const verdict = async (response) => decide({ mine, response, lineage });

  // The positive: a verified refusal over this client's own digest licenses
  // exactly one successor at the same position.
  if ((await verdict({ kind: 'refusal', refusal, signature: refusalSig })) !== 're-mint') {
    throw new Error('an honest refusal over this position did not license a re-mint');
  }

  /** A negative here is a response that fails to license a re-mint. */
  const mustReMint = async (response) => {
    if ((await verdict(response)) !== 're-mint') throw new Error('not a license to re-mint');
  };

  // Each of the nine bound fields, one at a time. The signature is the honest
  // one and exactly one field of the message changes, so each fails on the
  // binding rather than on anything downstream.
  for (const [name, patch] of [
    ['aad-only-refusal-label', { label: 'done/position-refuse/v2' }],
    ['aad-only-refusal-version', { v: 2 }],
    ['aad-only-refusal-workspace', { workspace: OTHER_WORKSPACE }],
    ['aad-only-refusal-credential', { credential: LAPTOP }],
    ['aad-only-refusal-position', { position: 14 }],
    ['aad-only-refusal-digest', { digest: hex(await sha256(utf8('some other envelope'))) }],
    ['aad-only-refusal-epoch', { epoch: 10 }],
    ['aad-only-refusal-reason', { reason: 'policy' }],
    ['aad-only-refusal-parent', { parent: hex(await sha256(utf8('a refusal never issued'))) }],
  ]) {
    // **The client's own envelope follows the patch.** Five of these fields are
    // read twice -- once by the signature and once by "is this about me?" -- so
    // a negative that changed only the message would refuse on the mismatch and
    // prove nothing about the binding. This way the subject agrees and the
    // signature is the only thing left to refuse it.
    const patched = { ...refusal, ...patch };
    const theirs = {
      workspace: patched.workspace,
      credential: patched.credential,
      position: patched.position,
      digest: patched.digest,
      epoch: patched.epoch,
    };
    await refuses(name, async () => {
      const got = await decide({
        mine: theirs,
        response: { kind: 'refusal', refusal: patched, signature: refusalSig },
        lineage,
      });
      if (got !== 're-mint') throw new Error('not a license to re-mint');
    });
  }

  // Genuine signatures, wrong subject. These are the attack the field negatives
  // above cannot reach: the service really did sign this, and it is not about
  // this envelope.
  for (const entry of wrongSubject) {
    // Verified here rather than trusted: a published "genuine signature" that is
    // not one would make each of these refuse for the wrong reason.
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      verifier,
      unhex(entry.signature),
      refuseMessage(entry.refusal),
    );
    if (!ok) throw new Error(`${entry.name}: its signature is supposed to be genuine and is not`);
    await refuses(entry.name, () =>
      mustReMint({ kind: 'refusal', refusal: entry.refusal, signature: entry.signature }),
    );
  }

  // An unsigned error body is silence, and so is a refusal under a key no epoch
  // certifies. Both resubmit rather than re-mint.
  await refuses('unsigned-error-body', () =>
    mustReMint({ kind: 'unsigned', body: '{"error":"stale epoch"}' }),
  );
  await refuses('refusal-under-an-uncertified-key', () =>
    mustReMint({ kind: 'refusal', refusal, signature: doc.refusal.uncertified_signature }),
  );

  // The delayed old-key compromise (`A-03`), refused by the resolution rather
  // than by any field: every subject field is this envelope's own, and the
  // signature is genuinely the retired key's — verified here first, because a
  // published "genuine signature" that is not one would make this refuse for
  // the wrong reason. The client resolves the verifier from its lineage's
  // current certification, and the key epoch 8 certified is not it.
  {
    const retiredOk = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importVerifier(KEYS.k_accept_retired.public_key),
      unhex(doc.refusal.retired_epoch_signature),
      refuseMessage(refusal),
    );
    if (!retiredOk) {
      throw new Error(
        'refusal-under-a-retired-epoch-key: its signature is supposed to be genuinely the retired key’s and is not',
      );
    }
  }
  await refuses('refusal-under-a-retired-epoch-key', () =>
    mustReMint({ kind: 'refusal', refusal, signature: doc.refusal.retired_epoch_signature }),
  );

  // The two demonstrations. Neither is a negative, because both succeed — and
  // an entry in `must_fail` that does not fail is the exact defect the coverage
  // audit exists to catch, one level up.
  const defective = await replayFrom({ seq: 11, link: v.derived.link_at_10 }, [PHONE_RUN[11]], {
    ...ctx,
    checkCarriedLink: true,
  });
  if (defective.link === v.expected.link_at_12) {
    throw new Error('the defective check was supposed to admit a link the client did not replay.');
  }

  const rolledBack = await openRecord(
    key,
    OLD_NONCE,
    recordAad({ ...BASE_RECORD, seq: 3990, kind: 'heads' }),
    unhex(doc.demonstrations.local_rollback.earlier_record_ct),
  );
  if (hex(rolledBack) !== doc.demonstrations.local_rollback.earlier_body) {
    throw new Error('the rollback demonstration does not open, which is the point of it.');
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

// --- assembly ---------------------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();

  const key = await deriveStoreKey(KG, WORKSPACE);
  const signer = await importSigner(KEYS.k_accept.seed);

  // Walk the chain once, keeping every link this file publishes.
  const links = [];
  let prev = EMPTY_CHAIN;
  for (const p of PHONE_RUN) {
    prev = await link({ workspace: WORKSPACE, credential: PHONE, ...p, prev });
    links.push(prev);
  }
  const linkAt = (n) => links[n - 1];

  const equivocated7 = await link({
    workspace: WORKSPACE,
    credential: PHONE,
    ...EQUIVOCATED_7,
    prev: linkAt(6),
  });

  const signHead = async (h, lnk) =>
    hex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          signer,
          headMessage({ ...h, workspace: WORKSPACE, credential: PHONE, link: lnk }),
        ),
      ),
    );

  const signedHead = { seq: 12, epoch: 9, final: false };
  const headSignature = await signHead(signedHead, linkAt(12));

  // An earlier head, so that `equivocated-position-at-the-mark` is refused by
  // the binding rather than by the head being at the wrong position — a
  // negative that fails for a second reason tests neither.
  const headSignatureAt7 = await signHead({ seq: 7, epoch: 8, final: false }, linkAt(7));

  const heads = [LAPTOP_BASELINE, { credential: PHONE, seq: 12, link: linkAt(12) }];
  const body = headsBody(heads);
  const aad = recordAad({ ...BASE_RECORD, kind: 'heads' });
  const ct = await sealRecord(key, NONCE, aad, body);

  // An earlier, genuine heads record, for the rollback demonstration.
  const earlierHeads = [
    LAPTOP_BASELINE,
    { credential: PHONE, seq: BASELINE_AT, link: linkAt(BASELINE_AT) },
  ];
  const earlierBody = headsBody(earlierHeads);
  const earlierCt = await sealRecord(
    key,
    OLD_NONCE,
    recordAad({ ...BASE_RECORD, seq: 3990, kind: 'heads' }),
    earlierBody,
  );

  const vectors = [
    {
      name: 'twelve-positions-and-a-baseline-at-nine',
      why: "The phone's chain through a rotation between positions 9 and 10, checkpointed at 9. Replayed from genesis and replayed from the checkpoint's baseline it reaches the same link at position 12, which is the whole of why everything below a checkpoint may be dropped.",
      inputs: {
        principal_id: PRINCIPAL,
        workspace_id: WORKSPACE,
        credential_id: PHONE,
        k_g: hex(KG),
        run: PHONE_RUN,
        baseline_at: BASELINE_AT,
        signed_head: signedHead,
        heads_record: { ...BASE_RECORD, kind: 'heads', nonce: NONCE },
        accepted_heads: heads,
      },
      derived: {
        link_at_6: linkAt(6),
        link_at_7: linkAt(7),
        link_at_baseline: linkAt(BASELINE_AT),
        link_at_10: linkAt(10),
        head_message: hex(
          headMessage({ ...signedHead, workspace: WORKSPACE, credential: PHONE, link: linkAt(12) }),
        ),
        heads_record_aad: hex(aad),
        heads_record_body: hex(body),
        head_vector: hex(headVector(heads)),
        head_vector_digest: await headVectorDigest(heads),
      },
      expected: {
        links,
        link_at_12: linkAt(12),
        head_signature: headSignature,
        head_signature_at_7: headSignatureAt7,
        heads_record_ct: hex(ct),
      },
    },
  ];

  // --- the refusal `S0-4` selects, signed once here and checked in verify() ----
  //
  // The refused envelope was minted under epoch 8, in flight across the
  // rotation — the refusal's ordinary occasion. Its `epoch` field is that
  // envelope's own referenced epoch (the fifth subject field, FU-06); the
  // signature is the live K_accept's, certified at epoch 9. The two epochs are
  // different here on purpose: the message says which envelope, the lineage
  // says which key.
  const refusedDigest = hex(await sha256(utf8('envelope at position 13')));
  const refusalBase = {
    workspace: WORKSPACE,
    credential: PHONE,
    v: 1,
    position: 13,
    digest: refusedDigest,
    epoch: 8,
    reason: 'stale-epoch',
    parent: EMPTY_CHAIN,
  };
  const signRefusal = async (r) =>
    hex(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, refuseMessage(r))));

  const wrongSubject = [];
  for (const [name, patch] of [
    ['refusal-for-another-position', { position: 14 }],
    ['refusal-for-another-digest', { digest: hex(await sha256(utf8('a different envelope'))) }],
    ['refusal-for-another-credential', { credential: LAPTOP }],
    ['refusal-for-another-workspace', { workspace: OTHER_WORKSPACE }],
    ['refusal-for-another-epoch', { epoch: 9 }],
  ]) {
    const r = { ...refusalBase, ...patch };
    wrongSubject.push({ name, refusal: r, signature: await signRefusal(r) });
  }

  // RFC 8032 §7.1 TEST 3's seed: a key no epoch certifies.
  const impostor = await importSigner(
    'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
  );
  const uncertifiedSignature = hex(
    new Uint8Array(
      await crypto.subtle.sign({ name: 'Ed25519' }, impostor, refuseMessage(refusalBase)),
    ),
  );

  // The retired key — epoch 8's certification, rotated away at 9 — signing a
  // perfect subject (A-03's delayed old-key compromise). Genuine, once
  // certified, and currently resolvable to nothing.
  const retiredEpochSignature = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.k_accept_retired.seed),
        refuseMessage(refusalBase),
      ),
    ),
  );

  const doc = {
    $schema: 'https://done.invalid/vectors/antireplay/1',
    generated_by: 'scripts/generate-antireplay-vectors.mjs',
    selection: 'docs/selections/row-6-antireplay-retention.md',
    trd_row: 6,
    construction: {
      admit:
        'Admit an envelope at (credential, n) iff: (1) it verifies, row 4; (2) n == held(c).seq + 1; (3) link_n is computed from the link the client itself holds, row 5; (4) a signed head at position >= n verifies against **that** link rather than the one it carries. Otherwise HOLD — the position or the head is not yet available — or REFUSE. A second link at a position already held needs no fifth condition: it arrives at or below the mark and condition 2 refuses it',
      mint: 'Mint at own_held + 1, reserving the position in a transaction that stages the spool row with it (S0-4 return, FU-10). On a **definite refusal** at n — all five subject fields this envelope’s own, verified under the K_accept the lineage currently certifies — re-mint at the same n under the current epoch; row 4 forbids skipping. On no answer, wait. Re-minting a position that may have been accepted is self-equivocation, and the rule above refuses it permanently on every other device',
      baseline:
        "held(c) starts at the adopted checkpoint's head-vector entry for c, or at (0, 32 zero bytes). Replaying from a checkpoint and replaying from genesis are the same operation, which is what makes a checkpoint a retention floor",
      heads_record:
        'Row 3’s record format with kind = \'heads\', in its own object store under the same store subkey, sharing the content store’s `seq` sequence. plaintext = LP("done/heads/v1") || head_vector, with row 7’s serialization verbatim',
      write_order:
        'The content batch commits first and the heads record after it. A crash between them re-delivers admitted positions, which is idempotent; the reverse order advances the mark past an operation that was never applied, and that operation is then below the baseline forever. Same direction as §6.1’s trim, for the same reason',
      retention: {
        own_outbound_envelopes:
          'Each device retains its own outbound envelopes back to the **second-newest** checkpoint it has seen admitted, not the newest. §11.3 test 8 falls back to the next-newest checkpoint and §14.3 re-envelops this device’s suffix from whichever checkpoint it applied; a device trimmed to the newest cannot supply that. Counting two locally needs no service field and no retention parameter on the wire',
        suffix_beside_a_checkpoint:
          'The durable store retains each retained checkpoint’s suffix from that checkpoint’s head vector forward. Row 7 retains at least two checkpoints, so it retains at least two suffixes',
        local_head_vector:
          'A high-water mark, not a log: one entry per credential, replaced in place. No depth, and no growth beyond the credential count',
      },
      not_here: {
        primitives:
          'SHA-256, HKDF, AES-256-GCM and Ed25519 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        links: 'The link and head constructions are row 5’s and are audited in finalization.json.',
        serialization: 'The head-vector serialization and its digest are row 7’s.',
        envelope: 'The envelope whose digest each link binds is row 4’s.',
      },
    },
    keys: KEYS,
    refusal: {
      why: "§7.4 makes a definite refusal the only license to re-mint a position and requires it be authenticated. Nothing could express one: row 15's transition Outcome names a transition, not an envelope (S0-4, f-745e332-envelope-refusal-carrier-missing). K_accept signs it, because acceptance and refusal are two answers from one decision domain -- a separate refusal key would be an authority that can induce a re-mint without being able to accept anything, and a compromised K_accept can already forge heads.",
      message:
        'Refuse = LP("done/position-refuse/v1") || LP(dec v) || LP(workspace_id) || LP(credential_id) || LP(dec position) || LP(hex refused_digest) || LP(dec epoch) || LP(reason) || LP(hex parent_refusal), signed by K_accept. refusal_id = SHA-256(Refuse). epoch is the refused envelope’s own referenced epoch -- the fifth subject field (FU-06, the S0-4 return).',
      verification:
        "The client resolves K_accept from the epoch in force in its authenticated lineage -- the same certification the acceptance heads resolve through -- never from the answer and never merely from an epoch it once held; then requires all five subject fields to be its own envelope's, the epoch included. A refusal under a retired epoch's key fails the signature; one naming another epoch fails the subject; both are silence (FU-06, A-03, the S0-4 return).",
      permanence:
        'A refusal closes (workspace, credential, position, refused_digest, epoch) forever. A late resubmission is answered with the same Refuse message under the live K_accept: refusal_id binds the message and not the signature, so the licence survives an ordinary rotation. Without permanence a client could re-mint on a refusal and have its original accepted behind it -- two links at one position, which §7.5 reads as a compromised credential.',
      chain:
        "A successor names the refusal_id that licensed it, and that refusal licenses its own position and no other -- a successor at n+1 under a refusal for n is the skipping row 4 forbids. The first attempt at a position names 32 zero bytes. A successor may itself be refused, and nothing caps the chain. Nothing caps the attempts either: RC-4A proposed a sole successor slot per refusal, and every attempt at a position competes for the one digest that position will ever accept, so at most one accepted digest per position already permits only one to win. Removing the slot from the executable model changed no result (S0-4).",
      lineage: {
        tip: 9,
        certified: { 8: KEYS.k_accept_retired.public_key, 9: KEYS.k_accept.public_key },
        note: 'The certification history the client holds (§13.5, ancestor-checked). The verifier is always certified[tip]; the history rows exist so a retired key is a value here rather than a description.',
      },
      refusal: refusalBase,
      signature: await signRefusal(refusalBase),
      wrong_subject: wrongSubject,
      uncertified_signature: uncertifiedSignature,
      uncertified_key: 'RFC 8032 §7.1 TEST 3 -- a key no epoch certifies.',
      retired_epoch_signature: retiredEpochSignature,
      retired_epoch_key: 'KEYS.k_accept_retired -- certified at epoch 8, rotated away at 9. A-03’s delayed old-key compromise signs with exactly this key, and the resolution refuses it.',
    },
    vectors,
    demonstrations: {
      self_equivocation: {
        why: 'The same credential at the same position with a different update, so that “a different link at a held position” is a value rather than a description. Nothing distinguishes this from an attacker holding the credential, which is why an honest client that re-mints without a definite refusal breaks its own chain permanently.',
        position: EQUIVOCATED_7.seq,
        accepted_link: linkAt(EQUIVOCATED_7.seq),
        equivocated_link: equivocated7,
      },
      head_checked_against_its_carried_link: {
        why: '§7.5’s *must not happen*, shown succeeding. A client at a divergent position 11 computes a different link at 12; checking the head against the link the **head** carries admits it anyway, because that check is satisfied by the head being well-formed and says nothing about what the client replayed. The negative `numeric-mark-without-its-link` is the same inputs under the correct check.',
        held: { seq: 11, link_is_actually_position: 10 },
        admitted_link_under_the_defective_check: await link({
          workspace: WORKSPACE,
          credential: PHONE,
          ...PHONE_RUN[11],
          prev: linkAt(10),
        }),
        correct_link_at_12: linkAt(12),
      },
      local_rollback: {
        why: 'An earlier heads record, genuinely sealed under the same subkey and the same AAD shape. It **opens**, and it is published here rather than in must_fail because it does: an AAD authenticates a record and cannot order two valid ones. The bound is in the selection document — a rollback is exploitable only in collusion with a service willing to sign a second link at a held position, which is the bound §7.5 already states for equivocation.',
        earlier_record_seq: 3990,
        earlier_record_nonce: OLD_NONCE,
        earlier_record_ct: hex(earlierCt),
        earlier_body: hex(earlierBody),
      },
    },
    must_fail: NEGATIVES,
  };

  await verify(doc);
  reportAudit(NEGATIVES.map((n) => n.name));

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/antireplay.json is stale. Run: node scripts/generate-antireplay-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('antireplay.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} anti-replay vector and ${NEGATIVES.length} negatives to test/vectors/antireplay.json`,
  );
};

await main();
