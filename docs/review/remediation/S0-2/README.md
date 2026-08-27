# `S0-2` — recipient authority and the complete generation/custody transition

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
| **D** | Executable evidence | generators, vectors, and one isolated falsifier per closed finding | **in progress** — 13 of 14, see below |
| **E** | Product surface | PRD §§6.3–6.5/7.2–7.4/7.6 and UI copy, including truthful `rotation_owed` | not started |

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
| 10 | A kill at each `GenerationApply` step resumes | not started | a state machine, not a byte format — belongs in `vitest`, not a vector file |
| 11 | No opener retired while a retained checkpoint lacks one | **done** | `checkpoint` — the superseded wording is encoded as a mutation and reproduces the failure |
| 12 | Checkpoint fallback survives two rotations | **done** | `checkpoint` — g+2 newest, g+1 the mandated fallback, g droppable |
| 13 | A pre-lock no-PRF profile cannot open `g+1` after a settled lock | **done** | `device-lock` — the replacement credential is sealed under `L_lock` with the same `LockSeal` machinery |
| 14 | The same profile still opens up to `g`; `rotation_owed` spans the exact interval | **done** | `device-lock` — wraps by generation, and `rotation_owed` asserted derived from the apply step |

**Only falsifier 10 remains, and it cannot be a vector.** A kill at each `GenerationApply` step is a crash-resume
property of a local state machine; every other item here is a property of bytes. It belongs in `vitest`, and it is
the one piece of Stage D that is a different kind of work from the rest.

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

**The order is a dependency order.** A fixes the interfaces B and C describe; D cannot write a falsifier for a
field that does not exist; E states in product terms what B and C made true, and stating it earlier would be
claiming it before it holds. The action tree's "safe parallel work" note applies within A: the recipient-set
schema and the local apply/reference ledger were designed against one another's interfaces rather than in
sequence, and recovery canonicalisation was designed independently of the device-lock carrier.

## Not in scope for this action

- Checkpoint semantics and creation authority — [`P-8`](../decisions/P-8-checkpoint-and-creation-authority.md)
  decided them; `S0-5` consolidates. A defines only the *reference* the opener predicate needs.
- Package root, Local opener, retired package and terminal handoff — `S0-6`, taking A's recovery-state and
  root-commitment shapes as given.
- The lapse carrier and destructive deletion — `P-4` and `S0-7`.
- Total local-write admission, the sequence allocator and the oversize branch — `P-3` and `S0-3`. A's records are
  written by that machine but do not select it.
