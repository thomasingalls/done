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
| **B** | Normative construction | TRD §§6.1/7.3–7.6/13.2–13.8: how a certified set is produced and consumed, how a transition applies locally, when an opener may be retired | not started |
| **C** | Selection rows | rows 3/5/7/9/11/13/14/15 amended to match | not started |
| **D** | Executable evidence | generators, vectors, and one isolated falsifier per closed finding | not started |
| **E** | Product surface | PRD §§6.3–6.5/7.2–7.4/7.6 and UI copy, including truthful `rotation_owed` | not started |

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
