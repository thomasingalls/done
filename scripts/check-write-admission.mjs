/**
 * The write-admission homes-agree readback (`P-3` falsifier 22; the `S0-3`
 * return, 2026-08-28).
 *
 * `P-3`'s ratified rules — the store subkey binds the store instance so one
 * key has one counter, nothing becomes authoritative without a durable
 * carrier, and a batch's commit validates its generation where the commit
 * lands — live in several homes at once: TRD §6.1 and §15 row 3's cell,
 * `docs/selections/row-3-record-format.md`, the record generator's published
 * rule text, `S0-2/A-schemas.md`'s fence, `S0-3/A-schemas.md`, PRD §7.10 and
 * the decision record itself. The `FU-07`/`FU-13` shape is a home still
 * publishing the decided-away rule while every checker stays green; this
 * script is the readback that refuses it, in the `status:check` shape:
 * byte rules against named sentences, in both directions.
 *
 * What it checks, exactly:
 *
 *   1. **The ratified rules are present at each home** — the scope rule and
 *      the store term in the derivation, the carrier rule, the fence, and the
 *      covered-set trim — as byte rules per home, matched over
 *      whitespace-flattened text so a hard wrap cannot hide a divergence.
 *   2. **The retired sentences stay dead** — the register's *still open* and
 *      `seq`-bounded budget (`E3`), the generator's `bounded by seq` rule
 *      string (round 1 `S-5`), the exact-watermark claim (`FU-13`), and the
 *      store-shared derivation formula — as byte rules against the consumable
 *      homes. Decision records and dated challenge material quote them as
 *      history and are deliberately outside the scan.
 *   3. **The record artifact reconstructs from its published inputs alone**
 *      (`FU-05`'s discipline, applied to row 3): the HKDF info, the store
 *      subkey, the AAD and the ciphertext of the `update-record` and
 *      `second-store` vectors — recomputed here with this file's own
 *      primitives and compared byte-for-byte — and the two stores' subkeys
 *      must differ, which is falsifier 14's readback tooth.
 *
 * What it does not check: that any construction is sound (generator negatives and
 * `pnpm vectors:coverage` cover only their declared cases), that the corpus implements
 * the rule (the authority map's `status` lines carry that), or any home it
 * does not name below. A green run means: the named homes state the ratified
 * rules, the named retired sentences appear in none of them, and the record
 * vectors reconstruct — nothing wider.
 *
 * Usage: node scripts/check-write-admission.mjs
 */

import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');
/** Whitespace-flattened, so a hard wrap cannot hide a stated or restored sentence. */
const flat = (t) => t.replace(/\s+/gu, ' ');

const failures = [];
const fail = (msg) => failures.push(msg);

// --- 1. the ratified rules, present at each home --------------------------------

const SCOPE_RULE = "a key's scope can be no wider than the state that counts its invocations";
const CARRIER_RULE = 'Nothing becomes authoritative without a durable carrier';
const STORE_INFO = 'LP("done/store/v1") || LP(workspace_id) || LP(store_id)';

const REQUIRED = [
  {
    file: 'docs/storage-contract.md',
    needs: [
      'without network redelivery',
      'SC-03 — writer lifetime and local activation',
      'SC-05 — exact trim and unreadable persistence',
      'SC-07 — resumable, journal-inclusive clear',
      'SC-08 — mandatory factor custody and honest copied-profile protection',
      'unrewound, unbranched history per',
    ],
  },
  {
    file: 'docs/TRD.md',
    needs: [
      SCOPE_RULE,
      CARRIER_RULE,
      // The fence, where §6.1 states it…
      'validates its generation where the commit lands',
      'aborts into re-reservation under the successor',
      // …and the covered-set trim, which FU-13 propagated here.
      'deletes what its state record covered',
    ],
  },
  {
    file: 'docs/PRD.md',
    needs: ['the document itself waits for its carrier'],
  },
  {
    file: 'docs/selections/row-3-record-format.md',
    needs: [
      STORE_INFO,
      'the budget is what fixes the scope',
      // The key-envelope counter statement — the home P-3 falsifier 16's
      // census entry cites.
      'One envelope per (generation, purpose) is a logical row constraint',
      'seal_reserved',
    ],
  },
  {
    file: 'docs/review/remediation/S0-2/A-schemas.md',
    needs: ["validates the reservation's generation where the commit lands"],
  },
  {
    file: 'docs/review/remediation/S0-3/A-schemas.md',
    needs: [
      'stage-and-promote',
      'key per counter',
      'conditional on an unrewound, unbranched history',
    ],
  },
  {
    file: 'scripts/generate-record-vectors.mjs',
    needs: [
      STORE_INFO,
      // The corrected published rule string (round 1 S-5's subject).
      'reserved before encryption, so an abandoned invocation is counted',
      'wrong-store-subkey',
    ],
  },
  {
    file: 'docs/review/remediation/decisions/P-3-write-admission.md',
    needs: ['option A at every joint'],
  },
];

for (const { file, needs } of REQUIRED) {
  const text = flat(read(file));
  for (const phrase of needs) {
    if (!text.includes(phrase)) {
      fail(
        `${file} no longer states the ratified rule: "${phrase}" is absent — the homes have diverged (P-3 falsifier 22).`,
      );
    }
  }
}

// §15 row 3's cell, checked in its own slice: the register row must carry the
// ratified scope and count, not merely somewhere in the TRD.
{
  const trd = read('docs/TRD.md');
  const row = trd.split('\n').find((line) => /^\| 3 \| Encrypted record/u.test(line));
  if (row === undefined) {
    fail(
      'docs/TRD.md §15.1 has no row 3 line the scan recognizes — the register moved under this readback.',
    );
  } else {
    for (const phrase of [
      'The store subkey binds the store instance',
      'counted by `reserved[gen]`',
    ]) {
      if (!row.includes(phrase)) {
        fail(
          `docs/TRD.md §15 row 3's cell no longer states "${phrase}" — the register and §6.1 have diverged again (E3's shape).`,
        );
      }
    }
  }
}

// --- 2. the retired sentences, refused as byte rules ----------------------------

/**
 * Homes a reader consumes as current. Decision records, dispositions, README
 * narratives and the action tree quote the retired sentences as history and
 * are outside this scan on purpose.
 */
const CONSUMABLE = [
  'docs/TRD.md',
  'docs/PRD.md',
  'docs/selections/row-3-record-format.md',
  'docs/review/remediation/S0-2/A-schemas.md',
  'docs/review/remediation/S0-3/A-schemas.md',
  'scripts/generate-record-vectors.mjs',
];

const REFUSED = [
  {
    phrase: 'a state record supersedes every record before it',
    was: 'SC-05: uniqueness is not coverage; a late reserved sequence must survive trim',
  },
  {
    phrase: 'no two counters ever share it',
    was: 'SC-09: raw profile clones duplicate the key and counter; the theorem is conditional',
  },
  {
    phrase: 'budget that `seq` bounds',
    was: "E3: the register's cell publishing the count P-3 retired — the budget reads reserved[gen], never seq",
  },
  {
    phrase: 'budget bounded by seq',
    was: "round 1 S-5: the generator's published rule string carrying the retired count",
  },
  {
    phrase: 'are **still open** (§6.1)',
    was: 'E3: the register calling the selected allocator and count open after S0-3 selected them',
  },
  {
    phrase: 'hands the trimmer an exact watermark',
    was: 'FU-13: the watermark claim a mutation retired — the allocator supplies uniqueness, and the trim consumes the covered set',
  },
  {
    phrase: 'info = LP("done/store/v1") || LP(workspace_id), L = 32',
    was: 'P-3 joint 1: the store-shared derivation — every device holding K_g derived the identical subkey while each counter saw only its own share',
  },
];

for (const file of CONSUMABLE) {
  const text = flat(read(file));
  for (const { phrase, was } of REFUSED) {
    if (text.includes(phrase)) {
      fail(
        `${file} publishes "${phrase}" again — ${was}. The rule was ratified at P-3 and consolidated at the S0-3 return; restore the ratified sentence or take the reopening to the record.`,
      );
    }
  }
}

// --- 3. the record artifact reconstructs from published inputs (FU-05's shape) --

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
const lp = (s) => {
  const bytes = utf8(s);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const vector = JSON.parse(read('test/vectors/record-format.json'));

const reconstruct = async (name) => {
  const v = vector.vectors.find((x) => x.name === name);
  if (v === undefined) {
    fail(`test/vectors/record-format.json has no ${name} vector to reconstruct.`);
    return null;
  }
  const inputs = v.inputs;
  const missing = [
    'k_g',
    'principal_id',
    'workspace_id',
    'store_id',
    'v',
    'gen',
    'seq',
    'kind',
    'nonce',
    'plaintext',
  ].filter((k) => inputs[k] === undefined);
  if (missing.length > 0) {
    fail(
      `the ${name} vector's inputs omit ${missing.join(', ')} — FU-05's defect: an artifact no one can rebuild from what is published.`,
    );
    return null;
  }

  // The HKDF info, from its published inputs in the published order.
  const info = concat(lp('done/store/v1'), lp(inputs.workspace_id), lp(inputs.store_id));
  if (hex(info) !== v.derived.hkdf_info) {
    fail(
      `the ${name} vector's hkdf_info does not reconstruct from its published inputs — the formula and the generator disagree.`,
    );
  }

  // The store subkey, through HKDF.
  const ikm = await crypto.subtle.importKey('raw', unhex(inputs.k_g), 'HKDF', false, [
    'deriveBits',
  ]);
  const kStore = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
      ikm,
      256,
    ),
  );
  if (hex(kStore) !== v.derived.k_store) {
    fail(
      `the ${name} vector's k_store does not reconstruct: computed ${hex(kStore)}, published ${v.derived.k_store}.`,
    );
  }

  // The AAD, from the published fields in the published order.
  const aad = concat(
    ...[
      'done/store/v1',
      inputs.principal_id,
      inputs.workspace_id,
      inputs.store_id,
      String(inputs.v),
      String(inputs.gen),
      String(inputs.seq),
      inputs.kind,
    ].map(lp),
  );
  if (hex(aad) !== v.derived.aad) {
    fail(`the ${name} vector's AAD does not reconstruct from the published fields.`);
  }

  // And the ciphertext opens under the recomputed key and AAD.
  try {
    const k = await crypto.subtle.importKey('raw', kStore, 'AES-GCM', false, ['decrypt']);
    const got = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unhex(inputs.nonce), additionalData: aad, tagLength: 128 },
        k,
        unhex(v.expected.ct),
      ),
    );
    if (hex(got) !== inputs.plaintext) {
      fail(
        `the ${name} vector's ciphertext does not open to its published plaintext under the recomputed key.`,
      );
    }
  } catch {
    fail(`the ${name} vector's ciphertext does not authenticate under the recomputed key and AAD.`);
  }
  return { kStore: hex(kStore), store: inputs.store_id };
};

const base = await reconstruct('update-record');
const sibling = await reconstruct('second-store');
if (base !== null && sibling !== null) {
  if (base.store === sibling.store) {
    fail(
      'the update-record and second-store vectors publish one store id — the sibling case no longer exercises the store term.',
    );
  }
  // Falsifier 14's readback tooth: two stores holding one K_g never derive
  // one K_store.
  if (base.kStore === sibling.kStore) {
    fail(
      'two stores holding one K_g derive one K_store — the store term has left the derivation (P-3 falsifier 14).',
    );
  }
}

// The published negatives that guard the store binding, in both carriers.
for (const name of ['wrong-store-subkey', 'record-aad-only-store']) {
  if (!vector.must_fail.some((n) => n.name === name)) {
    fail(
      `test/vectors/record-format.json no longer publishes the ${name} negative — the store binding is untested in one of its two carriers.`,
    );
  }
}

// --- report ---------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`write admission: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  'write admission: the ratified scope, carrier and fence are stated at the named homes, the retired sentences ' +
    'appear in none of them, and the record vectors — two stores, two subkeys — reconstruct from published inputs alone.',
);
console.log(
  '  Scope: byte rules over the named homes and two vector reconstructions — never construction soundness ' +
    'and never implementation. Vectors cover declared cases; production obligations remain in storage-conformance.md.',
);
