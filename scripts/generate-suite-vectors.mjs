/**
 * Test vectors for the algorithm suite and its agility rule (TRD §15 row 1, §13.2, §13.10).
 *
 * The selection is specified in docs/selections/row-1-algorithm-suite.md. This
 * script is the executable half of that document. It emits
 * test/vectors/algorithm-suite.json, which carries three kinds of thing:
 *
 *   - The *primitive KATs*, copied from their standards and never generated.
 *     They prove the implementation is the named primitive and nothing else.
 *     A KAT produced by the code it checks proves only self-consistency.
 *   - The *suite and carrier registry*, which is the agility mechanism itself:
 *     a carrier version selects a whole suite, so there is no per-record
 *     algorithm field to negotiate and therefore none to downgrade.
 *   - The *separation check*, which is TRD §13.2's rule made executable. If a
 *     later edit reuses one primitive across the asynchronous and synchronous
 *     paths, this script fails rather than the reviewer catching it.
 *
 * Each generator under scripts/ is deliberately self-contained, including its
 * copy of `lp`. A reviewer opens one file and reads a construction end to end;
 * a shared helper would buy deduplication at the cost of that property, and
 * drift between copies is caught by the vectors themselves.
 *
 * Usage: node scripts/generate-suite-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/algorithm-suite.json', import.meta.url);

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

/** Length-prefixed field: uint16be(byteLength) || utf8. Injective, so no field can shift another. */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

// --- suite 1 -------------------------------------------------------------------

/**
 * One suite, every role. `path` is the load-bearing column: TRD §13.2 forbids
 * one primitive key crossing the asynchronous/synchronous boundary and §13.10
 * states the criterion as no primitive shared between the two paths. The
 * stronger reading is the one checked below.
 */
const SUITE_1 = {
  'content-store-aead': {
    primitive: 'AES-256-GCM',
    provider: 'WebCrypto',
    path: 'async',
    nonce: '96-bit, random per record',
    why: 'Native and hardware-accelerated, so it adds no bundle. Forced to differ from the journal by §13.2.',
  },
  'local-key-envelope-aead': {
    primitive: 'AES-256-GCM',
    provider: 'WebCrypto',
    path: 'async',
    nonce: '96-bit, random per envelope',
    why: 'Same path, same primitive; L_local is a non-extractable AES-GCM CryptoKey (§13.3).',
  },
  'network-envelope-aead': {
    primitive: 'AES-256-GCM',
    provider: 'WebCrypto',
    path: 'async',
    nonce: '96-bit, random per envelope',
    why: 'Named here so the suite is complete. Its wire format is row 4 and review 3b.',
  },
  'journal-aead': {
    primitive: 'XChaCha20-Poly1305',
    provider:
      'audited RustCrypto chacha20poly1305 crate, compiled to an inlined wasm module (wasm/journal-seal), instantiated synchronously',
    path: 'sync',
    nonce: '192-bit, random per record',
    why: 'Selected by row 2. The only primitive the platform does not supply, and the only one on the crash path.',
  },
  'subkey-derivation': {
    primitive: 'HKDF-SHA-256',
    provider: 'WebCrypto deriveBits',
    path: 'async',
    why: 'Derivation happens once at open, where async is free. Labels are what keep §13.2 separation real.',
  },
  'mutation-signature': {
    primitive: 'Ed25519',
    provider: 'WebCrypto',
    path: 'async',
    why: 'Small, fast, widely reviewed. Availability is now broad enough that the fallback path §13.10 anticipated is a compatibility question, not a design one.',
  },
  'public-key-wrap': {
    primitive: 'HPKE base mode, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM',
    provider: 'library, unselected',
    path: 'async',
    ids: { kem: '0x0020', kdf: '0x0001', aead: '0x0002' },
    why: 'RFC 9180 with the most widely implemented ciphersuite. Covers the R_pub and per-reader wrap cases uniformly (§13.2).',
  },
  hash: {
    primitive: 'SHA-256',
    provider: 'WebCrypto',
    path: 'both',
    why: 'One hash everywhere HKDF, signatures and commitments need one.',
  },
};

/** Roles this row deliberately does not fill, each with the row that owns it. */
const DEFERRED = {
  'recovery-code-stretching': {
    owner: 'TRD §15 row 14',
    why: 'A choice about the code’s entropy and presentation, not about the KDF (§13.10). Argon2id or none falls out of that, and the row is not started.',
  },
  'slot-verifier': {
    owner: 'TRD §15 row 12',
    why: 'Must resist offline guessing by a profile holder (§13.9). Assigned to review 3b by §15, so it is not this row’s to take.',
  },
  'device-lock-derivation': {
    owner: 'TRD §15 row 13',
    why: 'Which factor replaces the promptless handle (§13.3). Row 3 defines the envelope format; row 13 decides what opens it.',
  },
};

// --- the carrier registry, which is the agility mechanism ----------------------

/**
 * The rule: a carrier's version selects an entire suite. There is no per-record
 * algorithm identifier, so there is nothing to negotiate and nothing to
 * downgrade. Every carrier that has associated data puts its own version in it,
 * so a renumbered record fails authentication rather than selecting a weaker
 * suite -- fail-closed by construction rather than by a remembered check.
 */
const CARRIERS = [
  {
    name: 'content-record',
    version: 1,
    encoding: 'StoredRecord.v (a structured-clone field)',
    suite: 1,
    label: 'done/store/v1',
    selected_by: 'row 3',
    in_aad: true,
  },
  {
    name: 'journal-entry',
    version: 2,
    encoding: 'the "2:" string prefix on the localStorage value',
    suite: 1,
    label: 'done/jrnl/v1',
    selected_by: 'row 2',
    in_aad: true,
    note: 'Version 2 under suite 1 is not an inconsistency. The leading integer is the carrier framing, which counted from 1 when the journal was plaintext; the trailing v1 in the label is the suite. §4 of the row 1 document explains why both axes exist.',
  },
  {
    name: 'local-key-envelope',
    version: 1,
    encoding: 'KeyEnvelope.v (a structured-clone field)',
    suite: 1,
    label: 'done/keyenv/v1',
    selected_by: 'row 3',
    in_aad: true,
  },
  {
    name: 'network-envelope',
    version: null,
    encoding: 'unselected',
    suite: null,
    label: null,
    selected_by: 'row 4, review 3b',
    in_aad: null,
  },
];

/** What a reader does with each (carrier, version) it might meet. */
const ACCEPTANCE = [
  {
    carrier: 'content-record',
    version: 1,
    verdict: 'accept',
    why: 'The only version this suite defines.',
  },
  {
    carrier: 'content-record',
    version: 0,
    verdict: 'refuse-and-report',
    why: 'No version 0 was ever written. A record claiming one is malformed or hostile.',
  },
  {
    carrier: 'content-record',
    version: 2,
    verdict: 'refuse-and-report',
    why: 'Above what this reader knows. A newer writer touched this store; guessing at its framing is how a store gets corrupted.',
  },
  { carrier: 'journal-entry', version: 2, verdict: 'accept', why: 'The encrypted journal.' },
  {
    carrier: 'journal-entry',
    version: 1,
    verdict: 'refuse-and-report',
    why: 'A plaintext entry from a pre-encryption build. Replaying it means shipping a plaintext reader, which §6.1 forbids and §11.1 tests for.',
  },
  {
    carrier: 'local-key-envelope',
    version: 1,
    verdict: 'accept',
    why: 'The only version this suite defines.',
  },
  {
    carrier: 'local-key-envelope',
    version: 2,
    verdict: 'refuse-and-report',
    why: 'Above what this reader knows. Refusing a key envelope closes the workspace; opening it wrongly loses it.',
  },
];

// --- primitive KATs, copied not generated --------------------------------------

const PRIMITIVE_KATS = [
  {
    role: 'content-store-aead / local-key-envelope-aead / network-envelope-aead',
    primitive: 'AES-256-GCM',
    source: 'McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", Test Case 16',
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbaddecaf888',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
    ciphertext:
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662',
    tag: '76fc6ece0f4e1768cddf8853bb2d551b',
  },
  {
    role: 'subkey-derivation',
    primitive: 'HKDF-SHA-256',
    source: 'RFC 5869 Appendix A, Test Case 1',
    ikm: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
    salt: '000102030405060708090a0b0c',
    info: 'f0f1f2f3f4f5f6f7f8f9',
    length_bytes: 42,
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  {
    role: 'mutation-signature',
    primitive: 'Ed25519',
    source: 'RFC 8032 §7.1, TEST 1',
    seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    public_key: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    message: '',
    signature:
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  },
  {
    role: 'hash',
    primitive: 'SHA-256',
    source: 'FIPS 180-4, one-block message "abc"',
    message_utf8: 'abc',
    digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
];

/** The PKCS#8 prefix for a raw Ed25519 seed, so WebCrypto can import RFC 8032's test key. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

const checkPrimitiveKats = async () => {
  for (const kat of PRIMITIVE_KATS) {
    if (kat.primitive === 'AES-256-GCM') {
      const k = await crypto.subtle.importKey('raw', unhex(kat.key), 'AES-GCM', false, ['encrypt']);
      const out = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: unhex(kat.iv), additionalData: unhex(kat.aad), tagLength: 128 },
          k,
          unhex(kat.plaintext),
        ),
      );
      if (hex(out.slice(0, -16)) !== kat.ciphertext || hex(out.slice(-16)) !== kat.tag) {
        throw new Error('AES-256-GCM KAT failed.');
      }
    } else if (kat.primitive === 'HKDF-SHA-256') {
      const ikm = await crypto.subtle.importKey('raw', unhex(kat.ikm), 'HKDF', false, [
        'deriveBits',
      ]);
      const okm = new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: unhex(kat.salt), info: unhex(kat.info) },
          ikm,
          kat.length_bytes * 8,
        ),
      );
      if (hex(okm) !== kat.okm) throw new Error('HKDF-SHA-256 KAT failed.');
    } else if (kat.primitive === 'Ed25519') {
      const priv = await crypto.subtle.importKey(
        'pkcs8',
        unhex(ED25519_PKCS8_PREFIX + kat.seed),
        'Ed25519',
        false,
        ['sign'],
      );
      const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', priv, unhex(kat.message)));
      if (hex(sig) !== kat.signature) throw new Error('Ed25519 KAT failed.');
      const pub = await crypto.subtle.importKey('raw', unhex(kat.public_key), 'Ed25519', false, [
        'verify',
      ]);
      if (!(await crypto.subtle.verify('Ed25519', pub, sig, unhex(kat.message)))) {
        throw new Error('Ed25519 KAT verified false.');
      }
    } else if (kat.primitive === 'SHA-256') {
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(kat.message_utf8)));
      if (hex(d) !== kat.digest) throw new Error('SHA-256 KAT failed.');
    } else {
      throw new Error(`No check implemented for KAT primitive ${kat.primitive}.`);
    }
  }
};

/**
 * TRD §13.2's separation rule, executable.
 *
 * §13.2 states it about keys ("one primitive key must not be reused across the
 * asynchronous and synchronous constructions") and §13.10 states it about
 * primitives ("no primitive reused across the asynchronous and synchronous
 * paths"). Those are not the same sentence, and the suite satisfies the
 * stronger one -- which is what this asserts, so a later edit that satisfies
 * only the weaker one fails here rather than at the review.
 */
const checkSeparation = () => {
  const bucket = (want) =>
    new Set(
      Object.values(SUITE_1)
        .filter((r) => r.path === want)
        .map((r) => r.primitive),
    );
  const asyncPath = bucket('async');
  const syncPath = bucket('sync');
  const shared = [...asyncPath].filter((p) => syncPath.has(p));
  if (shared.length > 0) {
    throw new Error(
      `TRD §13.10 violated: primitive(s) shared across the async and sync paths: ${shared.join(', ')}`,
    );
  }
  if (syncPath.size === 0)
    throw new Error('No synchronous primitive in the suite; row 2 should supply one.');
  return { async: [...asyncPath].toSorted(), sync: [...syncPath].toSorted(), shared };
};

/** Every carrier must name a defined suite, or be explicitly unselected with an owner. */
const checkCarriers = () => {
  for (const c of CARRIERS) {
    if (c.suite === null) {
      if (!c.selected_by)
        throw new Error(`Carrier ${c.name} is unselected and names no owning row.`);
      continue;
    }
    if (c.suite !== 1)
      throw new Error(`Carrier ${c.name} names suite ${c.suite}, which is not defined.`);
    if (!c.label?.endsWith(`/v${c.suite}`)) {
      throw new Error(`Carrier ${c.name}'s label ${c.label} does not end in its suite version.`);
    }
    if (!c.in_aad) throw new Error(`Carrier ${c.name} does not authenticate its own version.`);
  }
  for (const a of ACCEPTANCE) {
    const carrier = CARRIERS.find((c) => c.name === a.carrier);
    if (!carrier) throw new Error(`Acceptance row names unknown carrier ${a.carrier}.`);
    const shouldAccept = carrier.version === a.version;
    if (shouldAccept !== (a.verdict === 'accept')) {
      throw new Error(
        `Acceptance row ${a.carrier}/${a.version} says "${a.verdict}" but the registry says otherwise.`,
      );
    }
  }
};

/** Every role is either selected in the suite or deferred to a named row. Nothing falls through. */
const checkCoverage = () => {
  const roles = [...Object.keys(SUITE_1), ...Object.keys(DEFERRED)];
  const dupes = roles.filter((r, i) => roles.indexOf(r) !== i);
  if (dupes.length > 0) throw new Error(`Role selected and deferred at once: ${dupes.join(', ')}`);
  for (const [role, d] of Object.entries(DEFERRED)) {
    if (!/row \d+/.test(d.owner)) throw new Error(`Deferred role ${role} names no owning row.`);
  }
};

const main = async () => {
  await checkPrimitiveKats();
  const separation = checkSeparation();
  checkCarriers();
  checkCoverage();

  // No AAD composition lives in this file -- it carries published KATs and the
  // carrier-version table -- but it reports that emptiness rather than staying
  // silent, because scripts/check-aad-coverage.mjs discovers generators instead
  // of being given a list, and cannot tell "no AAD" from "forgot to report".
  reportAudit();

  const doc = {
    $schema: 'https://done.invalid/vectors/algorithm-suite/1',
    generated_by: 'scripts/generate-suite-vectors.mjs',
    selection: 'docs/selections/row-1-algorithm-suite.md',
    trd_row: 1,
    rule: {
      statement:
        'A carrier version selects an entire suite. There is no per-record algorithm identifier, no negotiation, and therefore nothing to downgrade.',
      reader:
        'A reader knows a fixed compiled-in set of (carrier, version) pairs, accepts exactly those, and refuses everything else including versions above its own.',
      refusal:
        'Refusal is reported and the carrier is left intact. Never skipped silently, never deleted by the read path.',
      binding:
        'Every carrier authenticates its own version in its associated data, so a renumbered record fails to open rather than selecting a weaker suite.',
      label:
        'done/<carrier>/v<suite> -- the trailing integer is the suite, not the carrier framing.',
    },
    suites: { 1: { roles: SUITE_1, deferred: DEFERRED } },
    carriers: CARRIERS,
    acceptance: ACCEPTANCE,
    separation_check: separation,
    domain_labels: Object.fromEntries(
      CARRIERS.filter((c) => c.label).map((c) => [
        c.label,
        { lp_hex: hex(lp(c.label)), carrier: c.name },
      ]),
    ),
    primitive_kats: PRIMITIVE_KATS,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/algorithm-suite.json is stale. Run: node scripts/generate-suite-vectors.mjs',
      );
      process.exit(1);
    }
    console.log(
      'algorithm-suite.json is current; primitive KATs and the §13.2 separation check pass.',
    );
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote suite 1 (${Object.keys(SUITE_1).length} roles, ${Object.keys(DEFERRED).length} deferred), ` +
      `${CARRIERS.length} carriers, ${ACCEPTANCE.length} acceptance rows and ${PRIMITIVE_KATS.length} primitive KATs.`,
  );
};

await main();
