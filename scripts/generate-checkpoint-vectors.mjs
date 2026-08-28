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
import { claims, falsifies } from './lib/traceability.mjs';

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

/**
 * The admission, which is what the producer's signature does not say.
 *
 * **Publishing `{sv, ds}` is not deriving them.** The manifest's signature says
 * *this producer made this manifest*; it does not say the pair inside describes
 * the snapshot the manifest names, nor that the head vector stops where the
 * snapshot stops. An authentic manifest whose coverage is wrong is worse than
 * an unsigned one, because it is believed.
 *
 * Two questions, and only one is a matter of trust. **Coverage is re-derived
 * locally by every restorer** -- decrypt, materialise, recompute, compare --
 * needing no signature and no second party, which is why the assertions below
 * do that first and without consulting one. **The accepted-head baseline is the
 * part trim removes the evidence for**, so an eligible client that checked it
 * signs this before any pre-checkpoint envelope may be dropped, and a fresh
 * restorer's confidence in the baseline is exactly its confidence in that
 * credential.
 */
const ADMIT_LABEL = 'done/cp-admit/v1';
const DERIVATION_VERSION = 'yjs-v13-sv-ds';

const admissionMessage = ({
  v = 1,
  workspace,
  checkpointDigest,
  manifestDigest,
  derivedSv,
  derivedDs,
  headBaselineDigest,
  derivationVersion = DERIVATION_VERSION,
  admittingCredential,
  selfAdmitted,
  decisionParent,
  label = ADMIT_LABEL,
}) =>
  concat(
    ...aadFields('checkpoint admission', {
      label,
      v: String(v),
      workspace_id: workspace,
      checkpoint_digest: checkpointDigest,
      manifest_digest: manifestDigest,
      derived_sv: derivedSv,
      derived_ds: derivedDs,
      head_baseline_digest: headBaselineDigest,
      derivation_version: derivationVersion,
      admitting_credential: admittingCredential,
      self_admitted: selfAdmitted ? '1' : '0',
      decision_parent: decisionParent,
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

const ADMISSION_NEGATIVES = [
  {
    name: 'admission-derived-sv-disagrees',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: "The check that needs nobody's signature. A restorer materialises the snapshot, derives {sv, ds} itself, and compares against BOTH the manifest and the admission. A disagreement is a refusal reached without trusting anyone, and it is mandatory even when every signature verifies -- an encoding or selection bug produces this as readily as a malicious producer.",
  },
  {
    name: 'admission-derived-ds-disagrees',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: "The same at the deletion half, which is bound separately for §7.6's reason: two replicas can carry identical state vectors and disagree about what has been deleted.",
  },
  {
    name: 'admission-signed-over-a-wrong-derivation',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: 'The case the local re-derivation exists for, and the only one that proves it runs. Here the admitter signs an admission whose derived coverage genuinely disagrees with the snapshot -- a colluding admitter, or an honest one with a bug. Every signature verifies. The refusal has to come from the restorer recomputing {sv, ds} itself, which is why that check is first and why it is mandatory even when the admission is valid. The sibling negatives above cannot show this: with the local check removed they still fail, on the signature, which is the fails-twice-isolates-nothing shape.',
  },
  {
    name: 'admission-of-another-manifest',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: 'An admission lifted onto a different manifest. It binds the manifest digest, so a checked coverage claim cannot be moved to a checkpoint nobody checked.',
  },
  {
    name: 'admission-with-a-substituted-head-baseline',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: 'The one trusted field, doing its job. Proving the head vector does not reach past the snapshot needs the accepted events that trim removes, so the baseline is what the admitter attests to and it may not be swapped afterwards.',
  },
  {
    name: 'admission-under-an-unimplemented-derivation-version',
    why: "sv and ds are a library's opaque encoding. Unversioned, a change to it turns every stored admission into a silent mismatch that reads as corruption; versioned, it is a legible refusal that names its cause.",
  },
  {
    name: 'admission-signed-by-a-credential-that-did-not-admit',
    why: 'The admitting credential is named in the message, so this fails on the binding rather than only on the key.',
  },
  {
    name: 'admission-forked-from-another-parent',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    why: "Incomparable proposals serialise by an authenticated decision parent and never by wall clock, which is row 7's own rule at the object that now settles it.",
  },
  {
    name: 'aad-only-admission-label',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-version',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-workspace-id',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-checkpoint-digest',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-manifest-digest',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-derived-sv',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-derived-ds',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-derivation-version',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-admitting-credential',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
  {
    name: 'aad-only-admission-self-admitted',
    why: 'The binding on its own. The semantic negatives above stop at the local re-derivation, which would refuse them just as readily if nothing were signed -- so each of these carries what the restorer expects and forces the refusal onto the signature.',
  },
];

const NEGATIVES = [
  {
    name: 'coverage-ignores-deletions',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
    mutate:
      'A manifest whose delete set differs while its state vector is identical. **This is §7.6’s stated failure as a vector**: two replicas can agree on `sv` and disagree about what has been deleted, so a bare state vector is not a coverage claim and `ds` has to be bound on its own.',
  },
  {
    name: 'coverage-ignores-insertions',
    falsifies: ['f-b997cdb-checkpoint-coverage-unchecked'],
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

  // --- the admission, and the two questions it keeps apart -----------------------

  const admitVerifier = await importVerifier(KEYS.other_credential.public_key);
  const manifestDigest = hex(await sha256(manifestMessage(manifest)));
  const headBaseline = manifest.headVecDigest;

  const ADMISSION = {
    workspace: WORKSPACE,
    checkpointDigest: manifest.checkpointDigest,
    manifestDigest,
    derivedSv: SV,
    derivedDs: DS,
    headBaselineDigest: headBaseline,
    admittingCredential: PHONE,
    selfAdmitted: false,
    decisionParent: '00'.repeat(32),
  };
  const admissionSig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      await importSigner(KEYS.other_credential.seed),
      admissionMessage(ADMISSION),
    ),
  );

  /**
   * The restorer, in the order §7.6 states -- and the first check consults no
   * signature at all, which is the point of doing it first.
   */
  const admit = async ({
    fields = ADMISSION,
    sig = admissionSig,
    derivation = DERIVATION_VERSION,
  }) => {
    if (fields.derivationVersion !== undefined && fields.derivationVersion !== derivation) {
      throw new Error(`derivation ${fields.derivationVersion} is not implemented here`);
    }
    // 1. Local re-derivation. No key, no signature, no second party.
    if (fields.derivedSv !== SV) throw new Error('derived sv disagrees with the local derivation');
    if (fields.derivedDs !== DS) throw new Error('derived ds disagrees with the local derivation');
    if (fields.manifestDigest !== manifestDigest)
      throw new Error('admission names another manifest');
    // 2. Only then, the trusted half.
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      admitVerifier,
      sig,
      admissionMessage(fields),
    );
    if (!ok) throw new Error('admission does not verify under the credential it names');
    return { baseline: fields.headBaselineDigest, selfAdmitted: fields.selfAdmitted };
  };

  const admitted = await admit({});
  if (admitted.baseline !== headBaseline)
    throw new Error('the admission does not carry the baseline.');
  if (admitted.selfAdmitted !== false) throw new Error('this admission is not self-admitted.');

  // A self-admitted checkpoint is ACCEPTED and its provenance is legible. §13.5
  // selects single-owner authority, so the only eligible client may be the
  // producer; requiring a second would leave a one-device workspace unable to
  // checkpoint at all, and therefore retaining envelopes without bound.
  const selfFields = { ...ADMISSION, admittingCredential: LAPTOP, selfAdmitted: true };
  const selfSig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      await importSigner(KEYS.producer.seed),
      admissionMessage(selfFields),
    ),
  );
  const selfAdmitted = await (async () => {
    const saved = admitVerifier;
    void saved;
    // verified under the producer, since that is who admitted it
    if (
      !(await crypto.subtle.verify(
        { name: 'Ed25519' },
        await importVerifier(KEYS.producer.public_key),
        selfSig,
        admissionMessage(selfFields),
      ))
    ) {
      throw new Error('the self-admission does not verify under its producer.');
    }
    return selfFields.selfAdmitted;
  })();
  if (selfAdmitted !== true) throw new Error('a self-admission must say that it is one.');

  // Validly signed, and wrong. Nothing but the local derivation can refuse it.
  await refuses('admission-signed-over-a-wrong-derivation', async () => {
    const wrong = { ...ADMISSION, derivedSv: SV_AHEAD };
    const properlySigned = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.other_credential.seed),
        admissionMessage(wrong),
      ),
    );
    // The signature is genuine; assert that before relying on the refusal below.
    if (
      !(await crypto.subtle.verify(
        { name: 'Ed25519' },
        admitVerifier,
        properlySigned,
        admissionMessage(wrong),
      ))
    ) {
      throw new Error('the fixture is not validly signed; the negative proves nothing');
    }
    await admit({ fields: wrong, sig: properlySigned });
  });

  await refuses('admission-derived-sv-disagrees', () =>
    admit({ fields: { ...ADMISSION, derivedSv: SV_AHEAD } }),
  );
  await refuses('admission-derived-ds-disagrees', () =>
    admit({ fields: { ...ADMISSION, derivedDs: DS_MORE_DELETED } }),
  );
  await refuses('admission-of-another-manifest', () =>
    admit({ fields: { ...ADMISSION, manifestDigest: 'ab'.repeat(32) } }),
  );
  await refuses('admission-with-a-substituted-head-baseline', () =>
    admit({ fields: { ...ADMISSION, headBaselineDigest: 'cd'.repeat(32) } }),
  );
  await refuses('admission-under-an-unimplemented-derivation-version', () =>
    admit({ fields: { ...ADMISSION, derivationVersion: 'yjs-v14-sv-ds' } }),
  );
  await refuses('admission-signed-by-a-credential-that-did-not-admit', async () =>
    admit({
      sig: new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          await importSigner(KEYS.producer.seed),
          admissionMessage(ADMISSION),
        ),
      ),
    }),
  );
  await refuses('admission-forked-from-another-parent', () =>
    admit({ fields: { ...ADMISSION, decisionParent: '11'.repeat(32) } }),
  );

  /**
   * The bindings, isolated.
   *
   * `admit` above checks the local re-derivation first and on purpose -- that
   * is the half needing no signature. The consequence is that its semantic
   * negatives stop there and never reach the binding, which is the
   * fails-twice-isolates-nothing shape the coverage audit exists to catch. So
   * each of these carries exactly what the restorer expects and changes one
   * signed field, forcing the refusal onto the signature alone.
   */
  const signatureOnly = async (fields) => {
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      admitVerifier,
      admissionSig,
      admissionMessage(fields),
    );
    if (!ok) throw new Error('admission signature does not cover this message');
    return ok;
  };

  await refuses('aad-only-admission-label', () =>
    signatureOnly({ ...ADMISSION, label: 'done/cp-admit/v2' }),
  );
  await refuses('aad-only-admission-version', () => signatureOnly({ ...ADMISSION, v: 0 }));
  await refuses('aad-only-admission-workspace-id', () =>
    signatureOnly({ ...ADMISSION, workspace: 'ws_01J0000000000000000000000A' }),
  );
  await refuses('aad-only-admission-checkpoint-digest', () =>
    signatureOnly({ ...ADMISSION, checkpointDigest: 'ee'.repeat(32) }),
  );
  await refuses('aad-only-admission-manifest-digest', () =>
    signatureOnly({ ...ADMISSION, manifestDigest: 'ab'.repeat(32) }),
  );
  await refuses('aad-only-admission-derived-sv', () =>
    signatureOnly({ ...ADMISSION, derivedSv: SV_AHEAD }),
  );
  await refuses('aad-only-admission-derived-ds', () =>
    signatureOnly({ ...ADMISSION, derivedDs: DS_MORE_DELETED }),
  );
  await refuses('aad-only-admission-derivation-version', () =>
    signatureOnly({ ...ADMISSION, derivationVersion: 'yjs-v14-sv-ds' }),
  );
  await refuses('aad-only-admission-admitting-credential', () =>
    signatureOnly({ ...ADMISSION, admittingCredential: LAPTOP }),
  );
  await refuses('aad-only-admission-self-admitted', () =>
    signatureOnly({ ...ADMISSION, selfAdmitted: true }),
  );

  // --- retention, and the clause the interlock was missing -----------------------

  falsifies('the opener predicate', ['f-b997cdb-checkpoint-key-retention-inverted']);

  /**
   * A checkpoint is openable only while its generation is, and the rule that
   * was supposed to guarantee that had the wrong subject.
   *
   * It read *never drop a checkpoint whose generation any retained checkpoint
   * still needs*, which constrains each checkpoint by reference to itself: the
   * only checkpoint that needs `g` is the one sealed under `g`. Nothing
   * constrained the **generation**. §13.7's forced rule guarantees a checkpoint
   * exists under the new generation before the old one is dropped -- it says
   * nothing about whether the **second-newest** stays openable, and that is the
   * one §11.3 test 8 falls back to.
   *
   * Stated over openers rather than over the local key envelope, because
   * deleting that envelope does not necessarily end access: a retained recovery
   * or reader wrap may still open the generation.
   */
  const sealedUnder = (gen, retained) => retained.filter((cp) => cp.gen === gen);

  /** Deleting every opener for a generation. */
  const mayDropGeneration = (gen, retained) => sealedUnder(gen, retained).length === 0;

  /**
   * Deleting *one* opener, which is the operation that actually happens.
   *
   * These are two different questions and the interlock only ever asked the
   * first. Removing a local key envelope is not dropping a generation: a
   * retained recovery or reader wrap may still open it. So the predicate is
   * stated over the opener **set**, and permits the removal exactly when
   * something else survives to open what is still retained.
   */
  const mayRetireOpener = (gen, opener, retained, openers) =>
    mayDropGeneration(gen, retained) || (openers[gen] ?? []).filter((o) => o !== opener).length > 0;

  // Two rotations, which is the shape test 8 needs: g+2 is newest, g+1 is the
  // mandated fallback, and g is the one nothing retains any more.
  const afterTwoRotations = [
    { gen: 5, role: 'newest' },
    { gen: 4, role: 'second-newest, the mandated fallback' },
  ];
  const openersHeld = { 3: [], 4: ['local key envelope'], 5: ['local key envelope'] };

  if (!mayDropGeneration(3, afterTwoRotations)) {
    throw new Error('Generation 3 is retained by nothing and should be droppable.');
  }
  if (mayDropGeneration(4, afterTwoRotations)) {
    throw new Error(
      'Generation 4 was droppable while the second-newest checkpoint is sealed under it. ' +
        'The fallback would be authentic, intact and undecryptable, and test 8 fails by construction.',
    );
  }

  // Retiring the last opener of a still-retained generation is the same failure
  // reached through the operation an implementation actually performs.
  if (mayRetireOpener(4, 'local key envelope', afterTwoRotations, openersHeld)) {
    throw new Error('The last opener of a retained generation was retirable.');
  }

  // And the benign reading the finding names: an opener need not be the local
  // envelope, so the predicate reads the whole set rather than one carrier.
  const alsoRecoveryWrap = { ...openersHeld, 4: ['local key envelope', 'retained recovery wrap'] };
  if (!mayRetireOpener(4, 'local key envelope', afterTwoRotations, alsoRecoveryWrap)) {
    throw new Error('A surviving recovery wrap did not count as an opener.');
  }

  // Every retained checkpoint is openable, which is what the whole predicate holds.
  for (const cp of afterTwoRotations) {
    if ((openersHeld[cp.gen] ?? []).length === 0) {
      throw new Error(`The ${cp.role} checkpoint has no opener.`);
    }
  }

  // The published list and the executed checks must be the same list, in both
  // directions. A "must fail" entry that quietly stops failing is the defect
  // this file exists to prevent; one that is published but never run is the
  // same defect a level up, and it is invisible without this comparison.
  const published = new Set([...NEGATIVES, ...ADMISSION_NEGATIVES].map((n) => n.name));
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
    // Filled after `verify`, which is where this file's guards run. Declared
    // here so its position in the published document does not depend on that.
    falsifies: undefined,
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
    retention_interlock: {
      why: 'The rule read "never drop a checkpoint whose generation any retained checkpoint still needs", which constrains each checkpoint by reference to itself -- the only checkpoint that needs g is the one sealed under g -- and never constrains the generation. §13.7 forces a checkpoint under the new generation before the old one is dropped; it says nothing about whether the second-newest stays openable, and that is the one §11.3 test 8 falls back to.',
      subject: 'the generation, not the checkpoint',
      stated_over:
        'the opener set, not the local key envelope -- a retained recovery or reader wrap may still open a generation whose envelope is gone',
      after_two_rotations: {
        retained: [
          { gen: 5, role: 'newest' },
          { gen: 4, role: 'second-newest, the mandated fallback' },
        ],
        droppable: [3],
        not_droppable: [4, 5],
      },
      expected:
        'a generation is droppable only when no retained checkpoint is sealed under it, and one opener is retirable only while another survives',
    },
    must_fail: [...NEGATIVES, ...ADMISSION_NEGATIVES],
  };

  await verify(doc);
  doc.falsifies = claims();
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
    `Wrote ${vectors.length} checkpoint vector and ${NEGATIVES.length + ADMISSION_NEGATIVES.length} negatives to test/vectors/checkpoint.json`,
  );
};

await main();
