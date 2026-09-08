# Encrypted-store conformance matrix

**Status:** current implementation acceptance plan · **Updated:** 2026-09-08.
Requirements are [storage-contract.md](./storage-contract.md), PRD §§7.1–7.2/7.10 and TRD
§§6.1/6.5/13.3/13.7. This matrix records **evidence classes**, not a claim that production conforms.
The [shared browser harness](./storage-harness.md) invokes each pinned candidate through production
adapters; [recorded executions](./storage-conformance-runs/2026-09-08.md) distinguish subcase outcomes.
Candidate-specific suites and byte vectors remain useful, but are not a substitute for that harness.

## Reading evidence

- **Model:** explicit abstract state/schedules; proves only the represented finite cases/assumptions.
- **Component:** actual Yjs or cryptographic primitive behavior; no persistence/UI integration implied.
- **Adapter:** actual production open/admit/receive/trim/clear/custody paths with controlled storage failures.
- **Browser:** isolated real profiles with lifecycle, complete storage and supported platform behavior.

`test/storageContract.test.ts` supplies model/component counterexamples. The earlier
`test/storageSchedule.test.ts` and `test/writeAdmission.test.ts` remain partial Stage 0 evidence:
they do not certify the new writer lifetime, offline causal closure or factor-genesis rules.
**The broader adapter/browser obligations below remain pending** until all their required evidence is
recorded. The shared harness now executes selected subcases, recording candidate revision, path, fault
schedule, assertions and result. A subcase pass or document check does not pay the entire obligation.

## Required scenarios

| ID / requirement | Counterexample or schedule | Acceptance oracle | Existing/new evidence here | Required production evidence |
| --- | --- | --- | --- | --- |
| C01 / SC-01–02 | Receive remote R in memory; append dependent local L; kill offline | Acknowledged L and its semantic basis recover without redelivery; no promotion before receive commit | Phase five preserves pending Yjs dependencies through cold replay. [Phase-six Goals editor](./editor-admission.md) now commits receive before the actual view/history and dependent input; real BroadcastChannel and offline crash recovery pass. Account receive authority and full workspace paths remain owed | Adapter + browser: actual receive/editor path, kill at receipt/commit/promotion/WAL boundaries |
| C02 / SC-02 | Remote deletion with unchanged state vector; local input; kill | Deletion effects survive; vector equality cannot stand in for coverage | [Phase-five admission](./ordered-admission.md) retains unresolved struct/delete bytes through cold replay. Phase-six unit tests carry pending deletes and remote replacement through the actual text/history adapter; full transport authority remains owed | Adapter: delete-only and unresolved struct/delete-set cases |
| C03 / SC-01–02 | First local edit refuses journal; second could journal; delayed commit | Second cannot bypass first; ordinary editor/export/undo/transport retain accepted state only | [Phase-six Goals editor evidence](./storage-conformance-runs/2026-09-08-editor-admission.md) exercises actual CodeMirror typing/commands, paste, undo, export, task widget and Blink composition commit; refused work stays private, forced retry/crash recover correctly. Native IME population, card/workspace paths and large-command adapters remain owed | Adapter + browser: real CodeMirror, IME, undo, paste slices, export and transport; kill before forced completion |
| C04 / SC-03–04 | Freeze tab caching g; transition tries retirement; tab appends then dies | Transition waits for live permit; recover late WAL before retiring g | Finite WAL-generation model; [phase-one lifecycle](./write-session.md) runs tab/worker/freeze/death schedules. [Phase-four journal](./journal-store.md) adds a frozen cached-key writer and late recovery; [phase-five admission](./ordered-admission.md) drains close without late promotion and verifies empty-receiver cross-tab ordering. Retirement/cutover remains owed | Browser: real freeze/resume, page/process death, workers, stale async callbacks and supported-version cutover |
| C05 / SC-03–04 | Kill transition actor after each durable phase; allow a writer in released-lock gap | Reacquire, reread current carriers, preserve openers; no stale census reuse | Not modeled by the finite pin probe | Adapter + browser: all phases, all reference classes, two concurrent transitions |
| C06 / SC-04 | Two rotations, newest checkpoint lost; unknown journal/package reference survives | Fallback remains openable; unknown reference blocks retirement | Earlier Stage 0 fallback model is partial | Adapter: checkpoint/suffix/package/outbound/accepted/wrap references combined with WAL and writer pins |
| C07 / SC-05 | Reserve 1,2,3; commit 1,3; snapshot 4; commit 2; trim | Delete precisely covered {1,3}; recover 2 | Yjs counterexample and late-range-delete mutant; phase-three full snapshots return predecessors of state records and perform no deletion | Adapter + browser: concurrent writers, delayed reservation, concurrent trims and record-byte replacement |
| C08 / SC-05 | Tab A snapshots its own document while disk contains B | Replacement includes every deleted record's update | Shared C08 browser case and production-source mutant; see the recorded execution | Adapter: production trim, reopen semantic union, drop-own-tab-only mutant |
| C09 / SC-05 | Corrupt persisted record/journal before load, during trim or between snapshot/delete | Typed repair-required; no ordinary open/transport/trim; carriers and needed keys retained | Carriers/admission refuse unreadable persistence. [Phase-six editor](./editor-admission.md) clears/disables ordinary text and refuses export after known journal damage; damaged carriers remain. Whole trim and full application refusal remain owed | Adapter: corrupt/unsupported/missing-key cases, whole-trim refusal, safe diagnostics, unrelated-store isolation |
| C10 / SC-06/08 | Partial identity/custody/counter/marker/journal; two competing creators/factors | Resume verified intent or refuse; never remint over surviving state; winning identity/custody retained | [Phase-two custody component](./custody.md) exercises concurrent creators, authenticated intent resumption and partial-state refusal; phase three adds resumable content initialization and missing-counter/database refusal. Full other-carrier census remains owed | Adapter + browser: every creation boundary, Local without account, losing creator obtains valid winner unlock |
| C11 / SC-07 | Content deletion blocked/refused; later journal deletion fails; kill each phase | Preserve WAL/keys/index before content success; resume scoped clear; terminal marker prevents resurrection | [Phase-four journal evidence](./storage-conformance-runs/2026-09-08-journal.md) exercises flush cleanup only: content abort, post-commit death, changed/refused cleanup and later-chunk failure retain needed entries. Authorized workspace clear, terminal markers and key/index retention remain owed | Adapter + browser: deleteDatabase blocked/error, quota/failure on progress writes, slot/shared-key isolation |
| C12 / SC-08 | New Local/Account genesis without confirmed factor; wrong factor or absent PRF | No persistent acknowledgement before custody; valid code unlocks offline; login cannot bypass | [Phase-two custody](./custody.md) adds confirmed code, sealed keys, cold unlock, counters and cancellation. [Phase-four journal](./journal-store.md) derives its raw subkey only under that factor-unlocked lifetime; actual onboarding and all persisted paths remain owed | Adapter + browser: actual onboarding/unlock and all persisted credential/cache paths |
| C13 / SC-08 | Copy complete profile, attempt local replay and future reader wraps without factor | No usable opener; valid-factor control succeeds; planted promptless opener is detected | [Phase-two copied-profile controls](./storage-conformance-runs/2026-09-08-custody.md) include external-factor success and planted promptless root recovering content/future-receiver probes; full production receiver and supported population remain owed | Browser: supported profile/authenticator matrix, positive controls and current/future credential inventory |
| C14 / SC-03/08 | Pre-migration copy, paused writer, interrupted custody/receiver/generation transition | Protection pending until completion; old history remains readable; old receiver cannot get successor | Existing transition vectors/model are partial; phase three exercises the independent IDB generation fence by deliberately bypassing the lifecycle barrier, without successor activation | Adapter + browser: certified replacement, no-PRF path, remote observation lag and every local interruption |
| C15 / SC-09 | Duplicate key/store_id/counter and advance both below local ceiling | Shared key's total exceeds one counter; no claim that clones are detected | Arithmetic clone counterexample; phase-three allocator covers concurrent/abandoned reservations and ceiling refusal. Phase-four chunk retries retain uncommitted journal entries; phase-five forced retry retains its original candidate and consumes a new content reservation. No supported writable import or clone detection performed | Adapter: supported import mints fresh key scope; custody-seal retries/purposes all reserve under the root; no restored writable counter; raw-clone exclusion recorded |
| C16 / SC-01/06 | Start transport/actor repair before local load, or reopen existing legacy as fresh | Complete replay/classification precedes application writes and transport; preserve active legacy routing | Yjs empty merge does not erase content; the old openStore comment is corrected. [Phase-six editor](./editor-admission.md) mounts its real view/channel only after admission recovery. Complete identity/startup actor repair/import and legacy routing remain owed | Adapter + browser: actual startup repair/import paths and seeded legacy routing |

## Harness and mutation requirements

One adapter contract must expose actual store lifecycle and controlled boundaries, not reimplement the
protocol inside a test double. Inspect canonical editor content, ordinary export/undo and transport
output as well as durable bytes. Replay offline after valid factor unlock. Capture every localStorage,
IndexedDB, derived-index and custody carrier by scoped identity; assertions inspect semantic CRDT state,
exact removed records and remaining opener references.

Run the original losing schedule against a mutant that omits each relevant guard: ignore writer pins,
reuse a pre-crash census, apply receive before commit, allow a pending predecessor bypass, delete by
range, count unreadable content as covered, remint partial genesis, clear WAL on refused content deletion,
retain a promptless receiver, or restore a copied writable counter. The suite must detect the mutation;
a green happy path alone is insufficient. Browser tests use disposable profiles and include actual
freeze/termination, not just a simulated delay or graceful `destroy()`.

## Gates and remaining measurements

L-1 completion requires the storage/admission/startup/clear/custody production cases applicable to its
carrier and the seeded legacy cutover matrix. L-2/L-3 additionally require the transition, accepted-head,
receiver and all-reference lifecycle compositions. L-4 retains support-population, performance,
authenticator, copied-profile and external-review gates. Stage 2's real-data cutover remains separate.
The storage conformance debts are registered in `docs/review/remediation/debts.json`; this matrix or a
passing byte-rule check is explicitly not payment.

Measure local journal seal/encode/append against the existing **under-1-ms p95** low-end target. Measure
remote receipt-to-visible latency, pending bytes, cold-start unlock costs and delayed-transition retention
on the declared support population. Remote-display and unlock limits require measured product disposition
before release; no timings in the abstract model are treated as browser performance.
