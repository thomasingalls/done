/**
 * Test vectors for the finalization shape (TRD §15 row 5, §7.5).
 *
 * The construction is specified in docs/selections/row-5-finalization.md. This
 * script is the executable half of that document: it emits
 * test/vectors/finalization.json, which the service and Stage 4's client must
 * reproduce byte for byte.
 *
 * Two objects, and the split is the whole design:
 *
 *   - The *link* is client-recomputable and unsigned. Every accepted envelope
 *     advances one per-credential hash chain, so position n cannot exist
 *     without position n-1. That is what a per-envelope receipt cannot do: a
 *     hostile relay may show any subset of independent receipts, and no subset
 *     of a chain is a chain.
 *   - The *head* is one Ed25519 signature over a link at a position, plus the
 *     flag that makes it a finalization boundary. Heads are amortized over a
 *     batch, so the chain is what makes evidence-on-every-envelope affordable.
 *
 * **The client never verifies a head against the link the head claims.** It
 * replays its own chain and asks whether the service's signature covers the
 * link it computed itself. A head field is therefore only ever checked by the
 * signature, which is what lets the coverage audit isolate every one of them.
 *
 * The primitive KATs are not here. SHA-256 and Ed25519 are row 1's, and their
 * published vectors live in test/vectors/algorithm-suite.json; what this file
 * carries is composition, which is where a construction on correct primitives
 * still goes wrong.
 *
 * Usage: node scripts/generate-finalization-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/finalization.json', import.meta.url);

const LINK_LABEL = 'done/accept/v1';
const HEAD_LABEL = 'done/accept-head/v1';

/** The empty chain. Position 1 binds the label, workspace and credential itself. */
const EMPTY_CHAIN = '0000000000000000000000000000000000000000000000000000000000000000';

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

/**
 * Length-prefixed field: uint16be(byteLength) || utf8.
 *
 * Row 3 established this and the reason travels unchanged: a delimiter-joined
 * encoding is not injective, so a credential id containing the delimiter shifts
 * every field after it and two different positions can encode to the same
 * bytes. Injectivity is the only property a bound field list needs.
 */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- the two constructions -----------------------------------------------------

/**
 * link_n = SHA-256( LP(label) || LP(workspace) || LP(credential) || LP(dec n)
 *                   || LP(dec epoch) || LP(hex digest) || LP(hex link_{n-1}) )
 *
 * The field list goes through aadFields so scripts/check-aad-coverage.mjs can
 * remove one field at a time and prove a negative below is testing it. The
 * encoding stays here, because it is what the selection document specifies.
 *
 * `digest` is the envelope's update digest, which §7.4 already puts in the
 * clear for the relay to validate. The chain adds no new cleartext field.
 */
const link = async ({ workspace, credential, seq, epoch, digest, prev, label = LINK_LABEL }) =>
  hex(
    await sha256(
      concat(
        ...aadFields('accepted link', {
          label,
          workspace_id: workspace,
          credential_id: credential,
          seq: String(seq),
          epoch: String(epoch),
          digest,
          prev,
        }).map(lp),
      ),
    ),
  );

/**
 * The signed head's message. One signature covers a link at a position, and the
 * chain reaches back from there, so it covers every position beneath it.
 *
 * `final` is bound because it is the finalization boundary itself. A head that
 * can be re-presented with the flag changed lets a hostile relay either freeze
 * a still-authorized credential or keep a revoked one's writes admissible.
 */
const headMessage = ({ workspace, credential, seq, link: lnk, epoch, final, label = HEAD_LABEL }) =>
  concat(
    ...aadFields('accepted head', {
      label,
      workspace_id: workspace,
      credential_id: credential,
      seq: String(seq),
      link: lnk,
      epoch: String(epoch),
      final: final ? 'true' : 'false',
    }).map(lp),
  );

// --- the service signing key ---------------------------------------------------

/**
 * RFC 8032 §7.1's published keypairs, so a reader can check the halves belong
 * together rather than trusting the file. TEST 2 signs; TEST 1 is the impostor.
 *
 * Row 14 established the rule this follows: a vector binding a public key to a
 * private one proves nothing if the vector's own halves are unrelated, so the
 * generator proves each pair to itself and refuses to write the file otherwise.
 */
const KEYS = {
  service: {
    role: 'The acceptance-signing key. Hot, because it signs on the delivery path.',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  impostor: {
    role: 'Not the service. Present so "signed by the wrong key" is a vector rather than a sentence.',
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

/** Prove each published pair is one keypair, or refuse to write the file. */
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

// --- the scenario --------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';

/**
 * Three accepted envelopes from the laptop across an epoch boundary, and one
 * from the phone at the same position in its own chain.
 *
 * The phone's entry is the point of the per-credential split: same workspace,
 * same position, same digest, different chain. §7.5 requires non-equivocation
 * *per credential*, and one global sequence would make one slow device's gap
 * into everyone's gap.
 */
const LAPTOP_CHAIN = [
  {
    name: 'first-accepted',
    why: 'Position 1 of a fresh credential. `prev` is the empty chain, so the first link still binds label, workspace and credential.',
    seq: 1,
    epoch: 7,
    digest: '9f2c4e6a08b1d3f57902a4c6e8b0d2f4160738a5c9eb2d4f6081a3c5e7092b4d',
  },
  {
    name: 'second-accepted',
    why: 'Position 2, same epoch. The link is the only thing carrying the fact that position 1 exists.',
    seq: 2,
    epoch: 7,
    digest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  },
  {
    name: 'across-an-epoch',
    why: 'Position 3 references epoch 8. A genuine late-arriving old-epoch update is legitimate (§7.5), so epoch is bound per position rather than per chain.',
    seq: 3,
    epoch: 8,
    digest: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  },
];

const PHONE_CHAIN = [
  {
    name: 'other-credential-same-position',
    why: 'The phone at its own position 1, carrying the laptop’s position-1 digest. Same workspace, same position, same bytes, different chain.',
    seq: 1,
    epoch: 7,
    digest: '9f2c4e6a08b1d3f57902a4c6e8b0d2f4160738a5c9eb2d4f6081a3c5e7092b4d',
  },
];

const NEGATIVES = [
  // The link: every field bound in it, one at a time, against a correct head.
  {
    name: 'wrong-workspace',
    mutate:
      'Replay the chain under a different workspace id. An envelope accepted in one workspace is not evidence in another.',
  },
  {
    name: 'wrong-credential',
    mutate:
      'Replay the laptop’s chain as the phone’s. Chains are per credential, so a position in one is not a position in the other.',
  },
  {
    name: 'wrong-sequence',
    mutate: 'Replay position 2 as position 3. A link cannot be moved along its own chain.',
  },
  {
    name: 'wrong-epoch',
    mutate:
      'Replay position 2 under epoch 8. This is the field §7.5 says the epoch alone cannot carry, so it is bound where acceptance is recorded instead.',
  },
  {
    name: 'wrong-digest',
    mutate:
      'Replay position 2 over a different update digest. Substituting the envelope under an accepted position is what the digest binding exists for.',
  },
  {
    name: 'reordered-chain',
    mutate:
      'Compute position 3 over position 1’s link, skipping position 2. Isolates `prev`, the only field that makes the chain a chain.',
  },
  {
    name: 'renumbered-link-label',
    mutate:
      'Replay under "done/accept/v2". The label is where this carrier authenticates its own version, so a renumbered chain must fail to verify rather than select another suite (row 1). **Deliberately not named `aad-only-`**: no link-layer negative can isolate one field, because eliding the head’s `link` rescues every one of them. That is the pin between the two layers, not a coverage gap — see the selection document.',
  },

  // The head: one signature, and every field it commits to.
  {
    name: 'head-signed-by-impostor',
    mutate:
      'A well-formed head over the correct link, signed with RFC 8032 TEST 1’s key instead of the service key.',
  },
  {
    name: 'head-wrong-sequence',
    mutate:
      'Verify the head as though it were signed at position 3. Isolates the head’s `seq`, which is what bounds how far the evidence reaches.',
  },
  {
    name: 'head-wrong-link',
    mutate:
      'The service signed a head over a different link at this position. The client verifies against the link it replayed itself, so the signature does not open.',
  },
  { name: 'head-wrong-workspace', mutate: 'Verify the head under a different workspace id.' },
  {
    name: 'head-wrong-credential',
    mutate:
      'Verify the laptop’s head as the phone’s. A head is per credential for the same reason the chain is.',
  },
  { name: 'head-wrong-epoch', mutate: 'Verify the head under a different epoch.' },
  {
    name: 'head-final-flag-flipped',
    mutate:
      'Verify the live head as though it were final. **This is the finalization boundary itself**: flipped one way it freezes a still-authorized credential, the other way it keeps a revoked one’s writes admissible.',
  },
  {
    name: 'aad-only-renumbered-head-label',
    isolates: 'accepted head.label',
    mutate: 'Verify the head under "done/accept-head/v2".',
  },

  // Two client rules, which are not field bindings. They are asserted here
  // because a rule nobody runs is a sentence.
  {
    name: 'forked-link-at-same-position',
    mutate:
      'A second, properly signed head over a different link at a position the client already holds. First-seen-wins per (credential, position) refuses it — the service equivocated, and a valid signature is not an answer to that.',
  },
  {
    name: 'envelope-beyond-signed-head',
    mutate:
      'Position 3 offered with only the head signed at position 2. Evidence is required on every applied envelope (§7.5), so this one is held rather than applied.',
  },
];

// --- what a client does --------------------------------------------------------

/**
 * Replay a chain from the empty chain forward. `patch(i)` supplies per-position
 * overrides, which is how every link negative below is expressed: one field,
 * one position, everything else untouched.
 */
const replay = async (entries, credential, patch = () => ({})) => {
  let prev = EMPTY_CHAIN;
  const links = [];
  for (const [i, e] of entries.entries()) {
    prev = await link({
      workspace: WORKSPACE,
      credential,
      seq: e.seq,
      epoch: e.epoch,
      digest: e.digest,
      prev,
      ...patch(i),
    });
    links.push(prev);
  }
  return links;
};

/**
 * Verify a signed head **against the link the client replayed**, never against
 * the link the head claims. Throws unless the service signed exactly this.
 */
const verifyHead = async (head, clientLink, signature, verifier) => {
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signature),
    headMessage({ ...head, link: clientLink }),
  );
  if (!ok) throw new Error('the signed head does not cover the link this client replayed');
};

/**
 * The two client rules that are not signature checks, kept in one place because
 * a rule split across three call sites has three chances to be wrong.
 */
const admissible = ({ credential, seq, computedLink, headSeq, held = new Map() }) => {
  const at = held.get(`${credential}/${seq}`);
  if (at !== undefined && at !== computedLink) {
    throw new Error('equivocation: a different link is already held at this position');
  }
  if (headSeq < seq) throw new Error('no signed head reaches this position');
};

// --- verification --------------------------------------------------------------

const verify = async (doc) => {
  const verifier = await importVerifier(KEYS.service.public_key);
  const links = await replay(LAPTOP_CHAIN, LAPTOP);

  // Positive: the published chain replays, and each published head verifies
  // against the link a client would have computed for itself.
  for (const [i, e] of LAPTOP_CHAIN.entries()) {
    if (doc.vectors.find((v) => v.name === e.name).expected.link !== links[i]) {
      throw new Error(`Vector "${e.name}" link does not replay.`);
    }
  }
  for (const h of doc.heads) {
    await verifyHead(h.head, links[h.head.seq - 1], h.signature, verifier);
  }

  const live = doc.heads.find((h) => h.name === 'live-head-at-2');
  const finalHead = doc.heads.find((h) => h.name === 'finalized-head-at-3');

  // --- link negatives: correct head throughout, one bound field changed --------

  for (const [name, patch] of [
    ['wrong-workspace', () => ({ workspace: 'ws_01J0000000000000000000000A' })],
    ['wrong-credential', () => ({ credential: PHONE })],
    ['wrong-sequence', (i) => (i === 1 ? { seq: 3 } : {})],
    ['wrong-epoch', (i) => (i === 1 ? { epoch: 8 } : {})],
    ['wrong-digest', (i) => (i === 1 ? { digest: LAPTOP_CHAIN[2].digest } : {})],
    ['renumbered-link-label', () => ({ label: 'done/accept/v2' })],
  ]) {
    await refuses(name, async () => {
      const forged = await replay(LAPTOP_CHAIN, LAPTOP, patch);
      await verifyHead(live.head, forged[1], live.signature, verifier);
    });
  }

  await refuses('reordered-chain', async () => {
    const skipped = await link({
      workspace: WORKSPACE,
      credential: LAPTOP,
      seq: LAPTOP_CHAIN[2].seq,
      epoch: LAPTOP_CHAIN[2].epoch,
      digest: LAPTOP_CHAIN[2].digest,
      prev: links[0],
    });
    await verifyHead(finalHead.head, skipped, finalHead.signature, verifier);
  });

  // --- head negatives ----------------------------------------------------------

  const forgedSig = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.impostor.seed),
        headMessage({ ...live.head, link: links[1] }),
      ),
    ),
  );
  await refuses('head-signed-by-impostor', () =>
    verifyHead(live.head, links[1], forgedSig, verifier),
  );

  for (const [name, patch] of [
    ['head-wrong-sequence', { seq: 3 }],
    ['head-wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['head-wrong-credential', { credential: PHONE }],
    ['head-wrong-epoch', { epoch: 99 }],
    ['head-final-flag-flipped', { final: !live.head.final }],
    ['aad-only-renumbered-head-label', { label: 'done/accept-head/v2' }],
  ]) {
    await refuses(name, () =>
      verifyHead({ ...live.head, ...patch }, links[1], live.signature, verifier),
    );
  }

  // The service signs a head over a link the client did not compute. Isolating
  // the head's own `link` field needs the signature to be genuine, so it is
  // made here rather than reused from the published set.
  await refuses('head-wrong-link', async () => {
    const other = await link({
      workspace: WORKSPACE,
      credential: LAPTOP,
      seq: 2,
      epoch: 7,
      digest: LAPTOP_CHAIN[2].digest,
      prev: links[0],
    });
    const signature = hex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          await importSigner(KEYS.service.seed),
          headMessage({ ...live.head, link: other }),
        ),
      ),
    );
    await verifyHead(live.head, links[1], signature, verifier);
  });

  // --- the two client rules -----------------------------------------------------

  await refuses('forked-link-at-same-position', async () => {
    const forked = await replay(LAPTOP_CHAIN, LAPTOP, (i) =>
      i === 1 ? { digest: LAPTOP_CHAIN[2].digest } : {},
    );
    admissible({
      credential: LAPTOP,
      seq: 2,
      computedLink: forked[1],
      headSeq: 2,
      held: new Map([[`${LAPTOP}/2`, links[1]]]),
    });
  });

  await refuses('envelope-beyond-signed-head', () =>
    admissible({ credential: LAPTOP, seq: 3, computedLink: links[2], headSeq: live.head.seq }),
  );

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

// --- assembly ------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();

  const signer = await importSigner(KEYS.service.seed);
  const links = await replay(LAPTOP_CHAIN, LAPTOP);
  const phoneLinks = await replay(PHONE_CHAIN, PHONE);

  const vectors = [
    ...LAPTOP_CHAIN.map((e, i) => ({
      name: e.name,
      why: e.why,
      inputs: {
        workspace_id: WORKSPACE,
        credential_id: LAPTOP,
        seq: e.seq,
        epoch: e.epoch,
        digest: e.digest,
        prev: i === 0 ? EMPTY_CHAIN : links[i - 1],
      },
      expected: { link: links[i] },
    })),
    ...PHONE_CHAIN.map((e, i) => ({
      name: e.name,
      why: e.why,
      inputs: {
        workspace_id: WORKSPACE,
        credential_id: PHONE,
        seq: e.seq,
        epoch: e.epoch,
        digest: e.digest,
        prev: i === 0 ? EMPTY_CHAIN : phoneLinks[i - 1],
      },
      expected: { link: phoneLinks[i] },
    })),
  ];

  const heads = [];
  for (const h of [
    {
      name: 'live-head-at-2',
      why: 'One signature covering positions 1 and 2. This is the amortization: the chain reaches back, so the service need not sign every position.',
      head: {
        workspace: WORKSPACE,
        credential: LAPTOP,
        seq: 2,
        link: links[1],
        epoch: 7,
        final: false,
      },
    },
    {
      name: 'finalized-head-at-3',
      why: 'The cutoff. `final: true` says no position above 3 will ever be accepted for this credential, which is one third of what revocation commits (§7.5).',
      head: {
        workspace: WORKSPACE,
        credential: LAPTOP,
        seq: 3,
        link: links[2],
        epoch: 8,
        final: true,
      },
    },
  ]) {
    const message = headMessage(h.head);
    heads.push({
      ...h,
      derived: { message: hex(message) },
      signature: hex(
        new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, message)),
      ),
    });
  }

  const doc = {
    $schema: 'https://done.invalid/vectors/finalization/1',
    generated_by: 'scripts/generate-finalization-vectors.mjs',
    selection: 'docs/selections/row-5-finalization.md',
    trd_row: 5,
    construction: {
      shape: 'Append-only per-credential accepted chain, with amortized service-signed heads',
      link: 'SHA-256( LP("done/accept/v1") || LP(workspace_id) || LP(credential_id) || LP(dec seq) || LP(dec epoch) || LP(hex digest) || LP(hex prev) )',
      empty_chain: '32 zero bytes. Position 1 binds label, workspace and credential itself.',
      head: 'Ed25519 over LP("done/accept-head/v1") || LP(workspace_id) || LP(credential_id) || LP(dec seq) || LP(hex link) || LP(dec epoch) || LP("true"|"false")',
      signing_key:
        'A separate acceptance-signing key, certified by the authorization key in the epoch it appears in. It is hot because it signs on the delivery path; the epoch key need not be.',
      length_prefix: 'uint16be(byteLength) || utf8 — injective, so no field can shift another',
      client_rules: [
        'Verify a head against the link you replayed yourself, never the link the head claims.',
        'Admit no envelope without a signed head at or above its position.',
        'First-seen-wins per (credential, position). A second link at a held position is equivocation, and a valid signature is not an answer to it.',
        'Above the newest head, hold rather than discard. Missing evidence is availability, not integrity (§7.5).',
      ],
      not_here: {
        primitives: 'SHA-256 and Ed25519 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        wire: 'How a link and a head travel beside an envelope is row 4’s framing.',
        retention: 'How deep a device keeps its own chain is row 6.',
        checkpoint:
          'The head vector a checkpoint manifest carries is §7.6’s, and its construction is row 7.',
      },
    },
    keys: KEYS,
    vectors,
    heads,
    must_fail: NEGATIVES,
  };

  await verify(doc);
  reportAudit(NEGATIVES);

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/finalization.json is stale. Run: node scripts/generate-finalization-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('finalization.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} chain vectors, ${heads.length} heads and ${NEGATIVES.length} negatives to test/vectors/finalization.json`,
  );
};

await main();
