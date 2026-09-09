# Bounded journal contention repair — execution evidence, 2026-09-09

The core reproductions were committed as **a292103** before this work. This is repair **phase 1**:
[bounded journal snapshot acquisition](../journal-contention.md). Pending Yjs forks, projection divergence,
original-record ordering and migration remain subsequent work. This checkpoint remains uncommitted.

| Execution | Result | Evidence |
| --- | --- | --- |
| Native contention suite | 12 cases pass, including 100 generated read histories | [JSON](./2026-09-09-journal-contention.json) |
| Existing journal regression | 17 cases pass; six mutants detected | [JSON](./2026-09-09-contention-journal-regression.json) |
| Existing admission regression | 15 cases pass; six mutants detected | [JSON](./2026-09-09-contention-admission-regression.json) |
| Existing owned-startup regression | 15 cases pass; three mutants detected | [JSON](./2026-09-09-contention-startup-regression.json) |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. Native runs use actual factor custody, crypto,
IndexedDB, localStorage, Web Locks, the journal owner and workspace admission in disposable contexts.
Enrollment/receive authority is synthetic. Reports are byte-for-byte copies from
`test-results/journal-contention/{final,journal-regression,admission-regression,startup-regression}`.
Each run records its input hashes; source mutations execute only in isolated copies.

## Repair and tested boundaries

`loadRecovery`, `flushJournal` and journal initialization allow at most **three total read captures**,
including the invocation-time synchronous capture. Only `journal-changed` retries, with 0 ms then 8 ms
scheduling delays under the same task and permit. The budget bounds attempts, not wall-clock duration.
Later input stays behind the pending admission barrier. Failed captures never enter content reservation,
sealing, publication or cleanup. A successful capture executes the content operation once; a subsequent
content failure is not retried. Journal-first recovery and exact-value cleanup remain in place.

The two controlled cross-tab cases pause the first enumeration using CDP while an actual peer appends,
or commits and cleans captured entries. Both now finish without human Retry. The separate transient
workspace case confirms that queued input promotes after the barrier. Sustained churn stops at three
captures with `journal-busy`, no content seals and all four WAL entries retained. Later input remains
private; 750 ms produces no further attempt. Explicit Retry after quiet resumes it. Startup exposes
`busy` / `journal-read-contention`, distinct from damage and unavailable storage.

Cancellation tests extend only the retry timer to make close deterministic. Both flush and initialization
cancellation remove that timer, make no later capture/seal, clear key caches and permit another page's
exclusive slot acquisition. A real storage read failure after one changed capture propagates after two
captures; it is not retried. An unsupported journal frame refuses immediately. A native content transaction
abort after a successful replacement capture makes exactly two content seals once, retains both WAL
entries and publishes no content records. The unit suite additionally verifies that an observed replacement
of an immutable value latches repair-required, including a syntactically valid authenticated replacement.

The generated native alphabet varies zero through six peer appends and flush versus recovery, with
seed **8941**. All **100 histories** satisfy the read budget, exact seal accounting, retained-entry and
payload/count recovery checks; the accumulated final recovery contains **306 original no-op payloads**.
These payload/count checks do not establish arbitrary CRDT semantic fidelity. Generated churn uses a
reentrant peer append at enumeration; the distinct cross-tab cases establish the controlled native race.
The native runner saves a first failing history and stops without shrinking. Its simple churn alphabet
also has a **100-run shrinking unit property**. No generated failure occurred in the final execution.

| Focused mutant | Required detecting assertion | Evidence |
| --- | --- | --- |
| Remove retry | `transient-flush-completes` | [JSON](./2026-09-09-contention-skip-retry.json) |
| Increase capture budget to five | `contention-capture-budget` | [JSON](./2026-09-09-contention-exceed-budget.json) |
| Retry a storage failure after churn | `noncontention-error-not-retried` | [JSON](./2026-09-09-contention-retry-storage-failure.json) |
| Seal content before stable capture | `read-retries-do-not-seal` | [JSON](./2026-09-09-contention-seal-before-capture.json) |

All four are detected at their named assertions; unexpected exceptions/timeouts do not count. Their
unmodified scenarios pass in the baseline. Reports are copied from the corresponding mutant-named
directories under `test-results/journal-contention` and preserve original and mutated hashes.

## Development corrections and verification

The first unit property used the shared Node localStorage double, whose Map-backed keys do not enumerate
through `Object.keys`; this produced empty snapshots. The new unit fixture enumerates its stored keys.
A replacement-value test initially nested spies recursively; restoring the earlier spy corrected it.
The first native smoke run's two cancellation assertions mishandled DOMException's numeric `code` (20);
the fixture now uses string codes or falls back to `name`. That was a harness failure, not a production
cancellation failure. The final native run repeats both cancellation cases successfully.

The older journal disappearance fixture now commits both payloads before simulating delayed cleanup.
The new retry must recover both payloads, including the removed WAL entry through content. Deleting an
uncommitted entry would instead model arbitrary destruction and cannot test a conforming handoff.

Full Vitest passes **729 tests / 59 files**, including seven new tests. Typecheck, focused lint/format,
build/budget, vector/AAD and applicable project/governance/origin/WASM/traceability checks pass. Initial JS
remains **306.3 kB / 350.0 kB** gzipped. `storage:contention` joins the project check chain. The literal full
chain, geometry, separate editor/workspace/genesis/clear/trim/property browser campaigns and broader platform
suites were not rerun. The new native cases do exercise the actual workspace path, and the three existing
regression suites above were rerun in full with their controls.

All recorded production, fixture and runner hashes match the reviewed working files, and frozen candidate
hashes match the executed copies. One prose-only correction followed execution: `docs/journal-store.md`
still had an old sentence denying all timers/retries and excluding every post-invocation entry. It now
distinguishes read-retry delays from coordinator batching/content retries and describes replacement capture
coverage. Its frozen SHA-256 is `c9c5b800569ec87d16b9665c9b82681bdc2c8e4c86fa23bd29469781b5431152`;
its corrected SHA-256 is `500baa6fbe81d83b14429843655f859b7d7171c739a5dbf5a9c7c7621e588f54`.
Raw reports retain the original hash; runtime tests were not repeated for this prose-only correction.

## Remaining work

The earlier uninterrupted overlap and 3,200 simultaneous-keystroke investigation did not reproduce routine
journal contention on Chromium. CDP pausing changes scheduling; these repair tests establish behavior when
the reader observes churn, not a frequency claim or cross-platform guarantee. The synchronous compaction
journal preflight is not wrapped in a retry of the mutation operation. No retirement, generation transition,
OS/power-loss, hostile unlocked writer or supported old-version exclusion guarantee is added.

Phase 2 must address pending-fork preservation and canonical/editor/export agreement through later dependency
delivery, using the saved original-framing corpus and external semantic oracles. Text/vector equality only
at promotion is insufficient. No Yjs/projection code changes or further migration work are included here.
Matrix evidence and its three pins advance; obligations and debt statuses remain unchanged.
