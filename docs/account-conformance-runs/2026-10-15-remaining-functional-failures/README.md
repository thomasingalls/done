# Remaining functional failures after the receiver repair

**2026-10-15 — bounded triage complete; full-suite baseline remains red.** Receiver/bootstrap repair
`6eeb7d5f300bca252f32823e9be2be1b0546f25d` is committed and its SSH signature verifies. It contains
the [previous repair packet](../2026-10-15-receiver-compatibility/README.md), regressions and approved
fixtures. The working tree was clean after that commit. The five subsequently approved fixture
edits and this record were then committed as signed `86e830c8`; its SSH signature verifies.
The following [compiler-loading packet](../2026-10-15-compiler-loading/README.md) closes D3's bounded
loader defect and records its separate approved locator update. The table below retains the triage
checkpoint and its other open groups. No push, preview refresh, merge or deployment occurred.
Aggregate qualification remains paused.

The compiler repair is now signed as `a6fa2298`. The next
[source/historical harness packet](../2026-10-15-source-harnesses/README.md) restores the H1/H2 functional
paths and records three still-failing mutation anchors. The table below remains the earlier triage
checkpoint; neither successor packet establishes a green full suite or resumes qualification.

## Scope and evidence

The [original 85-command baseline](../2026-10-15-full-functional-suite/README.md) reports 36 command
passes and 49 failures, including repeated wrappers. It has not been rerun as a whole. The
[updated ledger](triage.json) preserves every earlier group and its source identity, marks the two
committed product repairs closed, records partial fixture closures and adds the default-worker
timeout issue. A diagnostic does not credit later unexecuted assertions or replace an old test.

Both unchanged successor cases still fail on the signed repair. A new observer preserves the
original cancellation/cold-reopen schedule and observes the native successor transaction's completion
without taking the active owner's marker lock. The old settlement helper returns with matching
positions while receiving is still `working`; automatic installation commits afterward. The
previous diagnostic itself attempted to take that marker lock before closing its owner. Its timeout
and source are retained. The corrected observation establishes automatic installation in this
schedule, rather than an explicit refresh substituted for the behavior under test.

Two further current-browser checks show authenticated opening refuses unsigned successor-field
removal and stage substitution. Structural parsing accepts that child at v6–v9, deliberately expanded
by `684f4f06` for checkpoint bootstrap. The older prose and structural assertion still describe v9
only. These observations do not close historical-reader coverage or authorize changing that old
security assertion; the discrepancy stays open.

The operator explicitly approved the [five-file patch](reproduction/proposed-narrow-fixtures.patch).
The [boundary receipt](old-test-boundary.json) verifies only those old files changed and each matches
the proposed hash. It corrects exact connected-route shape, current host schema, the counter-v3
compatibility refusal, the documented superseded response and the receive-lane settlement boundary.
Every test, remaining refusal expectation, backup/key/pin comparison, no-progress/writing assertion
and deadline stays present. All five complete files pass **41 tests, zero skips**, including all 24
generated handoff histories and effective discovery-expiry omission detection. All **21** affected
planning/selection regression cases pass. Inventory/manifest rechecks retain **846 obligations and
305 unresolved obligations**; no aggregate is run.

The separate development-loader defect reproduces with a fresh cache and no shell. Explicit
`needsInterop` in a second isolated configuration also fails on the missing compiler-runtime `c`
export. Both observations are retained as app failures even though the diagnostic process exits
zero after recording them. Its initial Playwright import-loader error is preserved separately and
earns no app evidence. No runtime or Vite source repair was made here.

## Remaining work

| Group | Current classification | Evidence needed to close it |
| --- | --- | --- |
| D3: development compiler runtime | Confirmed tooling defect; reproduced on current source. | Repair the transform/import boundary, prove fresh-cache development mounting and affected private-migration behavior, and retain packaged checks separately. Explicit interop alone failed. |
| F1: onboarding, geometry, labels and entry controls | Stale entry/presentation fixtures; later assertions remain blocked. | Approve exact entry/locator/copy changes, then execute unlock, wrong-code, storage, undo, retry, offline and rollback assertions. |
| F3: browser service upgrade | Host schema fixture now passes; schema-five browser upgrade remains open. | Align its entry and exact version/log expectations, retaining actual backup, pending-account, passkey and writing comparisons. |
| F6: profiled sync realm | Test environment conflicts with the ordinary-global absence assertion. | Preserve profiling evidence and establish absence in a separate unprofiled realm; approve old fixture changes first. |
| F7: receive size boundary | The wire fixture hits the HTTP ceiling before the intended decoded-envelope limit. | Independently assert both encoded/decoded sizes, reach each refusal separately, and retain terminal halt, Local preservation and explicit retry checks. |
| F8: service-inbound generated model | Model expects in-owner recovery after corruption; contract requires quarantine until restart. | Approve a quarantine-aware independent model, preserving refusal after byte restoration and full-verification recovery after restart. |
| H1: copied source closures | Legacy and driver fixtures omit dependencies and stop before their promised behavior. | Approve complete copied/hashed input closures and execute every previously unreachable case. |
| H2: historical readers and emitted chunks | Old modules mixed with current callers; successor adapter drops sibling chunks. | Restore identified, complete historical closures and retain all emitted outputs. No current-reader or parse-only substitute earns historical compatibility credit. |
| H3: mutation controls | Missing/nonunique anchors or refusal by an earlier safety guard. | Repair semantic targets with approval and prove each intended falsifier. Another guard's refusal or a load error is not sensitivity credit. |
| H4: genesis interruption controls | Baselines pass; three controls time out before their intended observation. | Repair activation/schedule and observe the specified failure without changing deadlines or weakening safety guards. |
| U1: successor structural stages | Parser, old assertion and earlier prose disagree; current authentication faults are refused. | Reconcile the checkpoint stage contract and add discriminating authenticated-stage/field and historical-reader evidence before changing the old assertion. |
| R1: default-worker unit deadline | Full population passes with two workers; default runs retain timeouts. | Establish a worker/resource policy and verify pinned CI Node 24. Do not silently increase deadlines or discard failed attempts. |
| P1: deferred formatting | Operator explicitly left the old formatting patch unapplied. | Separate approval if desired. It does not close any security construction or functional boundary. |

The next bounded product-side investigation is D3. Complete source/historical closures then restore
the reachability needed to assess their later failures; model/entry fixture work and effective mutation
controls remain separately reviewable. U1 needs a coherent contract and evidence rather than a
changed Boolean expectation alone. No remaining old-test edits are authorized by this map.

## Retention and limits

The [artifact index](artifact-index.json) retains **36 hashed artifacts**: original triage material,
new failures, independent observations, successful full-file runs, exact proposed/applied patches,
source identities and collector. [Results](results.json) separate failures, diagnostic observations
and passing tests. Logs normalize workstation paths and redact disposable factor patterns; profiles,
databases and real vault data are not copied. No application/service/protocol/Vite source differs
from signed `6eeb7d5f` in this follow-up.

Local Node is 26.11.1. CI Node 24 and a new Firefox/Bitwarden walkthrough were not run. Preview
`fcb659c3`, its service and user data remain untouched. The outcome was appended to
`docs/completed.md` before advancing this packet state; the other seat's `docs/progress.md` is
untouched. Publication and aggregate qualification remain separate and paused.
