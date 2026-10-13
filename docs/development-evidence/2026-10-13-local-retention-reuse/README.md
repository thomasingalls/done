# Private reduced-owner reuse evidence — 2026-10-13

Base: signed **`72d1b8bf`** (`G`). The new implementation is uncommitted; `manifest.json`
identifies final source files and compressed evidence. [Contract](../../account-local-retention-reuse.md).
All accounts, writing, keys and removed rows are disposable fixtures. No publication, service change,
personal-profile conversion or release qualification. Test durations on this busy host are not latency
measurements, and these counts do not establish a speedup.

## Focused results

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaselineWarm.test.ts test/localBaselineReuse.test.ts test/localBaseline.test.ts test/localBaselineLifecycle.test.ts test/localRetentionStorage.test.ts test/warmContent.test.ts test/verifiedRecords.test.ts test/incrementalLedger.test.ts test/finalApplyGate.test.ts test/admissionQueue.test.ts`
  — **191 tests in ten files pass**, `unit-final.log.gz`. Twenty new tests exercise actual reduced
  carrier reuse and real protocol continuation: reservations, owned appends, caller isolation,
  unallocated source coverage, changed rows/authority, closed/late results, corruption of chunks/keys/
  pointer, failed writes, elapsed/row audit deadlines, full-reference disagreement and interruption.
  One property runs eight seeded histories (seed `131026`, 2–8 own/peer actions), checking every
  incremental result against independent full baseline replay and then mutating caller copies.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 node --test test/local-baseline/removal.native.mjs`
  — **14 native Chromium cases pass**, `native-final.log.gz`. Thirteen retained removal cases cover
  exact atomic abort, renderer death, old/new journal pairing, lost reply/readback failure, expected-
  revision retries, live undo, journal-before-apply, retired flights, old readers and unpublished
  originals after cold open. The new case observes actual warm loads through flush/publication and
  full replay after resume. `ACCOUNT_AUTHORITY_REUSE=1` also enables numeric diagnostics here.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts lifecycle-owner.spec.ts removal-checkpoint.spec.ts`
  — **three packaged journeys pass**, `lifecycle-final.log.gz`: original/joined owners, initial and
  later admission, two rotations, offline current-key retry, interrupted custody activation,
  detached editing, repeated cuts, checkpoint installation, two-way delivery and undo/redo.
- Complete-history controls: `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test --test-name-pattern='logical recovery|ordinary|recovery|journal|undo' test/local-baseline/owner.native.mjs`
  — 12 passing, two failing and one intentionally skipped in `complete-initial.log.gz`; both failures
  pass on the corrected source with `--test-name-pattern='era boundary rejects late|exact dry run is read-only'`
  (`complete-repair.log.gz`). Thus **all 14 selected enabled controls have passing evidence**; this is
  not a clean rerun of the entire selection. See the correction record below.
- `node --test --test-name-pattern='ordinary Account workspace exposes no installer' test/local-baseline/owner.native.mjs`
  — **one ordinary-owner negative control passes**, `ordinary.log.gz`.
- TypeScript, focused lint/format, Yjs patch check, ordinary application build, initial JS budget
  and origin isolation pass. Initial JS remains **138.3 kB gzip**, below the 350 kB budget.

The final unit run includes the later oracle-tail and comparison controls. The native work-count
and lifecycle runs precede that final audit-tail guard; the guard itself is exercised by the new
unit case. No timing numbers are pooled between these runs.

## Work-count result

`work-counts.json` is extracted from the independent focused native work-count run (`counts.log.gz`).
It observes one real reduced owner after warming its post-removal origin, then three status reads,
one journalled edit, flush and publication, followed by page resume:

| Counter | Flush/publication delta | Resume delta |
| --- | ---: | ---: |
| Warm loads | 45 | 0 |
| Unchanged baseline reuse | 39 | 0 |
| Incremental baseline extensions | 6 | 0 |
| Full baseline replays | 0 | 1 |
| Physical rows fully loaded | 0 | 7 |
| Fresh authority checks | 110 | 4 |

These checks still authenticate current authority; they do not replace it with a cached permission.
The test asserts zero full-replay/loaded-row growth during the measured operation and positive
reuse/authority counts. Exact operation counts are observations, not fixed scheduler requirements.
The final 14-case run independently passes those same assertions.

## Corrections and limits

- The first packaged run failed both rotation journeys: the added authority identity pin was also
  applied to one-shot lifecycle readers, whose `installedMembership(counter)` constructs equivalent
  objects each time. Stable object identity is now required only for the live warm owner. A new unit
  control covers reconstructed one-shot evidence, and both journeys plus the checkpoint journey
  pass. Initial failure output is retained as `lifecycle-initial.log.gz`.
- Two complete-history tests rebuild their bundles during execution. They encountered a temporary
  transaction-scope typo while this source was being edited: the ordinary warm shape transaction
  omitted `meta`, producing `NotFoundError` before anchoring. The guard again always includes `meta`;
  only the rolling row audit conditionally includes it. Both tests pass on corrected code, and the
  final storage/unit checks pass. The initial output remains in `complete-initial.log.gz`.
- An early zero-read unit assertion included the first load after removal, which deliberately clears
  its predecessor cache. The fixture now warms once before starting the warm-operation observation.
  This was a test-boundary correction; cold opening still reads and verifies everything retained.
- Public conversion remains disabled. Complete v3/v4 owners still run their physical oracle, and
  one-shot lifecycle readers remain full readers. Generic reduced compaction remains fenced.
- Changed-view projections still copy retained logical data; index-size fallback and full semantic
  audits still cost work proportional to the retained origin/suffix. This phase does not establish
  a maintenance pause bound or constant-time count/bounds queries.

Next: controlled growth/cost measurements, followed separately by reader-first publication/rollback
and supported capacity/history-required behavior before converting any real profile.
