# The authority-derivation map

**2026-09-08 pin review:** the changed custody, storage and local-activation sections were reread
against SC-01–09. Factor roots retain their existing principal/workspace authority. `resolved` below
means the specified derivation/predicate has a home; it does not claim production conformance. Custody
seal counting now includes retries/purposes and all counter arguments exclude raw rollback/clones.
The [conformance matrix](../../../storage-conformance.md) records the remaining implementation evidence.

**Standing:** home — read back by [`check-authority-map.mjs`](../../../../scripts/check-authority-map.mjs)
(`pnpm authority:check`, in `pnpm check`) · **Built:** 2026-08-28, queue item 3(a) · **Anchored at:** `S0-2`
Stage A/B, because that is where the authority carriers live; its entries span every stage's joints

For every verification key and acceptance predicate in the workspace design: the client- or
factor-authenticated state that resolves it. [`HANDOFF.md`](../HANDOFF.md)'s class 1 — *an acceptance step
trusts a key or predicate that no factor-authenticated state resolves* — generated seven of the open blockers,
found one at a time by challenge rounds. This map is the instrument that closes the class as a class:
**a dangling or service-only edge fails the checker rather than a review** (`P-1` falsifier 14), and what still
blocks what is computed from the entries on demand, never transcribed beside them.

The ruling it enforces is `P-1`'s, ratified 2026-08-28 and stated as the pattern the sibling joints follow:
**a verification key resolves through client- or factor-authenticated state, or it does not verify.** Its first
entry is `P-1`'s own: no approval verifies under a key whose only voucher is the service-signed epoch.

## The four roots, and what each is allowed to carry

Every resolution chain terminates at exactly one of:

| Root | What it is | What may terminate there |
| --- | --- | --- |
| `trust-root` | Client-authenticated state grounded at workspace creation — the genesis certified set under the creating credential's key | anything |
| `factor` | State opened by something only the user holds — the recovery code, the archive code, a device-lock factor, a platform authenticator | anything |
| `structural` | A commitment verifiable from the bytes alone, no authority consulted — a hash recomputation, a local re-derivation | anything |
| `service` | The service's own signing keys | **only** an entry whose `guards` is `availability`, with the stated bound cited — the powers §13.2's service row grants: serialize epochs, assert accepted positions, stop hosting. Never keys, content, custody, attribution or deletion |

The `service` row is the design's own boundary, not a new rule: §13.1 fixes that authorization and decryption
never collapse, §13.5 prices what an equivocating service must do (fork, not withhold), and §14.7 §6 states a
compromised biller's blast radius as availability. The map makes the boundary a checked property of every edge
instead of an argument repeated at some of them.

## How to read an entry

Entries are the fenced `authority` blocks below — fenced so no formatter can ever reach them, machine-parsed so
the checker's enums are total: an unknown `kind`, `guards`, `status` or field name fails rather than entering
no bucket.

- **`kind`** — `verification` (a signature some acceptance step verifies) · `predicate` (an acceptance rule
  that consumes authenticated state) · `aead` (a sealing key; carried here because `P-3` falsifier 16 needs a
  census with one home — see §5).
- **`guards`** — what the entry protects: `keys | content | custody | attribution | deletion | availability`.
  The first five must terminate at `trust-root`, `factor` or `structural`; only `availability` may terminate at
  `service`, and then `bound:` cites the stated bound.
- **`resolves`** — the chain, ` -> `-separated, ending at `root:<root>` or `via:<entry>`. **A chain records the
  rule the decision records ratified or the schemas state — not what the corpus currently implements.** The
  `status` line carries that difference.
- **`status`** — `resolved`: the rule is stated at its pinned homes and the challenge rounds left it standing.
  `open`: a disposition holds the joint open; `blocker:` names the entry that holds it (`FU-nn` from
  [`FOLLOWUP-DISPOSITION.md`](../S0-9/FOLLOWUP-DISPOSITION.md), a finding, or a reopened `P-n`) and `return:`
  names the stage that owes the repair, both validated against the documents that define them.
- **`pin`** — `path §number hash12` (or `path hash12` for a whole file): the SHA-256 (first 12 hex) of the
  section that states the rule or embodies the defect. An edit to a pinned home fails the checker until the
  editor re-reads the entry and either re-pins it or flips it — `RC-8C`'s both-directions agreement, made
  mechanical, in the regime this program has now adopted four times (the review's `config.json`, `P-5`'s
  census, `RC-9`'s manifest, here).

**What the checker proves, exactly.** Every chain terminates at a permitted root for its guard; every open
joint carries a real blocker and a defined return; every pinned home is byte-current; and every `Ed25519(`
construction in the TRD and the seven stage documents sits in a pinned section, so the map cannot decide
its own census. **What it does not prove:** that the corpus implements a chain — an open entry's flip is owed
at its return, under that record's falsifiers, and the sweep sees signature constructions, not every predicate
prose could state. A pin detects drift, never forgery.

---

## 1. The two carriers every recipient-authority chain grounds in

Class 1's repair has one shape because `P-1` gave it one: every member key resolves through the certified-set
chain, and the chain grounds at its two edges — genesis under the creating credential, or a bootstrap-minted
replacement under the factor-resolved signer. These four entries are that shape; every later section's chains
end `via:` one of them.

**The shared home.** A member credential's signing key is what approvals, envelope signatures, admissions,
attribution claims and handoff receipts all verify under. Before the `S0-2` return the only
credential-to-signing-key certification was §13.2's authority table row — the service-signed epoch, the object
`P-1` exists to dethrone — which is round 1 `D-1` and the high finding it returned. The ratified home landed
2026-08-28: the parent certified set's member entry, `(credential_id ‖ W_pub ‖ S_pub)`, with every approval
naming its approver in its signed bytes and the verifier resolving that name through the parent set —
`certified-set-approved-by-an-impostor` is round 1's mutation inverted, with the lookup real (`P-1`
falsifier 12).

```authority
entry: member-signing-keys
kind: verification
guards: keys
verifies: any member credential's Ed25519 signature an acceptance step consumes
resolves: the named signer's member entry (credential_id ‖ W_pub ‖ S_pub) in the parent certified set -> each parent's own approval -> the genesis set under the creating credential -> root:trust-root
resolves: a bootstrap-minted replacement set -> via:bootstrap-signer
status: resolved
pin: docs/TRD.md §13.2 e20172edb4ea
pin: docs/TRD.md §13.5 fc07fa38364f
pin: docs/review/remediation/S0-2/A-schemas.md §1 4863e06ab791
```

The pins are the three homes the `S0-2` return amended together (`P-1` falsifiers 12–13, 18–19): §13.2's
ratified-rule paragraph and its table rows, §13.5's `CertifiedSet` member and approval formulas, and the Stage A
schema — with `pnpm recipient:check` as the falsifier-19 readback over them and the generators. Any of them
changing fails this entry until it is re-read, exactly as the flip itself did.

**Re-pinned 2026-08-29 for `R3-4`, and the entry still holds.** Both homes gained the member-entry uniqueness
rule: a set carrying two entries under one `credential_id` is malformed and a verifier refuses it. The entry's
resolution line already read *the named signer's member entry* — singular — and this makes the singular true by
construction rather than by assumption, so the re-pin is the additive kind and no status flips. §13.5's two
other pinning entries (`epoch-signature`, `head-first-contact`) are re-pinned by the same edit and their
`bound:` lines are untouched by it. `recipient:check` now carries the rule as a byte rule at both homes, since
the generator's object-keyed `members` cannot express a duplicate and no published negative can cover it.

**The factor-carried edge.** At total loss the client-authenticated state *is* the four objects, so the
bootstrap verifier must be factor-carried: committed in `recovery_state_digest`, sealed beside `R_priv`,
rotated by every recovery replacement, the old key refused after. `FU-01` found the commitment asserted and
carried by nothing; the `S0-2` return landed the carrier — the digest's `bootstrap_signer` field, acceptance
deriving the verifier from the factor-opened state alone, and the retired signer refused by the rotated
commitment (`P-1` falsifiers 15–16).

```authority
entry: bootstrap-signer
kind: verification
guards: keys
verifies: sig over a RecoveryBootstrap when no eligible client survives
resolves: the signer commitment inside recovery_state_digest -> the signer sealed beside R_priv under the recovery code -> root:factor
status: resolved
pin: docs/TRD.md §13.8 51dcd0675a51
pin: docs/review/remediation/S0-2/A-schemas.md §2 78dea0956af7
```

```authority
entry: bootstrap-countersig
kind: verification
guards: keys
verifies: the new credential's countersig over the same Bootstrap
resolves: the carried new_S_pub inside the binding the factor-resolved sig vouches for (new_credential_id ‖ new_W_pub ‖ new_S_pub ‖ new_recovery_state_digest) -> via:bootstrap-signer
status: resolved
pin: docs/review/remediation/S0-2/A-schemas.md §2 78dea0956af7
```

The countersig's verifier is the one key the parent set cannot carry — the new credential exists precisely
because no set names it — so the `Bootstrap` carries `new_S_pub` and the countersig verifies under it, vouched
by the binding the factor-resolved `sig` covers. `P-1` falsifier 17's composition landed with the flip: an
accepted bootstrap's binding is the replacement certified set, and the transition vectors rotate under it —
both bootstrap entries flipped together at the `S0-2` return (`P-1` falsifiers 15–17, 2026-08-28).

**The ceremony.** Enrollment's second gate is the one place a key crosses between people's hands, and its
authority is the releasing client's eligibility plus the out-of-band channel — the typed symbols. Under the
ratified option A the transcript binds `S_pub` — landed at the return, with a `substituted-signing-key`
negative — and `FU-05`'s republication landed in the same regeneration: every transcript input is in the
vector's published inputs, and `pnpm recipient:check` reconstructs the transcript, its hash, the wrap info and
the SAS from them alone.

```authority
entry: enrollment-transcript
kind: predicate
guards: keys
verifies: the SAS ceremony that licenses a content-key release and produces the set successor
resolves: the typed symbols over the transcript (workspace, epoch and head, both credentials, W_pub, S_pub, recovery_state_digest) -> the releasing client's eligibility in the certified set -> via:member-signing-keys
status: resolved
pin: docs/TRD.md §13.6 1accb334be21
```

## 2. The lineage and the acceptance domain — service powers, each with its bound

These are the edges the design deliberately grants the service, and the map's job here is the opposite of
§1's: not to remove the edge, but to pin the bound that keeps it an availability power. An entry in this
section acquiring a wider guard than `availability` would fail the checker — which is the boundary §13.1
states, enforced per edge.

```authority
entry: epoch-signature
kind: verification
guards: availability
verifies: a successor epoch — roster, capabilities, generation, K_accept certification, accepted-head vector
resolves: the service authorization key -> root:service
bound: §13.5 — epochs are serialized, signed and ancestor-checked, so equivocation must fork the lineage rather than withhold; and per P-1 the epoch resolves no recipient-authority key — it carries the certified sets and vouches for none of them
status: resolved
pin: docs/TRD.md §13.5 fc07fa38364f
```

```authority
entry: head-first-contact
kind: verification
guards: availability
verifies: the nonce-bound signed head assertion a brand-new or total-loss device consumes at first contact
resolves: K_auth's head assertion -> root:service
bound: §13.5 — client_nonce separates a hostile relay from a hostile service; issued_at is displayed, never enforced; a stale self-consistent head degrades to a partition because a hidden revocation is a hidden generation, and the ancestor rule takes over after first contact
status: resolved
pin: docs/TRD.md §13.5 fc07fa38364f
```

```authority
entry: accepted-head
kind: verification
guards: availability
verifies: Head_n over a credential's accepted chain — the evidence required before any envelope is applied
resolves: K_accept, certified by the authorization key in the epoch in force -> via:epoch-signature
bound: §7.5 — accepted positions are exactly what the service is authoritative over; the client verifies against the link it replayed itself, first-seen-wins per position, and withheld evidence stops sync rather than admitting anything
status: resolved
pin: docs/TRD.md §7.5 21aa93da7f05
```

```authority
entry: position-refusal
kind: verification
guards: availability
verifies: a definite Refuse — the only licence to re-mint a position
resolves: the same K_accept, from the same certification -> via:epoch-signature
bound: §7.5 — a refusal is permanent, closes exactly (workspace, credential, position, digest, epoch) — the refused envelope's own referenced epoch, the fifth subject field — licenses one successor at its own position and no other; the verifier resolves from the lineage's certification in force, never from the answer, and everything else is silence
status: resolved
pin: docs/TRD.md §7.5 21aa93da7f05
pin: docs/review/remediation/S0-4/A-schemas.md §3 e4380ac288fd
```

The refusal's key resolves exactly as the head's does — and since the `S0-4` return (2026-08-28) its
*subject* is closed too: the signed epoch was absent from the client's comparison and from the spool model,
so a genuine refusal under a stale or forked `K_accept` licensed a re-mint — the delayed old-key compromise
discarding current outbound bytes (`A-03`, `FU-06`). The return carried the envelope's own epoch into the
subject as its fifth field and kept the resolution exactly the head's — the certification in force in the
authenticated lineage, never a key from the answer — so the attack is silence both ways: naming the
envelope's epoch it fails the signature, naming the retired key's own it fails the subject. The
`refusal-under-a-retired-epoch-key` and `refusal-for-another-epoch` vectors publish both, the model holds the
verdicts, and `refusal_id` binds the message rather than the signature, so permanence survives an ordinary
rotation.

```authority
entry: relay-admission
kind: predicate
guards: availability
verifies: a relay admission token opening a scoped transport connection
resolves: the service's token issuance -> root:service
bound: §13.2 — a bounded transport scope that may not decrypt, sign content, admit a device, change capabilities or recover an account
status: resolved
pin: docs/TRD.md §13.2 e20172edb4ea
```

## 3. Content authenticity and attribution

Every entry here chains through the member-key home, which is what *class* means: these entries' own rules
held both challenge rounds, and they stay blocked-through until §1 flips — repair the home once and they clear
together, which the checker computes rather than anyone maintaining.

```authority
entry: envelope-signature
kind: verification
guards: content
verifies: sig over an envelope's AAD fields, nonce and digest (§7.4)
resolves: the signing credential named in the clear header -> its member entry for the referenced epoch -> via:member-signing-keys
status: resolved
pin: docs/TRD.md §7.4 879970c40c7c
```

```authority
entry: checkpoint-manifest
kind: verification
guards: content
verifies: M v2 — the producing credential's manifest over checkpoint digest, separate SHA-256(sv) and SHA-256(ds), and the head vector
resolves: the producing credential -> via:member-signing-keys
status: resolved
pin: docs/TRD.md §7.6 95710d790858
```

```authority
entry: checkpoint-admission
kind: predicate
guards: content
verifies: that a checkpoint means the accepted snapshot it claims — SemanticAdmission plus the restorer's order
resolves: local re-derivation of {sv, ds} from the decrypted snapshot, compared three ways -> root:structural
resolves: the admission signature and the admitting credential's eligibility at the manifest's epoch -> via:member-signing-keys
status: resolved
pin: docs/TRD.md §7.6 95710d790858
pin: docs/review/remediation/S0-5/A-schemas.md §1 87c7b6063c29
pin: docs/review/remediation/S0-5/A-schemas.md §4 6fc9ec7ea390
```

**Re-pinned 2026-09-11 for descriptor encoding v2.** The producing/admitting key paths and local
three-way coverage comparison are unchanged; both signed messages bind separate decoded-byte
descriptor hashes. Checkpoint encryption and its key authority are unchanged. The private v1 refusal
and 16 MiB pair bound are recorded in [the amendment](../../../account-admission-bounds.md).

**Flipped 2026-08-28 at the `S0-5` return** (`FU-11`, `ST-06`). The rule was always stated; what flipped it is
that the evidence now exercises it with the authority as an input: the verifier resolves from the certified
set's member entry at the manifest's epoch — a genuine signature by an uncertified credential refuses at the
lookup, before any signature runs — the producer's self-admission beside a second eligible client is refused
by cardinality (the exact acceptance `ST-06` convicted, inverted with its world kept and published), the
`self_admitted` flag equals the derived relation in both directions, and install is a staged machine whose
activation flips content and heads together — kill points, rollback and the actual second-newest fallback
scheduled in `test/storageSchedule.test.ts`.

```authority
entry: attribution-record
kind: verification
guards: attribution
verifies: R — the standing claim minted by the writing credential at card creation
resolves: content_commitment recomputed from the card's own bytes -> root:structural
resolves: sig by the writing credential -> via:member-signing-keys
status: resolved
pin: docs/TRD.md §13.7 90571d7b3fd0
```

```authority
entry: creation-certificate
kind: verification
guards: attribution
verifies: C — the certificate a card's identity commits to
resolves: card_id recomputed as the hash of C, so a different creator is a different id -> root:structural
resolves: cert_sig by the creating credential -> via:member-signing-keys
status: resolved
pin: docs/review/remediation/S0-5/A-schemas.md §2 fa5ea81f2eec
```

## 4. Custody, packages, recovery

```authority
entry: recovery-envelope
kind: predicate
guards: custody
verifies: opening the sealed R_priv ‖ RootCommitment ‖ bootstrap seed envelope
resolves: the 125-bit recovery code the user re-entered before the account existed -> root:factor
status: resolved
pin: docs/TRD.md §13.8 51dcd0675a51
pin: docs/account-crypto/recovery-layout.md §1 88db6bbcf31b
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: recovery-replace-stepup
kind: predicate
guards: custody
verifies: the three gates on replace-recovery
resolves: content access proven by use — rewrapping opens every retained generation, and the required local factor opens the scoped custody entry -> root:factor
resolves: an account-credential assertion over the nonce-bound, single-use challenge -> via:account-credential
status: resolved
pin: docs/TRD.md §13.8 51dcd0675a51
```

```authority
entry: account-package-root
kind: predicate
guards: content
verifies: importer step 2 — the recomputed RootCommitment against the manifest, before any unwrap
resolves: the commitment sealed beside R_priv under the recovery code -> root:factor
status: resolved
pin: docs/review/remediation/S0-6/A-schemas.md §1 29d6982aa361
```

```authority
entry: package-manifest
kind: verification
guards: content
verifies: the assembler's manifest over a portable package's parts
resolves: assembled_by, resolved from the epochs the package itself carries -> via:member-signing-keys
resolves: the factor-checked root commitment, consumed first at import -> via:account-package-root
status: resolved
pin: docs/TRD.md §14.4 c44b7bbd2d3e
```

```authority
entry: terminal-lineage-record
kind: verification
guards: availability
verifies: the signed terminal record that moves a lineage to retired
resolves: the lineage authorization key -> root:service
bound: §14.4 and §14.7 §6 — terminal lineage needs a client-signed retire intent the biller does not hold, the record commits before anything is deleted, and a retired package is a complete re-assembly under the terminal authority, never a live manifest with a field rewritten
status: resolved
pin: docs/TRD.md §14.4 c44b7bbd2d3e
pin: docs/review/remediation/S0-6/A-schemas.md §3 d4c0e75e9ddb
```

```authority
entry: local-archive-anchor
kind: predicate
guards: content
verifies: what authenticates a never-established Local archive
resolves: auth_root — the archive identity's own digest, both public halves, recomputed and checked against the commitment sealed under the archive code -> root:factor
resolves: the manifest's verifier — the signing half the commitment-checked auth_root commits, never a key the package offers -> root:factor
status: resolved
pin: docs/review/remediation/S0-6/A-schemas.md §2 faa19f8bc380
pin: scripts/generate-package-vectors.mjs 03771d2e0ccb
```

**Flipped 2026-08-29 at the `S0-6` return** (`FU-02`, `A-04`, `ST-01`). The joint was the disconnection: the
factor sealed an HPKE recipient while the published package positive verified its manifest under the laptop's
device key, and the code-sealed commitment was never composed with the manifest. The identity now carries a
manifest-signing half under the same code, `auth_root` is the digest of both public halves, and the composed
importer — run over the published package itself, which reconstructs from its published inputs — refuses the
fresh mint at the commitment before the signer is consulted and before any unwrap, with the order observed
rather than inferred. The pre-return device-signed acceptance, the uncommitted-signer door, and the
endpoints-era wrap attacks are published negatives; the envelope's AAD joined the coverage audit with each of
its four fields isolated.

```authority
entry: terminal-handoff
kind: predicate
guards: deletion
verifies: verified-current — the receipt that authorizes a hosted deletion class
resolves: the receiving client's signature -> via:member-signing-keys
resolves: the CatchupTranscript committed by catchup_digest — its signer the lineage's certification in force at source_epoch, whose chain terminates at the committed trust root, never the receiver -> root:trust-root
resolves: the link chain from receiver_prior_head to the terminal head, and the absence list the signed count must equal -> root:structural
status: resolved
pin: docs/TRD.md §14.4 c44b7bbd2d3e
pin: docs/review/remediation/S0-6/A-schemas.md §4 0d33a5cdf7a2
```

**Flipped 2026-08-29 at the `S0-6` return** (`FU-03`, `A-05`). The pre-return value was one hash over two
public heads plus a bare count — computable by the stale receiver itself, so the gate on destruction read
self-assertion as currentness. `catchup_digest` now commits the full bytes of a `CatchupTranscript` the gate
re-verifies: signer resolved from the certification in force (an input, never the answer — the receiver's own
genuine signature is a published negative), links chained from the receiver's authenticated prior head to the
terminal head with chaining-from-elsewhere, a broken interior link and stopping short refused separately, and
absences named, with the count the receiver signed checked against the list. The pre-return acceptance —
endpoints digest, `knownAbsences: 0` — and the old positive's count-without-a-list are both kept as permanent
negatives, and the accepted receipt publishes its transcript so the artifact reconstructs from its inputs.

```authority
entry: destructive-boundary
kind: predicate
guards: deletion
verifies: what licenses hosted erasure — the intent, the boundary, and the per-class gate
resolves: the retire intent carrying its erasure acceptance in its signed payload (P-4, option B) -> via:member-signing-keys
resolves: per-class TerminalHandoffs, one durable receipt per deletion class -> via:terminal-handoff
status: resolved
pin: docs/TRD.md §14.7 683f0f7679ef
pin: docs/review/remediation/S0-7/A-schemas.md §3 c29c3b0d8d88
```

**Flipped 2026-08-29 at the `S0-7` return** (`FU-04` — `ST-02`, `A-06`, `E1`, and round 1's `C-7`; `P-4`
falsifiers 11–19). The joint was the strongest convergence across all seven challengers: composed with
§14.7's inherited clock, a retirement could be born with its ceiling already elapsed, so every class deleted
at the click instant with `handoffs.size === 0` — elapsed time replacing the receiving client's custody
authority, and the suite asserting it as a positive. The boundary is now the retirement's own — `retired_at +
RETENTION`, written exactly once at the `cause` overwrite, never earlier than an inherited deadline — so the
born-elapsed reproduction refuses `no-handoff` at the birth instant and is the model's permanent negative;
every `retire` payload carries the erasure acceptance in its signed bytes, with the acceptance-less mint a
published negative and the in-transit strip a published digest difference; a boundary erasure executes that
instruction and terminates in `deleted-without-receipt`, a state no reader can take for a receipt; the
entitlement signer moves the boundary in neither direction, in the challenge's own order; and the gate and
the retention model state one six-class domain, published with the package vectors and cross-checked both
ways by `pnpm retention:check`, which also holds the eight boundary homes to the ratified sentences.

```authority
entry: retention-mark
kind: verification
guards: availability
verifies: a signed, revision-ordered RetentionMark — the disclosure PRD §6.10 requires
resolves: the retention service's signing key -> root:service
bound: §14.7 §6 — the signer is not the lineage authorization key: it can stop hosting and cannot admit, revoke, rotate, retire, delete before the deadline its own clock computed, move a retirement's destructive boundary in either direction, or touch class 6 under cause entitlement; clients reject a passed revision
status: resolved
pin: docs/TRD.md §14.7 683f0f7679ef
pin: docs/review/remediation/S0-7/A-schemas.md §1 b1cd5c9a0902
```

```authority
entry: entitlement-event
kind: verification
guards: availability
verifies: a billing event — grace-begins, sync-stops, restored
resolves: the entitlement service's signing key -> root:service
bound: S0-7 §2 — effective_at is bound evidence and never the clock, so a backdated event cannot move the deadline; sequence is monotonic per account, so a replayed stop cannot re-stop a resumed one; the exact wire is gated on D-31
status: resolved
pin: docs/review/remediation/S0-7/A-schemas.md §2 739acfa79631
```

```authority
entry: reseed-session
kind: predicate
guards: availability
verifies: resuming hosted sync after destructive progress — a branch, never a genesis
resolves: the seeding device's signature naming the lineage it continues -> via:member-signing-keys
status: resolved
note: FU-12 landed 2026-08-29 at the S0-7 return — the branch set is durable state, the stale second survivor is refused with its session held and joins after re-deriving, and the derive-to-commit window runs on the scheduler with a kill and a second writer inside; it was a class-2 interleaving, never an authority edge
pin: docs/review/remediation/S0-7/A-schemas.md §4 7278571c3cd2
```

```authority
entry: account-credential
kind: verification
guards: availability
verifies: the WebAuthn account credential and the local slot verifier
resolves: an assertion from the platform authenticator, same-origin only, Ed25519 or ES256 -> root:factor
status: resolved
pin: docs/TRD.md §13.9 8d9ba621b3e6
```

```authority
entry: device-lock-custody
kind: predicate
guards: custody
verifies: opening every persistent scoped custody entry from genesis and cold start
resolves: current code-only custody requires factor opening, metadata authentication and retained-key correspondence; selected PRF enrollment remains separate -> via:private-local-custody-open
status: resolved
pin: docs/TRD.md §13.3 edf42ef40738
```

## 5. The AEAD keys — `P-3` falsifier 16's census, seeded

Not verification keys, but the same question one construction over: what state is an acceptance bounded
*against*? `P-3` falsifier 16 requires every AEAD key on the write path to name either the durable state that
counts its invocations or the nonce discipline that needs none, with a checker refusing a key with neither —
these entries are that census's home, seeded at `S0-2` and grown at the `S0-3` return (2026-08-28). The
checker refuses an `aead` entry that names neither, or both, and the sweep below now sees AEAD constructions
as well as signatures.

```authority
entry: k-store
kind: aead
guards: content
verifies: the store subkey sealing every StoredRecord
counted-by: SeqCounter.reserved[gen] — one key per counter: the derivation binds the store_id minted beside the counter (row 3 §§3–4), and the store rotates before the 2^32nd reservation, equality first disallowed; conditional on an unrewound, unbranched history (SC-09), not raw profile clones
status: resolved
pin: docs/TRD.md §6.1 80ffa103b92e
pin: docs/selections/row-3-record-format.md dcefb99d3368
```

The scope was round 1's *one live construction defect* — every store holding `K_g` derived the identical
subkey while each `SeqCounter` saw only its own share — and it flipped at the `S0-3` return (2026-08-28,
`P-3` falsifiers 14–16): the `info` binds the store identity, so `reserved[gen]` counts every invocation of
the key it bounds and the sum over independently created devices is a sum over distinct keys.
That argument excludes raw clones and rollback, which duplicate the store identity and counter (SC-09). The two-store reproduction in
`test/storageSchedule.test.ts` is inverted with its schedule kept, `wrong-store-subkey` is the published
negative, and `pnpm admission:check` reads the homes.

```authority
entry: k-journal
kind: aead
guards: content
verifies: the synchronous journal subkey
discipline: 24 fresh independent random bytes per entry without an application nonce counter, subject to row 2's finite-use collision bound and fresh-randomness assumption; no unlimited-lifetime or clone/restore guarantee
status: resolved
pin: docs/selections/row-2-journal-aead.md d1b1d4616aad
```

```authority
entry: k-net
kind: aead
guards: content
verifies: the network-envelope subkey K_net
counted-by: NetSealCounter.reserved[gen] per workspace/credential — private v2 binds credential and generation in HKDF; strictly reserve each invocation before crypto, including crash recovery and refusal successors; reject before 2^32; assumes an unrewound, unbranched credential history
status: resolved
note: FU-10 still requires atomic position plus reserved-row identity. The 2026-09-10 preparation corrects the older model’s crash/successor undercount and v1 shared-key domain. Resolved here is the specified construction, not native implementation; account-outbound.md and its counterexamples retain that boundary.
pin: docs/TRD.md §7.4 879970c40c7c
pin: docs/review/remediation/S0-4/A-schemas.md §2 4eee344bd206
pin: docs/account-crypto/transport.md §2 ff41202e59ad
pin: docs/account-crypto/transport.md §8 381c3f07f8b3
```

```authority
entry: k-code-sealed-envelopes
kind: aead
guards: custody
verifies: the recovery envelope and the archive envelope
discipline: one message per derived key — a fresh per-seal salt into HKDF of the code; nonrepeating randomness across seals, including restored or cloned histories, is required (§13.8, S0-6 §2); vector agreement does not establish that host assumption
status: resolved
pin: docs/TRD.md §13.8 51dcd0675a51
pin: docs/review/remediation/S0-6/A-schemas.md §2 faa19f8bc380
pin: docs/account-crypto/recovery-layout.md §1 88db6bbcf31b
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: k-key-envelopes
kind: aead
guards: custody
verifies: the local key envelopes — K_g and §13.4's sealed credentials under scoped factor-protected L_lock; L_local is legacy migration input
counted-by: v2 custody root seal_reserved — reserve before every invocation, across purposes and abandoned retries; rotate the root or refuse before the 2^32nd reservation (row 3 §5, SC-09). One envelope per (generation, purpose) is only logical uniqueness. Resume the same staged root with its counter; unrewound/unbranched history is required
status: resolved
pin: docs/selections/row-3-record-format.md dcefb99d3368
pin: docs/TRD.md §13.3 edf42ef40738
```

```authority
entry: k-index
kind: aead
guards: content
verifies: the deferred search-index subkey — the label done/index/v1, reserved and unselected
discipline: no invocation exists to count — no construction is selected (row 3 §4; row 18 stays at its own gate per P-7), and the selection that creates an index write path owes this entry its counter or discipline before it ships
status: resolved
pin: docs/TRD.md §13.2 e20172edb4ea
```

```authority
entry: k-checkpoint
kind: aead
guards: content
verifies: the sealed checkpoint — K_cp over the full snapshot, an opener on every device
discipline: one message per derived key — cp_salt is 16 fresh random bytes per seal into K_cp's HKDF, carried in the clear beside the nonce, so exactly one plaintext is ever sealed under each derived key and nonce reuse is structurally unreachable (§7.6, row 7); the key cannot narrow to a store because every device must open it and no single store could count the others' seals, so freshness rides the seal rather than a counter — §13.8's discipline at the fifth subkey
status: resolved
pin: docs/TRD.md §7.6 95710d790858
pin: docs/selections/row-7-checkpoint.md a6f8b4910ab8
```

**The census's one declared absence, paid and struck at the `S0-5` return (2026-08-28).** From the `S0-3`
return until then, `K_cp` was held out of the census by a declaration in this paragraph, because its homes
stated neither a durable state that counts its invocations nor a nonce discipline that needs none — falsifier
16's exact shape — and the repair could not copy `P-3` joint 1: a checkpoint must open on every device, so its
key cannot narrow to a store. The homes now select the per-seal derivation above, the `wrong-cp-salt` negative
is published, and the entry entered with the declaration struck in the same edit — the checker still refuses
the entry and the declaration coexisting, and both disappearing. The `L_local`/`L_lock` envelopes and the
deferred index subkey entered above at the `S0-3` return (2026-08-28), each from the homes that select it.

---

## The census is the documents', and the discipline is the regime's

**The sweep.** Every `Ed25519(` construction — and, since the `S0-3` return, every AEAD construction
(`AES-256-GCM(`, `XChaCha20-Poly1305(`, `AEAD(`) — in `docs/TRD.md` and the seven stage documents
(`S0-1/A-policies.md`, and `S0-2`/`S0-3`/`S0-4`/`S0-5`/`S0-6`/`S0-7` `A-schemas.md` — `S0-1` and `S0-3`
joined at the `S0-9` round-3 return, `R3-2`, which demonstrated a sealed construction in `S0-3`'s schema home
entering no census) must sit in a section some entry pins — so a signature or
sealed construction added anywhere in those documents fails the checker until the map claims it, and the map
cannot shrink its own population. What the sweep cannot see is a predicate stated in prose with no
construction; those enter through the dispositions and the schemas, which is where every entry above came
from, and a challenge that finds one missing has found a real gap in this file.

**The flip.** A stage return that repairs a joint edits the pinned homes, which fails the entry's pins; the
same change flips `status` to `resolved` and strikes the blocker, and the checker refuses every other
combination — a resolved entry still carrying its blocker, an open entry whose homes changed silently, a
blocker or return naming nothing. The open set can only shrink by repair, exactly as the `OWED` list can only
shrink by payment.

**Consumption.** The stage returns (queue item 4) flip their entries: `S0-2` — `member-signing-keys`,
`bootstrap-signer`, `bootstrap-countersig`, `enrollment-transcript` — **flipped 2026-08-28 at the `S0-2`
return**; `S0-3` — `k-store` — **flipped 2026-08-28 at the `S0-3` return**; `S0-4` — `position-refusal` —
**flipped 2026-08-28 at the `S0-4` return**; `S0-5` — `checkpoint-admission` — **flipped 2026-08-28 at the
`S0-5` return, with the `k-checkpoint` census entry entered and its declared absence struck the same day**;
`S0-6` — `local-archive-anchor`, `terminal-handoff` — **flipped 2026-08-29 at the `S0-6` return**; `S0-7` —
`destructive-boundary` — **flipped 2026-08-29 at the `S0-7` return, the map's last open joint: the open count
now reads zero, entry by entry at the returns, never by edict**. `S0-9` round 3 reads the computed
summary as the class-1 ledger, and `S0-10` consumes a map whose open count is zero or does not close. `P-1`
falsifier 14 was discharged at the `S0-2` return: the member-key entries flipped, every chain still terminates
at a permitted root for its guard, and the checker — not a review — is what refuses a dangling or service-only
edge from here on.

## 7. Private first-authority byte contracts (2026-09-11)

These entries specify the current private first-epoch rules. `resolved` means their authority rule is
stated at the pinned home, not that the entire Account protocol has been qualified. The executable
[construction registry](../../../account-crypto/constructions.json) joins actual source sites to these
entries and fixed-vector requirements. B/C/D and inherited Local gaps remain explicitly open there; an
eight-document legacy sweep or zero open entries here cannot close the whole Account census.

```authority
entry: private-first-service
kind: verification
guards: availability
verifies: independently pinned K_auth signatures over private first-epoch proposals, observations, activation contexts, receipts and slot bindings
resolves: the exact configured service pin resolves K_auth -> root:service
bound: Only fixed-purpose serialization/observation at §§2,5,7; cannot license recipients, plaintext coverage or device-factor release.
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §5 57d1d3ddb251
pin: docs/account-crypto/first-authority.md §7 77691367bf63
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

```authority
entry: private-first-origin
kind: verification
guards: keys
verifies: the creating request origin endorsement, including candidate and certification signatures
resolves: the bootstrap signer authenticated inside the factor-opened recovery state, with its root commitment checked -> root:factor
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §5 57d1d3ddb251
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

```authority
entry: private-creating-device
kind: verification
guards: attribution
verifies: candidate and certified-set approval by the exact prepared device signing key
resolves: device signing key opened from the authenticated Local preparation under mandatory custody -> root:factor
resolves: the complete request and prepared-key correspondence endorsed at creation -> via:private-first-origin
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §5 57d1d3ddb251
pin: docs/account-crypto/first-authority.md §6 23edf4c7a828
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

```authority
entry: private-first-hashes
kind: predicate
guards: content
verifies: structural pin/request/completion/head digests; these name bytes and confer no authority by themselves
resolves: recompute the exact domain, LP and ordered JSON bytes before consuming their enclosing authenticated object -> root:structural
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §3 f14d0f566ff3
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §5 57d1d3ddb251
pin: docs/account-crypto/first-authority.md §6 23edf4c7a828
pin: docs/account-crypto/first-authority.md §7 77691367bf63
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

```authority
entry: private-first-coverage
kind: predicate
guards: content
verifies: initial checkpoint manifest and admission with independent plaintext SV/DS rederivation and empty first-head baseline
resolves: the decrypted snapshot locally rederived and compared to both descriptors -> root:structural
resolves: the initial producing and admitting device signing key -> via:private-creating-device
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §3 f14d0f566ff3
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §6 23edf4c7a828
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

```authority
entry: private-first-activation
kind: predicate
guards: availability
verifies: fresh exact-completion assertion by the actual registered account credential; receipt and slot binding name that credential
resolves: actual account authenticator assertion at the exact origin and RP -> via:account-credential
resolves: fixed-purpose signed activation context and atomic consumed receipt decision -> via:private-first-service
bound: Only the first account activation/slot-authentication boundary in §7; no content-key release or device-lock bypass.
status: resolved
pin: docs/account-crypto/first-authority.md §1 34c623d42fe5
pin: docs/account-crypto/first-authority.md §2 699db1bc3e59
pin: docs/account-crypto/first-authority.md §4 166fcd729355
pin: docs/account-crypto/first-authority.md §7 77691367bf63
pin: docs/account-crypto/first-authority.md §8 e6fc9feaa990
```

## 8. Private initial recovery bytes — group B

These entries specify current preparation bytes and their narrow powers. Replacement/total-loss
recovery and the checkpoint/startup bridge remain separate. The construction registry retains those
unfinished qualifications; resolving a byte home is not complete protocol validation.

```authority
entry: private-recovery-possession
kind: verification
guards: custody
verifies: bootstrap-key correspondence check and initial saved-code possession confirmation; no account or total-loss grant
resolves: the bootstrap seed and expected root authenticated together inside the factor-opened three-part payload -> root:factor
status: resolved
pin: docs/account-crypto/recovery-layout.md §1 88db6bbcf31b
pin: docs/account-crypto/recovery-layout.md §2 e4cf66042858
pin: docs/account-crypto/recovery-layout.md §3 04b998cb7371
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: private-recovery-commitments
kind: predicate
guards: custody
verifies: exact initial root, envelope, state and draft commitments; hashes alone are not authority
resolves: fixed LP bytes and SHA256 recomputation -> root:structural
resolves: the sealed commitment checked against the caller-established expected scope -> via:recovery-envelope
status: resolved
pin: docs/account-crypto/recovery-layout.md §1 88db6bbcf31b
pin: docs/account-crypto/recovery-layout.md §2 e4cf66042858
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: private-account-challenges
kind: predicate
guards: availability
verifies: exact purpose, attempt, account, RP/origin and fresh service nonce for initial account/recovery challenges
resolves: recomputed LP challenge bytes and operation-owned state -> root:structural
resolves: the separately verified account assertion over that challenge -> via:account-credential
status: resolved
pin: docs/account-crypto/recovery-layout.md §2 e4cf66042858
pin: docs/account-crypto/recovery-layout.md §3 04b998cb7371
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: private-recovery-wrap
kind: aead
guards: keys
verifies: base-mode HPKE generation seal, with no sender authority inferred from encryption
discipline: one sequence-zero message per fresh X25519 sender context, fixed RFC 9180 suite 32/1/2 and empty AAD; requires nonrepeating sender randomness across seals/restores/clones
status: resolved
pin: docs/account-crypto/recovery-layout.md §4 54947337b7c1
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

```authority
entry: private-recovery-recipient
kind: predicate
guards: keys
verifies: the recovery recipient and generation scope before HPKE unwrap
resolves: the recipient key pair and root authenticated by the factor-opened payload -> via:recovery-envelope
resolves: sender authority on the separate first candidate -> via:private-first-origin
status: resolved
pin: docs/account-crypto/recovery-layout.md §1 88db6bbcf31b
pin: docs/account-crypto/recovery-layout.md §4 54947337b7c1
pin: docs/account-crypto/recovery-layout.md §5 c160491d235a
```

## 9. Private encrypted transport bytes — group C

These fixed byte homes preserve the member/service authority separation and current versions.
Group D custody and local witness bridges remain open; no real Account is provisioned by these tests.

```authority
entry: private-transport-member
kind: verification
guards: attribution
verifies: envelope and wrapper attribution; v1 credential or v2 reader signatures with distinct publisher scope
resolves: the named active workspace signing key resolved through the authenticated certified member set -> via:member-signing-keys
status: resolved
pin: docs/account-crypto/transport.md §1 175443c33e0e
pin: docs/account-crypto/transport.md §2 ff41202e59ad
pin: docs/account-crypto/transport.md §4 3d2d54df83c8
pin: docs/account-crypto/transport.md §5 bb09e7a60319
pin: docs/account-crypto/transport.md §6 1a7053699c06
pin: docs/account-crypto/transport.md §8 381c3f07f8b3
```

```authority
entry: private-transport-acceptance
kind: verification
guards: availability
verifies: fixed-purpose refusal, accepted head, exact read page and service completeness witness
resolves: the current acceptance key resolved from the held authenticated epoch, never from the response -> via:epoch-signature
bound: Only §4 acceptance/closure evidence, §6 scoped read evidence and §7 ledger completeness; no member, recipient, plaintext-admission or factor authority.
status: resolved
pin: docs/account-crypto/transport.md §1 175443c33e0e
pin: docs/account-crypto/transport.md §4 3d2d54df83c8
pin: docs/account-crypto/transport.md §5 bb09e7a60319
pin: docs/account-crypto/transport.md §6 1a7053699c06
pin: docs/account-crypto/transport.md §7 f13da6f75166
pin: docs/account-crypto/transport.md §8 381c3f07f8b3
```

```authority
entry: private-transport-framing
kind: predicate
guards: content
verifies: exact typed binary/JSON carriers and ordered nested bytes; parsing alone authenticates nothing
resolves: bounded canonical decoding and exact byte reconstruction before the enclosing signature and owner checks -> root:structural
status: resolved
pin: docs/account-crypto/transport.md §1 175443c33e0e
pin: docs/account-crypto/transport.md §3 4853b942c998
pin: docs/account-crypto/transport.md §4 3d2d54df83c8
pin: docs/account-crypto/transport.md §5 bb09e7a60319
pin: docs/account-crypto/transport.md §6 1a7053699c06
pin: docs/account-crypto/transport.md §8 381c3f07f8b3
```

```authority
entry: private-transport-commitments
kind: predicate
guards: content
verifies: ciphertext, refusal-ID, acceptance-link, exact signed-request and event-chain hashes; none is standalone authority
resolves: SHA256 recomputation over the specified exact bytes, with enclosing signatures and held context checked separately -> root:structural
status: resolved
pin: docs/account-crypto/transport.md §1 175443c33e0e
pin: docs/account-crypto/transport.md §2 ff41202e59ad
pin: docs/account-crypto/transport.md §4 3d2d54df83c8
pin: docs/account-crypto/transport.md §5 bb09e7a60319
pin: docs/account-crypto/transport.md §7 f13da6f75166
pin: docs/account-crypto/transport.md §8 381c3f07f8b3
```

## 10. Private service key custody — group D1

This qualifies the server seed seals and their owner inputs. Client factors and content/recipient
authority remain independent; the rest of group D and inherited Local bridges remain open.

```authority
entry: private-service-custody-input
kind: predicate
guards: custody
verifies: validated operator inputs, independent expected pin, exact seed/public exports, key correspondence and closed-owner lifetime
resolves: the separately supplied operator wrapping secret authenticating the stored seed and scoped descriptor -> root:factor
resolves: explicit expected-pin comparison and key-format/public-key rederivation; these structural checks grant no client authority -> root:structural
status: resolved
pin: docs/account-crypto/service-custody.md §1 fc3af13356e9
pin: docs/account-crypto/service-custody.md §2 516770c18caa
pin: docs/account-crypto/service-custody.md §3 8ef023179a38
pin: docs/account-crypto/service-custody.md §4 2b47c6c1e840
pin: docs/account-crypto/service-custody.md §5 06d2aa51332b
pin: docs/account-crypto/service-custody.md §6 1713a08e3b21
```

```authority
entry: private-service-root-seal
kind: aead
guards: custody
verifies: the service root seed seal and exact pin-bound KDF/AAD
discipline: one seed per fresh salt-derived key with a fresh random nonce; requires nonrepeating randomness and unrewound/unbranched histories across initialize/restore/clone; no counter or rotation qualification
status: resolved
pin: docs/account-crypto/service-custody.md §2 516770c18caa
pin: docs/account-crypto/service-custody.md §5 06d2aa51332b
pin: docs/account-crypto/service-custody.md §6 1713a08e3b21
```

```authority
entry: private-service-acceptance-seal
kind: aead
guards: custody
verifies: the two-layer acceptance key schedule, proposal/public-key AAD and seed seal
discipline: one seed per fresh salt-derived key with a fresh random nonce, under the service-scoped custody root; requires nonrepeating randomness and unrewound/unbranched histories; no rotation/restore qualification
status: resolved
pin: docs/account-crypto/service-custody.md §3 8ef023179a38
pin: docs/account-crypto/service-custody.md §5 06d2aa51332b
pin: docs/account-crypto/service-custody.md §6 1713a08e3b21
```

## 11. Local promotion MAC and deterministic identities — group D2

Only retained promotion authentication is qualified here. Complete Account grants and remaining Local
constructions require their separate owners and evidence.

```authority
entry: private-promotion-authentication
kind: verification
guards: custody
verifies: HMAC-SHA256 over the versioned carrier under the factor-opened scoped Local custody root
resolves: independently opened mandatory Local factor and authenticated current custody -> via:device-lock-custody
status: resolved
pin: docs/account-crypto/local-promotion.md §1 398c25ea71ac
pin: docs/account-crypto/local-promotion.md §2 93d98c3adfca
pin: docs/account-crypto/local-promotion.md §3 52d90cc03eb2
pin: docs/account-crypto/local-promotion.md §4 689be8855dac
pin: docs/account-crypto/local-promotion.md §6 fb4cccefd90c
```

```authority
entry: private-promotion-context
kind: predicate
guards: custody
verifies: closed version/stage shapes, exact current source, claim, custody, seal budget and credential collision checks; deterministic names confer no authority
resolves: current authenticated source comparisons after MAC verification -> via:private-promotion-authentication
resolves: byte-exact structural checks and proposal hash framing, not service eligibility or recipient admission -> root:structural
status: resolved
pin: docs/account-crypto/local-promotion.md §1 398c25ea71ac
pin: docs/account-crypto/local-promotion.md §2 93d98c3adfca
pin: docs/account-crypto/local-promotion.md §3 52d90cc03eb2
pin: docs/account-crypto/local-promotion.md §4 689be8855dac
pin: docs/account-crypto/local-promotion.md §5 27df81372cd2
pin: docs/account-crypto/local-promotion.md §6 fb4cccefd90c
```

## 12. Account capsule and ledger contracts — group D3

These entries preserve the distinction between enclosing authentication, completeness, publication
evidence and plaintext coverage. Counter-v2 and inherited Local bridges remain open.

```authority
entry: private-account-capsule-input
kind: predicate
guards: content
verifies: canonical carrier shape, held-route/type placement and exact source identity; plaintext payloads confer no authentication
resolves: payload opened from scoped factor-protected Local custody before semantic use -> via:device-lock-custody
resolves: canonical bytes and scoped structural predicates, without current service or member authority -> root:structural
status: resolved
pin: docs/account-crypto/account-ledger.md §1 73439e172173
pin: docs/account-crypto/account-ledger.md §2 5df20f1d1ba9
pin: docs/account-crypto/account-ledger.md §3 c7933547450b
pin: docs/account-crypto/account-ledger.md §4 c1ab5278aa37
pin: docs/account-crypto/account-ledger.md §5 3d81df0bac8b
pin: docs/account-crypto/account-ledger.md §6 d788c391a6ac
pin: docs/account-crypto/account-ledger.md §7 5e0caa8bc6a7
```

```authority
entry: private-account-ledger-completeness
kind: predicate
guards: custody
verifies: the full ordered event union checked against the retained authenticated counter, with coupled final commit and no silent witness reset
resolves: current scoped counter MAC authentication, not a supplied public hash -> via:private-content-metadata
resolves: exact ordered hash chain, event count and atomic compare-and-write predicates -> root:structural
status: resolved
pin: docs/account-crypto/account-ledger.md §1 73439e172173
pin: docs/account-crypto/account-ledger.md §2 5df20f1d1ba9
pin: docs/account-crypto/account-ledger.md §3 c7933547450b
pin: docs/account-crypto/account-ledger.md §4 c1ab5278aa37
pin: docs/account-crypto/account-ledger.md §5 3d81df0bac8b
pin: docs/account-crypto/account-ledger.md §6 d788c391a6ac
pin: docs/account-crypto/account-ledger.md §7 5e0caa8bc6a7
```

```authority
entry: private-account-ledger-publication
kind: predicate
guards: availability
verifies: signed submission/response reconstruction under held member and acceptance authority and retained envelope order
resolves: member signature checked against the held certified key -> via:private-transport-member
resolves: acceptance evidence in its bounded purpose -> via:private-transport-acceptance
bound: Only retained publication evidence; no membership, factor, recipient or plaintext-admission authority.
status: resolved
pin: docs/account-crypto/account-ledger.md §1 73439e172173
pin: docs/account-crypto/account-ledger.md §2 5df20f1d1ba9
pin: docs/account-crypto/account-ledger.md §3 c7933547450b
pin: docs/account-crypto/account-ledger.md §4 c1ab5278aa37
pin: docs/account-crypto/account-ledger.md §5 3d81df0bac8b
pin: docs/account-crypto/account-ledger.md §6 d788c391a6ac
pin: docs/account-crypto/account-ledger.md §7 5e0caa8bc6a7
```

```authority
entry: private-account-ledger-coverage
kind: predicate
guards: content
verifies: exact decrypted original/source correspondence and received disk content coverage after independent evidence verification
resolves: source and disk content protected by the opened local factor custody -> via:device-lock-custody
resolves: recomputed original bytes and content/deletion/pending-state coverage; a service signature or hash alone cannot establish this -> root:structural
status: resolved
pin: docs/account-crypto/account-ledger.md §1 73439e172173
pin: docs/account-crypto/account-ledger.md §2 5df20f1d1ba9
pin: docs/account-crypto/account-ledger.md §3 c7933547450b
pin: docs/account-crypto/account-ledger.md §4 c1ab5278aa37
pin: docs/account-crypto/account-ledger.md §5 3d81df0bac8b
pin: docs/account-crypto/account-ledger.md §6 d788c391a6ac
pin: docs/account-crypto/account-ledger.md §7 5e0caa8bc6a7
```

## 13. Authenticated counter and witness contracts — group D4

These entries qualify the scoped metadata bridge, not power-loss accounting or all inherited Local cryptography.

```authority
entry: private-content-metadata-key
kind: predicate
guards: keys
verifies: factor-opened generation secret and exact scoped HKDF fields
resolves: generation secret opened through admitted factor custody -> via:device-lock-custody
resolves: purpose-separated Unicode LP fields and non-extractable HMAC key parameters -> root:structural
status: resolved
pin: docs/account-crypto/content-counter.md §1 bf706ca4de43
pin: docs/account-crypto/content-counter.md §2 d5670fb971b9
pin: docs/account-crypto/content-counter.md §3 1ca2e196dbba
pin: docs/account-crypto/content-counter.md §4 52fa837d1e07
pin: docs/account-crypto/content-counter.md §5 89994beb8cea
```

```authority
entry: private-content-metadata
kind: verification
guards: custody
verifies: HMAC-SHA256(K_meta, reconstructed witness or counter payload), including root, scope, version and retained ledger witness
resolves: scoped metadata key derived from admitted factor-opened custody -> via:private-content-metadata-key
status: resolved
pin: docs/account-crypto/content-counter.md §1 bf706ca4de43
pin: docs/account-crypto/content-counter.md §2 d5670fb971b9
pin: docs/account-crypto/content-counter.md §3 1ca2e196dbba
pin: docs/account-crypto/content-counter.md §4 52fa837d1e07
pin: docs/account-crypto/content-counter.md §5 89994beb8cea
```

```authority
entry: private-content-counter-order
kind: predicate
guards: custody
verifies: valid allocation sums/bounds, exact previous payload and MAC comparison, and atomic counter/event ownership
resolves: previously authenticated metadata, rechecked by exact comparison inside the transaction -> via:private-content-metadata
resolves: serialized reservation, generation, placement and final event/witness predicates, within the stated relaxed durability model -> root:structural
status: resolved
pin: docs/account-crypto/content-counter.md §1 bf706ca4de43
pin: docs/account-crypto/content-counter.md §2 d5670fb971b9
pin: docs/account-crypto/content-counter.md §3 1ca2e196dbba
pin: docs/account-crypto/content-counter.md §4 52fa837d1e07
pin: docs/account-crypto/content-counter.md §5 89994beb8cea
```

## 14. Inherited store and journal byte bridges — group D5

These entries qualify current scoped byte owners, not rotation or whole-WASM provenance.

```authority
entry: private-store-name
kind: predicate
guards: keys
verifies: admitted Unicode identities and length-prefixed digest inputs; name is not authentication
resolves: admitted scope and structural rediscovery naming -> root:structural
status: resolved
pin: docs/account-crypto/store-journal.md §1 3fe80ec5c29f
pin: docs/account-crypto/store-journal.md §2 bb602641986e
pin: docs/account-crypto/store-journal.md §3 3c2014f935aa
pin: docs/account-crypto/store-journal.md §4 5e2f7b117b1b
pin: docs/account-crypto/store-journal.md §5 fc637722b527
```

```authority
entry: private-store-key
kind: predicate
guards: keys
verifies: factor-opened generation secret, workspace/store KDF binding and native key usages
resolves: generation secret opened through admitted factor custody -> via:device-lock-custody
resolves: exact purpose-separated key info and non-extractable key parameters -> root:structural
status: resolved
pin: docs/account-crypto/store-journal.md §1 3fe80ec5c29f
pin: docs/account-crypto/store-journal.md §2 bb602641986e
pin: docs/account-crypto/store-journal.md §3 3c2014f935aa
pin: docs/account-crypto/store-journal.md §4 5e2f7b117b1b
pin: docs/account-crypto/store-journal.md §5 fc637722b527
```

```authority
entry: private-store-record
kind: aead
guards: content
verifies: AES-256-GCM scoped record AAD, header, tag and native placement
counted-by: authenticated SeqCounter.reserved[gen], coupled to the storeId-derived key; equality at 2^32 refuses. F-15 remains open for relaxed durability and OS/power-loss accounting; no rollback/clone bound.
status: resolved
pin: docs/account-crypto/store-journal.md §1 3fe80ec5c29f
pin: docs/account-crypto/store-journal.md §2 bb602641986e
pin: docs/account-crypto/store-journal.md §3 3c2014f935aa
pin: docs/account-crypto/store-journal.md §4 5e2f7b117b1b
pin: docs/account-crypto/store-journal.md §5 fc637722b527
```

```authority
entry: private-journal-key
kind: predicate
guards: keys
verifies: generation secret, workspace-specific HKDF and exact 32-byte synchronous key
resolves: generation secret opened through admitted factor custody -> via:device-lock-custody
resolves: purpose-separated info and key width -> root:structural
status: resolved
pin: docs/account-crypto/store-journal.md §1 3fe80ec5c29f
pin: docs/account-crypto/store-journal.md §2 bb602641986e
pin: docs/account-crypto/store-journal.md §3 3c2014f935aa
pin: docs/account-crypto/store-journal.md §4 5e2f7b117b1b
pin: docs/account-crypto/store-journal.md §5 fc637722b527
```

```authority
entry: private-journal-carrier
kind: aead
guards: content
verifies: XChaCha20-Poly1305 workspace/generation/full-storage-identity AAD and canonical carrier
discipline: 24 fresh independent random bytes per invocation, within the finite-use collision bound and no restored/cloned RNG assumption in the pinned D5 home; current generation-1 owner only.
status: resolved
pin: docs/account-crypto/store-journal.md §1 3fe80ec5c29f
pin: docs/account-crypto/store-journal.md §2 bb602641986e
pin: docs/account-crypto/store-journal.md §3 3c2014f935aa
pin: docs/account-crypto/store-journal.md §4 5e2f7b117b1b
pin: docs/account-crypto/store-journal.md §5 fc637722b527
```

## 15. Current factor custody and v2 credential/metadata bridge — D6

Current owner predicates are distinct from selected future PRF, rotation and power-loss obligations.

```authority
entry: private-local-factor
kind: predicate
guards: custody
verifies: held principal/workspace and confirmed generated code open the 32-byte custody root
resolves: enrolled generated code, retained outside the copied-profile domain -> root:factor
resolves: current scope, normalized code and closed single-code seal -> root:structural
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-factor-seal
kind: aead
guards: custody
verifies: v1 factor KDF, AAD and root seal
discipline: fresh 16-byte salt derives a per-seal AES key and a separate fresh 12-byte nonce seals one root; finite-use fresh-randomness assumption, no cloned/restored RNG qualification
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-root-seals
kind: aead
guards: custody
verifies: v1 generation envelope and v2 operational credential seals under the same factor-opened root
counted-by: authenticated custody seal_reserved grants all three root invocations before encryption; equality at 2^32 refuses. Default native durability and unrewound/unbranched history remain subject to F-15; no power-loss claim.
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-custody-metadata-key
kind: predicate
guards: keys
verifies: purpose-separated metadata HKDF binds slot, principal, workspace and root identity
resolves: factor-opened custody root -> via:private-local-factor
resolves: exact scoped info and non-extractable HMAC usages -> root:structural
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-custody-metadata
kind: verification
guards: custody
verifies: HMAC-SHA256 over the complete closed custody tuple and exact prior-MAC comparison before replacement
resolves: scoped metadata key from the factor-opened root -> via:private-local-custody-metadata-key
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-custody-pairs
kind: predicate
guards: keys
verifies: opened Ed25519/X25519 private credentials correspond to authenticated advertised keys before release
resolves: roles, IDs and sealed/public bytes authenticated in custody metadata -> via:private-local-custody-metadata
resolves: Ed25519 local challenge verification and ephemeral X25519 equality, not external membership authority -> root:structural
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

```authority
entry: private-local-custody-open
kind: predicate
guards: custody
verifies: strict parsed protected state, factor/metadata checks and all retained key openers before publishing a capability
resolves: authenticated custody tuple from the factor-opened root -> via:private-local-custody-metadata
resolves: private/public correspondence of both retained credentials -> via:private-local-custody-pairs
resolves: strict primitive state, native comparison/commit order, current generation and lifetime ownership -> root:structural
status: resolved
pin: docs/account-crypto/local-custody.md §1 62718a2a9c61
pin: docs/account-crypto/local-custody.md §2 13cf45cde8ef
pin: docs/account-crypto/local-custody.md §3 e092a55a66e2
pin: docs/account-crypto/local-custody.md §4 a4d785bf39e2
pin: docs/account-crypto/local-custody.md §5 51a1b0addeb4
pin: docs/account-crypto/local-custody.md §6 4517b014105e
```

## 16. Current genesis checkpoint and persisted startup bridge — D7

These predicates qualify the genesis-only implementation; they do not instantiate successor checkpoint installation.

```authority
entry: private-checkpoint-key
kind: predicate
guards: keys
verifies: per-seal HKDF from the held generation key with exact workspace binding
resolves: current factor-protected custody root and authenticated generation envelope -> via:private-local-custody-open
resolves: device wrap recipient, lineage/root context and generation-key equality -> via:private-recovery-recipient
status: resolved
pin: docs/account-crypto/checkpoint.md §1 1ba07b8d7606
pin: docs/account-crypto/checkpoint.md §2 ff5de5a6b82d
pin: docs/account-crypto/checkpoint.md §3 ea8cc350e5e1
pin: docs/account-crypto/checkpoint.md §4 9aca2271994a
pin: docs/account-crypto/checkpoint.md §5 6a17735630ce
```

```authority
entry: private-checkpoint-seal
kind: aead
guards: content
verifies: v1 checkpoint AES-256-GCM under the per-seal key, full update and all five AAD fields
discipline: fresh 16-byte salt and independent 12-byte nonce per new seal, retained retry reuses the ciphertext; finite fresh-randomness assumption with unrewound/unbranched histories, not RNG-clone or power-loss evidence
status: resolved
pin: docs/account-crypto/checkpoint.md §1 1ba07b8d7606
pin: docs/account-crypto/checkpoint.md §2 ff5de5a6b82d
pin: docs/account-crypto/checkpoint.md §3 ea8cc350e5e1
pin: docs/account-crypto/checkpoint.md §4 9aca2271994a
pin: docs/account-crypto/checkpoint.md §5 6a17735630ce
```

```authority
entry: private-checkpoint-startup
kind: predicate
guards: content
verifies: verified pinned receipt/binding, factor and passkey ownership, exact checkpoint coverage and already-present genesis before releasing Account classification
resolves: certified creating signer and separately rederived SV/DS -> via:private-first-coverage
resolves: factor-owned generation key and exact per-seal derivation -> via:private-checkpoint-key
resolves: supported retained stage, exact selected route, fresh local assertion, after-assertion owner reread and cold database/journal containment without repair -> root:structural
status: resolved
pin: docs/account-crypto/checkpoint.md §1 1ba07b8d7606
pin: docs/account-crypto/checkpoint.md §2 ff5de5a6b82d
pin: docs/account-crypto/checkpoint.md §3 ea8cc350e5e1
pin: docs/account-crypto/checkpoint.md §4 9aca2271994a
pin: docs/account-crypto/checkpoint.md §5 6a17735630ce
```

```authority
entry: private-checkpoint-service-binding
kind: predicate
guards: availability
verifies: pinned receipt, slot binding and exact selected destination checked before checkpoint open, separate from content authority
resolves: pinned service admission and epoch proof -> via:private-first-service
bound: Only retained admission and routing assertions in checkpoint §3; no recipient, plaintext coverage or factor authority.
status: resolved
pin: docs/account-crypto/checkpoint.md §1 1ba07b8d7606
pin: docs/account-crypto/checkpoint.md §2 ff5de5a6b82d
pin: docs/account-crypto/checkpoint.md §3 ea8cc350e5e1
pin: docs/account-crypto/checkpoint.md §4 9aca2271994a
pin: docs/account-crypto/checkpoint.md §5 6a17735630ce
```

## 17. Retained Local claim and inherited migration scope — D8

Account authenticates retained Local identity/provenance; legacy operation owners remain separately scoped.

```authority
entry: private-local-claim-key
kind: predicate
guards: keys
verifies: scoped HMAC key derived from the factor-opened root after initial custody record authentication
resolves: generated factor opens the custody root -> via:private-local-factor
resolves: the initial creating custody tuple authenticates the identity plan -> via:private-local-custody-metadata
resolves: exact claim key-info tuple and native slot lifetime -> root:structural
status: resolved
pin: docs/account-crypto/local-provenance.md §1 e567db12e74e
pin: docs/account-crypto/local-provenance.md §2 f3c9de5314e1
pin: docs/account-crypto/local-provenance.md §3 9c5ef2dadbe3
pin: docs/account-crypto/local-provenance.md §4 e2e8dfc8556d
pin: docs/account-crypto/local-provenance.md §5 a53f67dc86d0
```

```authority
entry: private-local-claim-mac
kind: verification
guards: custody
verifies: HMAC over exact fresh progress, selected-import provenance and optional cleanup wrapper v1/v2
resolves: factor-owned scoped claim key -> via:private-local-claim-key
status: resolved
pin: docs/account-crypto/local-provenance.md §1 e567db12e74e
pin: docs/account-crypto/local-provenance.md §2 f3c9de5314e1
pin: docs/account-crypto/local-provenance.md §3 9c5ef2dadbe3
pin: docs/account-crypto/local-provenance.md §4 e2e8dfc8556d
pin: docs/account-crypto/local-provenance.md §5 a53f67dc86d0
```

```authority
entry: private-account-local-anchor
kind: predicate
guards: custody
verifies: ready Local claim verified before promotion or Account startup, matched to live custody and exact selected claimMac without restoring missing carriers
resolves: authenticated retained claim and initial identity plan -> via:private-local-claim-mac
resolves: stage, retained custody/route/witness/counter census and exact promotion claimMac; Local-clear/preactive-import rows can only refuse access -> root:structural
status: resolved
pin: docs/account-crypto/local-provenance.md §1 e567db12e74e
pin: docs/account-crypto/local-provenance.md §2 f3c9de5314e1
pin: docs/account-crypto/local-provenance.md §3 9c5ef2dadbe3
pin: docs/account-crypto/local-provenance.md §4 e2e8dfc8556d
pin: docs/account-crypto/local-provenance.md §5 a53f67dc86d0
```
