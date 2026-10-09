# Bounded legacy source-cleanup validation — 2026-09-09

**The native validation for authenticated, journal-inclusive source cleanup is complete for this bounded
seeded phase.** The user ran the exact command `pnpm storage:legacy-cleanup`; this checkpoint examines and
preserves that execution, without rerunning it. This does not close L-1, the full legacy-cutover obligation,
production old-writer exclusion or Stage 2.

The run began at `2026-09-09T19:38:40.141Z` and finished at `2026-09-09T19:43:35.445Z`: 295.304 seconds.
The unchanged [native report](./2026-09-09-legacy-cleanup/report.json) records `passed: true`,
`testsPassed: true`, `status: finished` and `inputsUnchanged: true`, with no failure, terminal error,
timeout or supervisor failure. It used Chromium `151.0.7922.34` on macOS.

## Executed evidence

| Check | Result |
| --- | --- |
| Directed native cases | 45 / 45 pass, including 16 deliberate renderer crashes |
| Baseline generated histories | 60 / 60 pass; seed 8941; no failures or shrinking |
| Previously failing history 21 | Same input hash as the archived `Field too long` failure; passes |
| Named fault controls | All seven detected by their designated assertions |
| Resource teardown | Context, Vite, browser client and browser server close operations finish without errors |
| Captured input identity | All 148 hashes match frozen baseline files and Git blobs at `3e7981b` |

Directed cases cover exact cleanup and repeated completion; invalid manifest preservation; journal-only source;
later destination journal flush and compaction; competing cleaners; authority refusals; eight transaction-abort
boundaries; database/progress/local-removal renderer deaths; missing, unreadable or dependency-incomplete
destination recovery; changed, unknown, missing or reappearing source; authenticated-progress tampering;
storage-removal refusal/exception; blocked native deletion and cancellation; imported Local clear before/after
cleanup, after custody-removal death, and after source reappearance.

Generated histories vary source content and DB/WAL framing, a later destination edit held in the encrypted
journal, observed transaction-abort boundaries, cold restart and changed retained source keys. The independent
Node ledger supplies expected destination text. All 60 histories reach their assertions. History 21's input hash
is `583abe5e5750a28dd9d3b9051de3ba2c3683b725c33df37fbeb968c063d5e4ed`, identical to the
[previous diagnostic](../../test/legacy-cleanup/regressions/field-too-long-2026-09-09/diagnostic.json).
It passes from `19:41:25.014Z` to `19:41:28.618Z`, exercising the repair within the full campaign.

| Deliberate defect | Detecting assertion |
| --- | --- |
| Skip manifest validation | `invalid-manifest-preserves-all-carriers` |
| Skip cold destination verification | `cold-coverage-refuses` |
| Ignore changed source value | `changed-value-refuses` |
| Sweep journals by prefix | `modern-journal-preserved` |
| Omit manifest authentication | `tampered-progress-refuses` |
| Omit destination journal from recovery | `pending-journal-refuses` |
| Forget source checks after Local clear | `clear-reappearance-refuses` |

The manifest control fails on its first generated input and shrinks twice to path `0:0:0`; the destination
control fails on its first input at path `0`, without shrinking. Their `first-failure` and counterexample files
are intentional control evidence. There is no baseline first failure. The 25 logged operation errors consist
of 16 intended renderer crashes and nine intended assertion failures (including two shrink trials).
No generic exception or timeout was credited as mutation detection.

## Provenance and preservation

Original output: `test-results/legacy-cleanup/2026-09-09T19-38-39.778Z`.
All eleven top-level artifacts are retained in [the archive](./2026-09-09-legacy-cleanup/provenance.json):
JSON files are byte-for-byte copies, and the complete event stream is preserved as a lossless gzip with fixed
mtime. The provenance file records original and copied byte sizes and SHA-256 hashes. The event stream is
available at [events.jsonl.gz](./2026-09-09-legacy-cleanup/events.jsonl.gz).

The report's starting commit is `4c3c3ab0cbb00e179133e59882466d68c1d340f3`. Harness instrumentation and
the repair were already present as working files when it started; they were committed while the campaign ran.
Before this documentation update, every `report.files` hash was independently compared with the frozen
baseline, current working file and Git blob at `3e7981b1c08f510a1507726e8bb31bd83cb35db6`; all 148 match.
The report retains its actual starting commit. Baseline snapshots can be reconstructed from that later commit
and verified against the report; variant patches live in its pinned `scripts/legacy-cleanup/campaign.mjs`.
The source snapshots are not duplicated in this archive.

## Closure and remaining scope

This run supplies the previously missing complete native directed/generated/control campaign. Together with
the [focused before/after repair evidence](./2026-09-09-legacy-cleanup-size-repair.md), it closes the bounded
source-cleanup validation checkpoint. The earlier incomplete/failed reports remain historical evidence.
No unit or native test is newly claimed as executed by this documentation checkpoint.

The harness controls synthetic predecessor contexts and known DB/journal/ancillary carriers. It does not
establish a production supported-version exclusion procedure, whole-profile or forensic residue removal,
cross-browser support, maximum-size memory/latency acceptance, independent review, the real carrier/attribution
choice or default application cutover. No obligation or debt is marked paid. The next bounded work is
[migration coordinator and restart preparation](../legacy-coordinator-preparation.md).
