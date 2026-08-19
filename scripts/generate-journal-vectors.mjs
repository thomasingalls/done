/**
 * Test vectors for the synchronous journal AEAD (TRD §15 row 2, §6.1).
 *
 * The construction is specified in docs/selections/row-2-journal-aead.md. This
 * script is the executable half of that document: it emits
 * test/vectors/journal-aead.json, which Stage 1's implementation must reproduce
 * byte for byte.
 *
 * Two kinds of vector, and the distinction matters to a reviewer:
 *
 *   - The *primitive* vector is copied from draft-irtf-cfrg-xchacha-03 §A.3.1.
 *     It proves the chosen implementation is XChaCha20-Poly1305 and nothing
 *     else. It is not ours and must never be regenerated — a KAT that is
 *     produced by the code it checks proves only that the code is consistent
 *     with itself.
 *   - The *composition* vectors are ours. They pin subkey derivation, the AAD
 *     encoding and the record framing, which is where a construction that uses
 *     a correct primitive still goes wrong.
 *
 * Nonces are inputs here. In production every nonce is 24 fresh bytes from
 * crypto.getRandomValues(); a vector has to fix one to be a vector at all, and
 * that fixing is not the nonce discipline.
 *
 * Usage: node scripts/generate-journal-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/journal-aead.json', import.meta.url);

const HKDF_LABEL = 'done/journal/v1';
const AAD_LABEL = 'done/jrnl/v1';
const RECORD_VERSION = '2:';

const utf8 = (s) => new TextEncoder().encode(s);
const hex = (u) => Buffer.from(u).toString('hex');
const unhex = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const b64 = (u) => Buffer.from(u).toString('base64');

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
 * Delimiter-joined associated data is ambiguous — a workspace id containing the
 * delimiter shifts every field after it, and two different contexts can encode
 * to the same bytes. Length prefixes make the encoding injective, which is the
 * only property AAD actually needs.
 */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const u32be = (n) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/**
 * K_journal = HKDF-SHA256(ikm = K_g, salt = "", info = LP(label) || LP(workspace), L = 32)
 *
 * WebCrypto rather than a JS HKDF because derivation happens once at open,
 * where async is free — the synchronous constraint binds the per-write path
 * only (§6.1). That keeps the bundle cost to the AEAD alone.
 *
 * K_g is already per-generation, so the subkey is too; the generation is not in
 * `info`. What the record's `gen` field selects is which K_g to derive from.
 */
const deriveJournalKey = async (kg, workspaceId) => {
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
  return new Uint8Array(bits);
};

/**
 * AAD = LP(label) || LP(workspace) || LP(gen) || LP(journalKey)
 *
 * The field list goes through aadFields so scripts/check-aad-coverage.mjs can
 * remove one field at a time and prove a negative below is testing it. The
 * encoding stays here, because it is what the selection document specifies.
 */
const aadFor = (workspaceId, gen, journalKey, label = AAD_LABEL) =>
  concat(
    ...aadFields('journal record', {
      label,
      workspace_id: workspaceId,
      gen: String(gen),
      journal_storage_key: journalKey,
    }).map(lp),
  );

/** Record = "2:" || base64( u32be(gen) || nonce[24] || ciphertext || tag[16] ) */
const seal = (journalKey, nonce, aad, plaintext, gen) =>
  RECORD_VERSION +
  b64(concat(u32be(gen), nonce, xchacha20poly1305(journalKey, nonce, aad).encrypt(plaintext)));

// --- the primitive KAT, copied not generated ----------------------------------

const PRIMITIVE_KAT = {
  source: 'draft-irtf-cfrg-xchacha-03 §A.3.1',
  note: 'Copied from the draft. Never regenerate: a KAT produced by the code it checks proves nothing.',
  key: '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f',
  nonce: '404142434445464748494a4b4c4d4e4f5051525354555657',
  aad: '50515253c0c1c2c3c4c5c6c7',
  plaintext_utf8:
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  ciphertext_first_16: 'bd6d179d3e83d43b9576579493c0e939',
  tag: 'c0875924c1c7987947deafd8780acf49',
};

const checkPrimitiveKat = () => {
  const out = xchacha20poly1305(
    unhex(PRIMITIVE_KAT.key),
    unhex(PRIMITIVE_KAT.nonce),
    unhex(PRIMITIVE_KAT.aad),
  ).encrypt(utf8(PRIMITIVE_KAT.plaintext_utf8));
  const head = hex(out.slice(0, 16));
  const tag = hex(out.slice(-16));
  if (head !== PRIMITIVE_KAT.ciphertext_first_16 || tag !== PRIMITIVE_KAT.tag) {
    throw new Error(`Primitive KAT failed: head=${head} tag=${tag}`);
  }
};

// --- the composition vectors, ours --------------------------------------------

const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');

const CASES = [
  {
    name: 'empty-update',
    why: 'A zero-length plaintext still authenticates; the tag and framing must not depend on payload length.',
    gen: 1,
    journalKey: 'done.pending-update.done.0',
    nonce: '000102030405060708090a0b0c0d0e0f1011121314151617',
    plaintext: '',
  },
  {
    name: 'keystroke-update',
    why: 'An 18-byte Yjs update — the measured size of one keystroke, and the common case for this path.',
    gen: 1,
    journalKey: 'done.pending-update.done.7',
    nonce: '404142434445464748494a4b4c4d4e4f5051525354555657',
    plaintext: '01010101a8e0c9d20500042101087903c0a8',
  },
  {
    name: 'rotated-generation',
    why: 'Generation is a cleartext header field, so it is in the AAD. A record claiming gen=2 cannot be replayed as gen=1.',
    gen: 2,
    journalKey: 'done.pending-update.done.7',
    nonce: '404142434445464748494a4b4c4d4e4f5051525354555657',
    plaintext: '01010101a8e0c9d20500042101087903c0a8',
  },
  {
    name: 'second-workspace',
    why: 'Same K_g, same nonce, same plaintext, different workspace. Proves the subkey is workspace-bound.',
    gen: 1,
    workspace: 'ws_01J0000000000000000000000A',
    journalKey: 'done.pending-update.done.7',
    nonce: '404142434445464748494a4b4c4d4e4f5051525354555657',
    plaintext: '01010101a8e0c9d20500042101087903c0a8',
  },
];

const NEGATIVES = [
  {
    name: 'wrong-workspace',
    mutate:
      'Derive the subkey for a different workspace id. Tests the HKDF info binding only -- the AAD half is aad-only-other-workspace.',
  },
  {
    name: 'wrong-generation',
    mutate: 'Authenticate with gen=2 in the AAD against a record written under gen=1.',
  },
  {
    name: 'moved-slot',
    mutate: 'Authenticate with journalKey ...done.8 against a record written for ...done.7.',
  },
  { name: 'flipped-tag-bit', mutate: 'Flip the low bit of the final tag byte.' },
  { name: 'truncated-record', mutate: 'Drop the final byte of the record.' },
  {
    name: 'wrong-version-prefix',
    mutate: 'Replace the "2:" prefix with "1:" (a pre-encryption plaintext entry).',
  },
  // The AAD-only group. Every field in the AAD needs an entry here or its
  // binding is untested: workspace_id is bound in the HKDF info as well, so a
  // negative that changes the derived key proves only that one of the two
  // works. That gap was real -- removing LP(workspace_id) from the AAD passed
  // every negative above it.
  {
    name: 'aad-only-other-workspace',
    mutate:
      'Authenticate with the other workspace in the AAD, subkey unchanged. Isolates the AAD binding from the HKDF info.',
  },
  {
    name: 'aad-only-hkdf-label',
    mutate:
      'Authenticate with the HKDF label in the AAD label position -- what one constant reached for twice produces.',
  },
  {
    name: 'aad-only-renumbered-label',
    mutate:
      'Authenticate with "done/jrnl/v2". The label is where this carrier authenticates its own version, so a renumbered record must fail to open rather than select another suite (row 1).',
  },
];

/**
 * Prove the vectors say something. A composition vector that does not round-trip
 * is a typo, and a "must fail" list whose entries quietly succeed is worse than
 * no list at all — so both are asserted here rather than asserted in prose.
 */
const open = (journalKey, record, aad) => {
  if (!record.startsWith(RECORD_VERSION)) throw new Error('bad version prefix');
  const raw = new Uint8Array(Buffer.from(record.slice(RECORD_VERSION.length), 'base64'));
  const gen = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3];
  const nonce = raw.subarray(4, 28);
  const sealed = raw.subarray(28);
  return { gen, plaintext: xchacha20poly1305(journalKey, nonce, aad).decrypt(sealed) };
};

const verify = async (vectors) => {
  for (const v of vectors) {
    const kj = unhex(v.derived.k_journal);
    const aad = unhex(v.derived.aad);
    const got = open(kj, v.expected.record, aad);
    if (hex(got.plaintext) !== v.inputs.plaintext) {
      throw new Error(`Vector "${v.name}" does not round-trip.`);
    }
    if (got.gen !== v.inputs.gen) throw new Error(`Vector "${v.name}" gen mismatch.`);
  }

  // The negatives, against the keystroke vector.
  const base = vectors.find((v) => v.name === 'keystroke-update');
  const kj = unhex(base.derived.k_journal);
  const { workspace_id: ws, gen, journal_storage_key: jk } = base.inputs;
  const rec = base.expected.record;

  const otherKey = await deriveJournalKey(KG, 'ws_01J0000000000000000000000A');
  await refuses('wrong-workspace', () => open(otherKey, rec, aadFor(ws, gen, jk)));
  await refuses('wrong-generation', () => open(kj, rec, aadFor(ws, gen + 1, jk)));
  await refuses('moved-slot', () => open(kj, rec, aadFor(ws, gen, 'done.pending-update.done.8')));

  const flipped = Buffer.from(rec.slice(RECORD_VERSION.length), 'base64');
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-tag-bit', () =>
    open(kj, RECORD_VERSION + flipped.toString('base64'), aadFor(ws, gen, jk)),
  );

  const truncated = Buffer.from(rec.slice(RECORD_VERSION.length), 'base64').subarray(0, -1);
  await refuses('truncated-record', () =>
    open(kj, RECORD_VERSION + Buffer.from(truncated).toString('base64'), aadFor(ws, gen, jk)),
  );

  await refuses('wrong-version-prefix', () =>
    open(kj, '1:' + rec.slice(RECORD_VERSION.length), aadFor(ws, gen, jk)),
  );

  // The AAD-only group: the correct K_journal throughout, one bound field changed.
  await refuses('aad-only-other-workspace', () =>
    open(kj, rec, aadFor('ws_01J0000000000000000000000A', gen, jk)),
  );
  await refuses('aad-only-hkdf-label', () => open(kj, rec, aadFor(ws, gen, jk, HKDF_LABEL)));
  await refuses('aad-only-renumbered-label', () =>
    open(kj, rec, aadFor(ws, gen, jk, 'done/jrnl/v2')),
  );

  // The published list and the executed checks must be the same list, in both
  // directions. A "must fail" entry that quietly stops failing is the defect
  // this file was written to prevent; one that is published but never run is
  // the same defect a level up, and it is invisible without this comparison.
  const published = new Set(NEGATIVES.map((n) => n.name));
  const asserted = assertedNames();
  const unrun = [...published].filter((n) => !asserted.includes(n));
  const unpublished = asserted.filter((n) => !published.has(n));
  if (unrun.length > 0)
    throw new Error(`Negatives published but never asserted: ${unrun.join(', ')}`);
  if (unpublished.length > 0)
    throw new Error(`Negatives asserted but not published: ${unpublished.join(', ')}`);
};

const main = async () => {
  checkPrimitiveKat();

  const vectors = [];
  for (const c of CASES) {
    const workspace = c.workspace ?? WORKSPACE;
    const journalKeyBytes = await deriveJournalKey(KG, workspace);
    const nonce = unhex(c.nonce);
    const plaintext = unhex(c.plaintext);
    const aad = aadFor(workspace, c.gen, c.journalKey);
    vectors.push({
      name: c.name,
      why: c.why,
      inputs: {
        k_g: hex(KG),
        workspace_id: workspace,
        gen: c.gen,
        journal_storage_key: c.journalKey,
        nonce: c.nonce,
        plaintext: c.plaintext,
      },
      derived: {
        hkdf_info: hex(concat(lp(HKDF_LABEL), lp(workspace))),
        k_journal: hex(journalKeyBytes),
        aad: hex(aad),
      },
      expected: { record: seal(journalKeyBytes, nonce, aad, plaintext, c.gen) },
    });
  }

  await verify(vectors);
  reportAudit(NEGATIVES.map((n) => n.name));

  const doc = {
    $schema: 'https://done.invalid/vectors/journal-aead/1',
    generated_by: 'scripts/generate-journal-vectors.mjs',
    selection: 'docs/selections/row-2-journal-aead.md',
    trd_row: 2,
    construction: {
      aead: 'XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha-03)',
      nonce: '24 bytes from crypto.getRandomValues() per record; no counter, no durable state',
      kdf: 'HKDF-SHA256 via WebCrypto deriveBits, at open',
      hkdf_info: 'LP("done/journal/v1") || LP(workspace_id)',
      aad: 'LP("done/jrnl/v1") || LP(workspace_id) || LP(decimal gen) || LP(journal_storage_key)',
      length_prefix: 'uint16be(byteLength) || utf8 — injective, so no field can shift another',
      record: '"2:" || base64( u32be(gen) || nonce[24] || ciphertext || tag[16] )',
      nonce_caveat:
        'Nonces are fixed inputs in these vectors so the composition is testable. Production generates them randomly; the fixed nonce is not the discipline.',
    },
    primitive_kat: PRIMITIVE_KAT,
    vectors,
    must_fail: NEGATIVES,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/journal-aead.json is stale. Run: node scripts/generate-journal-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('journal-aead.json is current, and the primitive KAT passes.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${vectors.length} composition vectors and ${NEGATIVES.length} negatives to test/vectors/journal-aead.json`,
  );
};

await main();
