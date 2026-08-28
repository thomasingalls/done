# `S0-9` independent challenge evidence

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Challenger:** independent non-author review at detached
`5923f510fd9ac3c1cd809e9bec352a7f73751492`
**Disposition:** **fail — `S0-10` must not close Stage 0**
**Scope:** `RC-1` through `RC-9`, their causal ancestors, preserved local theorems, actor authority,
crash/retry/concurrency boundaries, all named adversarial scenarios, regenerated evidence, and later-gate
governance.

The repaired branch contains substantial sound work. All directly invoked vector generators, the 371-test suite,
the three document checks, traceability generation, WASM behavioral verification/freshness, the application build,
and typechecking pass. That does not establish Stage 0 closure. The independent challenge found one high-severity
destructive-deletion contradiction and several closure/governance defects that green oracles do not see.

## Independent basis and boundary

- `git rev-parse HEAD` returned the required full hash. The checkout was detached and clean before the report files
  were created.
- `9edd9300adebcec3abd2234c946f1dcccdc17eef`, the reviewed tip named by the remediation package, was proved to be
  an ancestor of this checkout before any comparison to it.
- The short object named in `end-state-materiality.md`'s title, `032d51d`, was tested with
  `git merge-base --is-ancestor 032d51d HEAD` and returned 1. It was therefore not inspected.
- No other branch, ref, worktree, stash, reflog, remote, later object, challenger result, or network source was
  consulted.
- Exact commands, exit codes, runner qualification, and useful output are in
  [`challenge-evidence-commands.md`](./challenge-evidence-commands.md).

## Stage 0 blockers

| ID        | Severity       | Defect                                                                                                                                                                                                                                                        | Stage 0?                                 | Earliest action/decision to reopen                                                                                                            |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `S0-9-E1` | **high**       | `S0-7` deletes every hosted retirement class at the retention deadline even when no `TerminalHandoff` exists. The passing test mapped to the safe-survivor finding asserts that unsafe result.                                                                | **yes**                                  | Jointly reopen `P-6`/`S0-6` deletion authority and `P-4`/`S0-7` retention policy.                                                             |
| `S0-9-E2` | **medium**     | The required `corrected-end-state.md` is an obsolete pre-decision branch document. It says seven decisions remain open and reintroduces the rejected two-attempt outbound cap.                                                                                | **yes**                                  | `P-5`/`S0-1` closure scope, then regenerate in `S0-8`; reopen a domain decision only if the selected records cannot resolve the stale branch. |
| `S0-9-E3` | **medium**     | TRD §15, which says it is the current winning register, calls row 3's allocator/count “still open” although §6.1 and the selected row now define both. `status:check` passes because it checks status references, not construction truth.                     | **yes**                                  | `S0-3` propagation plus `P-5`/`S0-1` document-agreement coverage.                                                                             |
| `S0-9-E4` | **medium**     | `P-3` still says `next_seq` is the exact trim watermark and a required falsifier, while `S0-3` records that mutation proved that rule non-load-bearing and replaced it with covered-set semantics plus unique allocation.                                     | **yes**                                  | `S0-3` propagation back to its owning `P-3` decision record; add a consumer check in `S0-1`/`S0-8`.                                           |
| `S0-9-E5` | **medium**     | Traceability calls artifacts reachable and “still runs” by textual script expansion. Real `pnpm check` exits at lint before format, every vector/document/trace/WASM/test command, so the normal gate does not execute the evidence `trace:check` calls live. | **yes**                                  | `P-5`/`S0-8` gate-liveness model and gate composition; do not repair by adding another tag.                                                   |
| `S0-9-E6` | **medium**     | The dated X25519 evidence table is simultaneously “required before `S0-10`” and owed to `L-4`. The generated traceability checker blesses the latter and cannot see the former.                                                                               | **yes**, until one real gate is selected | `P-5`/`S0-1` closure authority and `S0-8` debt accounting.                                                                                    |
| `S0-9-E7` | **low/medium** | A current materiality ledger names a non-ancestor hash as its end state, so its provenance cannot describe this exact repaired lineage as written.                                                                                                            | **yes** for exact-tip closure provenance | `P-5`/`S0-1`, then `S0-8` regeneration/readback.                                                                                              |

### `S0-9-E1` — the deletion safety invariant is reversed at the `RC-6`/`RC-7` joint

**Artifacts.** `S0-6/A-schemas.md:91-123` says only a durable per-class `TerminalHandoff` authorizes hosted
deletion, a lost acknowledgement retains bytes, and a stale offline replica is not a survivor. Its falsifier map at
lines 154-159 repeats those exact properties. `S0-7/A-schemas.md:113-127` instead makes the deadline a ceiling for
retirement and explicitly says a lost acknowledgement retains bytes only until that ceiling. The executable model
implements the override at `test/hostedRetention.test.ts:262-286`: after the deadline, `deleteClass` no longer
requires a handoff. The test at lines 441-449 starts retirement with zero handoffs and expects every hosted class to
be absent while `handoffComplete` remains false.

**Reproduction.** The exact targeted Vitest command passes one test:

```text
pnpm exec vitest run test/hostedRetention.test.ts \
  -t 'lets nothing survive the deadline, including a retirement whose handoff never came'
```

This is not a missing assertion. It is a green oracle asserting the bad outcome described by the original high
finding `f-4259822-retirement-safe-survivor-gate-undefined`: hosted bytes are destroyed while no independently held,
verified-current terminal survivor/export exists.

There is a second composition mismatch. The `S0-6` package generator recognizes only five deletion classes at
`scripts/generate-package-vectors.mjs:432-433` and refuses any unknown class at lines 1022-1024. `S0-7` adds a sixth,
`recovery-anchor`. Before the deadline, the sixth class is therefore outside the exact handoff artifact; after the
deadline, all six retirement classes are deleted without that artifact. The two “exact” constructions do not share
one deletion-authority domain.

**Violated invariant and scope.** This violates the `RC-6` original invariant, the high finding, `S0-6`'s selected
local theorem, `S0-9`'s required cross-cluster actor/crash challenge, and adversarial scenario `C-10`. It also exposes
an unresolved product conflict: privacy/data-minimization may require a retention ceiling, while safe-survivor
authority forbids irreversible deletion without receipt. The current records silently let the timer outrank the
selected client receipt.

**Preserve.** Keep terminal-before-delete, a full service-signed retired package, verified-current catch-up,
per-class idempotent deletion progress, one retention clock, expiry keeping the recovery anchor, lapse/retirement
separation, and the retire-wins race.

**Simpler repair analysis.** Do not patch the test vector. The smallest honest repair is to preserve the deadline as
the expiry floor and make the retirement-with-no-survivor case an explicit product/legal decision or waiver with a
distinct authority. If the product selects forced erasure at the deadline, narrow the safe-survivor guarantee and
record that no recovery survivor may exist. If it selects recoverability, the timer cannot substitute for
`TerminalHandoff`. Either choice must be shared by all six classes and the package/deletion generators.

### `S0-9-E2` — `corrected-end-state.md` is a stale second source of design truth

`action-tree.md:629-637` makes this file an exact `S0-9` artifact, so it cannot be dismissed as historical notes.
Yet it says:

- at lines 13-16 and 302-303, that `RC-1`, `RC-2`, `RC-3`, `RC-5`, `RC-7`, `RC-8`, and `RC-9` remain unselected and
  Stage 0 is not fully selected;
- at lines 76-77, 151-154, 194-196, 220, 242, and 269-280, that choices recorded by `P-1` through `P-5` and `P-8`
  remain unresolved;
- at lines 168-175, that final refusal licenses exactly attempt 1 and no third attempt.

The last item is not merely stale wording. `S0-4/README.md` records that mutation killed the sole-successor/two-attempt
cap because two epoch changes can exhaust it; the selected repair is an unbounded refusal chain in which each durable
refusal licenses one successor at the same position. The required corrected-end-state artifact therefore
reintroduces the availability defect the action deliberately retired.

This is the precise failure mode `P-5` tried to prevent: one fact has more than one home and the consumer-facing copy
drifts. None of `status:check`, `retention:check`, `limit:check`, `vectors:check`, or `trace:check` reads this exact
artifact.

**Preserve/simpler repair.** Preserve the decided records and executable artifacts. Regenerate this document from
the selected decisions, or reduce it to a generated projection with an independent bidirectional check. Do not
reopen sound branch decisions merely to make stale prose true.

### `S0-9-E3` and `S0-9-E4` — current write-admission documents disagree

TRD §15 says at `docs/TRD.md:3454-3456` that it states what is currently true and wins on disagreement. Its row 3
cell at line 3462 nevertheless says the per-generation count and crash-safe allocator are “still open.” The same TRD
already defines `next_seq` and `reserved[gen]` at §6.1 (`docs/TRD.md:670-690`), and
`docs/selections/row-3-record-format.md:140-158` selects that construction.

`pnpm status:check` passes. Its own scope statement at `scripts/check-selection-status.mjs:17-30` explains why: it
checks selected/open row membership, row counts, and PRD sentences that explicitly cite a row. It does not compare
the construction cells against the normative sections or selection records. This is acceptable as a narrow checker,
but not as evidence that the current register is coherent in the broader sense claimed by `P-5`.

Separately, `docs/review/remediation/decisions/P-3-write-admission.md:124-127,150,171-172` still says `next_seq` is an
exact trim watermark and makes it a repair/falsifier. `S0-3/README.md:56-69` says a deletion mutation changed no
result: once sequences are unique, range and covered-set trims agree, so the watermark rule was retired as
non-load-bearing. TRD §6.1 and row 3 now use unique allocation plus the snapshot's exact covered set. The decision
record—the claimed owner of the branch—was not propagated.

**Preserve/simpler repair.** Preserve admission-before-authoritative mutation, slicing/prefix crash behavior, the
global allocator, per-generation reserved invocation accounting, and covered-set trim. Update the stale records and
add a small independent check from §15/`P-3` to their selected construction. No allocator redesign is needed.

### `S0-9-E5` — traceability proves textual inclusion, not gate execution

`scripts/check-traceability.mjs:330-365` recursively concatenates package-script strings and decides liveness with a
substring `includes`. It does not model `&&` failure. `package.json:17` orders `lint` and `format` before all vectors,
document checks, traceability, WASM verification, and tests. The independent `pnpm check` run exited 1 at lint, so
none of those later commands ran. `pnpm trace:check` nevertheless reports their claims live because their command
text occurs later in the script.

This does not invalidate the manual direct runs; they passed. It invalidates the generated matrix's stronger text at
`traceability.md:15-18` that each artifact “still runs” through reachable closure. It also means `trace:check` itself
does not execute in the normal check gate.

The base handoff already warned that `pnpm check` had unrelated lint/format failures. This challenge does not count
those inherited failures as remediation defects. It does record that the repaired tip also introduces lint failures
in repair-owned files, including `scripts/generate-head-discovery-vectors.mjs:496`,
`scripts/check-selection-status.mjs:139`, `test/outboundSpool.test.ts:383`, and
`test/generationApply.test.ts:174,176`. Thus the gate is not merely blocked by an immutable predecessor issue.

**Preserve/simpler repair.** Preserve the four evidence carriers and population reconciliation. Make the evidence
suite an independently executing gate/receipt (or fix/order prerequisites so it actually reaches each artifact), and
have traceability consume execution results rather than shell-text reachability. A new claim tag would not fix this.

### `S0-9-E6` and `S0-9-E7` — debt and provenance disagree

`action-tree.md:19` says the X25519 dated evidence table is required before `S0-10`. `HANDOFF.md:53-55` and generated
`traceability.md:72` instead owe it to `L-4`; `end-state-materiality.md:56` classifies it as a current closure defect.
The checker contains a hard-coded owed gate and only verifies that the gate name exists. It does not reconcile the
earlier prerequisite. This is not a request to fabricate external browser evidence. It is a request to choose the
real blocking stage and state it consistently.

In addition, `end-state-materiality.md:1` labels its end state `032d51d`, which is not an ancestor of the pinned
repaired checkout. The content is present at this tip, but the title cannot serve as exact-lineage provenance. The
unverified object was not inspected.

## `RC-1` through `RC-9` disposition

| Cluster | Causal ancestor challenged                                                                                                 | Tip result                                                         | Preserved local theorem / simpler-repair result                                                                                                                                                                                                                                                                      | Authority, crash/retry/concurrency result                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RC-1`  | Base service roster plus row 11's immediate-only ceremony left no portable eligibility/recovery fact.                      | **pass construction; closure qualified**                           | Immediate typed-SAS/four-object recovery remains sound. **Simpler:** a local success bit or old-installer-only certificate fails delayed rotation/total loss; the certified set plus factor-held bootstrap is the smallest construction found that preserves both.                                                   | Single existing eligible client authenticates the set; recovery bootstrap is factor-held. Concurrent conflicting certificates are serialized. Integration is later `L-2`, but the actor split is explicit.                                                                    |
| `RC-2`  | Row 13 custody, row 7 fallback, and row 15 transition lanes converged without one local application/reference transaction. | **pass construction; closure qualified**                           | Staged lock swap, signed mine/other/silence, old-work retention, successor-before-active, and two openable checkpoints survive. **Simpler:** an endpoint flag or wire-only repair cannot preserve old work/openers; no simpler safe repair was found.                                                                | `GenerationApply` resumes every modeled kill and preserves exact old work. Credential replacement removes the promptless future path. Runtime enforcement remains `L-2`.                                                                                                      |
| `RC-3`  | Rows 2/3 added exact AEAD bytes without total admission, allocation, attempt accounting, or oversize state.                | **fail document closure (`E3/E4`); executable model passes**       | Admission/slicing, allocator uniqueness, per-generation `reserved`, boundary equality, width checks, and covered-set trim survive. **Simpler:** propagate the selected construction to stale documents; do not redesign the writer.                                                                                  | Two-tab allocation and abandoned reservations are modeled; runtime/immutable performance remains later. The current register falsely calls the construction open.                                                                                                             |
| `RC-4`  | Random-nonce envelopes and silence rule lacked an exact spool/refusal carrier.                                             | **fail required corrected artifact; selected construction passes** | Exact bytes before send, silence retry, authenticated refusal chain, checkpoint retention, and accepted-chain arithmetic survive. **Simpler:** deleting the stale two-attempt copy is sufficient for closure; restoring the cap or treating unsigned refusal as authority is not.                                    | Client owns spool/position; service owns atomic decisions; relay has no authority. Crash/lost reply and concurrent epoch refusals are modeled by the unbounded chain in the selected records.                                                                                 |
| `RC-5`  | Authentic checkpoint/claim bytes were mistaken for semantic and temporal authority.                                        | **pass construction; closure qualified**                           | Independent semantic admission and creator-bound card id preserve snapshot/head derivation and original creation. Self-admission is surfaced. **Simpler:** producer signatures or mutable-map convention cannot supply the missing authority; no smaller sound substitute was found.                                 | Owner proposal is distinct from admitting authority; staged install preserves content-before-head and clean fallback. Full runtime install remains `L-3`.                                                                                                                     |
| `RC-6`  | Portable-root and deletion-handoff lanes were joined without independently held current terminal evidence.                 | **FAIL (`E1`)**                                                    | Root commitment, Local archive factor, full retired package, and per-class handoff survive before the deadline. **Simpler:** a vector patch is insufficient; select whether handoff or forced-erasure authority wins and use it for all six classes.                                                                 | Client receipt is selected authority, but `RC-7` lets the service timer erase it at the deadline. Crash/lost-ack direction is therefore unsafe.                                                                                                                               |
| `RC-7`  | Three transition kinds plus a retention number left lapse/expiry state unauthenticated and non-resumable.                  | **FAIL in composition with `RC-6`**                                | One clock, signed revision, cause-specific six-class ledger, reseed, live lineage through expiry, and retire-wins race survive. **Simpler:** retain this machine and change only the explicitly selected retirement-authority rule after resolving `RC-6`; do not collapse lapse into the three lineage transitions. | Entitlement signer can stop sync, not retire; device signs reseed. At the destructive boundary the clock improperly outranks client handoff.                                                                                                                                  |
| `RC-8`  | Independent policy, evidence-scope, capability, and document-authority divergences converged only at closure.              | **FAIL (`E2`-`E7`)**                                               | Suite separation, same-origin WebAuthn, literal-URL scan scope, and current selection counts mostly survive. **Simpler:** regenerate/check the stale consumers and consume real gate receipts; no new universal registry is required.                                                                                | Status/trace checkers have narrower authority than the closure copy grants them; corrected-end-state is an unchecked stale consumer; debt stage is inconsistent.                                                                                                              |
| `RC-9`  | Legacy cutover, performance population, audit scope, and source/blob freshness require real later gates.                   | **FAIL current gate governance; later debts mostly honest**        | `wasm:verify`, `wasm:stale`, build origin scan, and budget checks pass directly. Historical audit is not misrepresented as exact-version proof. **Simpler:** keep debts at their real later gate and wire independent receipts; do not promote component KATs/history into release proof.                            | Normal `check` never reaches most evidence; freshness is a manual command and not a normal gate; X25519 is assigned two different gates. Legacy cutover, product performance, audit delta/toolchain, and integrated service work remain blocking at their named later stages. |

## The ten single-falsifier findings

These were inspected individually because losing one carrier loses all claimed evidence for its finding.

| Finding / sole carrier                                         | Challenge result                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| generation switch — `GenerationApply — a kill at every step`   | **pass, model scope.** It resumes all eight modeled steps, keeps old journal/batch/outbound bytes, installs an opener before active marker, and keeps both checkpoint generations openable. It remains an abstract `L-2` integration obligation.                         |
| recovery forward rotation — `the replacement-payload variants` | **qualified.** It proves exact payload binding, including successor generation. It explicitly does not prove the exposed old code opens nothing; that remainder is honestly tagged `L-2`. The finding must not be described as completely executable at Stage 0.         |
| origin isolation — `check-origin-isolation.mjs`                | **pass, narrowed scope.** It scans built literal `http(s)/ws(s)` URLs and allowlists only namespace identifiers. It explicitly excludes constructed/protocol-relative/runtime channels and assigns them to later CSP/deployment readback.                                |
| rotated journal — `wrong-generation-key`                       | **pass.** The generation-2 positive uses its own root and the negative uses the generation-1-derived key with correct generation-2 AAD, isolating lookup rather than AAD.                                                                                                |
| network carrier registry — `checkCarriers`                     | **pass locally.** It reads the owning selection's status and refuses a null carrier after its row closes. It does not make the entire closure registry canonical.                                                                                                        |
| WASM width guard — `check-wasm-seal.mjs`                       | **pass.** Six wrong-width cases plus the stale-buffer sequence exercise the shipped wrapper; external KAT and composition vectors remain separate. Source/toolchain freshness is later.                                                                                  |
| checkpoint opener — `the opener predicate`                     | **qualified.** It distinguishes dropping a generation from retiring one opener and exercises newest/second-newest. The arrays and opener taxonomy are synthetic; `GenerationApply` provides a second composition check, but integrated garbage collection remains later. |
| lock caveat — `the rotation_owed derivation`                   | **qualified.** It proves the selected eight-step table keeps the flag through settlement; the function is derived from the same step numbers it asserts, so its credibility depends on the separately tested `GenerationApply` ordering.                                 |
| nonce ceiling — allocator/count test                           | **pass.** It distinguishes `reserved[gen]` from global `nextSeq`, checks equality as first refusal, gaps, rotation, and cross-tab ranges. The stale P-3/§15 copies are a document failure, not a test failure.                                                           |
| PRD selection status — `check-selection-status.mjs`            | **FAIL as closure evidence.** It proves 17/4 membership and five cited PRD sentences, but cannot see §15 row 3's contradictory construction or `corrected-end-state.md`.                                                                                                 |

## AAD isolation and mutation-battery credibility

`pnpm vectors:coverage` (as part of `vectors:check`) reported 190 authenticated fields and a published negative for
each. Its elision method requires the named negative to stop failing when that one AAD field is removed, which is a
credible defense against the common dual-failure negative for declared AAD fields. No counterexample was found in
that scope.

The per-action mutation narratives are useful but are author-recorded results, not independent receipts. The
independent runs confirmed their final artifacts, not all historical mutations. Two current outcomes demonstrate
why that distinction matters: the retention suite is green in the unsafe direction, and traceability's “reachable”
mutation did not include failure of an earlier `&&` prerequisite. Mutation batteries remain supporting evidence,
not closure authority.

## Named adversarial scenarios

All scenarios in `docs/review/analysis/adversarial-scenarios.md` were replayed against the repaired records. “Later”
means the Stage 0 construction is coherent but no integrated implementation is claimed.

| Scenarios      | Repaired-tip assessment                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P-01`, `P-02` | **pass design / later integration.** Startup remains local replay before transport; journal→record→compare-remove retains duplicate-safe crash coverage.                                                                    |
| `P-03`         | **pass design.** Admission and slicing keep accepted pieces durable; quota/unavailable storage withholds acknowledgement. Immutable population performance remains `L-4`.                                                   |
| `P-04`, `P-05` | **pass executable model.** Cross-tab reservations are disjoint; abandoned attempts stay charged; exact covered-set trim preserves concurrent records. Document closure fails under `E3/E4`.                                 |
| `P-06`         | **pass design / later integration.** Content-before-head preserves redelivery; accepted run integration remains `L-2`.                                                                                                      |
| `P-07`         | **pass executable model.** Exact envelope persists before send, silence retries identical bytes, and authenticated refusal licenses one next attempt in an unbounded chain. The required corrected-end-state copy is stale. |
| `P-08`, `P-09` | **pass model / later integration.** Lock staging and `GenerationApply` preserve one opener, old work, active marker order, and future credential replacement.                                                               |
| `P-10`         | **pass selected semantic model / later install.** Admission binds re-derived semantics and head baseline; staged install/rollback remains `L-3`.                                                                            |
| `P-11`         | **later blocker (`L-1`/`L-2`).** Legacy plaintext export/import/selection/deletion/restart remains explicitly unimplemented; no false Stage 0 implementation claim found.                                                   |
| `A-01`         | **pass model / later service.** Relay silence has no authority; service-signed refusal and exact successor chain prevent self-equivocation.                                                                                 |
| `A-02`         | **qualified as designed.** Service equivocation remains detectable only when views meet; no global non-equivocation claim is made.                                                                                          |
| `A-03`, `A-04` | **pass selected authority.** Certified recipient state, including authentic recovery digest, is consumed by later rotators; stale ceremony restarts.                                                                        |
| `A-05`, `A-06` | **pass selected capability model.** `rotation_owed` narrows the interim promise and replacement operational credentials remove the post-rotation promptless path; runtime remains later.                                    |
| `A-07`         | **qualified boundary.** Same-origin hostile code remains inside the threat boundary. Static literal-origin scan passes; CSP/deployment/runtime controls remain a real release gate.                                         |
| `C-01`, `C-02` | **pass model.** Second-newest checkpoint retains an opener and generation references block old-key deletion. Integrated GC is later.                                                                                        |
| `C-03`, `C-04` | **pass/qualified.** Recovery retains four independent objects and nonce-bound first contact; hostile authorization service remains the declared freshness boundary.                                                         |
| `C-05`, `C-06` | **pass selected design.** Factor-sealed root prevents fresh rewrap substitution; replacement binds full bytes and successor generation. The old-code-no-future-access runtime check remains `L-2`.                          |
| `C-07`         | **FAIL at deletion joint.** Lapse/resume/expiry state itself is coherent; retirement after the shared deadline bypasses its client authority.                                                                               |
| `C-08`         | **pass design / later integration.** Divergent survivors reseed as branches under the existing lineage rather than genesis.                                                                                                 |
| `C-09`         | **pass design / later continuity execution.** New lineage/generation and own-source-only suffix are preserved.                                                                                                              |
| `C-10`         | **FAIL.** Zero-handoff retirement deletes all hosted classes at the deadline; exact reproduction passes.                                                                                                                    |
| `C-11`         | **qualified / later `L-3`/`L-4`.** Local operation and archive construction are present; independent replacement stack, clean-device restore, and full provider-loss execution remain blocking later evidence.              |

## Later gates and historical-only items

These are not misreported as new Stage 0 design blockers except where the documents assign conflicting stages:

- **Legacy plaintext cutover:** real `L-1`/`L-2` blocker before opening a known old origin; not evidence against the
  selected encrypted carrier.
- **Journal performance/support population:** fixed-slot and exploratory append evidence remain component results;
  immutable burst/occupancy/cleanup on a declared device population is a real `L-4` blocker.
- **RustCrypto audit/source/blob/toolchain:** `pnpm wasm:verify` and `pnpm wasm:stale` pass, but the 2019 audit does
  not cover the exact crate/compiler/glue/blob, and `wasm:stale` is not wired into normal `check` or `build`. Keep the
  exact source delta/toolchain attestation at `L-4`.
- **Browser/X25519 capability:** no unsupported browser claim was independently made. The dated evidence table must
  be assigned consistently either before `S0-10` or at `L-4`; it cannot be both.
- **Historical-only four:** no current construction was reopened. They remain append-only provenance corrections.

## Final disposition

`S0-9` **fails**. The earliest substantive decision boundary to reopen is the joint `P-6`/`S0-6` and
`P-4`/`S0-7` choice over whether a timer may override independently held terminal-survivor authority. The earliest
closure boundary to reopen is `P-5`/`S0-1`, followed by `S0-8`, because required documents drift, gate reachability is
textual rather than actual, and debt/provenance do not agree. `S0-10` must remain blocked until these failures are
resolved and independently rerun.
