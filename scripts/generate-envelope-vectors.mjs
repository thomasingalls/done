/**
 * Test vectors for the network envelope wire format (TRD §15 row 4, §7.4).
 *
 * The construction is specified in docs/selections/row-4-envelope-format.md.
 * This script is the executable half of that document: it emits
 * test/vectors/envelope.json, which Stage 4's client and the relay must
 * reproduce byte for byte.
 *
 * §7.4's field split is a product constraint rather than a preference, and the
 * whole format follows from it: workspace, epoch, credential and update digest
 * are **in the clear** because the relay validates them, the attributed actor
 * is **inside the seal** because the relay is not entitled to a per-write
 * record of who wrote, and the signature covers **both**.
 *
 * Two bound field lists, and keeping them apart is the point:
 *
 *   - The **AAD** binds every clear header field the *reader* trusts. It cannot
 *     bind the nonce (an AEAD input) or the digest (a function of the output),
 *     which is why there is a second list at all.
 *   - The **signature message** binds the same header fields plus the nonce and
 *     the digest, so the two fields the AAD structurally cannot reach are
 *     covered by the credential that produced them.
 *
 * A field mutated in one list and not the other is exactly what the coverage
 * audit needs to isolate either, so the negatives below come in two families.
 * That is not artificial: a header the reader trusts differing from what was
 * sealed is one attack, and a header differing from what was signed is another.
 *
 * The primitive KATs are not here. AES-256-GCM, HKDF, SHA-256 and Ed25519 are
 * row 1's, and their published vectors live in test/vectors/algorithm-suite.json.
 *
 * Usage: node scripts/generate-envelope-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/envelope.json', import.meta.url);

const HKDF_LABEL = 'done/envelope/v1';
const AAD_LABEL = 'done/env/v1';
const SIG_LABEL = 'done/env-sig/v1';
const BODY_LABEL = 'done/env-body/v1';

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

/** Length-prefixed bytes: uint32be(byteLength) || bytes. Updates are not text. */
const lpb = (b) =>
  concat(
    new Uint8Array([
      (b.length >>> 24) & 0xff,
      (b.length >>> 16) & 0xff,
      (b.length >>> 8) & 0xff,
      b.length & 0xff,
    ]),
    b,
  );

const u32be = (n) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// --- the constructions ----------------------------------------------------------

/**
 * K_net = HKDF-SHA256(ikm = K_g, salt = "", info = LP(label) || LP(workspace), L = 32)
 *
 * §13.2's network-envelope subkey. Same shape as row 2's journal subkey and
 * row 3's store subkey, differing only by label — which is what makes §13.2's
 * separation a property of the labels rather than of three constructions a
 * reviewer has to compare by hand.
 */
const deriveNetKey = async (kg, workspaceId) => {
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
 * AAD = LP(label) || LP(dec v) || LP(workspace) || LP(credential) || LP(dec epoch)
 *       || LP(dec gen) || LP(dec seq)
 *
 * Every clear header field the load path trusts, and nothing that structurally
 * cannot be here. The nonce is the AEAD's own input; the digest is SHA-256 of
 * the ciphertext this call produces, so binding it would be circular. Both are
 * covered by the signature instead.
 */
const aadFor = ({ v, workspace, credential, epoch, gen, seq, label = AAD_LABEL }) =>
  concat(
    ...aadFields('envelope aad', {
      label,
      v: String(v),
      workspace_id: workspace,
      credential_id: credential,
      epoch: String(epoch),
      gen: String(gen),
      seq: String(seq),
    }).map(lp),
  );

/**
 * The signature message. The same header fields, plus the two the AAD cannot
 * reach.
 *
 * `digest` is SHA-256 of the ciphertext rather than of the plaintext, because
 * §7.2 has the relay validating it without a content key. Signing it is what
 * makes the relay's cheap check and the client's real check agree.
 */
const sigMessage = ({
  v,
  workspace,
  credential,
  epoch,
  gen,
  seq,
  nonce,
  digest,
  label = SIG_LABEL,
}) =>
  concat(
    ...aadFields('envelope signature', {
      label,
      v: String(v),
      workspace_id: workspace,
      credential_id: credential,
      epoch: String(epoch),
      gen: String(gen),
      seq: String(seq),
      nonce,
      digest,
    }).map(lp),
  );

/**
 * The sealed body: the attributed actor, then the batch.
 *
 * §7.4 puts the actor inside the seal, and a source may batch its own mutations
 * when actor, credential, epoch — and generation, since the key changes — are
 * the same. So one envelope carries one actor by construction, and batching
 * costs no attribution granularity at all.
 */
const body = (actorId, actorKind, updates) =>
  concat(
    lp(BODY_LABEL),
    lp(actorId),
    lp(actorKind),
    u32be(updates.length),
    ...updates.map((u) => lpb(unhex(u))),
  );

// --- keys -----------------------------------------------------------------------

/**
 * RFC 8032 §7.1's keypairs, so the halves can be checked rather than trusted:
 * TEST 2 is the device signing credential, TEST 1 is a credential that is not
 * this one. Row 14's rule, and row 5 follows it too.
 */
const KEYS = {
  device: {
    role: 'The device signing credential (§13.4). Signs; never receives a content key for signing alone.',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  other_credential: {
    role: 'A different admitted credential. Present so "signed by another credential" is a vector rather than a sentence.',
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

// --- the scenario ----------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_WORKSPACE = 'ws_01J0000000000000000000000A';
const LAPTOP = 'cred_01HZXR0000000000000000LAPT';
const PHONE = 'cred_01HZXR0000000000000000PHON';
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');

const HUMAN = { id: 'act_01HZXQ8H0M4N2P6R9T3V5W7Y1B', kind: 'human' };

const BASE = {
  v: 1,
  workspace: WORKSPACE,
  credential: LAPTOP,
  epoch: 7,
  gen: 1,
  seq: 2,
  nonce: '404142434445464748494a4b',
};

const CASES = [
  {
    name: 'single-update',
    why: 'One 18-byte Yjs update — the measured size of a keystroke — from a human actor. The common case.',
    ...BASE,
    actor: HUMAN,
    updates: ['01010101a8e0c9d20500042101087903c0a8'],
  },
  {
    name: 'batched-updates',
    why: 'Three updates from the same actor, credential, epoch and generation, in one envelope. §7.4 permits exactly this batching and no other.',
    ...BASE,
    seq: 3,
    actor: HUMAN,
    updates: [
      '01010101a8e0c9d20500042101087903c0a8',
      '01010101a8e0c9d2060004210108790cc0a9',
      '01010101a8e0c9d2070004210108791dc0aa',
    ],
  },
  {
    name: 'system-actor',
    why: 'An import, attributed to the system actor (§9.2). The actor is a sealed field, so its kind is invisible to the relay.',
    ...BASE,
    seq: 4,
    actor: { id: 'act_system', kind: 'system' },
    updates: ['01010101a8e0c9d20800042101087a2ec0ab'],
  },
  {
    name: 'rotated-generation',
    why: 'The same bytes under generation 2. `gen` selects which K_g the subkey comes from, so it is bound in both lists.',
    ...BASE,
    gen: 2,
    seq: 5,
    actor: HUMAN,
    updates: ['01010101a8e0c9d20500042101087903c0a8'],
  },
];

/**
 * The two families of negative, declared once each so a field cannot acquire a
 * binding without acquiring a published negative in the same edit.
 *
 * Each entry mutates its field in **one** list and leaves the other correct,
 * which is what makes it isolating: the AAD family models a header the reader
 * trusts differing from what was sealed, the signature family models one
 * differing from what was signed, and those are different attacks.
 */
/** @type {{ field: string, patch: Record<string, unknown>, mutate: string }[]} */
const AAD_MUTATIONS = [
  {
    field: 'label',
    patch: { label: 'done/env/v2' },
    mutate:
      'The label is where this carrier authenticates its own version, so a renumbered envelope must fail to open rather than select another suite (row 1).',
  },
  { field: 'v', patch: { v: 2 }, mutate: 'Claim format version 2 for bytes sealed as version 1.' },
  {
    field: 'workspace_id',
    patch: { workspace: OTHER_WORKSPACE },
    mutate:
      'Open the envelope as though it belonged to another workspace, subkey unchanged. This is the AAD half of §11.2 test 3’s cross-workspace replay; the subkey half is `wrong-workspace-subkey`.',
  },
  {
    field: 'credential_id',
    patch: { credential: PHONE },
    mutate:
      'Attribute the envelope to another credential. The credential is what the epoch binds capabilities to, so this is where §11.2 test 3’s capability change lands.',
  },
  {
    field: 'epoch',
    patch: { epoch: 8 },
    mutate:
      'Move the envelope to a later epoch — the field §7.5 shows cannot by itself distinguish accepted from withheld, and which therefore must at least be immovable.',
  },
  {
    field: 'gen',
    patch: { gen: 2 },
    mutate: 'Claim a content-key generation the envelope was not sealed under.',
  },
  {
    field: 'seq',
    patch: { seq: 99 },
    mutate:
      'Renumber the envelope’s position. Row 5’s accepted chain binds this position, so a movable `seq` would move a link.',
  },
];

/** @type {{ field: string, patch: Record<string, unknown>, mutate: string }[]} */
const SIG_MUTATIONS = [
  {
    field: 'label',
    patch: { label: 'done/env-sig/v2' },
    mutate: 'Verify under a renumbered signature label.',
  },
  { field: 'v', patch: { v: 2 }, mutate: 'Verify as though the header claimed format version 2.' },
  {
    field: 'workspace_id',
    patch: { workspace: OTHER_WORKSPACE },
    mutate: 'Verify against another workspace id.',
  },
  {
    field: 'credential_id',
    patch: { credential: PHONE },
    mutate: 'Verify as another credential’s envelope.',
  },
  { field: 'epoch', patch: { epoch: 8 }, mutate: 'Verify against a later epoch.' },
  { field: 'gen', patch: { gen: 2 }, mutate: 'Verify against another generation.' },
  { field: 'seq', patch: { seq: 99 }, mutate: 'Verify against another position.' },
  {
    field: 'nonce',
    patch: { nonce: '000102030405060708090a0b' },
    mutate:
      'Verify against a different nonce. **The AAD structurally cannot bind this**, so the signature is the only thing that does.',
  },
  {
    field: 'digest',
    patch: { digest: 'ff'.repeat(32) },
    mutate:
      'Verify against a different ciphertext digest. **The AAD structurally cannot bind this either** — it is a function of the ciphertext the AAD helped produce — so a substituted body is caught here or nowhere.',
  },
];

const NEGATIVES = [
  ...AAD_MUTATIONS.map(({ field, mutate }) => ({ name: `aad-only-${field}`, mutate })),
  ...SIG_MUTATIONS.map(({ field, mutate }) => ({ name: `sig-only-${field}`, mutate })),
  {
    name: 'wrong-workspace-subkey',
    mutate:
      'Derive K_net for another workspace and open with it. Tests the HKDF info binding; the AAD half is `aad-only-workspace_id`.',
  },
  {
    name: 'signed-by-other-credential',
    mutate:
      'A well-formed signature over the correct message, produced by a different admitted credential. §7.4 forbids re-signing another credential’s operations, and this is the check that notices.',
  },
  { name: 'flipped-tag-bit', mutate: 'Flip the low bit of the final tag byte.' },
  { name: 'truncated-ciphertext', mutate: 'Drop the final byte of the ciphertext.' },
  {
    name: 'digest-not-of-ciphertext',
    mutate:
      'A header whose `digest` is not SHA-256 of the ciphertext beside it. The relay validates this without a content key (§7.2), so it is refused before any client sees it.',
  },
];

// --- what a reader does ------------------------------------------------------------

const seal = async (key, nonce, aad, plaintext) =>
  new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: unhex(nonce), additionalData: aad, tagLength: 128 },
      key,
      plaintext,
    ),
  );

const open = async (key, nonce, aad, ct) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unhex(nonce), additionalData: aad, tagLength: 128 },
      key,
      ct,
    ),
  );

/** The relay's check: no content key, one hash. */
const relayAccepts = async (header, ct) => {
  if (hex(await sha256(ct)) !== header.digest) {
    throw new Error('digest is not SHA-256 of the ciphertext');
  }
};

/** The client's check, in the order it actually runs. */
const admit = async ({ header, ct, signature, verifier, key }) => {
  await relayAccepts(header, ct);
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signature),
    sigMessage(header),
  );
  if (!ok) throw new Error('envelope signature does not verify');
  return open(key, header.nonce, aadFor(header), ct);
};

// --- verification ------------------------------------------------------------------

const verify = async (doc) => {
  const key = await deriveNetKey(KG, WORKSPACE);
  const verifier = await importVerifier(KEYS.device.public_key);

  // Positive: every vector opens to the body it was built from.
  for (const c of CASES) {
    const v = doc.vectors.find((x) => x.name === c.name);
    const header = { ...c, digest: v.expected.digest };
    const plaintext = await admit({
      header,
      ct: unhex(v.expected.ciphertext),
      signature: v.expected.signature,
      verifier,
      key,
    });
    if (hex(plaintext) !== hex(body(c.actor.id, c.actor.kind, c.updates))) {
      throw new Error(`Vector "${c.name}" does not round-trip.`);
    }
  }

  const base = doc.vectors.find((x) => x.name === 'single-update');
  const header = { ...CASES[0], digest: base.expected.digest };
  const ct = unhex(base.expected.ciphertext);
  const ok = { header, ct, signature: base.expected.signature, verifier, key };

  // The AAD family: correct key and correct signature check skipped, one bound
  // header field differing between what the reader trusts and what was sealed.
  for (const { field, patch } of AAD_MUTATIONS) {
    await refuses(`aad-only-${field}`, () =>
      open(key, header.nonce, aadFor({ ...header, ...patch }), ct),
    );
  }

  // The signature family: the sealed bytes are untouched, one field differing
  // between what the reader trusts and what the credential signed.
  for (const { field, patch } of SIG_MUTATIONS) {
    await refuses(`sig-only-${field}`, async () => {
      const good = await crypto.subtle.verify(
        { name: 'Ed25519' },
        verifier,
        unhex(base.expected.signature),
        sigMessage({ ...header, ...patch }),
      );
      if (!good) throw new Error('envelope signature does not verify');
    });
  }

  const otherKey = await deriveNetKey(KG, OTHER_WORKSPACE);
  await refuses('wrong-workspace-subkey', () => open(otherKey, header.nonce, aadFor(header), ct));

  const impostorSig = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.other_credential.seed),
        sigMessage(header),
      ),
    ),
  );
  await refuses('signed-by-other-credential', () => admit({ ...ok, signature: impostorSig }));

  const flipped = Uint8Array.from(ct);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-tag-bit', () => open(key, header.nonce, aadFor(header), flipped));
  await refuses('truncated-ciphertext', () =>
    open(key, header.nonce, aadFor(header), ct.subarray(0, -1)),
  );
  await refuses('digest-not-of-ciphertext', () =>
    relayAccepts({ ...header, digest: 'ab'.repeat(32) }, ct),
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

// --- assembly -----------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();

  const key = await deriveNetKey(KG, WORKSPACE);
  const signer = await importSigner(KEYS.device.seed);

  const vectors = [];
  for (const c of CASES) {
    const plaintext = body(c.actor.id, c.actor.kind, c.updates);
    const aad = aadFor(c);
    const ct = await seal(key, c.nonce, aad, plaintext);
    const digest = hex(await sha256(ct));
    const message = sigMessage({ ...c, digest });
    vectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        k_g: hex(KG),
        v: c.v,
        workspace_id: c.workspace,
        credential_id: c.credential,
        epoch: c.epoch,
        gen: c.gen,
        seq: c.seq,
        nonce: c.nonce,
        actor_id: c.actor.id,
        actor_kind: c.actor.kind,
        updates: c.updates,
      },
      derived: {
        hkdf_info: hex(concat(lp(HKDF_LABEL), lp(c.workspace))),
        aad: hex(aad),
        body: hex(plaintext),
        signature_message: hex(message),
      },
      expected: {
        ciphertext: hex(ct),
        digest,
        signature: hex(
          new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, message)),
        ),
      },
    });
  }

  const doc = {
    $schema: 'https://done.invalid/vectors/envelope/1',
    generated_by: 'scripts/generate-envelope-vectors.mjs',
    selection: 'docs/selections/row-4-envelope-format.md',
    trd_row: 4,
    construction: {
      clear_header: 'v, workspace_id, credential_id, epoch, gen, seq, nonce[12], digest',
      sealed_body:
        'LP("done/env-body/v1") || LP(actor_id) || LP(actor_kind) || u32be(count) || ( u32be(len) || update )*',
      hkdf_info: 'LP("done/envelope/v1") || LP(workspace_id)',
      aad: 'LP("done/env/v1") || LP(dec v) || LP(workspace_id) || LP(credential_id) || LP(dec epoch) || LP(dec gen) || LP(dec seq)',
      signature:
        'Ed25519 over LP("done/env-sig/v1") || LP(dec v) || LP(workspace_id) || LP(credential_id) || LP(dec epoch) || LP(dec gen) || LP(dec seq) || LP(hex nonce) || LP(hex digest)',
      digest: 'SHA-256(ciphertext) — validated by the relay without a content key (§7.2)',
      nonce:
        '12 bytes from crypto.getRandomValues() per envelope, under a 2^32-per-generation budget that `seq` already bounds — row 3’s argument, unchanged',
      seq: 'The credential’s own monotonic position. The service’s accepted position must equal it, which is what makes row 5’s chain gap-free by construction rather than by assertion',
      batching:
        'One envelope carries one actor. A batch closes at a change of actor, credential, epoch or generation; at a flush interval that must not be shorter than the acceptance-head cadence, since the envelope waits for a head regardless (§7.5); or at a byte cap. The interval and cap are tunables with grounds, not constants with authority',
      length_prefix: 'uint16be(byteLength) || utf8 for text; uint32be for update bytes',
      not_here: {
        primitives:
          'AES-256-GCM, HKDF, SHA-256 and Ed25519 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        acceptance:
          'The link and head that travel beside an envelope are row 5’s, in test/vectors/finalization.json.',
        retention: 'How deep a device retains its own outbound envelopes is row 6.',
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
        'test/vectors/envelope.json is stale. Run: node scripts/generate-envelope-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('envelope.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} envelope vectors and ${NEGATIVES.length} negatives to test/vectors/envelope.json`,
  );
};

await main();
