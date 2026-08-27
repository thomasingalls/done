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
| **C** | Selection rows | rows 3/5/7/9/11/13/14/15 amended to match | not started |
| **D** | Executable evidence | generators, vectors, and one isolated falsifier per closed finding | not started |
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
