/**
 * The recipient-authority homes-agree readback (`P-1` falsifier 19; the `S0-2`
 * return, 2026-08-28).
 *
 * `P-1`'s ratified rule — a member entry binds `(credential_id ‖ W_pub ‖
 * S_pub)`, every approval names its approver, the bootstrap verifier is
 * factor-carried inside `recovery_state_digest` — lives in several homes at
 * once: TRD §§13.2/13.5/13.8, rows 9/11/14, `S0-2/A-schemas.md` §§1–2, and the
 * two generators that emit the executable half. The `FU-07`/`FU-13` shape is a
 * home still publishing the decided-away rule while every checker stays green;
 * this script is the readback that refuses it, in the `status:check` shape:
 * membership and byte rules against named sentences, in both directions.
 *
 * What it checks, exactly:
 *
 *   1. **The ratified formulas are present at each home** — the member triple,
 *      the approver-naming approval, the `bootstrap_signer` commitment inside
 *      `recovery_state_digest`, the transcript's `new_signing_key` and
 *      `recovery_state_digest` fields, and (`R3-4`) the member-entry
 *      uniqueness rule at the two homes that state it — as byte rules per
 *      home.
 *   2. **The convicted sentences stay dead** — the pair-only member formula,
 *      and the uncarried `RecoverySet` commitment (`FU-01`'s finding: prose
 *      asserting a carrier no schema defined) — as byte rules against the
 *      consumable homes. Decision records and dated challenge material quote
 *      them as history and are deliberately outside the scan.
 *   3. **The enrollment artifact reconstructs from its published inputs alone**
 *      (`FU-05`): `recovery_state_digest` from its published preimage, the
 *      transcript from the published inputs in the published field order, its
 *      hash, the wrap `info`, and the SAS — recomputed here with this file's
 *      own primitives and compared byte-for-byte against the vector's derived
 *      values.
 *
 * What it does not check: that any construction is sound (the generators' own
 * negatives and `pnpm vectors:coverage` own that), that the corpus implements
 * the rule (the authority map's `status` lines carry that), or any home it
 * does not name below. A green run means: the named homes state the ratified
 * rule, the named retired sentences appear in none of them, and the enrollment
 * vector reconstructs — nothing wider.
 *
 * Usage: node scripts/check-recipient-authority.mjs
 */

import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);

// --- 1. the ratified formulas, present at each home -----------------------------

const TRIPLE = 'LP(credential_id) || LP(hex W_pub) || LP(hex S_pub)';
const APPROVAL = 'LP("done/certified-set-approval/v1") || LP(approver_credential_id) || CertifiedSet';
const SIGNER_COMMIT = 'LP(hex bootstrap_signer)';
const CARRIED_S_PUB = 'LP(hex new_S_pub)';

/**
 * `R3-4`'s malformedness rule, landed 2026-08-29 at both homes before `L-2`
 * builds the verifier that owes it. `members_digest` sorts by `credential_id`
 * alone, so a duplicated key leaves the order — and the digest, and the `S_pub`
 * an approval resolves under — undetermined between two conforming verifiers.
 * The generator cannot express the case (its `members` is an object keyed by
 * `credential_id`), so no published negative covers it and prose is the only
 * carrier the rule has; this byte rule is what stops the prose from going
 * quiet.
 */
const UNIQUE_MEMBER = 'for the same `credential_id` is malformed';

const REQUIRED = [
  { file: 'docs/TRD.md', needs: [TRIPLE, APPROVAL, SIGNER_COMMIT, 'LP(hex new_S_pub)', UNIQUE_MEMBER] },
  {
    file: 'docs/review/remediation/S0-2/A-schemas.md',
    needs: [TRIPLE, APPROVAL, SIGNER_COMMIT, CARRIED_S_PUB, UNIQUE_MEMBER],
  },
  {
    file: 'scripts/generate-transition-vectors.mjs',
    needs: [
      // The published members_digest formula names the triple…
      'LP(credential_id) || LP(hex W_pub) || LP(hex S_pub)',
      // …and the approval formula names its approver.
      'LP("done/certified-set-approval/v1") || LP(approver_credential_id) || CertifiedSet',
    ],
  },
  {
    file: 'scripts/generate-head-discovery-vectors.mjs',
    needs: [
      // The digest formula commits the signer…
      'LP(hex bootstrap_signer)',
      // …and the bootstrap carries the countersigning key.
      'LP(hex new_signing_key)',
    ],
  },
  {
    file: 'scripts/generate-enrollment-vectors.mjs',
    needs: ['LP(hex new_signing_key)', 'LP(hex recovery_state_digest)', 'LP(hex bootstrap_signer)'],
  },
  {
    file: 'docs/selections/row-11-enrollment-ceremony.md',
    needs: ['LP(hex S_pub) || LP(hex recovery_state_digest)'],
  },
  {
    file: 'docs/selections/row-9-chain-head-discovery.md',
    needs: ['factor-carried', 'rotates the signer'],
  },
  {
    file: 'docs/selections/row-14-recovery-code.md',
    needs: ['bootstrap signing key beside `R_priv`'],
  },
];

for (const { file, needs } of REQUIRED) {
  const text = read(file);
  for (const phrase of needs) {
    if (!text.includes(phrase)) {
      fail(`${file} no longer states the ratified rule: "${phrase}" is absent — the homes have diverged (P-1 falsifier 19).`);
    }
  }
}

// The TRD's §13.8 must itself carry the Bootstrap construction §13.2 cites —
// round 1 D-3's dangling normative reference, refused as a byte rule at the
// section that owes it.
{
  const trd = read('docs/TRD.md');
  const s138 = trd.slice(trd.indexOf('### 13.8'), trd.indexOf('### 13.9'));
  if (!s138.includes('done/recovery-bootstrap/v1')) {
    fail('docs/TRD.md §13.8 no longer carries the RecoveryBootstrap construction §13.2 cites — the dangling normative reference is back (round 1 D-3).');
  }
}

// --- 2. the convicted sentences, refused as byte rules --------------------------

/**
 * Homes a reader consumes as current. Decision records, dispositions and the
 * superseded end-state quote the retired sentences as history and are outside
 * this scan on purpose.
 */
const CONSUMABLE = [
  'docs/TRD.md',
  'docs/PRD.md',
  'docs/review/remediation/S0-2/A-schemas.md',
  'docs/selections/row-9-chain-head-discovery.md',
  'docs/selections/row-11-enrollment-ceremony.md',
  'docs/selections/row-14-recovery-code.md',
  'scripts/generate-transition-vectors.mjs',
  'scripts/generate-head-discovery-vectors.mjs',
  'scripts/generate-enrollment-vectors.mjs',
];

const REFUSED = [
  {
    phrase: '( LP(credential_id) || LP(hex W_pub) )*',
    was: 'the pair-only member formula — the entry with no signing key, whose approvals could only resolve through the epoch',
  },
  {
    phrase: 'RecoverySet',
    was: "FU-01's uncarried commitment: prose asserting a schema that never existed, while the executable verifier used a constant",
  },
];

for (const file of CONSUMABLE) {
  const text = read(file);
  for (const { phrase, was } of REFUSED) {
    if (text.includes(phrase)) {
      fail(`${file} publishes "${phrase}" again — ${was}. The rule was ratified at P-1 and consolidated at the S0-2 return; restore the ratified sentence or take the reopening to the record.`);
    }
  }
}

// --- 3. the enrollment artifact reconstructs from published inputs (FU-05) ------

const utf8 = (s) => new TextEncoder().encode(s);
const hex = (u) => Buffer.from(u).toString('hex');
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
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const vector = JSON.parse(read('test/vectors/enrollment-ceremony.json'));
const honest = vector.vectors.find((v) => v.name === 'honest-enrollment');

if (honest === undefined) {
  fail('test/vectors/enrollment-ceremony.json has no honest-enrollment vector to reconstruct.');
} else {
  const inputs = honest.inputs;
  const state = inputs.recovery_state;
  const missing = [
    'workspace_id',
    'epoch',
    'epoch_head',
    'existing_credential_id',
    'new_credential_id',
    'new_wrapping_key',
    'new_signing_key',
    'recovery_state',
    'recovery_state_digest',
    'nonce_existing',
    'nonce_new',
  ].filter((k) => inputs[k] === undefined);
  if (missing.length > 0) {
    fail(`the honest vector's inputs omit ${missing.join(', ')} — FU-05's defect: a transcript no one can rebuild from what is published.`);
  } else {
    // recovery_state_digest, from its published preimage.
    const stateDigest = hex(
      await sha256(
        concat(
          ...[
            'done/recovery-state/v1',
            String(state.counter),
            state.r_pub,
            state.recovery_envelope_digest,
            state.root_commitment,
            state.bootstrap_signer,
          ].map(lp),
        ),
      ),
    );
    if (stateDigest !== inputs.recovery_state_digest) {
      fail(`recovery_state_digest does not reconstruct from its published preimage: computed ${stateDigest}, published ${inputs.recovery_state_digest}.`);
    }

    // The transcript, from the published inputs in the published field order.
    const transcript = concat(
      ...[
        'done/enroll/v1',
        inputs.workspace_id,
        String(inputs.epoch),
        inputs.epoch_head,
        inputs.existing_credential_id,
        inputs.new_credential_id,
        inputs.new_wrapping_key,
        inputs.new_signing_key,
        inputs.recovery_state_digest,
        inputs.nonce_existing,
        inputs.nonce_new,
      ].map(lp),
    );
    if (hex(transcript) !== honest.derived.transcript) {
      fail('the transcript does not reconstruct from the published inputs — the formula and the generator disagree (FU-05).');
    }

    const th = hex(await sha256(transcript));
    if (th !== honest.derived.transcript_hash) {
      fail(`the transcript hash does not reconstruct: computed ${th}, published ${honest.derived.transcript_hash}.`);
    }
    const wrapInfo = hex(concat(lp('done/enroll-wrap/v1'), lp(th)));
    if (wrapInfo !== honest.derived.wrap_info) {
      fail('the wrap info does not reconstruct from the transcript hash.');
    }

    // The SAS, through HKDF, against the vector's own alphabet claim.
    const ikm = await crypto.subtle.importKey('raw', transcript, 'HKDF', false, ['deriveBits']);
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: lp('done/enroll-sas/v1') },
        ikm,
        5 * 8,
      ),
    );
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let sas = '';
    for (const b of bits) sas += alphabet[b & 0x1f];
    if (sas !== honest.expected.sas) {
      fail(`the SAS does not reconstruct: computed ${sas}, published ${honest.expected.sas}.`);
    }

    // And the negative that guards the digest names its exact values.
    const substituted = vector.must_fail.find((n) => n.name === 'substituted-recovery-state');
    if (substituted?.values?.original_digest !== inputs.recovery_state_digest || !substituted?.values?.substituted_digest) {
      fail('substituted-recovery-state no longer names its concrete original and substituted values (FU-05).');
    }
  }
}

// --- report ---------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`recipient authority: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  'recipient authority: the ratified formulas are stated at the named homes, the retired sentences appear in ' +
    'none of them, and the enrollment transcript, hash, wrap info and SAS reconstruct from published inputs alone.',
);
console.log(
  '  Scope: byte rules over the named homes and one vector reconstruction — never construction soundness ' +
    '(the negatives and vectors:coverage own that) and never implementation (the authority map’s status lines own that).',
);
