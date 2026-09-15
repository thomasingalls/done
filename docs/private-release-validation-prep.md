# Next work: release-validation graph and qualification

This follows the bounded 2026-09-12 repair sequence and the Q review intake at `9ff48b5`.
The Q findings add concrete validation prerequisites and further liveness work before practical
Account cutover; the earlier sequence did not close F-07 in full. This is a work and validation plan,
not a release receipt or authorization to change the author's running app. The current phase evidence
and remaining limits live in
[the repair record](./account-privacy-recovery-capacity.md) and [findings index](./review/implementation/findings.md).

## Prerequisites added by the Q review

The [Q packet and responses](./review/implementation/393ef43-9ff48b5.md) and
[current routing](./review/implementation/findings.md#q-addendum-routing-and-independent-exit-criteria)
preserve each finding. The intake is signed `95bbed7` (original `409fbd0`); the subsequent
[validation-control repair](./review/implementation/validation-controls.md) completes item 1 below.
The [Q follow-up sequence](./review/implementation/liveness-followups.md) completes the bounded repairs
in items 2–4. Full-history capacity and the aggregate qualification work remain ahead.

1. **Q-01/Q-04 — bounded repair complete:** reviewed the seven added census files and changed
   construction sites, recorded classifications/pins, and restored coverage, HTTP-bound and
   unreadable-content controls on the actual paths. Phase runners now execute the shared prerequisites;
   current receipts come from the actual checks. Keep those checks current as the next phases change
   source; their passing result does not cover the complete release aggregate.
2. **Q-03 — complete:** replaced repeated full request JSON in the service verification context with its freshly
   authenticated compact binding, retaining scope/generation/predecessor and exact input bytes.
   Both 64 KiB and 1 MiB checkpoints with 35 rows retain 13 warm versus 118 cold verifications;
   authority-change controls pass. Existing cache bounds remain.
3. **Q-02 — bounded repair complete; capacity remains:** retained a natural-scheduling 80-edit/30-burst
   probe, reduced repeated carrier loads/copies and added an explicit private v9 original-source
   batch contract. Source identity, attribution, durable allocation, exact retry, crash boundaries,
   malformed batches and changed current views are checked. The burst falls from 112.7 seconds /
   thirty positions to 9.7 seconds / three; single edits near eighty positions still take 2.7–2.9
   seconds and the local admission loop takes 6.1 seconds in the batch campaign. Qualify the supported
   workload/device set; publication and network re-entry checks remain current.
4. **Q-05 — complete:** distinct receive expiry reason and bounded diagnostic, 160 generated scheduler
   histories and three native consecutive expiries then automatic recovery. Fresh requests and
   capped backoff remain; a count-only permanent halt was not added.

## Aggregate work package — F-20 / N-06 / P-05, with P-06

**Phase 1 inventory is complete:** the [checked graph and coverage map](./release-validation-graph.md)
records current package wiring, proposed required families, explicit exclusions and concrete execution
gaps. `pnpm validation:inventory` detects drift; it does not run the aggregate. The
[execution foundation and all eleven catalogue adapters](./release-validation-execution.md) now
supply owned execution for 163 catalogue cases and 54 mutations.
General integration covers **272 files / 2,198 case dispositions (11 not applicable)**, including all 123 Account files.
0 test-file, 84 command and 52 campaign obligations remain.
The earlier private Local handoff passed functional and relative command-performance gates but failed Android card typing at 63.5 ms (<16 ms required); activation was held at that checkpoint. The later RC disposition is recorded below. Prior owner/headroom/oracle observations, R-04/P-06, wrapper outputs and immutable qualification remain open.
The physical companion and earlier snapshot comparisons remain historical evidence, with phone/manual continuation cancelled. Subsequent optimization selected R3 + membership-repair eligibility + restricted replay buffers. Functional/lifetime qualification and the bounded receive-fixture repair completed above signed `e38be54c`. The [latest application gate](./f17-rc-activation.md) completes all measurements and fails Android card p95 38.7 ms (<16 required) and settled navigation 113.6 ms (<100 required); desktop card is 9.0 ms and Android focus 35.4 ms. Under the operator's direction to accept the best combination for the RC, a separate explicit post-measurement disposition accepts both timing misses as open debt. The original exception-rule assessment and gate stay failed. The same candidate passes 147 owned unit cases, ten native workspace cases/four mutations, and eight normal Local app cases with 20 generated histories. Its exact Local factory selection is now the repository default; Account stays reference. Larger optimization work is deferred. Activation is signed as `83b5f157`. The first wrapper slice passes 35 owned executions/65 cases and one exact vector reuse, resolving two command rows and one campaign row. It retains passing Node output and corrects only the stale activation census source pin; original failures remain. [Wrapper evidence](./account-conformance-runs/2026-09-15-wrapper-preparation/README.md). Preparation is signed as `5cbad3fa`. The new opt-in report-file custody passes 68 owned cases, exact report reuse and two fault controls, while ordinary command contracts and unresolved wrapper counts stay unchanged. [Report evidence](./account-conformance-runs/2026-09-15-wrapper-file-output/README.md). Report retention is signed as `9e4a1d9e`. Account core now passes 60 owned cases, exact wrapper reuse and all ten retained reports, plus synthetic semantic controls and two discriminating faults. It resolves one command and one campaign row; the initial pre-test Chromium abort remains preserved. [Account core evidence](./account-conformance-runs/2026-09-15-wrapper-account-core/README.md). Core is signed as `d41a0a56`. Recovery now passes 93 owned cases including the core regression, ten retained recovery reports, three clean persistent browser lifetimes and exact receipt reuse. Generated profile/report controls and two deliberate faults discriminate. The stale blocked-wrapper planning failure is retained and its dispositions corrected. Recovery resolves one more command and campaign row. [Recovery evidence](./account-conformance-runs/2026-09-15-wrapper-account-recovery/README.md). Recovery is signed as `4e8a8f3a`. Authority now passes 81 owned cases including recovery regression, six retained reports and exact reuse. Signed-report generation controls and two faults discriminate, with actual foreign-root/stale-nonce distinctions and independent archived-signature verification. One more command and campaign row resolves. [Authority evidence](./account-conformance-runs/2026-09-15-wrapper-account-authority/README.md). Authority is signed as `e18a77df`. Promotion now passes 78 owned cases including authority regression, six retained reports and exact reuse. Generated control pairs and two faults discriminate; enriched reports prove the recorded mutant result is eligible and accepts an actually substituted intent. One command and campaign row resolves. [Promotion evidence](./account-conformance-runs/2026-09-15-wrapper-account-promotion/README.md). Promotion is signed as `b31be6c0`. Genesis now passes 86 owned cases including promotion regression, seven retained reports, a bound historical reader and exact reuse. Generated semantic/history controls and two faults discriminate. One command and campaign row resolves. [Genesis evidence](./account-conformance-runs/2026-09-15-wrapper-account-genesis/README.md). Genesis is signed as `d38a0ab0`. Admission now passes 107 owned cases including genesis regression, nine retained reports, a bound historical reader and exact reuse. Observed activation/receipt targets, service-ledger replay, generated controls and two faults discriminate. One command and campaign row resolves. [Admission evidence](./account-conformance-runs/2026-09-15-wrapper-account-admission/README.md). Admission is signed as `b9d4efa2`. Handoff passes 116 owned cases including admission regression, nine retained reports, bound historical reader and exact reuse. Credential substitution, route agreement, independent signature checks and two deliberate faults discriminate. One command and campaign resolve. [Handoff evidence](./account-conformance-runs/2026-09-15-wrapper-account-handoff/README.md). Handoff is signed as `9b7f02ea`. Editing passes 103 owned cases including handoff regression, eight retained reports, bound historical reader and exact reuse. Observed ancestry/passkey controls and per-command recovery checks, generated controls and two deliberate faults discriminate. One command and campaign resolve. [Editing evidence](./account-conformance-runs/2026-09-15-wrapper-account-editing/README.md). Editing is signed as `61e53cdb`. Outbound passes 116 owned cases including editing regression, exact receipt reuse, 18 retained files and five ordered child invocations. Separate child case reports and semantic evidence reject zero-exit incomplete results; eight synthetic runs and two omitted-check faults discriminate. One command and campaign resolve. [Outbound evidence](./account-conformance-runs/2026-09-15-wrapper-account-outbound/README.md). Outbound is signed as `49cbb1e2`. Capture passes 128 owned cases including outbound regression, exact reuse and ten retained reports. First-observation and full-byte comparison repairs close the recorded capture oracle follow-ups; generated controls and omitted-check faults discriminate. One command and campaign resolve. [Capture evidence](./account-conformance-runs/2026-09-15-wrapper-account-capture/README.md). Next: Account spool wrapper integration, then remaining wrappers/qualification repairs; immutable and supported-device qualification remain open. [Debt scope and closure](./review/implementation/f17-rc-latency-debt.json).

The [R intake](./review/implementation/9ff48b5-d03e473.md) additionally
requires R-01's service/receiver size contract repair before a durable Account cutover; that bounded
repair is signed `5872dc5`, with malicious-member recovery still explicit. The completed
[signing sweep](./review/implementation/signing-prep-2026-09-13.md) now records thirty verified signed
replacements and current baseline/navigation reconciliation. Historical intake and phase evidence
remain unchanged; no new aggregate result follows from signing.

1. Inventory the executable validation graph: current `package.json` checks, later standalone Account
   contract/audit/isolation/oracle campaigns, and the new private-release phase campaigns. Map every
   required case/control/property/vector family to an invocation. Repeated prerequisite vector work
   may run once only when its exact source/dependency identity is shared; do not drop coverage because
   a phase claims an earlier prerequisite passed.
2. Give native suites separate measured deadlines, finite waits, heartbeat output, child-process
   cancellation and a complete case census. Address the known load-sensitive generated unit deadlines.
   Include R-03 without reducing its 120 generated histories. Give full lint/format explicit archive
   exclusions and live-source obligations under R-04; scoped phase checks are not the whole gates.
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
| Responsiveness, F-17 | Selected R3 + repair eligibility + replay buffers is now the Local repository default after functional/lifetime checks. Account remains reference. The unchanged application gate still fails Android card p95 38.7 ms (<16) and settled navigation 113.6 ms (<100); desktop card is 9.0 ms and Android focus 35.4 ms. A separate explicit RC disposition accepts both timing misses as open debt without changing budgets or failed receipts. The initial exception rule did not permit navigation; its failed assessment is preserved. Larger optimization is deferred; supported-device/history capacity and immutable qualification remain open. [Current evidence](./f17-rc-activation.md), [debt and closure](./review/implementation/f17-rc-latency-debt.json). |
| Retained markers, F-19 | Confirm native storage/resource costs and end-to-end admission/open capacity at the declared workload. Full MAC/parse work, completion duplication and the 72 MiB private promotion body ceiling remain; the microprofile is not maximum-body/concurrency qualification. |

Q-06/R-02's signing sweep now has a [verified crosswalk](./account-conformance-runs/2026-09-13-signed-review-history.json).
Tested IDs/hashes remain historical, current executable baseline lookups use identical signed trees,
and Q-07/R-02's current documentation is corrected. Signing is not an aggregate execution receipt.
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
