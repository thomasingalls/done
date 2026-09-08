# Encrypted-store conformance matrix

**Status:** current implementation acceptance plan · **Updated:** 2026-09-08.
Requirements are [storage-contract.md](./storage-contract.md), PRD §§7.1–7.2/7.10 and TRD
§§6.1/6.5/13.3/13.7. This matrix records **evidence classes**, not a claim that production conforms.
The next implementation step is one shared harness invoking each candidate through production adapters.
Candidate-specific suites and byte vectors remain useful, but are not a substitute for that harness.

## Reading evidence

- **Model:** explicit abstract state/schedules; proves only the represented finite cases/assumptions.
- **Component:** actual Yjs or cryptographic primitive behavior; no persistence/UI integration implied.
- **Adapter:** actual production open/admit/receive/trim/clear/custody paths with controlled storage failures.
- **Browser:** isolated real profiles with lifecycle, complete storage and supported platform behavior.

`test/storageContract.test.ts` supplies model/component counterexamples. The earlier
`test/storageSchedule.test.ts` and `test/writeAdmission.test.ts` remain partial Stage 0 evidence:
they do not certify the new writer lifetime, offline causal closure or factor-genesis rules.
**Every adapter/browser obligation below is pending** until the shared harness runs it and records its
candidate revision, executed path, fault schedule, assertions and result. No document check pays one.

## Required scenarios

| ID / requirement | Counterexample or schedule | Acceptance oracle | Existing/new evidence here | Required production evidence |
| --- | --- | --- | --- | --- |
| C01 / SC-01–02 | Receive remote R in memory; append dependent local L; kill offline | Acknowledged L and its semantic basis recover without redelivery; no promotion before receive commit | Yjs component: missing predecessor and corrected order | Adapter + browser: actual receive/editor path, kill at receipt/commit/promotion/WAL boundaries |
| C02 / SC-02 | Remote deletion with unchanged state vector; local input; kill | Deletion effects survive; vector equality cannot stand in for coverage | Yjs component: omitted delete changes replay | Adapter: delete-only and unresolved struct/delete-set cases |
| C03 / SC-01–02 | First local edit refuses journal; second could journal; delayed commit | Second cannot bypass first; ordinary editor/export/undo/transport retain accepted state only | Historical admission model covers one refusal, not this composition | Adapter + browser: real CodeMirror, IME, undo, paste slices, export and transport; kill before forced completion |
| C04 / SC-03–04 | Freeze tab caching g; transition tries retirement; tab appends then dies | Transition waits for live permit; recover late WAL before retiring g | New finite model with WAL generations, cached keys and ignore-pins mutant | Browser: real freeze/resume, page/process death, workers, stale async callbacks and supported-version cutover |
| C05 / SC-03–04 | Kill transition actor after each durable phase; allow a writer in released-lock gap | Reacquire, reread current carriers, preserve openers; no stale census reuse | Not modeled by the finite pin probe | Adapter + browser: all phases, all reference classes, two concurrent transitions |
| C06 / SC-04 | Two rotations, newest checkpoint lost; unknown journal/package reference survives | Fallback remains openable; unknown reference blocks retirement | Earlier Stage 0 fallback model is partial | Adapter: checkpoint/suffix/package/outbound/accepted/wrap references combined with WAL and writer pins |
| C07 / SC-05 | Reserve 1,2,3; commit 1,3; snapshot 4; commit 2; trim | Delete precisely covered {1,3}; recover 2 | Yjs component counterexample; late-range-delete mutant fails | Adapter + browser: concurrent writers, delayed reservation, concurrent trims and record-byte replacement |
| C08 / SC-05 | Tab A snapshots its own document while disk contains B | Replacement includes every deleted record's update | Prior comparison found candidate-specific failures; no receipt imported as shared conformance | Adapter: production trim, reopen semantic union, drop-own-tab-only mutant |
| C09 / SC-05 | Corrupt persisted record/journal before load, during trim or between snapshot/delete | Typed repair-required; no ordinary open/transport/trim; carriers and needed keys retained | Matrix disposition; no production claim | Adapter: corrupt/unsupported/missing-key cases, whole-trim refusal, safe diagnostics, unrelated-store isolation |
| C10 / SC-06/08 | Partial identity/custody/counter/marker/journal; two competing creators/factors | Resume verified intent or refuse; never remint over surviving state; winning identity/custody retained | Matrix disposition | Adapter + browser: every creation boundary, Local without account, losing creator obtains valid winner unlock |
| C11 / SC-07 | Content deletion blocked/refused; later journal deletion fails; kill each phase | Preserve WAL/keys/index before content success; resume scoped clear; terminal marker prevents resurrection | Matrix disposition | Adapter + browser: deleteDatabase blocked/error, quota/failure on progress writes, slot/shared-key isolation |
| C12 / SC-08 | New Local/Account genesis without confirmed factor; wrong factor or absent PRF | No persistent acknowledgement before custody; valid code unlocks offline; login cannot bypass | Existing row-13 vectors cover seal bytes only | Adapter + browser: actual onboarding/unlock and all persisted credential/cache paths |
| C13 / SC-08 | Copy complete profile, attempt local replay and future reader wraps without factor | No usable opener; valid-factor control succeeds; planted promptless opener is detected | No complete copied-profile test here | Browser: supported profile/authenticator matrix, positive controls and current/future credential inventory |
| C14 / SC-03/08 | Pre-migration copy, paused writer, interrupted custody/receiver/generation transition | Protection pending until completion; old history remains readable; old receiver cannot get successor | Existing transition vectors/model are partial | Adapter + browser: certified replacement, no-PRF path, remote observation lag and every local interruption |
| C15 / SC-09 | Duplicate key/store_id/counter and advance both below local ceiling | Shared key's total exceeds one counter; no claim that clones are detected | Arithmetic model counterexample, no billions of encryptions performed | Adapter: supported import mints fresh key scope; custody-seal retries/purposes all reserve under the root; no restored writable counter; raw-clone exclusion recorded |
| C16 / SC-01/06 | Start transport/actor repair before local load, or reopen existing legacy as fresh | Complete replay/classification precedes application writes and transport; preserve active legacy routing | Yjs component: empty replica merge alone does not erase content | Adapter + browser: actual startup repair/import paths and seeded legacy routing |

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
