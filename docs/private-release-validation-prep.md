# Next work: validation prerequisites and remaining liveness

This follows the bounded 2026-09-12 repair sequence and the Q review intake at `9ff48b5`.
The Q findings add concrete validation prerequisites and further liveness work before practical
Account cutover; the earlier sequence did not close F-07 in full. This is a work and validation plan,
not a release receipt or authorization to change the author's running app. The current phase evidence
and remaining limits live in
[the repair record](./account-privacy-recovery-capacity.md) and [findings index](./review/implementation/findings.md).

## Prerequisites added by the Q review

The [Q packet and responses](./review/implementation/393ef43-9ff48b5.md) and
[current routing](./review/implementation/findings.md#q-addendum-routing-and-independent-exit-criteria)
preserve each finding. The intake was committed unsigned in `409fbd0`; the subsequent
[validation-control repair](./review/implementation/validation-controls.md) completes item 1 below.
Items 2–4 and aggregate qualification remain ahead.

1. **Q-01/Q-04 — bounded repair complete:** reviewed the seven added census files and changed
   construction sites, recorded classifications/pins, and restored coverage, HTTP-bound and
   unreadable-content controls on the actual paths. Phase runners now execute the shared prerequisites;
   current receipts come from the actual checks. Keep those checks current as the next phases change
   source; their passing result does not cover the complete release aggregate.
2. **Q-03:** replace repeated full request JSON in the service verification context with its freshly
   authenticated compact binding, retaining scope/generation/predecessor and exact input bytes. Add
   representative checkpoint/ledger-size and authority-change controls. Existing cache bounds remain.
3. **Q-02:** retain a reproducible natural-scheduling burst/growth probe and an explicit workload
   acceptance criterion, then reduce redundant carrier loads/copies within owned state revisions.
   Source coalescing or multiple-source envelopes require a bounded design covering source identity,
   attribution, durability, crash/retry and current protocol representation. A view from the start of
   a scheduler pass cannot replace checks after writes or network waits without proving freshness.
4. **Q-05:** expose receive expiry as a bounded reason/diagnostic and exercise repeated expiry then
   recovery. Keep fresh requests and backoff; a count-only permanent halt is not an accepted repair.

## Aggregate work package — F-20 / N-06 / P-05, with P-06

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

Q-06's intentional unsigned chain is recorded in the repository; eventual signing must preserve tested
IDs/hashes and add a tree-checked crosswalk. Q-07's current documentation was corrected in the intake.
Q-08 needs prospective artifact budgets/deduplication and normalized publishable paths. Preserve raw
failed histories and reproducible evidence with durable hash-checked retrieval before relocating any
archive; no external store or historical deletion has been selected. Public sharing also needs a
decision about paths already present in Git history.

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
