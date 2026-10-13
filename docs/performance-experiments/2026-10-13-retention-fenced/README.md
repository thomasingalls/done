# Final retention fence: attribution and grouped exact removal

2026-10-13. Base **signed `f89ee3f9`** (`G`), which commits the preceding preparation-handoff phase.
The selected runtime and this packet are uncommitted at capture. This is private authenticated local
retention work; public activation and general release validation remain paused. No personal data,
service, image or deployment changed.

**Result:** at 1,201 accepted own positions / 8,439 physical rows, three matched desktop pairs reduce
median final admission fence **1,030 → 473 ms (54%)**, primarily by reducing the replacement exchange
**621 → 99 ms**. Full conversion is **6.251 → 5.458 s**. Longest foreground tasks are essentially
unchanged (**104 → 102 ms** medians). One profiled CPU-4x pair gives **1.898 → 1.564 s** fenced and
**25.961 → 24.742 s** total. This is useful but not transparent background maintenance.

## Mechanism and preserved contract

See the [contract](../../account-local-retention-fenced.md) and
[prospective protocol with the dated-in-sequence amendments](./protocol.md).
Preparation remains outside admission; final mutation and authenticated readback remain fenced.
The complete fresh authority checks, journal-empty/activity checks, reservation burns, era change,
old-read retirement, independent replay, caller isolation and live document/UndoManager are unchanged.

The only selected behavioral change is grouping physical deletion: after the strict transaction's
full byte-for-byte census match and private plan checks, independently prove that every physical
logical key appears exactly once in the deletion plan. Only then clear those completely covered
logical stores. Unknown, omitted, duplicate, substituted or late keys refuse. The metadata store is
never cleared, and a future partial-cut plan cannot authorize this operation. This expressly replaces
the old per-key database-operation rule, while keeping its enumerated coverage proof. All four stores
still change atomically. There is no explicit commit, range/sequence inference or partial deletion.

## What the first profile found

An instrumented current-build conversion took 6.131 s, including a 1,021.5 ms final fence. Fixed-name
User Timing spans in the trace share Chromium's monotonic clock with the CPU samples. The parser in
`probe/fenced-profile.py` clips sample intervals to each span. Profiled wall times include awaited I/O;
inclusive/nested times must not be summed.

| Final subphase | Initial profile |
| --- | ---: |
| Plan inspection copy in content owner | 40.1 ms |
| Preflight raw inventory / comparisons | 37.0 / 28.0 ms |
| Adapter evidence copy / expected-inventory copy | 33.3 / 16.8 ms |
| Reservation exchange | 72.5 ms |
| Replacement exchange | **644.8 ms** |
| ↳ census / comparisons / issuing writes | 41.8 / 23.7 / 22.5 ms |
| Raw readback + equality | 16.0 ms |
| Authenticated load / independent replay | 44.7 / 6.7 ms |

Approximately 557 ms of replacement is outside those three measured components, including native
request processing/settlement and cleanup. CPU samples there are mostly idle/program; they do not
identify the database backend's internal algorithm. The isolated grouped-write result supports request
volume as the practical lever. It does not establish that success-event dispatch itself caused the wait.

## Rejected first candidate: explicit commit

We first called `IDBTransaction.commit()` after all exact checks/writes, keeping strict durability and
normal completion/abort ownership. The [IndexedDB commit contract](https://w3c.github.io/IndexedDB/#dom-idbtransaction-commit)
allows commit without waiting for request-success dispatch; pending request failures still abort.
This candidate did not meet the prospectively stated 20% fence-improvement threshold:

| Pair | Reference fence | Explicit-commit fence |
| --- | ---: | ---: |
| 1 | 1,012.7 ms | 972.1 ms |
| 2 | 977.7 ms | 983.4 ms |
| 3 | 1,009.4 ms | 1,027.0 ms |

The medians differ by only 2.6% and overlap. The exploratory 4x pair is 1,966.9 → 1,945.4 ms. We removed
explicit commit before the grouped-removal run. Its frozen bundle, runtime patch, complete numeric
results, profiles/traces and logs are retained. Its 11 existing transaction unit tests passed; it did
not undergo the grouped candidate's native/lifecycle controls and is not claimed qualified.

## Selected candidate: matched observations

Each pair uses clones of the same closed, genuine native IndexedDB fixture. The order is R/C, C/R,
R/C. Both arms run the same instrumentation. This is one host and one synthetic account, with repeated
observations rather than independent users.

| Pair | Reference total | Grouped total | Reference fence | Grouped fence | Reference exchange | Grouped exchange |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6,251 ms | 5,458 ms | 1,029.6 ms | 485.9 ms | 654.4 ms | 98.9 ms |
| 2 | 6,162 ms | 5,696 ms | 1,001.9 ms | 463.2 ms | 620.7 ms | 98.6 ms |
| 3 | 6,377 ms | 5,450 ms | 1,038.6 ms | 473.1 ms | 621.4 ms | 100.3 ms |

Reference preparation spans 5,156–5,333 ms; candidate preparation 4,967–5,228 ms. That unchanged phase
also drifted, so do not attribute every millisecond of the total-duration difference to the repair.
The approximately 522 ms median exchange improvement is separately measured. Readback/equality plus
load/replay is 65–71 ms reference and 66–76 ms candidate; it was not weakened or optimized here.

Desktop reference maximum tasks are 104/103/104 ms, candidate 99/109/102 ms. The task counts are 6/6/6
and 4/4/5, respectively. This primarily improves logical queue waiting, not the worst CPU stall.

One same-session **profiled** CPU-4x pair (exploratory, not phone evidence):

| Outcome | Reference | Grouped |
| --- | ---: | ---: |
| Total | 25,961 ms | 24,742 ms |
| Preparation | 24,050.1 ms | 23,155.9 ms |
| Final fence | 1,898.1 ms | 1,564.1 ms |
| Replacement exchange | 757.3 ms | 293.4 ms |
| Readback + load + replay | 190.9 ms | 207.4 ms |
| Maximum foreground task | 475 ms | 423 ms |
| Maximum 10 ms timer interval | 887.4 ms | 828.5 ms |

The candidate's remaining fenced CPU includes **436.4 ms of three detached history copies** and
339.4 ms in the three measured comparison spans (each includes existing duplicate checks). These
are the next measured opportunities. Complete authority and baseline verification remain required.
No broad startup/sync/phone claim follows from this fixture.

## Work and correctness observations

All eight quiet cuts (six desktop + two 4x) remove exactly 8,439 rows, preserve the exact snapshot,
leave only encrypted baseline metadata, and cold-open identically. Across those cuts, observed native
calls are identical: 4,834 importKey, 2,416 deriveKey, 10,852 decrypt, 9,638 verify, 26,485 digest and
three sign calls. The scoped authority counter stays at **14**; this is not a census of every lower-level
custody check. Full replay/census/source metrics also match between arms (see `summary.json`).
The 4x candidate additionally records a 16-row / 63,079-byte warm audit in the observation window,
which includes the 50 ms post-cut collection interval; the other quiet observations record zero.
Do not treat all diagnostic counters as identical.

Three timed preparation interventions keep journal-before-apply, undo/redo and exact cold recovery.
Reference and grouped CPU-1x input admission take 9.4 and 10.6 ms; grouped 4x takes 37.4 ms. The cuts
skip without removal. These timer-triggered measurements start when the callback runs and exclude
any pre-handler blocking. The native held-crypto and final-fence controls separately test ordering.

## Focused checks

- **129 unit tests / six files:** retention storage, baseline, warm reuse, reuse, lifecycle and anchor.
  Five new malformed-deletion controls prove refusal before clear, preserving predecessor rows and
  burned reservation. Existing changed-row, late-key, authority, journal and seal-failure controls pass.
- **18 native controls:** atomic rollback after first clear; foreign low row after reservation refuses
  before any clear; renderer death after reservation and commit; exact retry; blocked queued input;
  preparation cancellation; lifecycle invalidation/close; journal crash boundaries; retired reads;
  old-reader fence; corrupted readback; restored old-era journal; unaccepted originals and cold replay.
- **Three packaged original/joined lifecycle/checkpoint journeys:** repeated cuts, two rotations,
  replacement, detached editing, interrupted activation, unfinished checkpoint refusal, retained
  installation, bidirectional writing and undo/reopen.
- TypeScript, focused lint/format, ordinary Vite build, Yjs patch/runtime checks, origin isolation
  (56 files), initial JavaScript **138.4 kB gzip / 350 kB budget**, and diff whitespace checks pass.

The controls/build ran during fixture seeding, and finished before the grouped timed observations.
No unrelated test campaign ran during timed observations. Host CPU/memory, load samples, Chromium,
Node and exact bundle identities are in the raw results. Other host/VM activity cannot be ruled out.
No inferential confidence interval is justified by three pairs.

## Reproduction and provenance

This packet's observations were generated in this session on disposable loopback fixtures. It does
not pool other agents' evidence. The 1,201 real accepted positions are seeded through the real owner,
synchronous journal, IndexedDB and outbound preparation. An independent Node/OpenSSL acceptance
oracle signs the service replies; this does not measure service throughput. The document has two
cards and a 12,559-character Goals text; subsequent accepted positions toggle one character. All
profiles, traces, raw numeric results and logs referenced here are included compressed in `evidence/`.
No profile database, credential/private key or real writing is saved in this packet.

The reference bundle is `f89ee3f9` plus numeric profiling; the final bundle includes grouped complete
removal. The discarded explicit-commit runtime patch also records the instrumentation. The exact
final source hashes are in `source-identity.json`; `manifest.json` covers all packet files except itself.
The frozen bundles are the authority for CPU-profile line numbers. The real runtime was unchanged
between the selected measured bundle and final focused checks; later changes were test/document text.

Run `probe/cut.mjs` with all four flags `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1
ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1`, `DEPTH_OUT` pointing at a scratch directory, and
`CUT_REFERENCE` pointing to the decompressed `reference-bundle.js.gz`. It builds the current candidate
and seeds the disposable fixture. Without a reference it profiles one current build. The initial
exploration used `CUT_WAIT_CANDIDATE` to hold the seeded fixture while inspecting the first profile,
then read an atomically written candidate bundle. Defaults: 1,201 positions, 15-minute seed ceiling,
120-second operation ceiling and 30-minute test ceiling. `fenced-profile.py` takes a `.cpuprofile` next
to its `.trace.json`; `summarize.py` takes a results JSON. Native checks use
`test/local-baseline/removal.native.mjs`; packaged checks use `playwright.local-baseline.config.ts`.

Retain this improvement privately. Initial conversion still has a material final wait and substantial
CPU-4x preparation. Next: reduce duplicate private evidence copying/comparison without exposing
mutable plan bytes or weakening exact transaction checks. Public reader-first compatibility/rollback,
capacity behavior, trigger/cadence and general release validation remain separate work.
