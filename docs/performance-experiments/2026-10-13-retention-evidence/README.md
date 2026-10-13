# Retention evidence copies and comparisons — 2026-10-13

Base: signed **`eb2a3374`**, grouped exact atomic removal. Candidate: the uncommitted runtime
identified in [source-identity.json](./source-identity.json). Private retention switches only.
Release validation remains paused; no deployment or personal profile was changed.

## Decision and repair

The [prospective protocol](./protocol.md) selected three redundant whole-history copies and repeated
comparisons of a private plan against its own detached copy. It predicted a CPU-1x fence around
300–350 ms and CPU-4x around 900–1,100 ms; acceptance required at least 20% lower paired median
fence, retained verification work and passing boundary controls.

The [ownership contract](../../account-local-retention-evidence-reuse.md) keeps the planner's full
capture private. Final replay copies only the candidate. The adapter copies candidate/counters and
deletion keys. A reservation verifier captures only the new counter and binding; each invocation
rechecks the live plan and compares every old row/chunk using synchronously borrowed private bytes.
Every fresh census still gets one full exact comparison. No private row references escape.

Both strict transactions, exact independent deletion completeness, complete fresh authority,
journal/activity fencing, reservation burns, authenticated readback and independent replay remain.
Input during preparation still cancels before mutation. Input during exchange/readback remains fenced.
Live Y.Doc/UndoManager, journal-before-apply and old-or-new crash recovery remain unchanged.

## Same-session result

One genuine **1,201 accepted own-position / 8,439 physical-row** fixture, with two cards and
12,559-character Goals, is cloned into isolated browser contexts. Three alternating reference/candidate
pairs use identical closed storage. These are repeated observations on one fixture/host, not
independent users. Quiet means unprofiled here; host contention was not controlled.

| Run order | Build | Total ms | Preparation ms | Final fence ms | Replacement exchange ms | Maximum task ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Reference 0 | 5,988 | 5,480.9 | 499.8 | 98.1 | 112 |
| 2 | Candidate 0 | 5,511 | 5,251.5 | 254.8 | 71.0 | 103 |
| 3 | Candidate 1 | 5,397 | 5,039.4 | 354.2 | 64.0 | 100 |
| 4 | Reference 1 | 5,713 | 5,201.0 | 507.6 | 105.2 | 105 |
| 5 | Reference 2 | 5,680 | 5,215.1 | 461.9 | 96.6 | 101 |
| 6 | Candidate 2 | 5,519 | 5,250.6 | 264.7 | 71.0 | 108 |

Median final fence **499.8 → 264.7 ms (47.0% lower)**; median total **5.713 → 5.511 s (3.5%)**.
Median maximum task **105 → 103 ms** does not establish a meaningful task-size improvement.
Candidate 1's readback/load/replay interval was 133.1 ms versus about 68 ms in its other two runs;
it is retained, not excluded. Unchanged preparation varies by hundreds of milliseconds.

The separate profiled CPU-4x pair:

| Measure | Reference | Candidate |
| --- | ---: | ---: |
| Final fence | 1,330.7 ms | 696.7 ms |
| Three copy spans | 371.6 ms | 11.4 ms |
| Three inventory comparison spans | 327.2 ms | 153.1 ms |
| Replacement exchange | 210.1 ms | 156.1 ms |
| Raw readback + comparison + authenticated load + independent replay | 164.7 ms | 161.7 ms |
| Preparation | 21,879.0 ms | 23,189.7 ms |
| Total | 23,220 ms | 23,896 ms |
| Maximum task / timer gap | 431 / 797.5 ms | 449 / 810.5 ms |

The 47.6% fence reduction meets the intended local target. Total CPU-4x conversion got slower in
this pair because unchanged preparation took 1.31 s longer. The data do **not** support an overall
conversion speedup or reduced preparation stalls under CPU throttling. The prior packet's CPU-4x
reference fence was 1.564 s; this run's signed reference is 1.331 s, another reason to use the matched
comparison rather than combining runs. CPU-4x is not a phone measurement.

Aligned CPU samples put the reference fence's full inspection copies at 299 ms self time. Candidate
full inspection copies disappear; remaining self time includes exact/byte comparison, raw result
materialization and cleanup. Candidate preflight/reservation/replacement censuses total 237.8 ms;
their comparisons total 153.1 ms, with about 162 ms for successor readback/load/replay. Those retained
checks explain most of the remaining 697 ms. Nested spans include waits and are not additive.

## Work and correctness

All **eight quiet/profiled conversions** preserve the snapshot and cold-reopen exactly. All **three
input interventions** skip before mutation, journal before apply, retain undo/redo and cold-recover:
reference CPU-1x 10.3 ms, candidate CPU-1x 9.9 ms, candidate CPU-4x 36.6 ms from the intervention
handler to admission completion. These timings do not measure a key arriving during a long task.

All eight conversions retain **14 scoped complete authority checks** and identical scoped startup,
delivery/inbound verification, replay/census and source work. All six unprofiled runs have identical
native crypto counts: 4,834 imports, 2,416 derivations, 10,852 decryptions, 9,638 signature verifications,
26,485 digests and three MAC signatures. The profiled reference records one additional native verify;
its exact source is not established. The profiled candidate matches the six quiet crypto counts and
records an extra warm audit of 16 rows / 63,079 bytes. Collection includes profiler drain and 50 ms
after conversion, so these are whole-window observations, not per-operation assertions. All other
scoped work counters match. No authentication path was removed by the repair.

Focused checks:

- **134 unique unit tests:** six-file set of 133, followed by the 18-test storage file after adding
  the old encrypted-chunk control (one additional case). New tests cover detached narrow copies,
  reserved counter/binding snapshots, verifier/plan disposal, disposal during sealing and old-chunk
  mutation. Existing exact-inventory mutations also exercise the post-reservation verifier. The five
  malformed deletion-set controls now intercept the narrow material accessor and still refuse before clear.
- **18 native controls:** atomic abort, reservation/commit renderer death and retry, late low row,
  input during preparation and final fencing, close/freeze/resume, old-read retirement, journal-era
  restore/crash, readback failure, unpublished sources, undo/redo and cold reopening.
- **Three packaged journeys:** original/joined owners through rotations, replacement, detached
  editing, checkpoint installation, repeated cuts, two-way editing/undo and cold reopen.
- TypeScript, focused format/lint, ordinary disposable Vite build, Yjs patch/runtime, origin scan
  (56 built files), and **138.3 kB / 350 kB** initial-JS budget pass.

## Provenance, reproduction and remaining scope

Host: Apple M1 Pro, 32 GiB, Node v26.11.1, Chromium 151.0.7922.34. The 1-minute load at sample
entry ranges from 6.45 to 11.12. Other checks completed during seeding, before timed observations;
no other campaign from this task ran during them. External activity was not excluded. The fixture
takes most of the roughly ten-minute run to construct; seed time is not measured as conversion.
Neither small sample size nor changing host load supports tight uncertainty bounds.

[summary.json](./summary.json) preserves each arm's ranges, work and crypto counts.
[manifest.json](./manifest.json) hashes **included** logs, frozen bundles, raw results, profiles,
aligned User Timing traces, runtime/test diff, source identities and scripts. The frozen reference
matches both `eb2a3374`'s source hashes and the preceding packet's grouped bundle. Generated
credentials are disposable; personal writing and credentials were not used.

To repeat, decompress `evidence/reference-bundle.js.gz` into a temporary file, then from the repo root:

```sh
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 \
DEPTH_OUT=/tmp/done-retention-evidence-repeat CUT_REFERENCE=/tmp/retention-reference.js \
node --experimental-strip-types --test docs/performance-experiments/2026-10-13-retention-evidence/probe/cut.mjs
```

The probe's current candidate is built from the checkout. Use the source identity/diff to reproduce
this candidate. `probe/summarize.py` reads the resulting `results.json`; `probe/fenced-profile.py`
aligns each `.cpuprofile` with its matching `.trace.json` and writes `.fenced.json`.

Copies of bounded candidate data and history-sized deletion keys remain, as do the full private
capture and required fresh physical censuses. Initial preparation is still full-history work and
has material foreground tasks. This is a narrower final-fence repair, not transparent background
maintenance. The next responsiveness investigation should target those preparation tasks; a further
final-fence reduction would need a distinct design for its remaining census/comparison work. Public
trigger/cadence, capacity behavior, reader-first rollout/rollback and release validation remain gated.
