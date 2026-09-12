# Next bounded phase: release validation

This is the next phase after the 2026-09-12 sync-liveness, privacy, failure/recovery and
storage/responsiveness repairs. It is a validation plan, not a release receipt or authorization to
change the author's running app. The current phase evidence and remaining limits live in
[the repair record](./account-privacy-recovery-capacity.md) and [findings index](./review/implementation/findings.md).

## First work package — F-20 / N-06 / P-05, with P-06

1. Inventory the executable validation graph: current `package.json` checks, later standalone Account
   contract/audit/isolation/oracle campaigns, and the new private-release phase campaigns. Map every
   required case/control/property/vector family to an invocation. Repeated prerequisite vector work
   may run once only when its exact source/dependency identity is shared; do not drop coverage because
   a phase claims an earlier prerequisite passed.
2. Give native suites separate measured deadlines, finite waits, heartbeat output, child-process
   cancellation and a complete case census. Address the known load-sensitive generated unit deadlines.
   Preserve failed attempts and counterexamples. The maintenance campaign's grouped-deadline failure
   is a concrete example, not evidence that a timeout always means insufficient time.
3. Sweep P-06's remaining phase prose against the canonical construction registry. Retain historical
   assessments and vectors. Do not reopen already evidenced byte contracts merely to rewrite history.
4. Run the complete selected graph at one immutable revision, retaining environment/dependency/source
   pins, counts, controls, timings, failures and explicit exclusions. A passing unit suite or a collection
   of phase receipts from different revisions is not this aggregate receipt. Builds go to disposable
   output directories; never overwrite personal `dist/` or `.dev/releases/17d87c2/app`.

Exit: an auditable required-case map and aggregate result at one revision, with no silent missing,
skipped, zero-case or timed-out stage, and an explicit supported workload/platform/claim disposition.
A failed gate is diagnosed before retry; longer time is not a substitute for a live bounded predicate.
No full `pnpm check`, broad platform qualification or public release is claimed by the phase receipts.

## Qualification decisions that remain visible

| Category | Remaining obligation |
| --- | --- |
| Privacy, F-21.4 | Qualify supported browser/OS/custody opener combinations; document opaque/fragmented representations not covered by whole-sentinel scanning. Logical legacy cleanup does not erase forensic remnants. No heap/swap/unallocated-sector claim. |
| Failures/recovery, F-09 | Current-format Local salvage is partial and requires intact authenticated custody. Account recovery, factor/key loss and unsupported historical formats need their own recovery/export/import contracts. Existing blocked-storage/prompt UX and lock-order documentation stay separately tracked (F-13/F-14/F-23/F-24). |
| Storage, F-16 | The scheduler is advisory: continuous work can postpone it, pending dependencies preserve original frames, a large state stays large, and Account proof history is not pruned. Establish a supported growth/reopen envelope. |
| Responsiveness, F-17 | Profile browser input-to-paint on supported devices and dense/deletion/undo histories. Full fallback and forks still scale with history; the improved 100k-item Node sample still has noticeable latency. |
| Retained markers, F-19 | Confirm native storage/resource costs and end-to-end admission/open capacity at the declared workload. Full MAC/parse work, completion duplication and the 72 MiB private promotion body ceiling remain; the microprofile is not maximum-body/concurrency qualification. |

A bounded author trial can explicitly accept a limited workload/device set. Broad user-facing promises
require evidence for the set actually supported. More aggressive caches, incremental projections,
ledger pruning, origin-wide scan reduction (F-18), source-capsule overhead (F-25) and the future Yjs
upgrade seam (F-22) remain distinct work, not implied by this phase's reductions.

## What follows validation

Account is still the private **creating-member ciphertext round trip**, Stage 4 §3.5 item 5. It is not
mounted into the personal packaged app and there is no real Account admission receipt. After an
acceptable private validation result, rehearse the author's Account promotion/cutover and recovery
artifacts, then build/validate enrollment's two gates and second-device adoption. The author's old
second device must adopt the first workspace with fresh custody, store identity, counters and
credentials; it must not import or merge its old plaintext history.

Stage 4 §3.5 items 6–9 still include enrollment, device list, revocation/rotation/acceptance/finalization,
and sign-out/remove/reset/picker/provenance. The week of offline edits on both devices and daily-use
exit remains. The broader continuity archive/restore/package contract follows in Stage 5.

As [sequencing](./sequencing.md#35-stage-4--the-service) specifies, first ciphertext round trip and two
devices converging are learning milestones, not public ship boundaries. Author dogfooding may precede
the independent protocol review. Another person's data or public security claims trigger the formal
review, baseline, disclosure and other stated gates. Deployment/operations, service retention/backups,
platform custody and the remaining user lifecycle must be ready for the promised product scope.
The intermediate Account v8 product is retired; its internal setup dependencies are not a release target.
