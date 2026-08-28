# `S0-2` — recipient authority and the complete generation/custody transition

**Standing:** home — the findings table below is an ownership source of the traceability population; read
back by `pnpm trace:check`.

**Started:** 2026-08-27 · **Inputs:** [`P-1`](../decisions/P-1-recipient-authority.md),
[`P-2`](../decisions/P-2-device-lock-gating.md), [`P-6`](../decisions/P-6-local-archive-factor.md) — all decided

The widest action in the plan. It closes eight findings, amends eight selection rows, changes PRD and TRD
sections, and regenerates five generator/vector pairs. It is staged because a single pass over that surface
cannot be reviewed, and because the stages have a real dependency order rather than an arbitrary one.

## Findings this action must close

| Finding | Severity | Closed in stage |
| --- | --- | --- |
| `f-c611666-rotation-reader-eligibility-missing` | high | A → C → D |
| `f-a073574-enrollment-recovery-key-unbound` | high | A → C → D |
| `f-4259822-recovery-replacement-no-forward-rotation` | high | A → B → D |
| `f-4259822-recovery-replacement-payload-bytes-unbound` | medium | A → D |
| `f-4259822-generation-switch-local-durability-undefined` | medium | A → B → D |
| `f-f5def83-device-lock-reader-key-bypass` | medium | A → C → D |
| `f-dbfd01f-device-lock-rotation-caveat-lost` | medium | E |
| `f-b997cdb-checkpoint-key-retention-inverted` | medium | partially repaired at `4e4d107`; predicate in A, evidence in D |

## Stages

| | Stage | Output | Status |
| --- | --- | --- | --- |
| **A** | Durable record schemas | exact field lists for every new record, in the project's own `LP()` notation, composing with the existing intent/outcome/epoch/custody carriers | **done** — [`A-schemas.md`](./A-schemas.md) |
| **B** | Normative construction | TRD §§13.2/13.4/13.5/13.6/13.7/13.8 | **done** — see below |
| **C** | Selection rows | rows 3/5/7/9/11/13/14/15 amended to match | **done** — see below |
| **D** | Executable evidence | generators, vectors, and one isolated falsifier per closed finding | **done** — 14 of 14 |
| **E** | Product surface | PRD §§6.3–6.5/7.2–7.4/7.6 and UI copy, including truthful `rotation_owed` | **done** — see below |

### What Stage B changed, and what it deliberately did not

| TRD | Change |
| --- | --- |
| §13.2 | The certified recipient set and the recovery-bootstrap signer enter the authority table, each with its own *must not* column |
| §13.4 | The two custody tiers are keyed on PRF availability; a locked slot needs a third. States why the existing credential cannot be re-sealed and must be replaced |
| §13.5 | The epoch carries a client-approved certified recipient set. States that this does not change what the head vector is or who asserts it |
| §13.6 | A successful ceremony *produces* the set successor; the transcript binds the recovery recipient; the six enrollment states are named and only the last is reader-eligible |
| §13.7 | Rotation consumes the certified set rather than a roster; `applying` becomes eight durable steps with step 5 as the commit point; the generation-drop gate gains its fourth clause |
| §13.8 | Replacement binds exact envelope and wrap bytes, and carries `successor-generation` so exposure rotates forward |

**Not changed, and why.** §6.1's local-store retention is reached through §13.7's opener predicate rather than
restated there, and its writer belongs to `P-3`/`S0-3`. §§7.3–7.6 needed no amendment once §13.5 established that
accepted positions remain the service's to assert and the approvals ride inside the epoch as bytes it cannot
forge — the row-5 exposure P-1 created turned out to be a clarification rather than a change. If `S0-8` disagrees
with that reading, §7.5 is where it reopens.

### After Stage C the rows and the generators disagree, on purpose

**This is a known intermediate state, and `pnpm vectors:check` cannot see it.** Row 11 now describes a transcript
that binds `recovery_state_digest`; `scripts/generate-enrollment-vectors.mjs` still builds the old one. Row 15
describes byte-exact `replace-recovery` parts; the generator still emits `rewrapped-generations: "1|2|3|4|5"`.
Row 13 describes a custody record with a wrapping credential the device-lock generator does not produce.

The check reports `enrollment-ceremony.json is current` throughout, because **it compares a generator to its
vector and never a document to its generator.** That is precisely the shape of
`f-992bc91-network-carrier-registry-stale`, where a registry passed every check while being stale, so it is
recorded here rather than discovered later: the green result after Stage C proves self-consistency, not
agreement with the rows.

**All three named drifts are now closed.** The enrollment generator binds `recovery_state_digest`, the transition
generator emits byte-exact `replace-recovery` parts, and the device-lock generator produces the
`wrapping_credential` row 13 describes. The rows and the generators agree again, and this time the agreement was
checked rather than assumed.

### Stage D progress

Each falsifier is mutation-tested: the guard is reverted, the check is confirmed to fail with the right
diagnosis, and the guard is restored.

| # | Falsifier | State | Where |
| --- | --- | --- | --- |
| 1 | A service-admitted credential absent from the certified set receives no wrap | **done** | `transition` — build-failing assertion; mutation A reproduces the intruder in the licensed set |
| 2 | A substituted `R_pub` is not wrapped to, even with a genuine `W_pub` | **done** | `enrollment` — `substituted-recovery-state`, isolated by the AAD audit; `transition` — `certified-set-with-substituted-recovery-state` |
| 3 | An authorized-but-unkeyed credential stays outside the set | **done** | `transition` — assertion over `ROSTER` vs `CERTIFIED_MEMBERS` |
| 4 | A stale certified set cannot be replayed against a later parent | **done** | `transition` — `certified-set-from-another-epoch` |
| 5 | Two incomparable approvals serialise; the loser rebuilds | **done** *(by composition)* | the certified-set approval binds `parent_epoch` and the bootstrap binds `conflict_parent`, so neither a stale set nor a fork wins silently. Serialisation itself is row 15's existing three-way rule, exercised by its own vectors |
| 6 | Four-object total loss bootstraps, then rotates | **done** | `head-discovery` — the bootstrap binds the replacement credential and its wrapping key from four objects and no surviving client |
| 7 | A forged bootstrap fails; a stale or forked head is detected | **done** | `head-discovery` — 16 negatives, including the signer, the countersignature, a stale head and a rival conflict parent |
| 8 | Eliding any byte of the envelope or any wrap changes the digest | **done** | `transition` — five complete variants, each asserted distinct; the superseded numbers-only digest published beside them |
| 9 | An exposed code does not open content after replacement | **done** *(binding half)* | `transition` — `successor-generation` is in the signed payload and asserted to change the digest. That it *opens nothing* is a runtime property for `L-2` |
| 10 | A kill at each `GenerationApply` step resumes | **done** | [`test/generationApply.test.ts`](../../../../test/generationApply.test.ts) — eight assertions over an executable model, six mutations each caught by the invariant written for it |
| 11 | No opener retired while a retained checkpoint lacks one | **done** | `checkpoint` — the superseded wording is encoded as a mutation and reproduces the failure |
| 12 | Checkpoint fallback survives two rotations | **done** | `checkpoint` — g+2 newest, g+1 the mandated fallback, g droppable |
| 13 | A pre-lock no-PRF profile cannot open `g+1` after a settled lock | **done** | `device-lock` — the replacement credential is sealed under `L_lock` with the same `LockSeal` machinery |
| 14 | The same profile still opens up to `g`; `rotation_owed` spans the exact interval | **done** | `device-lock` — wraps by generation, and `rotation_owed` asserted derived from the apply step |

### Stage D is complete, and writing it changed two things

**`settled_at` is load-bearing, and the model proved it by my leaving it out.** I first modelled step 8 as deleting
the apply record. `null` then meant both *never started* and *finished*, so a restart after a completed transition
could not tell them apart and began a second one — advancing a generation nobody had asked to advance. The record
is settled first and cleaned afterwards. `A-schemas.md` already carried `settled_at`; the model confirmed why,
rather than the schema being changed to suit the model.

**Checkpoint admission has to be idempotent by construction, not by convention.** Step 6 prepending
unconditionally would, on a replay, evict the second-newest checkpoint — destroying the fallback while resuming
the very transition meant to preserve it. Admitting a checkpoint that is already newest is now a no-op.

Both were found by assertions written before the model was, which is the point of writing them that way.

**What falsifier 10 does not claim.** It models the decisions the transition worker makes. It says nothing about
whether IndexedDB, the journal or the relay behave as modelled — those are `L-1` and `L-2` integration concerns —
and it is only as good as the model. Each invariant is therefore written as the sentence it comes from rather than
as a bare assertion, so a reviewer can check the model against the design rather than only against itself.

**The AAD coverage audit caught a real mistake while this was being written**, and it is worth recording because
it is the machinery working as designed. The first `service_nonce` negative failed on the comparison between the
nonce in the object and the one the recovery received — a comparison that would refuse it just as readily if the
nonce were signed by nobody. The audit elided the field, saw that every negative still failed, and reported that
nothing published was testing the binding. The repair is row 14 §9's move at a new carrier: a second negative
carries the nonce the verifier expects, so the comparison passes and only the signature can refuse it. **A negative
that fails twice isolates nothing**, and this file now has one of each.

### What Stage C changed

| Row | Change |
| --- | --- |
| 3 | Header note only: a `KeyEnvelope`'s opener is no longer the only thing a generation drop consults |
| 5 | Header note only: the epoch gains a client-approved sub-object; **accepted positions are unchanged** |
| 7 | The interlock line gains the surviving-opener clause, stated over openers rather than the local envelope |
| 9 | Header note only: the signed head assertion is what a `RecoveryBootstrap` consumes; no fifth object |
| 11 | The transcript binds `recovery_state_digest`; success produces a certified recipient-set successor |
| 13 | `CustodyRecord` gains `wrapping_credential`; enrollment stages the replacement and introduces it through a certified-set successor |
| 14 | Replacement binds exact bytes and carries `successor-generation`, so exposure rotates forward |
| 15 | Per-kind payload parts made explicit and byte-exact; `applying` becomes eight durable steps; the drop gate gains its fourth clause |

Every amendment follows the project's existing `**Amended by:**` convention (row 9 → row 11 set the precedent),
naming `S0-2` and the date rather than a peer row, since the amender here is a remediation action.

### What Stage E changed

| PRD | Change |
| --- | --- |
| §6.3 | Signing in does not make a device a recipient of content keys **later**, either. An interrupted sign-in leaves a device that can sign in and cannot read, which is the honest outcome rather than a failure |
| §6.4 | The device list shows an admitted-but-not-enrolled device as such, since a list that shows it identically to an enrolled one is not honest — and it is the screen a person would use to notice a device they do not recognise |
| §6.5 | Exclusion wraps to the devices a person actually enrolled, not to a service roster |
| §7.2 | *From now on* begins when the rotation **lands**, not when the factor is set; the interface may not claim protection from copies while `rotation_owed` is true. Enabling the lock also replaces the device's content-receiving credential |
| §7.3 | The certified recipient set and the recovery-bootstrap authority enter the product authority table, mirroring TRD §13.2 |
| §7.4 | Rotation wraps to exactly the certified set, never to a roster of everyone the service has admitted |
| §7.6 | Replacing an **exposed** code rotates forward; replacing a merely **lost** one need not, but only if the product can tell them apart and says which it did |

**Three of these were found by a sweep rather than by the plan.** The action tree named §§6.3–6.5/7.2–7.4/7.6,
but not which sentences. Grepping the PRD for the language TRD §13.7 had used before Stage B corrected it —
"every remaining reader" — found three passages that would have left the two documents contradicting each other
in exactly the way `f-tip-prd-stale-selection-status` describes. The authority tables are now the same length,
which is a cheap thing to check and would not have been true otherwise.

**The order is a dependency order.** A fixes the interfaces B and C describe; D cannot write a falsifier for a
field that does not exist; E states in product terms what B and C made true, and stating it earlier would be
claiming it before it holds. The action tree's "safe parallel work" note applies within A: the recipient-set
schema and the local apply/reference ledger were designed against one another's interfaces rather than in
sequence, and recovery canonicalisation was designed independently of the device-lock carrier.

## The `S0-2` return (2026-08-28)

Both `S0-9` rounds returned repairs here — `FU-01` (`A-01`), `FU-05` (`A-02`), `FU-09`'s interface half
(`ST-04`), and `P-1`'s reopened approver and bootstrap-signer joints (round 1 `D-1`/`D-3`/`D-4`) — and the
return landed them under `P-1` falsifiers 12–19, with every gate re-run green:

- **Stage A/B** — the member entry is the `(credential_id ‖ W_pub ‖ S_pub)` triple, every approval names its
  approver, `recovery_state_digest` commits `bootstrap_signer`, the `Bootstrap` carries `new_S_pub`, and TRD
  §13.8 carries the `RecoveryBootstrap` construction §13.2 cites — round 1 `D-3`'s dangling normative
  reference closed. `A-schemas.md` §4 step 5 and §5 gained `P-3`'s ratified fence (`FU-09`).
- **Stage C** — rows 9, 11 and 14 amended: the factor-carried verifier, the transcript's `S_pub`, and the
  bootstrap signer sealed beside `R_priv`.
- **Stage D** — the three generators reworked and regenerated: the approver lookup is real and the impostor
  negative inverted; bootstrap acceptance derives its verifier from the factor-opened `RecoveryState`,
  refuses a stale chain as an authority failure and the retired signer by the rotated commitment; the
  bootstrap→certified-set composition runs in the transition vectors; the enrollment vector publishes every
  transcript input (`FU-05`). `test/enrollmentStates.test.ts` runs §13.6's six states with crash points and
  serializes the sibling-successor race (falsifier 18, criterion 11);
  `test/storageSchedule.test.ts`'s reservation-fence reproduction is inverted with its schedule kept.
- **The instruments** — the authority map's four member-key entries flipped (falsifier 14);
  `pnpm recipient:check` joined `pnpm check` as falsifier 19's homes-agree readback, with `FU-05`'s
  independent reconstruction inside it.

What stays reserved, exactly as the record reserves it: the `CertifiedSet` AAD registration and the impostor
negative's regeneration re-read at `S0-8`; `P-3` falsifiers 14–22 at the `S0-3` return.

## Not in scope for this action

- Checkpoint semantics and creation authority — [`P-8`](../decisions/P-8-checkpoint-and-creation-authority.md)
  decided them; `S0-5` consolidates. A defines only the *reference* the opener predicate needs.
- Package root, Local opener, retired package and terminal handoff — `S0-6`, taking A's recovery-state and
  root-commitment shapes as given.
- The lapse carrier and destructive deletion — `P-4` and `S0-7`.
- Total local-write admission, the sequence allocator and the oversize branch — `P-3` and `S0-3`. A's records are
  written by that machine but do not select it.
