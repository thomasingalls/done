/**
 * Test vectors for the attribution-preserving representation (TRD §15 row 8, §13.7).
 *
 * The construction is specified in docs/selections/row-8-attribution-record.md.
 * This script is the executable half of that document: it emits
 * test/vectors/attribution.json.
 *
 * The problem §13.7 states: the attributed actor sits inside the envelope seal,
 * so verifying historical authorship means decrypting historical envelopes, so
 * the product must "retain enough to open every generation whose attribution it
 * still claims — or stop claiming it." With compaction paused (§10.4) nothing
 * retires a claim, so that floor is unbounded in practice.
 *
 * The record below is a standing signed object, minted by the writing
 * credential at card creation and living **in the content root beside the card
 * it attributes**. Two consequences follow, and they are the row:
 *
 *   - §6.1's trim collapses the store to one state record under the *current*
 *     generation, and the records come along. So verifying historical authorship
 *     stops needing historical generations, and §13.7's two retention questions
 *     stop being different sizes — not because they were conflated, but because
 *     one of them shrank to the other.
 *   - A checkpoint containing these records preserves attribution **by
 *     construction**: each claim is still signed by the credential that made it,
 *     and the checkpointing client signs only the container. §7.6's forbidden
 *     shape — one client re-signing everyone's history — becomes unreachable
 *     rather than prohibited.
 *
 * §13.7 warns that copying an original envelope signature beside a newly
 * assembled tuple does not work, because that signature authenticates the
 * original envelope and ciphertext rather than the new tuple. This record is
 * therefore signed over the tuple directly, at write time, by the credential
 * that is making the claim — never assembled later by anyone else.
 *
 * The primitive KATs are not here; Ed25519 and SHA-256 are row 1's.
 *
 * Usage: node scripts/generate-attribution-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/attribution.json', import.meta.url);

const RECORD_LABEL = 'done/attrib/v1';
const BODY_LABEL = 'done/attrib-body/v1';

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

/** Length-prefixed field: uint16be(byteLength) || utf8. Row 3's convention. */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- the construction ------------------------------------------------------------

/**
 * commitment = SHA-256( LP("done/attrib-body/v1") || LP(card_id) || LP(body) )
 *
 * A commitment to the card's body **as created**. It is bound so the claim is
 * falsifiable rather than to make it unforgeable — the card id already does the
 * latter. What it buys is a checkable distinction the product currently cannot
 * draw: `Card.author` answers *who created this* (§4.8), and a card whose body
 * has since been replaced wholesale still shows its creator. With the
 * commitment, a verifier can say which of those it is looking at.
 */
const commit = async (cardId, body) =>
  hex(await sha256(concat(lp(BODY_LABEL), lp(cardId), lp(body))));

/**
 * R = LP("done/attrib/v1") || LP(dec v) || LP(workspace_id) || LP(card_id)
 *     || LP(actor_id) || LP(actor_kind) || LP(credential_id) || LP(dec epoch)
 *     || LP(hex content_commitment)
 *
 * Signed by the **writing** credential, at creation, over the tuple itself.
 *
 * `seq` is deliberately absent, and that absence is a decision rather than an
 * omission — see the selection document. Binding the envelope position would
 * tie verification to row 5's chain, and a binding whose verification forces
 * retention is not free in a row whose entire purpose is to reduce retention.
 */
const recordMessage = ({
  v,
  workspace,
  cardId,
  actorId,
  actorKind,
  credential,
  epoch,
  commitment,
  label = RECORD_LABEL,
}) =>
  concat(
    ...aadFields('attribution record', {
      label,
      v: String(v),
      workspace_id: workspace,
      card_id: cardId,
      actor_id: actorId,
      actor_kind: actorKind,
      credential_id: credential,
      epoch: String(epoch),
      content_commitment: commitment,
    }).map(lp),
  );

// --- keys ---------------------------------------------------------------------

/**
 * RFC 8032 §7.1's keypairs. TEST 2 is the laptop's signing credential; TEST 1 is
 * a second admitted credential, present so "a claim assembled by somebody else"
 * is a vector rather than a sentence — which is §13.7's named failure.
 */
const KEYS = {
  laptop: {
    role: 'The credential that made the claim. §7.4 lets it sign only its own operations, and a claim is one.',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  phone: {
    role: 'Another admitted credential. It may not assemble a claim about the laptop’s write, and cannot.',
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

// --- the scenario ---------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';
const HUMAN = { id: 'act_01HZXQ8H0M4N2P6R9T3V5W7Y1B', kind: 'human' };
const SYSTEM = { id: 'act_system', kind: 'system' };

const LINEAGE = 'ln_01HZXQ7M4K9P2R6T8V0Y3B5N7D';

/**
 * The card's identity, and why it is derived rather than drawn.
 *
 * **The map below cannot enforce this row's write-once rule.** It is a Yjs map:
 * a compromised credential can replace another source's entry with one naming
 * itself, sign the complete tuple with its own valid key, and ship it in its
 * own accepted envelope. It verifies. After trim removes the earlier envelopes
 * a fresh restorer has no prior value and no accepted creation position to
 * refuse it with, and reports the attacker as the verified creator.
 *
 * So the identifier carries the property instead. `card_id` commits to the
 * creating credential, which means **a different credential produces a
 * different id** — there is no replacement claim to make, because a claim
 * naming another creator for this id cannot exist. Nothing has to be retained,
 * ordered or asked, and that is exactly why it survives the trim that defeated
 * the convention.
 *
 * Row 14's alphabet, and 16 bytes because ids were already 128-bit.
 */
const CREATION_LABEL = 'done/creation/v1';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const creationMessage = ({
  v = 1,
  workspace = WORKSPACE,
  lineage = LINEAGE,
  creatorCredential,
  creatorNonce,
}) =>
  concat(
    ...[CREATION_LABEL, String(v), workspace, lineage, creatorCredential, creatorNonce].map(lp),
  );

const cardIdFrom = async (fields) => {
  const digest = (await sha256(creationMessage(fields))).subarray(0, 16);
  let out = '';
  for (const byte of digest) out += CROCKFORD[byte & 0x1f];
  return `card_${out}`;
};

const CREATION = {
  creatorCredential: LAPTOP,
  creatorNonce: '9f'.repeat(16),
};
/** The same person, a second card. Only the nonce differs. */
const CREATION_SECOND = { ...CREATION, creatorNonce: '4c'.repeat(16) };
/** What the phone could mint if it tried to claim authorship of the first. */
const CREATION_FORGED = { ...CREATION, creatorCredential: PHONE };

const CARD = await cardIdFrom(CREATION);
const CARD_BODY = 'Draft the sequencing note';

const CASES = [
  {
    name: 'human-created-card',
    why: 'The ordinary case: a person creates a card on their laptop at epoch 7.',
    v: 1,
    workspace: WORKSPACE,
    cardId: CARD,
    actor: HUMAN,
    credential: LAPTOP,
    epoch: 7,
    body: CARD_BODY,
  },
  {
    name: 'system-actor-import',
    why: 'An imported card, attributed to the system actor (§9.2) and signed by the importing device’s credential. The system actor is not a member and holds no credential of its own (§4.8).',
    v: 1,
    workspace: WORKSPACE,
    cardId: 'card_01HZXQ9J1N5P3R7T0V4X6Z8B3E',
    actor: SYSTEM,
    credential: LAPTOP,
    epoch: 7,
    body: 'Imported from a ten-day export',
  },
  {
    name: 'empty-card',
    why: 'A card created empty and typed into afterwards — the ordinary creation path in this product, and the case where the commitment is expected not to match later.',
    v: 1,
    workspace: WORKSPACE,
    cardId: 'card_01HZXQ9J1N5P3R7T0V4X6Z8B4F',
    actor: HUMAN,
    credential: LAPTOP,
    epoch: 8,
    body: '',
  },
];

const NEGATIVES = [
  {
    name: 'creation-certificate-from-another-credential',
    falsifies: ['f-b997cdb-attribution-self-replacement'],
    why: 'The row, as arithmetic. The phone mints a certificate naming itself as creator of this card -- and it does not name this card, because the id is what its own certificate hashes to. A claim naming another creator for an existing id cannot be constructed, so there is nothing to refuse at the claim layer.',
  },
  {
    name: 'creation-certificate-with-another-nonce',
    why: 'The same credential, a different nonce. It is a different card, which is what lets one person create two.',
  },
  {
    name: 'creation-certificate-signed-by-another-credential',
    falsifies: ['f-b997cdb-attribution-self-replacement'],
    why: "The certificate's own signature, doing its own job: the id proves which credential the certificate names, and the signature proves that credential produced it.",
  },
  {
    name: 'assembled-by-another-credential',
    mutate:
      'The phone signs a claim about a card the laptop created. **This is §13.7’s named failure** — a newly assembled tuple beside somebody else’s work — and it fails because the record is signed over the tuple by the credential making the claim rather than copied from an envelope.',
  },
  {
    name: 'lifted-to-another-card',
    mutate:
      'The laptop’s genuine claim, re-keyed under a different card id. Isolates `card_id`, which is what stops a record being moved to a card its actor never created.',
  },
  {
    name: 'reattributed-actor',
    mutate: 'Change the attributed actor while keeping the signing credential.',
  },
  {
    name: 'reattributed-actor-kind',
    mutate:
      'Change `human` to `system`. A separate field because the kind changes what the UI says and what §4.8 permits, and a claim that moves between kinds is not the same claim.',
  },
  {
    name: 'reattributed-credential',
    mutate:
      'Name a different credential inside a record the laptop signed, **verified under the key that actually signed it**. Holding the verifier fixed is what makes this test the binding: fetching the named credential’s key instead would fail on the key and prove nothing about the field.',
  },
  { name: 'wrong-workspace', mutate: 'Verify the claim against another workspace.' },
  {
    name: 'wrong-epoch',
    mutate:
      'Move the claim to another epoch. The epoch is what a verifier resolves the credential-to-actor authorization against (§13.5), so a movable epoch would let a claim borrow a different roster.',
  },
  {
    name: 'substituted-commitment',
    mutate:
      'Replace the body commitment with one for different text. The commitment makes the claim falsifiable; a substitutable one would make it merely decorative.',
  },
  { name: 'wrong-version', mutate: 'Claim record version 2 for a version-1 record.' },
  {
    name: 'aad-only-renumbered-label',
    isolates: 'attribution record.label',
    mutate:
      'Verify under "done/attrib/v2". The label is where this carrier authenticates its own version (row 1).',
  },
];

// --- what a verifier does ---------------------------------------------------------

/**
 * Verify one claim, and separately report whether it is still *exact*.
 *
 * The two are different questions and the product should not merge them: the
 * signature says a credential made this claim, and the commitment says whether
 * the card still holds what was claimed about. A card edited after creation has
 * a valid claim and an inexact one, and that is the honest reading of
 * card-creation attribution rather than a defect in it.
 */
const verifyClaim = async ({ record, signature, verifier, currentBody = null }) => {
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signature),
    recordMessage(record),
  );
  if (!ok) throw new Error('attribution record does not verify');
  if (currentBody === null) return { verified: true, exact: null };
  return {
    verified: true,
    exact: (await commit(record.cardId, currentBody)) === record.commitment,
  };
};

// --- verification ------------------------------------------------------------------

const verify = async (doc) => {
  const verifier = await importVerifier(KEYS.laptop.public_key);

  // Positive: every record verifies, and an unedited card reads as exact.
  for (const c of CASES) {
    const v = doc.vectors.find((x) => x.name === c.name);
    const record = {
      ...c,
      actorId: c.actor.id,
      actorKind: c.actor.kind,
      commitment: v.derived.content_commitment,
    };
    const got = await verifyClaim({
      record,
      signature: v.expected.signature,
      verifier,
      currentBody: c.body,
    });
    if (!got.exact)
      throw new Error(`Vector "${c.name}" should read as exact against its own body.`);
  }

  // And the case the commitment exists for: a card edited since creation still
  // verifies and stops being exact. This is a result, not a failure.
  const base = doc.vectors.find((x) => x.name === 'human-created-card');
  const record = {
    ...CASES[0],
    actorId: HUMAN.id,
    actorKind: HUMAN.kind,
    commitment: base.derived.content_commitment,
  };
  const edited = await verifyClaim({
    record,
    signature: base.expected.signature,
    verifier,
    currentBody: 'Draft the sequencing note, then book the review',
  });
  if (!edited.verified || edited.exact) {
    throw new Error('An edited card must verify and must not read as exact.');
  }

  const ok = { record, signature: base.expected.signature, verifier };

  // §13.7's named failure: a claim assembled by somebody other than its author.
  await refuses('assembled-by-another-credential', async () => {
    const forged = hex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          await importSigner(KEYS.phone.seed),
          recordMessage(record),
        ),
      ),
    );
    await verifyClaim({ ...ok, signature: forged });
  });
  // `credential_id` changed and nothing else, **verified under the key that
  // actually signed**. Holding the verifier fixed is what makes this isolating:
  // fetching the phone's key to check a record the laptop signed fails on the
  // key rather than on the binding, which is the two-changes-at-once defect
  // docs/decisions.md adopted the coverage rule against — and which the audit
  // caught here on the first pass.

  for (const [name, patch] of [
    ['reattributed-credential', { credential: PHONE }],
    ['lifted-to-another-card', { cardId: 'card_01HZXQ9J1N5P3R7T0V4X6Z8B9Z' }],
    ['reattributed-actor', { actorId: 'act_01HZXQ8H0M4N2P6R9T3V5W7Y2C' }],
    ['reattributed-actor-kind', { actorKind: 'system' }],
    ['wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['wrong-epoch', { epoch: 8 }],
    ['substituted-commitment', { commitment: await commit(CARD, 'Something else entirely') }],
    ['wrong-version', { v: 2 }],
    ['aad-only-renumbered-label', { label: 'done/attrib/v2' }],
  ]) {
    await refuses(name, () => verifyClaim({ ...ok, record: { ...record, ...patch } }));
  }

  // --- the identity, and the replacement that cannot be built --------------------

  const creationSigner = await importSigner(KEYS.laptop.seed);
  const creationSig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, creationSigner, creationMessage(CREATION)),
  );

  // The id recomputes, which is the check every reader performs and the reason
  // no prior value or retained event is needed.
  if ((await cardIdFrom(CREATION)) !== CARD) throw new Error('the card id does not recompute.');
  if (
    !(await crypto.subtle.verify(
      { name: 'Ed25519' },
      verifier,
      creationSig,
      creationMessage(CREATION),
    ))
  ) {
    throw new Error('the creation certificate does not verify under its named creator.');
  }

  /**
   * **This is the finding, and it is now unbuildable rather than refused.**
   *
   * Under the superseded scheme the phone could mint a valid claim for this
   * card naming itself, and after trim nothing could contradict it. It still
   * can mint a valid certificate -- but the certificate hashes to a *different
   * id*, so what it produces is a different card rather than a replacement.
   */
  const forgedId = await cardIdFrom(CREATION_FORGED);
  await refuses('creation-certificate-from-another-credential', async () => {
    if (forgedId === CARD) return; // would be a successful replacement
    throw new Error(`a different creator yields a different card: ${forgedId}`);
  });

  const secondId = await cardIdFrom(CREATION_SECOND);
  await refuses('creation-certificate-with-another-nonce', async () => {
    if (secondId === CARD) return;
    throw new Error(`a different nonce yields a different card: ${secondId}`);
  });

  await refuses('creation-certificate-signed-by-another-credential', async () => {
    const wrong = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.phone.seed),
        creationMessage(CREATION),
      ),
    );
    if (
      !(await crypto.subtle.verify({ name: 'Ed25519' }, verifier, wrong, creationMessage(CREATION)))
    ) {
      throw new Error('certificate signed by the wrong credential');
    }
  });

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

// --- assembly -----------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();
  const signer = await importSigner(KEYS.laptop.seed);

  // The creation certificate, published below and re-derived independently by
  // `verify`, so a drift between the two is a failure rather than a value
  // copied from one place to the other.
  const creationSig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, signer, creationMessage(CREATION)),
  );
  const forgedId = await cardIdFrom(CREATION_FORGED);
  const secondId = await cardIdFrom(CREATION_SECOND);

  const vectors = [];
  for (const c of CASES) {
    const commitment = await commit(c.cardId, c.body);
    const record = {
      ...c,
      actorId: c.actor.id,
      actorKind: c.actor.kind,
      commitment,
    };
    const message = recordMessage(record);
    vectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        v: c.v,
        workspace_id: c.workspace,
        card_id: c.cardId,
        actor_id: c.actor.id,
        actor_kind: c.actor.kind,
        credential_id: c.credential,
        epoch: c.epoch,
        body_at_creation: c.body,
      },
      derived: { content_commitment: commitment, message: hex(message) },
      expected: {
        signature: hex(
          new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, message)),
        ),
      },
    });
  }

  const doc = {
    $schema: 'https://done.invalid/vectors/attribution/1',
    generated_by: 'scripts/generate-attribution-vectors.mjs',
    selection: 'docs/selections/row-8-attribution-record.md',
    trd_row: 8,
    construction: {
      shape:
        'A standing signed claim, minted by the writing credential at card creation, living in the content root beside the card it attributes',
      record:
        'Ed25519( writing credential ; LP("done/attrib/v1") || LP(dec v) || LP(workspace_id) || LP(card_id) || LP(actor_id) || LP(actor_kind) || LP(credential_id) || LP(dec epoch) || LP(hex content_commitment) )',
      commitment: 'SHA-256( LP("done/attrib-body/v1") || LP(card_id) || LP(body at creation) )',
      residence:
        'In the content root, in a write-once map keyed by card id. §7.6 already requires attribution evidence to be portable workspace material that is checkpointed, stored and restored with the workspace rather than a separate operator archive — this is that, at the cheapest possible cost',
      why_no_seq:
        'The envelope position is deliberately not bound. Verifying it would tie every claim to row 5’s chain and therefore force chain retention, and a binding whose verification forces retention is not free in a row whose purpose is to reduce retention. Acceptance is already implied: a record only reaches the content root through an accepted envelope',
      two_questions:
        'The signature says a credential made this claim. The commitment says whether the card still holds what was claimed about. A card edited after creation verifies and is not exact, which is the honest reading of card-creation attribution rather than a defect in it',
      storage_bound:
        'One record per card, minted once, never updated. Attribution costs a constant multiple of what the cards already cost and retires on exactly the event §4.5 already says retires it — a card’s deletion under compaction',
      retention_effect:
        '§6.1’s trim collapses the store to one state record under the current generation and the records come with it, so verifying historical authorship stops requiring historical generations. §13.7’s two retention questions stop being different sizes',
      not_here: {
        primitives: 'Ed25519 and SHA-256 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        checkpoint: 'How these records travel in a checkpoint is row 7.',
        retirement:
          'What retires a claim is §4.5’s compaction, and the replica-acknowledgement protocol it waits on is §10.4’s.',
      },
    },
    keys: KEYS,
    vectors,
    creation_identity: {
      why: "Row 8 puts standing claims in a write-once map in the content root, and a Yjs map cannot enforce write-once -- that is an application convention, not an authority. A compromised credential replaces another source's entry with one naming itself, signs the complete tuple with its own valid key, and after trim a fresh restorer has no prior value to refuse it with. The identifier carries the property instead.",
      certificate:
        'C = LP("done/creation/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(creator_credential) || LP(hex creator_nonce)',
      card_id: 'the first 16 bytes of SHA-256(C), Crockford Base32',
      creator: LAPTOP,
      nonce: CREATION.creatorNonce,
      message_hex: hex(creationMessage(CREATION)),
      signature: hex(creationSig),
      derived: CARD,
      the_replacement_that_cannot_be_built: {
        note: "The phone mints a perfectly valid certificate claiming authorship. It does not name this card, because this id is what the laptop's certificate hashes to -- so what it produces is a different card rather than a replacement. Nothing is refused at the claim layer; there is nothing to refuse.",
        forged_by: PHONE,
        yields: forgedId,
      },
      one_creator_two_cards: {
        note: 'Only the nonce differs, which is what lets one person create more than one card.',
        second: secondId,
      },
      expected:
        'a different creator and a different nonce each yield a different card id; neither can replace the first',
    },
    must_fail: NEGATIVES,
  };

  await verify(doc);
  reportAudit(NEGATIVES);

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/attribution.json is stale. Run: node scripts/generate-attribution-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('attribution.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} attribution records and ${NEGATIVES.length} negatives to test/vectors/attribution.json`,
  );
};

await main();
