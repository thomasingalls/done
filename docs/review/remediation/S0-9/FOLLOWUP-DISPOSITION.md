# `S0-9` — serial independent follow-up disposition

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Run:** 2026-08-28 · **Subject:** `5923f51` · **Integrated after:** `713b49d` · **Verdict: FAIL. `S0-10`
remains blocked.**

## Why this follow-up exists

After the four-challenger disposition at [`DISPOSITION.md`](./DISPOSITION.md), three additional non-author
challengers independently reviewed the same pre-challenge tip, each from its own detached worktree at
`5923f510fd9ac3c1cd809e9bec352a7f73751492`. They ran **serially, exactly one at a time**. Each was prohibited
from consulting another branch, worktree, reflog, remote, later commit, or challenge report. The second and third
challengers began only after the prior challenger had stopped.

| Lens                                         | Report                                                                  | Exact command/result log                                                                  | Result   |
| -------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| actor and protocol authority                 | [`challenge-authority.md`](./followup-authority/challenge-authority.md) | [`challenge-authority-commands.md`](./followup-authority/challenge-authority-commands.md) | **FAIL** |
| storage, crash/retry, concurrency            | [`challenge-storage.md`](./followup-storage/challenge-storage.md)       | [`challenge-storage-commands.md`](./followup-storage/challenge-storage-commands.md)       | **FAIL** |
| evidence, closure, cross-cluster composition | [`challenge-evidence.md`](./followup-evidence/challenge-evidence.md)    | [`challenge-evidence-commands.md`](./followup-evidence/challenge-evidence-commands.md)    | **FAIL** |

The two commits between the challenged tip and this integration, `7aa2fa1` and `713b49d`, changed the S0-9
records and the selection-status/traceability checkers. They did not change the challenged PRD/TRD constructions,
selection rows, generators, vectors, or state-machine tests. Construction failures below therefore remain material
after `713b49d`; checker-specific observations are recorded separately and must be rechecked after their owning
checker changes.

## Reconciled result

Where the challengers disagree, this disposition uses the challenge rule: a concrete counterexample or an absent
state required by the acceptance criteria defeats a broader pass. Green generators and tests establish useful local
theorems; they do not override a schedule or authority relation the model cannot express.

### High-severity Stage 0 blockers

| ID      | Reconciled defect                                                                                                                                                                                                                                                                             | Independent support                                                                                                     | Earliest return                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FU-01` | The total-loss bootstrap verifier is not carried by, derived from, or retired with the factor-authenticated recovery state. The exact recovery digest has counter, `R_pub`, envelope digest and root commitment, while the executable bootstrap accepts a fixed out-of-band verification key. | authority `A-01`                                                                                                        | `S0-2` Stage A/B/D; reopen `P-1` only if its selected carrier cannot carry the authority                                                                                                                                    |
| `FU-02` | The Local archive factor authenticates an HPKE recipient, but the published package manifest is authenticated by a separate device key not bound by that factor. A fresh wrap to the genuine archive public key opens an independently chosen generation key.                                 | authority `A-04`; storage `ST-01`; confirms and sharpens the Local-archive failure already recorded in `DISPOSITION.md` | `S0-6` Stage A/B/D; `P-6` only if the factor choice changes                                                                                                                                                                 |
| `FU-03` | A behind receiver's `TerminalHandoff` catch-up value is only `SHA-256(LP(priorHead)                                                                                                                                                                                                           |                                                                                                                         | LP(terminalHead))` plus a non-negative absence count. It carries no authenticated transcript, chain proof, absence identifiers, signer authority, or count-to-list check, so a stale receiver can self-assert completeness. | authority `A-05` | `S0-6` Stage A/D and TRD §14.4 |
| `FU-04` | The retention deadline deliberately deletes every retirement class with zero durable handoffs. The passing model reaches `cleared` while `handoffComplete` is false, allowing elapsed time to replace the receiving client's current-custody authority.                                       | authority `A-06`; storage `ST-02`; evidence `E1`; independently confirms the high blocker in `DISPOSITION.md`           | product choice at `P-4`, then `S0-7` Stage A/B/D/E composed with `S0-6`                                                                                                                                                     |

### Medium-severity Stage 0 blockers

| ID      | Reconciled defect                                                                                                                                                                                                                                                                | Independent support                                                                                  | Earliest return                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `FU-05` | The enrollment generator inserts `recovery_state_digest` into its opaque transcript, but the published construction formula and honest vector inputs omit the value. The artifact cannot be independently reconstructed for its new load-bearing field.                          | authority `A-02`                                                                                     | `S0-2` Stage D, then `S0-8` regeneration                                       |
| `FU-06` | A refusal's epoch is signed but is absent from the client's subject comparison and from the exact spool model. The only epoch negative invalidates an old signature; no genuine wrong-epoch refusal is rejected.                                                                 | authority `A-03`                                                                                     | `S0-4` Stage A/D and TRD §7.5                                                  |
| `FU-07` | `corrected-end-state.md`, an explicit S0-9 input, still publishes pre-decision branches and the bounded/sole-successor refusal rule that S0-4 mutation testing rejected. No current document checker reads this consumer.                                                        | authority `A-07`; evidence `E2`                                                                      | closure authority at `P-5`/`S0-1`, then `S0-8`                                 |
| `FU-08` | After an authoritative Yjs mutation, synchronous journal refusal can be followed by a page kill before the forced IndexedDB transaction completes. The pure model makes that fallback synchronous and cannot schedule the unrecoverable window.                                  | storage `ST-03`                                                                                      | `P-3`/`S0-3` admission decision and Stage A/D                                  |
| `FU-09` | A writer can reserve under generation `g`, cross `GenerationApply`'s marker advance, and commit a late `g` record after cleanup classified the old object set. Neither model supplies a lease, fence, or atomic marker/commit validation.                                        | storage `ST-04`                                                                                      | `S0-2`/`S0-3` interface; `P-3` if the reservation transaction changes          |
| `FU-10` | A crash after position reservation and before spool insertion leaves no durable reservation identity, digest, envelope or refusal subject. The current test proves only that the counter gap remains, not that the position can be occupied or closed.                           | storage `ST-05`                                                                                      | `S0-4` Stage A/D                                                               |
| `FU-11` | Checkpoint evidence has no certified-recipient eligibility/cardinality input and no staged install machine. It cannot refuse producer self-admission when a second eligible client exists or exercise content-before-head rollback and actual second-newest fallback.            | storage `ST-06`                                                                                      | `S0-5` Stage A/D; the selected `P-8` branch may remain                         |
| `FU-12` | The divergent-reseed test calls `resume` twice from the same input world. It never accepts the second branch after the first advances the revision, so the selected compare-and-set rule would reject the required second survivor as stale.                                     | storage `ST-07`                                                                                      | `S0-7` Stage A/D                                                               |
| `FU-13` | Current write-admission authority is internally inconsistent: TRD §6.1 and row 3 select `next_seq`, `reserved[gen]` and covered-set trim; TRD §15 still calls the allocator/count open; `P-3` still publishes the retired exact-watermark claim.                                 | evidence `E3/E4`                                                                                     | update the owning decision/register projections, then add independent readback |
| `FU-14` | Traceability treats command-text inclusion after `&&` as execution reachability. On the challenged tip, `pnpm check` stops at lint before vectors, document checks, traceability, WASM verification and tests, while the matrix says those artifacts still run through the gate. | evidence `E5`; complements the liveness/relation/recency limits already recorded in `DISPOSITION.md` | `S0-8` traceability/gate receipt design                                        |

### Gate-governance and provenance blockers

| ID      | Reconciled defect                                                                                                                                                                         | Support                                                                 | Required resolution                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `FU-15` | `action-tree.md` requires dated X25519 evidence before `S0-10`, while `HANDOFF.md` and generated traceability assign the same debt to `L-4`.                                              | authority `A-08`; evidence `E6`; also present in `DISPOSITION.md`       | select one blocking stage and make all authority records agree     |
| `FU-16` | `end-state-materiality.md` titles its ledger with `032d51d`, which is not an ancestor of the challenged tip. The content is present, but the title is not valid exact-lineage provenance. | evidence `E7`; the object was not inspected after ancestry proof failed | correct the provenance label without changing finding dispositions |

## What still held

The follow-up does not discard the repaired package's local theorems:

- all three challengers verified detached `HEAD = 5923f510fd9ac3c1cd809e9bec352a7f73751492`;
- all 16 generated vector artifacts were current;
- 36 test files and 371 tests passed in each complete run;
- AAD coverage reported 190 authenticated fields, each with an isolated published negative;
- targeted state-machine runs passed 70 tests in the authority review and 66 in the storage review;
- exact-byte spool retry, refusal permanence, `GenerationApply`'s modeled steps, suite separation, WASM width/KAT
  checks, checkpoint field binding, root commitment for the account package, and one-clock retention behavior remain
  useful results within their stated scope.

Those results narrow the repairs. They do not close the missing authority and concurrency joints above.

## Relationship to the existing independent disposition

This follow-up **does not replace** [`DISPOSITION.md`](./DISPOSITION.md). It adds three serial independent reads.
The strongest convergence is on `f-4259822-retirement-safe-survivor-gate-undefined`: every follow-up challenger
independently reached the same executable zero-handoff deletion. The Local archive finding also converges across
the prior disposition and two follow-up lenses.

The new reports add distinct blockers not resolved by `713b49d`, particularly the recovery bootstrap verifier,
refusal epoch, terminal catch-up transcript, post-mutation async crash, generation fence, abandoned position,
checkpoint install authority and divergent reseed branch composition. The earlier disposition's `P-1` approver-key,
`P-3` key-scoping, evidence-relation/recency and origin-scanner findings remain open as recorded there.

## Final disposition

`S0-9` remains **failed**. `S0-10` is not authorized. Repair must return to the earliest authority or state-machine
decision identified above, preserve the surviving local theorems, regenerate affected artifacts, and rerun an
independent challenge. Finding `status:` values remain untouched.
