/**
 * Test vectors for checkpoint construction and its manifest (TRD §15 row 7, §7.6).
 *
 * The construction is specified in docs/selections/row-7-checkpoint.md. This
 * script is the executable half of that document: it emits
 * test/vectors/checkpoint.json.
 *
 * §7.6 sets three constraints and this row satisfies them in three different
 * ways, which is worth knowing before reading the fields:
 *
 *   - **"No merged state as the recovery representation."** The checkpoint is a
 *     full snapshot sealed under one generation, and the manifest is what makes
 *     it usable without the store understanding any of it.
 *   - **"No bare state vector as a coverage claim."** A Yjs state vector maps
 *     client to clock over insertions; deletions live in the DeleteSet. Two
 *     replicas can agree on `sv` and disagree about what was deleted, so the
 *     manifest binds both halves and a negative below proves `ds` is bound
 *     independently rather than incidentally.
 *   - **"No checkpoint that re-signs another credential's operations."** This
 *     one is discharged by row 8 rather than here: attribution is a set of
 *     standing records each signed by its own author, living in the content the
 *     checkpoint snapshots. The producing credential signs the container and
 *     nothing inside it, so §7.6's forbidden shape is unreachable rather than
 *     prohibited.
 *
 * `sv` and `ds` are bound as **opaque byte strings**. That is deliberate: their
 * content is Yjs's, and §10.1 has a deferred v13 → v14 upgrade that would change
 * it. Binding them opaquely means that upgrade changes what the bytes say and
 * not what this construction is.
 *
 * The primitive KATs are not here; Ed25519, SHA-256, HKDF and AES-256-GCM are
 * row 1's.
 *
 * Usage: node scripts/generate-checkpoint-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/checkpoint.json', import.meta.url);

const HKDF_LABEL = 'done/checkpoint/v1';
const CP_AAD_LABEL = 'done/cp/v1';
const MANIFEST_LABEL = 'done/cp-manifest/v1';
const HEADVEC_LABEL = 'done/headvec/v1';

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

// --- the constructions ------------------------------------------------------------

/**
 * K_cp = HKDF-SHA256(ikm = K_g, salt = "", info = LP(label) || LP(workspace), L = 32)
 *
 * A fifth §13.2 subkey, differing from the store, journal and envelope subkeys
 * only by label — which is what keeps that separation a property of the labels
 * rather than of five constructions a reviewer compares by hand.
 */
const deriveCheckpointKey = async (kg, workspaceId) => {
  const ikm = await crypto.subtle.importKey('raw', kg, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: concat(lp(HKDF_LABEL), lp(workspaceId)),
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
 * The sealed checkpoint's AAD. Row 3's rule at a fourth carrier: the cleartext a
 * reader trusts before it has opened anything.
 */
const checkpointAad = ({ v, workspace, gen, epoch, label = CP_AAD_LABEL }) =>
  concat(
    ...aadFields('checkpoint aad', {
      label,
      v: String(v),
      workspace_id: workspace,
      gen: String(gen),
      epoch: String(epoch),
    }).map(lp),
  );

/**
 * head_vector = for each credential, ascending by id:
 *                 LP(credential_id) || LP(dec seq) || LP(hex link)
 *
 * The sort is the canonicalization and it is load-bearing: two devices producing
 * a checkpoint over the same accepted state must produce the same digest, and a
 * map iterated in insertion order would not. A negative below reorders it.
 *
 * This is row 5's accepted-head vector, which §7.5 also puts in the epoch
 * payload. The checkpoint carries it so a device starting here verifies the
 * suffix forward from authenticated heads instead of replaying from genesis.
 */
const headVector = (heads) =>
  concat(
    ...[...heads]
      .sort((a, b) => (a.credential < b.credential ? -1 : a.credential > b.credential ? 1 : 0))
      .flatMap((h) => [lp(h.credential), lp(String(h.seq)), lp(h.link)]),
  );

const headVectorDigest = async (heads) =>
  hex(await sha256(concat(lp(HEADVEC_LABEL), headVector(heads))));

/**
 * The manifest's signed message.
 *
 * `sv` and `ds` are both bound, and separately, because §7.6 is explicit that a
 * bare state vector is not a coverage claim. `epoch_head` joins `epoch` on
 * row 9's reasoning: the head commits to the number, and binding both means a
 * current-looking number cannot be paired with an older head.
 */
const manifestMessage = ({
  v,
  workspace,
  epoch,
  epochHead,
  gen,
  checkpointDigest,
  sv,
  ds,
  headVecDigest,
  credential,
  label = MANIFEST_LABEL,
}) =>
  concat(
    ...aadFields('checkpoint manifest', {
      label,
      v: String(v),
      workspace_id: workspace,
      epoch: String(epoch),
      epoch_head: epochHead,
      gen: String(gen),
      checkpoint_digest: checkpointDigest,
      sv,
      ds,
      head_vector_digest: headVecDigest,
      producing_credential: credential,
    }).map(lp),
  );

// --- keys ---------------------------------------------------------------------------

const KEYS = {
  producer: {
    role: 'The credential that produced this checkpoint. It signs the container and nothing inside it.',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  other_credential: {
    role: 'Another admitted credential, present so "produced by somebody else" is a vector rather than a sentence.',
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

// --- the scenario ---------------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const EPOCH_HEAD = '2b7f0a9c14e6d3850fa2c51e86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36';

/**
 * A Yjs snapshot's two coverage halves, as opaque bytes — see the file header.
 * The second delete set shares the first's state vector, which is exactly the
 * pair §7.6 says a bare state vector cannot distinguish.
 */
const SV = '01a8e0c9d20503b1c4f70a02';
const DS = '02a8e0c9d2050107b1c4f70a0304';
const DS_MORE_DELETED = '02a8e0c9d2050109b1c4f70a0306';
const SV_AHEAD = '01a8e0c9d20507b1c4f70a02';

const HEADS = [
  {
    credential: PHONE,
    seq: 4,
    link: '7f3e1d0c9b8a5647382910fedcba98765432100fedcba9876543210fedcba987',
  },
  {
    credential: LAPTOP,
    seq: 12,
    link: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  },
];

const SNAPSHOT = utf8(
  'a Yjs full snapshot of the content root, including row 8’s attribution records',
);

const BASE = {
  v: 1,
  workspace: WORKSPACE,
  epoch: 9,
  epochHead: EPOCH_HEAD,
  gen: 3,
  credential: LAPTOP,
};
const NONCE = '404142434445464748494a4b';

const NEGATIVES = [
  {
    name: 'coverage-ignores-deletions',
    mutate:
      'A manifest whose delete set differs while its state vector is identical. **This is §7.6’s stated failure as a vector**: two replicas can agree on `sv` and disagree about what has been deleted, so a bare state vector is not a coverage claim and `ds` has to be bound on its own.',
  },
  {
    name: 'coverage-ignores-insertions',
    mutate:
      'The same manifest with a different state vector and the same delete set — the mirror of the negative above. Both halves are bound independently, so neither can be moved against the other, and the pair is published as a pair because §7.6’s point is that one of them alone is not a coverage claim.',
  },
  {
    name: 'substituted-checkpoint-digest',
    mutate:
      'The manifest’s own digest field altered while the bytes beside it are untouched — a manifest pointing at a checkpoint nobody signed for. Distinct from `substituted-checkpoint`, which is the store’s keyless hash check: this is the signature, and only it survives a store that does not run the check.',
  },
  {
    name: 'reordered-head-vector',
    mutate:
      'Serialize the accepted-head vector in insertion order rather than ascending by credential id. Isolates `head_vector_digest`, and the sort is what makes two devices checkpointing the same state agree.',
  },
  {
    name: 'produced-by-another-credential',
    mutate:
      'A well-formed manifest signed by a different admitted credential. The producing credential is named in the message, so this fails on the binding and not only on the key.',
  },
  {
    name: 'substituted-checkpoint',
    mutate:
      'A manifest paired with checkpoint bytes it does not digest. The durable store can check this without a content key, exactly as the relay checks an envelope’s digest (§7.2).',
  },
  { name: 'wrong-workspace', mutate: 'Verify the manifest against another workspace.' },
  {
    name: 'wrong-generation',
    mutate:
      'Claim a generation the checkpoint was not sealed under. **A checkpoint is only openable while its generation is retained**, which is why rotation forces a new one before the old generation may be dropped.',
  },
  { name: 'wrong-epoch', mutate: 'Move the manifest to another epoch number.' },
  {
    name: 'stale-epoch-head',
    mutate:
      'A current epoch number paired with an older head. Row 9’s pairing, applied to the artifact a recovering device reads first.',
  },
  { name: 'wrong-version', mutate: 'Claim manifest version 2 for a version-1 manifest.' },
  {
    name: 'aad-only-renumbered-manifest-label',
    mutate: 'Verify under "done/cp-manifest/v2".',
  },
  // The sealed checkpoint's own AAD, one field at a time.
  {
    name: 'cp-aad-only-workspace',
    mutate: 'Open the checkpoint as though it belonged to another workspace, subkey unchanged.',
  },
  { name: 'cp-aad-only-generation', mutate: 'Open it claiming another generation.' },
  { name: 'cp-aad-only-epoch', mutate: 'Open it claiming another epoch.' },
  { name: 'cp-aad-only-version', mutate: 'Open it claiming another format version.' },
  {
    name: 'cp-aad-only-renumbered-label',
    mutate: 'Open it under "done/cp/v2".',
  },
  {
    name: 'wrong-workspace-subkey',
    mutate: 'Derive K_cp for another workspace. The AAD half is `cp-aad-only-workspace`.',
  },
];

// --- what a restoring device does ------------------------------------------------------

const openCheckpoint = async (key, aad, ct) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unhex(NONCE), additionalData: aad, tagLength: 128 },
      key,
      ct,
    ),
  );

/** The durable store's check: no content key, one hash. */
const storeAccepts = async (manifest, ct) => {
  if (hex(await sha256(ct)) !== manifest.checkpointDigest) {
    throw new Error('checkpoint digest does not match the bytes beside it');
  }
};

const verifyManifest = async (manifest, signature, verifier) => {
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signature),
    manifestMessage(manifest),
  );
  if (!ok) throw new Error('checkpoint manifest does not verify');
};

// --- verification -------------------------------------------------------------------------

const verify = async (doc) => {
  const key = await deriveCheckpointKey(KG, WORKSPACE);
  const verifier = await importVerifier(KEYS.producer.public_key);
  const v = doc.vectors[0];
  const ct = unhex(v.expected.ciphertext);
  const manifest = {
    ...BASE,
    checkpointDigest: v.expected.checkpoint_digest,
    sv: SV,
    ds: DS,
    headVecDigest: v.derived.head_vector_digest,
  };

  // Positive: the store's cheap check passes, the manifest verifies, and the
  // checkpoint opens to the snapshot it was built from.
  await storeAccepts(manifest, ct);
  await verifyManifest(manifest, v.expected.signature, verifier);
  const opened = await openCheckpoint(key, checkpointAad(BASE), ct);
  if (hex(opened) !== hex(SNAPSHOT)) throw new Error('checkpoint does not round-trip.');

  // §7.6's stated failure, and the sort.
  await refuses('coverage-ignores-deletions', () =>
    verifyManifest({ ...manifest, ds: DS_MORE_DELETED }, v.expected.signature, verifier),
  );
  await refuses('coverage-ignores-insertions', () =>
    verifyManifest({ ...manifest, sv: SV_AHEAD }, v.expected.signature, verifier),
  );
  await refuses('substituted-checkpoint-digest', () =>
    verifyManifest(
      { ...manifest, checkpointDigest: 'ab'.repeat(32) },
      v.expected.signature,
      verifier,
    ),
  );
  await refuses('reordered-head-vector', async () => {
    const unsorted = hex(
      await sha256(
        concat(
          lp(HEADVEC_LABEL),
          ...HEADS.flatMap((h) => [lp(h.credential), lp(String(h.seq)), lp(h.link)]),
        ),
      ),
    );
    await verifyManifest({ ...manifest, headVecDigest: unsorted }, v.expected.signature, verifier);
  });

  await refuses('produced-by-another-credential', async () => {
    const forged = hex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          await importSigner(KEYS.other_credential.seed),
          manifestMessage(manifest),
        ),
      ),
    );
    await verifyManifest(manifest, forged, verifier);
  });
  await refuses('substituted-checkpoint', () =>
    storeAccepts({ ...manifest, checkpointDigest: 'ab'.repeat(32) }, ct),
  );

  for (const [name, patch] of [
    ['wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['wrong-generation', { gen: 4 }],
    ['wrong-epoch', { epoch: 10 }],
    [
      'stale-epoch-head',
      { epochHead: 'c4e1a6b3d0f295847e3b1c0d9a8f7e6d5c4b3a29180f7e6d5c4b3a2918f0e7d6' },
    ],
    ['wrong-version', { v: 2 }],
    ['aad-only-renumbered-manifest-label', { label: 'done/cp-manifest/v2' }],
    // The producing credential is named *in the message*, so changing that name
    // alone — verifier and signature untouched — is what isolates the field.
    // The forged-signature half of the same negative is above.
    ['produced-by-another-credential', { credential: PHONE }],
  ]) {
    await refuses(name, () =>
      verifyManifest({ ...manifest, ...patch }, v.expected.signature, verifier),
    );
  }

  // The sealed checkpoint's AAD, one field at a time.
  for (const [name, patch] of [
    ['cp-aad-only-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['cp-aad-only-generation', { gen: 4 }],
    ['cp-aad-only-epoch', { epoch: 10 }],
    ['cp-aad-only-version', { v: 2 }],
    ['cp-aad-only-renumbered-label', { label: 'done/cp/v2' }],
  ]) {
    await refuses(name, () => openCheckpoint(key, checkpointAad({ ...BASE, ...patch }), ct));
  }

  const otherKey = await deriveCheckpointKey(KG, 'ws_01J0000000000000000000000A');
  await refuses('wrong-workspace-subkey', () => openCheckpoint(otherKey, checkpointAad(BASE), ct));

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

  const key = await deriveCheckpointKey(KG, WORKSPACE);
  const signer = await importSigner(KEYS.producer.seed);
  const aad = checkpointAad(BASE);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: unhex(NONCE), additionalData: aad, tagLength: 128 },
      key,
      SNAPSHOT,
    ),
  );
  const checkpointDigest = hex(await sha256(ct));
  const headVecDigest = await headVectorDigest(HEADS);
  const manifest = { ...BASE, checkpointDigest, sv: SV, ds: DS, headVecDigest };
  const message = manifestMessage(manifest);

  const vectors = [
    {
      name: 'checkpoint-at-epoch-9',
      why: 'A laptop checkpointing a two-device workspace at epoch 9, generation 3. The snapshot includes row 8’s attribution records, which is what makes this preserve attribution without anyone re-signing anything.',
      inputs: {
        k_g: hex(KG),
        v: BASE.v,
        workspace_id: WORKSPACE,
        epoch: BASE.epoch,
        epoch_head: EPOCH_HEAD,
        gen: BASE.gen,
        nonce: NONCE,
        producing_credential: LAPTOP,
        sv: SV,
        ds: DS,
        accepted_heads: HEADS,
        snapshot_utf8: Buffer.from(SNAPSHOT).toString('utf8'),
      },
      derived: {
        hkdf_info: hex(concat(lp(HKDF_LABEL), lp(WORKSPACE))),
        checkpoint_aad: hex(aad),
        head_vector: hex(headVector(HEADS)),
        head_vector_digest: headVecDigest,
        manifest_message: hex(message),
      },
      expected: {
        ciphertext: hex(ct),
        checkpoint_digest: checkpointDigest,
        signature: hex(
          new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, message)),
        ),
      },
    },
  ];

  const doc = {
    $schema: 'https://done.invalid/vectors/checkpoint/1',
    generated_by: 'scripts/generate-checkpoint-vectors.mjs',
    selection: 'docs/selections/row-7-checkpoint.md',
    trd_row: 7,
    construction: {
      checkpoint:
        'AES-256-GCM(K_cp; a Yjs full snapshot of the content root, AAD) — the snapshot includes row 8’s attribution records',
      hkdf_info: 'LP("done/checkpoint/v1") || LP(workspace_id)',
      checkpoint_aad:
        'LP("done/cp/v1") || LP(dec v) || LP(workspace_id) || LP(dec gen) || LP(dec epoch)',
      manifest:
        'Ed25519( producing credential ; LP("done/cp-manifest/v1") || LP(dec v) || LP(workspace_id) || LP(dec epoch) || LP(hex epoch_head) || LP(dec gen) || LP(hex checkpoint_digest) || LP(hex sv) || LP(hex ds) || LP(hex head_vector_digest) || LP(producing_credential) )',
      head_vector:
        'For each credential ascending by id: LP(credential_id) || LP(dec seq) || LP(hex link). Digest = SHA-256( LP("done/headvec/v1") || head_vector ). The sort is the canonicalization',
      coverage:
        '`sv` and `ds` bound separately, as opaque bytes. §7.6 forbids a bare state vector as a coverage claim; opacity means §10.1’s deferred Yjs upgrade changes what the bytes say rather than what this construction is',
      attribution:
        'Preserved by row 8 rather than by anything here. Each claim is signed by its own author and lives in the snapshotted content; the producer signs the container and nothing inside it, so §7.6’s forbidden shape is unreachable',
      cadence: [
        'A rotation forces a checkpoint under the new generation **before the old generation may be dropped** — a checkpoint is only openable while its generation is retained.',
        'Otherwise: whichever comes first of an accepted-position count since the last checkpoint, or elapsed time. Both are tunables whose ground is first-sync cost (§12’s 1.5 s checkpoint verify), and neither can be set honestly before there is a service to measure.',
      ],
      retention: [
        'At least two checkpoints and their suffixes, because §11.3 test 8 requires falling back to the next-newest when the newest is unavailable.',
        'Never drop a checkpoint whose generation is the newest one any retained checkpoint uses.',
      ],
      not_here: {
        primitives:
          'AES-256-GCM, HKDF, SHA-256 and Ed25519 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        attribution: 'The records inside the snapshot are row 8’s.',
        heads: 'The links and heads the vector collects are row 5’s.',
        packages: 'What a migration or terminal package carries is row 10’s.',
      },
    },
    keys: KEYS,
    vectors,
    must_fail: NEGATIVES,
  };

  await verify(doc);
  reportAudit(NEGATIVES.map((n) => n.name));

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/checkpoint.json is stale. Run: node scripts/generate-checkpoint-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('checkpoint.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} checkpoint vector and ${NEGATIVES.length} negatives to test/vectors/checkpoint.json`,
  );
};

await main();
