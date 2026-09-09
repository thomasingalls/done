# Owned legacy migration coordinator and restart preparation

**Status: bounded private coordinator implemented and validated.** This follows
[native source-cleanup validation](./storage-conformance-runs/2026-09-09-legacy-cleanup.md).
It records the contract for one private coordinator in the seeded Markdown/system migration path. It does not
change default application startup, settle the real Stage 2 carrier choice, or authorize the real profile's
selection/deletion. [SC-01–09](./storage-contract.md), [sequencing §§3.2–3.3/5.4](./sequencing.md) and
[action-tree L-1](./review/remediation/action-tree.md) retain authority over those boundaries.

## Implemented checkpoint

`createLegacyCoordinator(slotId)` owns read-only `inspect`, `capture`, a one-use factor `enroll` ceremony,
and one explicitly named `advance` action: import, select, cleanup or verify. It copies caller-owned packet
bytes before awaiting, erases its own copies, rejects concurrent operations, and closes pending ceremonies on
cancellation. A failed confirmation closes that wrapper; starting a new ceremony is allowed only while the
slot remains unused, otherwise the retained intent must be resumed. Inspection hints before unlock confer no
authority. Authenticated metadata inspection is also distinct from current content recovery.

A read-only `verifyLegacyCleanup` entry point requires terminal signed progress under the cleanup owner's own
permit. It cannot start or resume deletion based on a previous inspection. Final verification then opens and
closes the ordinary Local owner; concurrent clear or damage can still refuse this separate observation. The
coordinator adds no durable success marker and never falls back to fresh enrollment on a missing claim/route.

[Preserved evidence](./storage-conformance-runs/2026-09-09-legacy-coordinator.md) includes the generated harness
scheduling failure and passing exact replay. The repaired injection stays armed across bounded imports until
the requested terminal commit is actually reached. No coordinator data-loss defect was found in these runs.
Production exclusion and recovery-save/readback host preparation are next, before any default-app route.

## Coordinator contract

The coordinator inspects one explicitly named Local slot and, after fresh verification, performs
one requested step through the existing import, selection or cleanup owner. A new renderer must recover the
next permitted action from retained carriers plus the original recovery packet and factor. It must not need
the previous renderer's document, callback, receipt object, in-memory phase or a saved progress label.

The seeded flow is capture → save and cold-verify recovery → confirm factor → bounded import calls → cold
selection → source cleanup → fresh verification of the selected route and known-source absence. Existing
component owners remain responsible for their own authentication, atomic writes and cleanup cursors. This
phase composes them and tests gaps between them. A single advance call does not silently import, select and
delete in succession. Enrollment uses the existing explicit generated-factor ceremony; later calls name the
step they intend to perform. The test driver may sequence them once their preconditions are satisfied.

Do not add a second durable migration stage/cursor or a new completion marker. The existing authenticated
records already carry the required identity and progress. A duplicate coordinator record could disagree with
them after a crash. Transient UI state and host diagnostics are observations, and never authorize an effect.

## Existing seams and bounded additions

| Existing owner | Responsibility retained | Coordinator work needed |
| --- | --- | --- |
| `legacySource.ts`, `legacyExport.ts` | Readonly source observation, dependency checks, diagnostic packet capture and cold replay | Dispatch capture only under seeded host exclusion; require externally saved/reloaded bytes before enrollment |
| `legacyImport.ts`, `legacyImportRecord.ts` | Factor-confirmed fresh identity, signed pre-active claim, bounded import actions and coupled receipts | Discover retained import state; resume the same intent with the same verified input, at most 1–32 actions per import invocation |
| `legacySelection.ts` | Cold pre-active verification, selecting intent, exact index route, atomic active custody decision | Dispatch only imported/selecting state; distinguish completed selection acknowledgement from current content recovery |
| `legacyCleanup.ts`, `legacyCleanupRecord.ts` | Cold journal-inclusive destination recovery, authenticated exact manifest and resumable deletion | Dispatch selected state; preserve v1/v2 progress; never recapture a partly deleted source as a replacement input |
| `localGenesis.ts`, `ownedStartup.ts` | Factor-verified Local route and ordinary journal/content recovery before admitted initialization | Hand a selected identity to ordinary Local open; migration completion must not infer recoverability from an index or receipt alone |
| `localClearState.ts`, `localClear.ts` | Clear exclusion and authenticated clear resumption, including source absence after custody removal | Detect a retained clear first; report that its owner is required, without attempting migration, reminting or clearing automatically |
| `writeSession.ts` | Native permit acquisition, transaction draining and cancellation | Close classification lifetimes before calling public owners that acquire their own exclusive permits |

Implementation files are `src/crdt/legacyCoordinator.ts` for private orchestration and
`src/crdt/legacyCoordinatorState.ts` for read-only inspection/dispositions. They are not exported from normal app
startup. `test/legacy-coordinator/` and `scripts/legacy-coordinator/` contain the composed native fixture, run by
`pnpm storage:legacy-coordinator`. Its interface preserves the contract below and cannot
accept a caller-supplied Yjs document, phase, cursor, route authority, key, restored counter or exclusion flag.

## Restart classification and authority

Inspection is slot-scoped and read-only under a lifecycle permit. It reads clear/import/Local control rows,
the exact slot index and the relevant scoped custody/content/journal census. It does not enumerate arbitrary
database names to discover workspaces. Before a factor is supplied, parsed stage names are presentation hints
only: return unlock/input requirements, not an authorization to resume or a verified completion claim.

After factor unlock, authenticate the retained claim and complete binding, and use the component census for
that stage. Simultaneous import and Local claims, unexpected control rows, malformed routes, live
custody/counters missing where that stage requires them, or conflicting identities refuse. Never choose
whichever stage looks furthest advanced.
An absent route is legal only where that existing stage permits it; absence is not evidence of a fresh slot.

| Durable observation | Permitted next action after verification | Restart rule |
| --- | --- | --- |
| No import/Local/clear claim; destination namespace passes the unused-slot census | Capture/verify recovery and offer enrollment | Fresh identity may be minted only by confirmed `beginLegacyImport`; existing unrelated material refuses |
| Import claim at `custody`, `content` or `importing` | `resumeLegacyImport` | Same factor, source/policy/plan binding and intent; replay committed receipts; abandoned reservations stay spent |
| Import claim at `imported` | `selectLegacyImport` | Full cold import replay and source checks repeat; the coarse stage is insufficient |
| Import claim at `selecting`, with absent or exact provisional route | `selectLegacyImport` | Repeat verification; only the existing selection owner may install the missing provisional route |
| Authenticated ready imported Local claim, no import marker, exact route; no cleanup manifest | Selected destination; cleanup available after its prerequisites | Selection is already committed; no reimport or comparison of current edited text to the old source |
| Ready imported Local claim with nonterminal authenticated cleanup manifest | `cleanupLegacySource` resumes that exact intent | The old whole-source digest no longer describes remaining storage; use manifest/cursor/value checks |
| Ready imported Local claim with terminal cleanup manifest | Verify terminal cleanup again, then separately verify ordinary Local open | A saved terminal cursor does not prove current source absence or current destination readability |
| Retained Local clear marker | Report clearing/cleared owner required | Do not start migration or reconstruct removed custody, even when source or index is absent |
| Fresh Local claim, Account slot, closed slot, unsupported/mixed state | Report existing owner required or repair/refusal | This coordinator cannot adopt, overwrite, repair or delete it |

No authentication result outlives its permit as write authority. The coordinator may release its inspection
permit and invoke an existing public component owner; that owner reacquires and rereads. Do not nest
`withExclusiveSlot` calls. If another contender advances or clears the slot in the gap, the requested action
either safely recognizes its own completed state or refuses and requires reinspection. Do not convert an
arbitrary refusal into enrollment, selection, cleanup or an unbounded automatic retry. The seeded host admits
one migration target for a source; serialization of one slot is not exclusion across different destination slots.

## Recovery packet and factor requirements

Use the existing `done-legacy-source-recovery` v1 diagnostic packet and explicit `markdown-system-v1` policy.
The input remains `LegacyImportInput`: recovery bytes, separately held recovery digest, source origin and
observation digest, and policy. The plan is derived by `prepareImportPlan`; callers cannot supply it as truth.
After the first claim commits, its authenticated binding is the reference for all resumed inputs. A filename,
download event, matching digest by itself or old receipt object is insufficient.

The seeded host must save the packet outside source/destination browser carriers, reread the actual saved
bytes, and cold-replay them before enrollment or selection/deletion. Keep that copy through all restarts and
cleanup. The host retains the expected digest and intended slot separately, and after enrollment must match
the authenticated claim. Its externally stored test factor is not copied into page storage or diagnostics.
The Markdown ZIP is a preview and does not substitute for the diagnostic packet required by these APIs.
Saving two attacker-replaceable files does not authenticate source; the digest is a byte-identity check.

Before initial intent, a failed save/readback, incomplete dependency basis or wrong packet refuses enrollment.
After intent, missing/corrupt/wrong packet returns recovery-input-required or input-mismatch without writes;
wrong factor returns unlock failure without reminting. This applies even if cleanup's cursor is terminal,
because the current cleanup/retry APIs still verify the packet and plan. Do not reconstruct it from partly
deleted source or silently replace the signed digest with a fresh observation. Before any intent exists, a
new capture is possible after reestablishing exclusion. Abandoning an existing intent needs a later explicit
owner; this phase never rolls it back automatically.

A selected destination may still be opened through ordinary Local factor unlock when the packet is missing,
subject to its own cold recovery. That does not complete migration maintenance. A user edit accepted after
selection must survive packet loss, source-cleanup interruption, journal flush and compaction. The packet
preserves the captured source basis; it is not a backup of later destination edits. Never automatically import
it over the selected destination or restore writable keys/reservations from it.

Do not persist plaintext packets, previews, decoded source content, factor codes or openers in a new browser
carrier. Dispose owned byte buffers on cancel/close; do not claim JavaScript string or filesystem forensic
erasure. The diagnostic packet is plaintext, omits ancillary credentials and is not a portable fidelity archive.
A production recovery-save/readback ceremony and the author's carrier/attribution decision remain required
before a default-app migration route. The existing 64 MiB input and action/source refusal bounds remain; bounded action
counts do not establish whole-input memory or latency acceptance.

## Host exclusion and cancellation

The seeded host is the external controller of a disposable browser context. Before dispatch it must close
all predecessor pages and workers, block service workers and old executable/network/WebSocket routes, and
admit only the known fixture. It keeps that exclusion across source capture, saved-file verification, import,
selection, cleanup and final observation, including time between individual API calls. A renderer restart
invalidates its handle; reestablish a new exclusion epoch and reload inputs before another call.

`scripts/legacy-export/exclusion.mjs` remains a test controller, not a production capability. It now reports
first exclusion loss through an optional callback. The composed harness wires that callback to coordinator
cancellation and guards each dispatch and result with its current epoch, and exercises loss
while work is parked and between owners. Checking only before/after an entire flow cannot establish that no
intervening effect occurred. Stale epoch handles cannot restart work. A host-reported completion requires an
unbroken current epoch around the final checks as well as passing component results.

On cancellation, close every owned session and wait for native draining. A queued IndexedDB deletion cannot
be cancelled and may still complete; retain its permit until it settles, then reread signed progress on a
later restart. Report blocked/draining rather than treating a timeout, observation callback or aborted signal
as completed deletion or released ownership. Exclusion loss cannot undo a previously committed effect.
Negative tests must distinguish stopping new effects from an already issued native deletion settling. A
campaign watchdog can terminate its disposable processes and fail the test; it does not change runtime safety.

**No production host procedure is established by this prep.** Before default-app migration integration, an implemented
procedure must enumerate and stop supported old pages/installed windows/workers, prevent cached or network
old bundles and transport from returning, define remote-source reconciliation, and cover restart/exclusion
loss. It must demonstrate those properties on seeded supported versions. New-origin isolation alone does not
stabilize or clean the old origin, and the current selection/cleanup APIs require the bound source origin.
An in-page boolean, callback or branded token cannot create the missing browser authority. Until a procedure
exists, these APIs stay private to the seeded flow and automatic production cleanup remains unavailable.

## Completion and refusal semantics

Keep three outcomes separate: import is complete but pre-active; the destination is durably selected; known
source cleanup is terminal and freshly verified. None means full product migration acceptance. Ordinary
selected editing is permitted by the existing owner before source cleanup; the coordinator must preserve
that behavior and surface pending cleanup. It must not reopen the legacy provider as a fallback.

The composed successful terminal observation requires terminal `verifyLegacyCleanup` verification (current
destination DB/journal, coupled receipts and known-source absence), followed by a fresh ordinary Local open
under its own owner. Close that owner after checking the external ledger in tests. Reclassify if a concurrent
clear or other transition prevents the open; the coordinator adds no durable success record. The host then
checks its current exclusion epoch. Whole-profile residue scanning and retirement of executable legacy routes
remain additional cutover gates beyond the component's known-source absence check.

Surface wrong factor, missing recovery input, input mismatch, unsupported state, repair required, busy,
cancelled/draining and source/exclusion change distinctly enough for a caller to choose the next step. Preserve
the original cause in diagnostics. Never retry storage corruption as contention, claim refused work succeeded,
replace source bindings on mismatch, or resume cleared/missing selected material as a fresh import.

## Conformance contract and executed scope

The [execution record](./storage-conformance-runs/2026-09-09-legacy-coordinator.md) maps the tests actually run,
including 36 directed coordinator cases, 60 generated native histories, 19 renderer deaths and ten controls.
The following table retains the required outcomes; detailed component fault/size cases also remain covered by
the passing import, selection, cleanup, startup and clear regression campaigns. Drive these production owners in
disposable Chromium. Freeze all consumed source/harness files and retain hashes, seed, first input/error,
completed shrink path, partial/final report and full bounded event stream. Reuse the cleanup harness's deadline,
supervisor, observed-abort and error-preservation machinery; do not build another unbounded runner.

| Boundary / schedule | Required falsifiable outcome |
| --- | --- |
| Capture/save/readback fails or packet depends on missing updates | No destination intent, selection or deletion; source exact bytes survive |
| Confirmation cancelled; death before/after atomic first intent | No effect before confirmation; after commit, same factor/identity resumes, with no replacement root/counter |
| Every import stage and slice reservation/commit, then cold restart | Exact external logical ledger and at-most-once action receipts; aborts spend reservations; no ordinary pre-active open |
| Selecting intent, index commit and final custody commit | Index alone never opens; resume repeats cold verification; only final custody completion selects |
| Wrong/missing packet or factor at each retained stage | No mutation; after selection ordinary valid-factor open can still recover later edits |
| Packet mutation while awaited; changed origin/policy/digest/plan binding | Input snapshot and authenticated binding remain fixed; no replacement or cleanup |
| Classification/dispatch gap: second coordinator advances, clear starts, route disappears | Fresh component checks reject stale authority; no duplicate import, remint or route repair after completed selection |
| Death after every cleanup effect/progress commit | Exact manifest resumes; no whole-source recapture requirement after deletion begins; changed/missing/reappearing values refuse |
| Exclusion loss or stale epoch before a step, between steps and while parked | Stop dispatch/cancel pending work; no success from a stale epoch; already issued native effects are accounted for |
| Cancellation during blocked database deletion | Permit remains held until deletion settles; no concurrent writer admitted early; restart rereads progress |
| Later selected journal-only edit, flush/compaction, renderer death | Original imported meaning plus all admitted later edits recover; no reimport overwrites current state |
| Terminal cursor with reappearing source, damaged destination or missing route | No composed completion; clear marker takes its own path even after custody removal |

The composed generator varies external source text/day/archive/unfiled values and DB/WAL partitions, import
budget, abort boundary, cleanup cursor, restart and later journal-only edits. Every generated history saves and
rereads the packet, selects, refuses missing input, resumes cleanup and cold-recovers the external ledger.
The harness separately tracks host epoch, chosen identity and reservations. Two contenders, stale inspection,
source/route change and clear handoff also have directed cases; detailed packet/manifest/update size boundaries
remain in the component suites. This is a bounded schedule generator, not arbitrary command interleavings.
Reports include coverage counts and preserve exact first failures before shrinking and native replay.

The oracle is an independent string/operation ledger plus an exact carrier/identity/reservation ledger, not
the importer's receipt count or the coordinator's returned phase. Before source deletion, source preservation
is byte-exact. After deletion starts, surviving/removed keys must agree with the authenticated one-effect
cursor contract and external original values. Successful migration terminals recover the ledger's final state
after all admitted edits, with permitted attribution; safe refusals preserve the remaining source and acknowledged
destination work. Deliberately requested Local clear follows its separate terminal oracle and must never
be reported as migration success. Unknown material
must remain untouched. Verify that encrypted destinations gain no ordinary plaintext carrier during the flow.

Require named controls for stale classification reuse, index-as-active, reminting retained custody, replacing
the original packet/binding after partial cleanup, skipping saved-file readback, treating exclusion loss as a
successful epoch, releasing a blocked-delete permit early, reimporting after a selected edit, and accepting a
terminal cursor without current recovery/absence checks. A generic exception or timeout does not count as a
detected control. Controls may target the coordinator/host seams while the existing component batteries
continue to cover their own mechanisms.

Acceptance requires all directed boundaries, generated histories with reported coverage, native cold restarts
and named controls to finish; failed histories are saved and repaired before advancing. Run the affected
import/selection/cleanup/startup/clear regressions when ownership seams change. Maintain current limits and
record any new exposed design defect separately. Even a passing composed campaign does not pay production
exclusion, full-profile residue, supported-browser/performance/review gates or the complete L-1 debt.
