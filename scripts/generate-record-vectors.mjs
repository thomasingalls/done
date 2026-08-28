/**
 * Test vectors for the encrypted record and local key-envelope formats
 * (TRD §15 row 3, §6.1, §13.3).
 *
 * The construction is specified in docs/selections/row-3-record-format.md. This
 * script is the executable half of that document: it emits
 * test/vectors/record-format.json, which Stage 1's implementation must
 * reproduce byte for byte.
 *
 * Two formats, because row 3 covers both and they share their binding rules:
 *
 *   - The *content record*, one Yjs update or one collapsed state, sealed under
 *     a subkey of K_g and stored in IndexedDB as a structured-clone object.
 *   - The *local key envelope*, K_g itself sealed under L_local, which is what
 *     the key store holds and what §6.1's start-up order opens first.
 *
 * The primitive KAT for AES-256-GCM lives in the row 1 vectors, because row 1
 * selects the primitive and row 3 selects what is built out of it. What is here
 * is composition: subkey derivation, AAD encoding, and the framing -- which is
 * where a construction on a correct primitive still goes wrong.
 *
 * Two things are inputs here that are not inputs in production, and a reviewer
 * should not read either as the discipline:
 *
 *   - Nonces are fixed. Production draws 12 fresh bytes from
 *     crypto.getRandomValues() per record, under the budget in §3 of the
 *     document.
 *   - L_local is raw bytes. Production holds it as a structured-cloned
 *     non-extractable CryptoKey that has no extractable representation at all.
 *
 * Usage: node scripts/generate-record-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/record-format.json', import.meta.url);

const STORE_LABEL = 'done/store/v1';
const ENVELOPE_LABEL = 'done/keyenv/v1';
const RECORD_VERSION = 1;
const ENVELOPE_VERSION = 1;
const ENVELOPE_PURPOSE = 'content-key';
/**
 * A second purpose, present only so the negatives can substitute one envelope
 * for another. §13.4's device credentials are the concrete other tenant of
 * L_local: on the tier that seals them locally, their envelope has this
 * construction's exact shape and differs in this field alone.
 */
const OTHER_PURPOSE = 'device-signing-key';

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
 * The same encoding row 2 selected, for the same reason: a delimiter-joined AAD
 * is not injective, so a workspace id containing the delimiter shifts every
 * field after it and two different contexts can encode to identical bytes.
 * Injectivity is the only property AAD actually needs, and it is the property
 * that the binding below depends on -- this format has seven cleartext fields
 * to bind rather than the journal's one, so an ambiguous encoding has more
 * room to do damage here than there.
 */
const lp = (s) => {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

/**
 * K_store = HKDF-SHA256(ikm = K_g, salt = "",
 *                       info = LP("done/store/v1") || LP(workspace_id) || LP(store_id), L = 32)
 *
 * Same KDF and label encoding as row 2's K_journal, so §13.2's subkey
 * separation stays a property of the labels -- and the info additionally binds
 * the store_id minted at store creation, which is a scope term rather than a
 * separation one (P-3, ratified 2026-08-28; S0-3). The nonce budget below is
 * counted by one SeqCounter per store, and a key's scope can be no wider than
 * the state that counts its invocations: one key per counter. Without the
 * store term, every device holding K_g derived the identical subkey while
 * each device's counter saw only its own share.
 *
 * The principal is NOT in the derivation, though it IS in the AAD. The split
 * is a rule worth stating once: derivation names the key's scope -- fixed by
 * the budget's counter -- and AAD names the record's home, which is a store
 * keyed by (principal, workspace) per §6.5.
 */
const deriveStoreKey = async (kg, workspaceId, storeId) => {
  const ikm = await crypto.subtle.importKey('raw', kg, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: concat(lp(STORE_LABEL), lp(workspaceId), lp(storeId)),
    },
    ikm,
    256,
  );
  return new Uint8Array(bits);
};

/**
 * AAD = LP(label) || LP(principal) || LP(workspace) || LP(store_id) || LP(dec v) || LP(dec gen) || LP(dec seq) || LP(kind)
 *
 * Every cleartext field of the record is here. IndexedDB holds a structured
 * clone, so `v`, `gen`, `seq` and `kind` are ordinary editable properties to
 * anyone with profile access -- and each of them is a field the load path
 * trusts. `v` selects the suite, `gen` selects the key, `seq` orders the trim,
 * `kind` decides whether a record supersedes every other one. The store id is
 * bound here as well as in the derivation, so a record that lands in the
 * wrong store fails at the key as well as the AAD (S0-3).
 */
const aadForRecord = ({ principal, workspace, store, v, gen, seq, kind, label = STORE_LABEL }) =>
  concat(
    ...aadFields('content record', {
      label,
      principal,
      workspace,
      store,
      v: String(v),
      gen: String(gen),
      seq: String(seq),
      kind,
    }).map(lp),
  );

/**
 * AAD = LP(label) || LP(principal) || LP(workspace) || LP(dec v) || LP(dec gen) || LP(purpose)
 *
 * `purpose` is here for the same reason row 2 bound the journal's storage key:
 * it costs fifteen bytes and removes a class of confusion rather than making it
 * unlikely. L_local is a device key, not a workspace key, so every future
 * locally sealed secret (§13.4's credentials, on the tier that seals them)
 * shares it. Without `purpose` those envelopes are structurally identical to
 * this one and can be substituted for it.
 */
const aadForEnvelope = ({ principal, workspace, v, gen, purpose, label = ENVELOPE_LABEL }) =>
  concat(
    ...aadFields('key envelope', {
      label,
      principal,
      workspace,
      v: String(v),
      gen: String(gen),
      purpose,
    }).map(lp),
  );

const sealGcm = async (keyBytes, nonce, aad, plaintext) => {
  const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      k,
      plaintext,
    ),
  );
};

const openGcm = async (keyBytes, nonce, aad, ct) => {
  const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      k,
      ct,
    ),
  );
};

// --- inputs --------------------------------------------------------------------

const PRINCIPAL = 'pr_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const WORKSPACE = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_WORKSPACE = 'ws_01J0000000000000000000000A';
const OTHER_PRINCIPAL = 'pr_01J0000000000000000000000A';
/**
 * The store-instance id, minted from local randomness at store creation beside
 * the SeqCounter it names (P-3, S0-3). It is cleartext store metadata, it
 * enters the derivation info and the AAD, and no two counters ever share one --
 * which is what makes the nonce budget per key rather than per device-count.
 */
const STORE_ID = 'st_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
const OTHER_STORE = 'st_01J0000000000000000000000A';

/** The same K_g as the row 2 vectors, so the two subkeys are visibly different derivations of one key. */
const KG = unhex('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
const KG_GEN2 = unhex('91c4e7a2035fd8b16e4a0c93d75218fe6b3a94c05d2e871f4a6b0938cd5e2107');
/** L_local, raw only because a vector needs bytes. In production: non-extractable, never exported. */
const L_LOCAL = unhex('7f2a91c30bd4e685af0132c974e5b8d206a3f47e91c85d3b0e6a248f5c71d9b0');

/** A measured 18-byte Yjs update -- one keystroke, and the common case for this path. */
const KEYSTROKE = '01010101a8e0c9d20500042101087903c0a8';
/** A collapsed state record is larger; 64 bytes stands in for one without pretending to be real. */
const STATE_BLOB =
  '0102a8e0c9d2050004210108790301010101a8e0c9d2050004210108790301010101a8e0c9d205000421010879030101010101010101010101010101010101010101010101010101010101010101';

const RECORD_CASES = [
  {
    name: 'update-record',
    why: 'The common case: one keystroke-sized Yjs update under the first generation.',
    v: RECORD_VERSION,
    gen: 1,
    seq: 1,
    kind: 'update',
    nonce: '000102030405060708090a0b',
    plaintext: KEYSTROKE,
  },
  {
    name: 'state-record',
    why: 'Same store, same generation, kind=state. Proves kind is bound: a state record supersedes every record before it, so a record whose kind can be edited can delete the store.',
    v: RECORD_VERSION,
    gen: 1,
    seq: 2,
    kind: 'state',
    nonce: '0c0d0e0f1011121314151617',
    plaintext: STATE_BLOB,
  },
  {
    name: 'empty-update',
    why: 'A zero-length plaintext still authenticates; framing and tag must not depend on payload length.',
    v: RECORD_VERSION,
    gen: 1,
    seq: 3,
    kind: 'update',
    nonce: '18191a1b1c1d1e1f20212223',
    plaintext: '',
  },
  {
    name: 'rotated-generation',
    why: 'A different K_g, so a different K_store. The cleartext gen is what selects which; it is in the AAD, so it cannot be edited to point at a generation the record was not sealed under.',
    v: RECORD_VERSION,
    gen: 2,
    seq: 4,
    kind: 'update',
    kg: KG_GEN2,
    nonce: '2425262728292a2b2c2d2e2f',
    plaintext: KEYSTROKE,
  },
  {
    name: 'second-workspace',
    why: 'Same K_g, same nonce, same plaintext, different workspace. Proves the subkey is workspace-bound by derivation, not only by AAD.',
    v: RECORD_VERSION,
    gen: 1,
    seq: 1,
    kind: 'update',
    workspace: OTHER_WORKSPACE,
    nonce: '000102030405060708090a0b',
    plaintext: KEYSTROKE,
  },
  {
    name: 'second-store',
    why: 'Same K_g, same workspace, same nonce, same plaintext, different store id. Proves the subkey is store-bound by derivation, not only by AAD — one key per SeqCounter, so no per-store comparison can undercount a shared key (P-3 falsifier 14).',
    v: RECORD_VERSION,
    gen: 1,
    seq: 1,
    kind: 'update',
    store: OTHER_STORE,
    nonce: '000102030405060708090a0b',
    plaintext: KEYSTROKE,
  },
];

const ENVELOPE_CASES = [
  {
    name: 'key-envelope',
    why: 'K_g sealed under L_local. This is what the key store holds and what §6.1 opens before anything else; every content record above is unreadable until this one opens.',
    v: ENVELOPE_VERSION,
    gen: 1,
    purpose: ENVELOPE_PURPOSE,
    nonce: '303132333435363738393a3b',
    kg: KG,
  },
  {
    name: 'key-envelope-rotated',
    why: 'The second generation, sealed under the same L_local. A device holds one envelope per generation its records still use (§6.1, §13.7).',
    v: ENVELOPE_VERSION,
    gen: 2,
    purpose: ENVELOPE_PURPOSE,
    nonce: '3c3d3e3f4041424344454647',
    kg: KG_GEN2,
  },
];

const NEGATIVES = [
  { name: 'wrong-workspace-subkey', mutate: 'Derive K_store for a different workspace id.' },
  {
    name: 'wrong-store-subkey',
    mutate:
      'Derive K_store for a different store id, workspace unchanged. The wrong-store sibling of wrong-workspace-subkey: two stores holding one K_g never derive one subkey, so a record sealed for one store fails to open under the key of another (P-3 falsifier 14).',
  },
  { name: 'wrong-principal', mutate: 'Authenticate with a different principal in the AAD.' },
  {
    name: 'wrong-workspace-aad',
    mutate: 'Authenticate with a different workspace in the AAD, subkey unchanged.',
  },
  { name: 'wrong-generation', mutate: 'Claim gen=2 in the AAD for a record sealed under gen=1.' },
  {
    name: 'kind-swapped',
    falsifies: ['f-3bea0e6-store-sequence-allocation-undefined'],
    mutate: 'Reinterpret an update record as a state record.',
  },
  {
    name: 'seq-edited',
    falsifies: ['f-3bea0e6-store-sequence-allocation-undefined'],
    mutate: 'Renumber seq from 1 to 99 to reorder the trim.',
  },
  {
    name: 'version-downgraded',
    mutate: 'Renumber v from 1 to 0 to select a suite this reader does not have.',
  },
  { name: 'flipped-tag-bit', mutate: 'Flip the low bit of the final tag byte.' },
  { name: 'truncated-ciphertext', mutate: 'Drop the final byte of ct.' },
  { name: 'envelope-aad-on-record', mutate: 'Open a content record with a key-envelope AAD.' },
  { name: 'record-aad-on-envelope', mutate: 'Open a key envelope with a content-record AAD.' },
  // The AAD-only group. Every field in an AAD needs an entry that changes that
  // field and nothing else, or its binding is untested. The two whole-AAD swaps
  // above do not do this job: they change every field at once, so they keep
  // failing on the structural difference whether or not the label contributes
  // anything -- and the envelope's six fields had no isolating negative at all.
  {
    name: 'record-aad-only-label',
    mutate:
      'Authenticate a content record with the key-envelope label, every record field unchanged. Isolates the labels contribution from the field difference the whole-AAD swaps also carry.',
  },
  {
    name: 'record-aad-only-store',
    mutate:
      'Authenticate a content record claiming the other store id in the AAD, subkey unchanged. Isolates the AAD binding from the derivation binding wrong-store-subkey carries.',
  },
  {
    name: 'envelope-aad-only-label',
    mutate:
      'Authenticate a key envelope with the content-record label, every envelope field unchanged.',
  },
  {
    name: 'envelope-aad-only-principal',
    mutate:
      'A key envelope claiming the other principal on the same profile (PRD §6.7s ordinary case).',
  },
  {
    name: 'envelope-aad-only-workspace',
    mutate:
      'A key envelope claiming the other workspace. L_local is a device key, not a workspace key, so nothing but the AAD separates the two slots.',
  },
  {
    name: 'envelope-aad-only-version',
    mutate:
      'A key envelope renumbered to v=0. The carrier version selects the whole suite (row 1), so it must fail to open rather than select a weaker one.',
  },
  {
    name: 'envelope-aad-only-generation',
    mutate:
      'A gen=1 envelope claiming gen=2, which is how a superseded content key would be made to look current.',
  },
  {
    name: 'envelope-aad-only-purpose',
    mutate:
      'A content-key envelope opened as a device-signing-key envelope. This is the substitution purpose exists to prevent, and nothing tested it.',
  },
];

/**
 * Prove the vectors say something. A composition vector that does not
 * round-trip is a typo, and a "must fail" list whose entries quietly succeed is
 * worse than no list at all -- so both are asserted here rather than in prose.
 */
const verify = async (records, envelopes) => {
  for (const v of records) {
    const got = await openGcm(
      unhex(v.derived.k_store),
      unhex(v.inputs.nonce),
      unhex(v.derived.aad),
      unhex(v.expected.ct),
    );
    if (hex(got) !== v.inputs.plaintext)
      throw new Error(`Record vector "${v.name}" does not round-trip.`);
  }
  for (const v of envelopes) {
    const got = await openGcm(
      unhex(v.inputs.l_local),
      unhex(v.inputs.nonce),
      unhex(v.derived.aad),
      unhex(v.expected.ct),
    );
    if (hex(got) !== v.inputs.k_g)
      throw new Error(`Envelope vector "${v.name}" does not round-trip.`);
  }

  const base = records.find((v) => v.name === 'update-record');
  const ks = unhex(base.derived.k_store);
  const nonce = unhex(base.inputs.nonce);
  const ct = unhex(base.expected.ct);
  const f = {
    principal: PRINCIPAL,
    workspace: WORKSPACE,
    store: STORE_ID,
    v: RECORD_VERSION,
    gen: 1,
    seq: 1,
    kind: 'update',
  };

  const otherSubkey = await deriveStoreKey(KG, OTHER_WORKSPACE, STORE_ID);
  await refuses('wrong-workspace-subkey', () => openGcm(otherSubkey, nonce, aadForRecord(f), ct));
  const otherStoreSubkey = await deriveStoreKey(KG, WORKSPACE, OTHER_STORE);
  await refuses('wrong-store-subkey', () => openGcm(otherStoreSubkey, nonce, aadForRecord(f), ct));
  await refuses('wrong-principal', () =>
    openGcm(ks, nonce, aadForRecord({ ...f, principal: OTHER_PRINCIPAL }), ct),
  );
  await refuses('wrong-workspace-aad', () =>
    openGcm(ks, nonce, aadForRecord({ ...f, workspace: OTHER_WORKSPACE }), ct),
  );
  await refuses('wrong-generation', () => openGcm(ks, nonce, aadForRecord({ ...f, gen: 2 }), ct));
  await refuses('kind-swapped', () =>
    openGcm(ks, nonce, aadForRecord({ ...f, kind: 'state' }), ct),
  );
  await refuses('seq-edited', () => openGcm(ks, nonce, aadForRecord({ ...f, seq: 99 }), ct));
  await refuses('version-downgraded', () => openGcm(ks, nonce, aadForRecord({ ...f, v: 0 }), ct));

  const flipped = Uint8Array.from(ct);
  flipped[flipped.length - 1] ^= 0x01;
  await refuses('flipped-tag-bit', () => openGcm(ks, nonce, aadForRecord(f), flipped));
  await refuses('truncated-ciphertext', () =>
    openGcm(ks, nonce, aadForRecord(f), ct.subarray(0, -1)),
  );

  const envAad = aadForEnvelope({
    principal: PRINCIPAL,
    workspace: WORKSPACE,
    v: ENVELOPE_VERSION,
    gen: 1,
    purpose: ENVELOPE_PURPOSE,
  });
  await refuses('envelope-aad-on-record', () => openGcm(ks, nonce, envAad, ct));
  const env = envelopes.find((e) => e.name === 'key-envelope');
  await refuses('record-aad-on-envelope', () =>
    openGcm(L_LOCAL, unhex(env.inputs.nonce), aadForRecord(f), unhex(env.expected.ct)),
  );

  // The AAD-only group: the correct key throughout, one bound field changed.
  await refuses('record-aad-only-label', () =>
    openGcm(ks, nonce, aadForRecord({ ...f, label: ENVELOPE_LABEL }), ct),
  );
  await refuses('record-aad-only-store', () =>
    openGcm(ks, nonce, aadForRecord({ ...f, store: OTHER_STORE }), ct),
  );

  const envNonce = unhex(env.inputs.nonce);
  const envCt = unhex(env.expected.ct);
  const e = {
    principal: PRINCIPAL,
    workspace: WORKSPACE,
    v: ENVELOPE_VERSION,
    gen: 1,
    purpose: ENVELOPE_PURPOSE,
  };
  const envRefuses = (name, over) =>
    refuses(name, () => openGcm(L_LOCAL, envNonce, aadForEnvelope({ ...e, ...over }), envCt));

  await envRefuses('envelope-aad-only-label', { label: STORE_LABEL });
  await envRefuses('envelope-aad-only-principal', { principal: OTHER_PRINCIPAL });
  await envRefuses('envelope-aad-only-workspace', { workspace: OTHER_WORKSPACE });
  await envRefuses('envelope-aad-only-version', { v: 0 });
  await envRefuses('envelope-aad-only-generation', { gen: 2 });
  await envRefuses('envelope-aad-only-purpose', { purpose: OTHER_PURPOSE });

  // The published list and the executed checks must be the same list. Row 2
  // established that a "must fail" entry which quietly stops failing is worse
  // than no entry; an entry that is published but never run is the same defect
  // one level up, and it is invisible without this comparison.
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
  const records = [];
  for (const c of RECORD_CASES) {
    const workspace = c.workspace ?? WORKSPACE;
    const store = c.store ?? STORE_ID;
    const kg = c.kg ?? KG;
    const kStore = await deriveStoreKey(kg, workspace, store);
    const fields = {
      principal: PRINCIPAL,
      workspace,
      store,
      v: c.v,
      gen: c.gen,
      seq: c.seq,
      kind: c.kind,
    };
    const aad = aadForRecord(fields);
    const ct = await sealGcm(kStore, unhex(c.nonce), aad, unhex(c.plaintext));
    records.push({
      name: c.name,
      why: c.why,
      inputs: {
        k_g: hex(kg),
        principal_id: PRINCIPAL,
        workspace_id: workspace,
        store_id: store,
        v: c.v,
        gen: c.gen,
        seq: c.seq,
        kind: c.kind,
        nonce: c.nonce,
        plaintext: c.plaintext,
      },
      derived: {
        hkdf_info: hex(concat(lp(STORE_LABEL), lp(workspace), lp(store))),
        k_store: hex(kStore),
        aad: hex(aad),
      },
      expected: {
        ct: hex(ct),
        stored_record: {
          v: c.v,
          gen: c.gen,
          seq: c.seq,
          kind: c.kind,
          nonce: c.nonce,
          ct: hex(ct),
        },
      },
    });
  }

  const envelopes = [];
  for (const c of ENVELOPE_CASES) {
    const fields = {
      principal: PRINCIPAL,
      workspace: WORKSPACE,
      v: c.v,
      gen: c.gen,
      purpose: c.purpose,
    };
    const aad = aadForEnvelope(fields);
    const ct = await sealGcm(L_LOCAL, unhex(c.nonce), aad, c.kg);
    envelopes.push({
      name: c.name,
      why: c.why,
      inputs: {
        l_local: hex(L_LOCAL),
        principal_id: PRINCIPAL,
        workspace_id: WORKSPACE,
        v: c.v,
        gen: c.gen,
        purpose: c.purpose,
        nonce: c.nonce,
        k_g: hex(c.kg),
      },
      derived: { aad: hex(aad) },
      expected: { ct: hex(ct), key_envelope: { v: c.v, gen: c.gen, nonce: c.nonce, ct: hex(ct) } },
    });
  }

  await verify(records, envelopes);
  reportAudit(NEGATIVES.map((n) => n.name));

  const doc = {
    $schema: 'https://done.invalid/vectors/record-format/1',
    generated_by: 'scripts/generate-record-vectors.mjs',
    selection: 'docs/selections/row-3-record-format.md',
    trd_row: 3,
    construction: {
      aead: 'AES-256-GCM via WebCrypto (suite 1, row 1)',
      primitive_kat:
        'test/vectors/algorithm-suite.json -- row 1 selects the primitive, row 3 the composition',
      kdf: 'HKDF-SHA256 via WebCrypto deriveBits, at open',
      store_hkdf_info: 'LP("done/store/v1") || LP(workspace_id) || LP(store_id)',
      store_aad:
        'LP("done/store/v1") || LP(principal_id) || LP(workspace_id) || LP(store_id) || LP(dec v) || LP(dec gen) || LP(dec seq) || LP(kind)',
      envelope_aad:
        'LP("done/keyenv/v1") || LP(principal_id) || LP(workspace_id) || LP(dec v) || LP(dec gen) || LP(purpose)',
      length_prefix: 'uint16be(byteLength) || utf8 -- injective, so no field can shift another',
      stored_record:
        '{ v, gen, seq, kind, nonce[12], ct } as a structured clone; ct carries the 16-byte tag',
      key_envelope: '{ v, gen, nonce[12], ct } as a structured clone; ct carries the 16-byte tag',
      nonce:
        '12 bytes from crypto.getRandomValues() per record, under a 2^32-per-(store, generation) budget counted by the SeqCounter\'s reserved[gen] -- reserved before encryption, so an abandoned invocation is counted; never read from seq (P-3, S0-3)',
      store_id:
        'minted from local randomness at store creation beside the SeqCounter it names; one key per counter, so the nonce budget binds the key it protects for every device count',
      nonce_caveat:
        'Nonces are fixed inputs in these vectors so the composition is testable. Production generates them randomly; the fixed nonce is not the discipline.',
      l_local_caveat:
        'L_local is raw bytes here because a vector needs bytes. In production it is a structured-cloned non-extractable CryptoKey with no extractable representation (§13.3).',
    },
    vectors: records,
    envelopes,
    must_fail: NEGATIVES,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUT, 'utf8');
    if (existing !== json) {
      console.error(
        'test/vectors/record-format.json is stale. Run: node scripts/generate-record-vectors.mjs',
      );
      process.exit(1);
    }
    console.log('record-format.json is current, and every negative still fails to authenticate.');
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${records.length} record vectors, ${envelopes.length} envelope vectors and ${NEGATIVES.length} negatives to test/vectors/record-format.json`,
  );
};

await main();
