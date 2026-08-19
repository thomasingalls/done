/**
 * Test vectors for chain-head discovery by a brand-new device (TRD §15 row 9, §13.5).
 *
 * The construction is specified in docs/selections/row-9-chain-head-discovery.md.
 * This script is the executable half of that document: it emits
 * test/vectors/head-discovery.json.
 *
 * §13.5 states the problem and does not solve it: "A returning client remembers
 * the newest head it has seen and rejects an ancestor. A brand-new client trusts
 * the service to identify the current head; there is no mechanism that fixes
 * that." This row narrows what "brand-new" covers rather than pretending to fix
 * it, and states what is left.
 *
 * Two of the three arrival paths stop being brand-new on inspection. A device
 * enrolled through §13.6's ceremony receives the head **through the person** —
 * row 11's transcript binds the authorization head, so the five typed symbols
 * authenticate where the lineage is as well as whose key it is. A device
 * restoring from a user-held migration package or fidelity archive has an
 * anchor from outside the service for the same reason.
 *
 * What is left is recovery with no surviving device, and this file is that
 * request: a **nonce-bound signed head assertion**. The nonce is what separates
 * a hostile relay from a hostile authorization service — the distinction §7.3
 * draws — because a captured assertion is unreplayable by anyone who does not
 * hold the authorization key.
 *
 * The primitive KATs are not here; Ed25519 and SHA-256 are row 1's. The epoch
 * head's own construction is §13.5's and row 7's, so it appears here as an
 * opaque digest, which is exactly what this row consumes it as.
 *
 * Usage: node scripts/generate-head-discovery-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/head-discovery.json', import.meta.url);

const ASSERT_LABEL = 'done/head-assert/v1';

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

// --- the construction --------------------------------------------------------------

/**
 * Assertion = Ed25519( K_auth ;
 *               LP("done/head-assert/v1") || LP(workspace_id) || LP(dec epoch)
 *               || LP(hex epoch_head) || LP(hex client_nonce) || LP(dec issued_at) )
 *
 * `client_nonce` is the field this row exists for. Without it the assertion is a
 * standing artifact any relay may keep and re-serve forever; with it, replay
 * requires the authorization key, which moves the residual from "anyone in the
 * path" to "the authorization service itself".
 *
 * `epoch` and `epoch_head` are both bound although the head commits to the
 * number. The redundancy costs two bytes and removes a class: an assertion
 * cannot pair a current-looking number with an older head.
 *
 * `issued_at` is displayed and not enforced. A clock is not evidence, and a
 * device recovering after device loss has no trustworthy one of its own.
 */
const assertionMessage = ({
  workspace,
  epoch,
  epochHead,
  clientNonce,
  issuedAt,
  label = ASSERT_LABEL,
}) =>
  concat(
    ...aadFields('head assertion', {
      label,
      workspace_id: workspace,
      epoch: String(epoch),
      epoch_head: epochHead,
      client_nonce: clientNonce,
      issued_at: String(issuedAt),
    }).map(lp),
  );

// --- keys ------------------------------------------------------------------------

/**
 * RFC 8032 §7.1's keypairs. TEST 2 is the authorization signing key; TEST 1
 * stands in for any other key in the deployment — row 5's acceptance key, a
 * relay's transport key — none of which may stand in for this one (§13.2).
 */
const KEYS = {
  authorization: {
    role: 'K_auth — the authorization signing key that signs epochs (§13.5). Not row 5’s K_accept.',
    source: 'RFC 8032 §7.1, TEST 2',
    seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    public_key: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  },
  other_service_key: {
    role: 'Another key the deployment holds. §13.2 forbids one key doing two jobs, and this is that rule as a vector.',
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

// --- the scenario ------------------------------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';

/**
 * Two epoch heads, an ancestor and its successor. Their construction is §13.5's
 * and row 7's; this row consumes them as opaque digests, which is all it needs
 * and all it is entitled to assume.
 */
const HEAD_9 = '2b7f0a9c14e6d3850fa2c51e86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36';
const HEAD_8 = 'c4e1a6b3d0f295847e3b1c0d9a8f7e6d5c4b3a29180f7e6d5c4b3a2918f0e7d6';

const CLIENT_NONCE = '7c1e5a3f9d2b8064e5a7c9b1d3f507294e6a8c0b2d4f6183a5c7e9b1d3f50729';
const SECOND_NONCE = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const ISSUED_AT = 1787270400;

const CURRENT = {
  workspace: WORKSPACE,
  epoch: 9,
  epochHead: HEAD_9,
  clientNonce: CLIENT_NONCE,
  issuedAt: ISSUED_AT,
};

const NEGATIVES = [
  {
    name: 'replayed-under-another-nonce',
    mutate:
      'The assertion a first device received, offered to a second device that sent its own nonce. **This is the row’s reason to exist**: without the nonce a captured assertion is a standing artifact any relay may re-serve forever, and replay stops requiring the authorization key.',
  },
  {
    name: 'aad-only-nonce-rewritten-to-match',
    mutate:
      'The captured assertion with its carried nonce **rewritten** to the second device’s, so the device’s own comparison passes and only the signature can refuse it. `replayed-under-another-nonce` above tests the client rule and does not test this: it fails on a string comparison whether or not the nonce is signed at all. The coverage audit found that gap on the one field this row exists for.',
  },
  {
    name: 'aad-only-stale-head',
    mutate:
      'A current epoch number paired with the previous epoch’s head. Isolates `epoch_head`, and is the attack the whole row is bounding — a self-consistent past served to a device with no history.',
  },
  {
    name: 'aad-only-wrong-epoch',
    mutate:
      'The current head paired with a different epoch number. Both are bound although the head commits to the number, so neither can be moved against the other.',
  },
  {
    name: 'aad-only-wrong-workspace',
    mutate:
      'Verify the assertion against another workspace. A device may hold several (§6.1), so this is an ordinary confusion rather than an exotic one.',
  },
  {
    name: 'aad-only-altered-issued-at',
    mutate:
      'Change the timestamp the device displays. It is not enforced — a recovering device has no trustworthy clock — but it is shown to a person, so it is signed.',
  },
  {
    name: 'aad-only-renumbered-label',
    mutate:
      'Verify under "done/head-assert/v2". The label is where this carrier authenticates its own version (row 1).',
  },
  {
    name: 'signed-by-another-service-key',
    mutate:
      'A well-formed assertion signed with a different key the deployment holds. §13.2 forbids one key doing two jobs; row 5’s acceptance key in particular is hot and this one need not be.',
  },
  {
    name: 'ancestor-offered-after-first-contact',
    mutate:
      'A correctly signed, correctly nonced assertion for epoch 8, offered to a device that has already recorded epoch 9. **The exposure is first contact only** — §13.5’s ancestor rule takes over the moment a head is recorded, and this is that boundary as a vector rather than a sentence.',
  },
];

// --- what an arriving device does ----------------------------------------------------

/**
 * Verify a head assertion. `sentNonce` is what *this* device generated, not what
 * the assertion carries, which is the whole point of checking it.
 */
const acceptHead = async ({ assertion, signature, sentNonce, verifier, recordedEpoch = null }) => {
  if (assertion.clientNonce !== sentNonce) {
    throw new Error('assertion answers a nonce this device did not send');
  }
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    verifier,
    unhex(signature),
    assertionMessage(assertion),
  );
  if (!ok) throw new Error('head assertion does not verify');

  // §13.5's ancestor rule. It does nothing at first contact, and everything
  // afterwards; the bound this row states is exactly the gap it cannot cover.
  if (recordedEpoch !== null && assertion.epoch < recordedEpoch) {
    throw new Error(
      `ancestor: epoch ${String(assertion.epoch)} is older than the recorded ${String(recordedEpoch)}`,
    );
  }
  return { epoch: assertion.epoch, head: assertion.epochHead };
};

// --- verification ----------------------------------------------------------------------

const verify = async (doc) => {
  const verifier = await importVerifier(KEYS.authorization.public_key);
  const signer = await importSigner(KEYS.authorization.seed);
  const current = doc.vectors.find((v) => v.name === 'current-head');
  const base = {
    assertion: CURRENT,
    signature: current.expected.signature,
    sentNonce: CLIENT_NONCE,
    verifier,
  };

  // Positive: the device that sent this nonce accepts, and records epoch 9.
  const got = await acceptHead(base);
  if (got.head !== HEAD_9) throw new Error('current-head does not verify.');

  await refuses('replayed-under-another-nonce', () =>
    acceptHead({ ...base, sentNonce: SECOND_NONCE }),
  );

  // The same replay with the carried nonce rewritten so the device's own
  // comparison passes. Only the signature refuses this one, which is what makes
  // it the isolating negative for `client_nonce` — and the negative above is
  // not, because a string comparison fails whether or not the field is signed.
  await refuses('aad-only-nonce-rewritten-to-match', () =>
    acceptHead({
      ...base,
      assertion: { ...CURRENT, clientNonce: SECOND_NONCE },
      sentNonce: SECOND_NONCE,
    }),
  );

  // The message family: one bound field differing between what the device
  // verifies and what the service signed.
  for (const [name, patch] of [
    ['aad-only-stale-head', { epochHead: HEAD_8 }],
    ['aad-only-wrong-epoch', { epoch: 8 }],
    ['aad-only-wrong-workspace', { workspace: 'ws_01J0000000000000000000000A' }],
    ['aad-only-altered-issued-at', { issuedAt: ISSUED_AT - 86_400 }],
    ['aad-only-renumbered-label', { label: 'done/head-assert/v2' }],
  ]) {
    await refuses(name, () => acceptHead({ ...base, assertion: { ...CURRENT, ...patch } }));
  }

  const otherSig = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await importSigner(KEYS.other_service_key.seed),
        assertionMessage(CURRENT),
      ),
    ),
  );
  await refuses('signed-by-another-service-key', () =>
    acceptHead({ ...base, signature: otherSig }),
  );

  // The ancestor rule: a genuine assertion for an older epoch, freshly nonced,
  // offered to a device that is no longer at first contact.
  await refuses('ancestor-offered-after-first-contact', async () => {
    const older = { ...CURRENT, epoch: 8, epochHead: HEAD_8, clientNonce: SECOND_NONCE };
    const signature = hex(
      new Uint8Array(
        await crypto.subtle.sign({ name: 'Ed25519' }, signer, assertionMessage(older)),
      ),
    );
    await acceptHead({
      assertion: older,
      signature,
      sentNonce: SECOND_NONCE,
      verifier,
      recordedEpoch: 9,
    });
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

// --- assembly --------------------------------------------------------------------------

const main = async () => {
  await checkKeypairs();
  const signer = await importSigner(KEYS.authorization.seed);

  const vectors = [];
  for (const c of [
    {
      name: 'current-head',
      why: 'What a recovering device with no surviving device receives, answering the nonce it sent.',
      assertion: CURRENT,
    },
    {
      name: 'same-head-second-device',
      why: 'The same head for a second arriving device. A different nonce means a different signature, which is what makes the first one unreplayable.',
      assertion: { ...CURRENT, clientNonce: SECOND_NONCE },
    },
    {
      name: 'ancestor-head',
      why: 'A genuine assertion for the previous epoch. Correctly signed and correctly nonced — refused only by §13.5’s ancestor rule, and only by a device that already has a head.',
      assertion: { ...CURRENT, epoch: 8, epochHead: HEAD_8, clientNonce: SECOND_NONCE },
    },
  ]) {
    const message = assertionMessage(c.assertion);
    vectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        workspace_id: c.assertion.workspace,
        epoch: c.assertion.epoch,
        epoch_head: c.assertion.epochHead,
        client_nonce: c.assertion.clientNonce,
        issued_at: c.assertion.issuedAt,
      },
      derived: { message: hex(message) },
      expected: {
        signature: hex(
          new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, message)),
        ),
      },
    });
  }

  const doc = {
    $schema: 'https://done.invalid/vectors/head-discovery/1',
    generated_by: 'scripts/generate-head-discovery-vectors.mjs',
    selection: 'docs/selections/row-9-chain-head-discovery.md',
    trd_row: 9,
    construction: {
      shape:
        'Narrow what "brand-new" covers, then bound what is left. Two of three arrival paths carry an anchor from outside the service; the third asks, with a nonce.',
      paths: {
        enrollment:
          'The head arrives through the person. Row 11’s transcript binds the epoch head, so the five typed symbols authenticate where the lineage is as well as whose key it is. No service trust at all.',
        migration:
          'A user-held package or fidelity archive carries a signed head (rows 10, §9.3, §14). Same in kind as enrollment: the anchor came from outside the service.',
        recovery:
          'No surviving device. The only genuinely brand-new case, and what the assertion below is for.',
      },
      assertion:
        'Ed25519( K_auth ; LP("done/head-assert/v1") || LP(workspace_id) || LP(dec epoch) || LP(hex epoch_head) || LP(hex client_nonce) || LP(dec issued_at) )',
      client_nonce: '32 fresh bytes from the arriving device, per request',
      issued_at:
        'Seconds. Displayed to the person, never enforced — a recovering device has no trustworthy clock',
      rules: [
        'Refuse an assertion answering a nonce this device did not send.',
        'Record the head at first contact; from then on §13.5’s ancestor rule applies and this row is finished.',
        'Show the person the epoch, its age and the device list it implies, because on the recovery path that display is the only remaining check.',
      ],
      residual:
        'A hostile authorization service can serve a recovering device a stale, self-consistent head at first contact. It cannot also show current content: revocation is atomic with rotation (§7.5), so a hidden revocation is a hidden generation, and a device on the stale generation cannot read anything written after it. The attack degrades to a partition, which is availability rather than integrity.',
      not_here: {
        primitives: 'Ed25519 and SHA-256 KATs are row 1’s, in test/vectors/algorithm-suite.json.',
        epoch_head:
          'How an epoch head is computed is §13.5’s and row 7’s. This row consumes it as an opaque digest, which is all it is entitled to assume.',
        transport: 'How the request and answer are framed is row 4’s.',
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
        'test/vectors/head-discovery.json is stale. Run: node scripts/generate-head-discovery-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('head-discovery.json is current, and every negative still fails.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} assertion vectors and ${NEGATIVES.length} negatives to test/vectors/head-discovery.json`,
  );
};

await main();
