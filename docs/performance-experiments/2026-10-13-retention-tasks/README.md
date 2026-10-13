# Budget remaining retention preparation tasks — 2026-10-13

Base: signed **`127fcf2a`**, private evidence reuse. The candidate is the uncommitted source captured
in [source-identity.json](./source-identity.json). Retention remains private; no public flag,
deployment, stored format or release-validation campaign changed.

## Attribution and repair

The [prospective protocol](./protocol.md) first aligned the preceding CPU-4x capture with its longest
main-thread events: 433/450 ms in self-receive projection, 349 ms in replay comparison/source selection,
and 214 ms in summarization. The new matched reference confirms the attribution with Long Tasks
observer timestamps aligned to the CPU trace: 483/427 ms, 346 ms and 217 ms respectively. Inclusive
sample counts overlap and must not be added.

The [continuation contract](../../account-local-retention-preparation-tasks.md) retains the existing
self-projection algorithm in a generator shared by synchronous and cooperative callers. Cooperative
callers yield between positions, retain decoded buffers privately and erase them if interrupted.
Summarization, source selection and complete outstanding-obligation comparison also check the guarded
CPU budget between records. This changes scheduling, not verification or which obligations are kept.

Full fresh authority checks, exact inventories/deletion proof, reservation burns, the journal-era and
activity fences, atomic exchange, authenticated readback and independent replay remain. No yield was
added inside the native transaction. Input cancels preparation before mutation, journals before apply,
and keeps the live document and UndoManager. Final exchange/readback still holds input admission.

## Matched observations

The same closed **1,201 accepted own-position / 8,439-row** IndexedDB fixture is cloned per observation.
It contains two cards and 12,559-character Goals, with synthetic credentials and an independent
acceptance oracle. Three alternating unprofiled pairs:

| Order | Build | Total ms | Preparation ms | Final fence ms | Maximum reported task ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Reference 0 | 5,434 | 5,168.5 | 261.6 | 101 |
| 2 | Candidate 0 | 5,584 | 5,324.5 | 255.8 | <50 |
| 3 | Candidate 1 | 5,561 | 5,302.2 | 255.1 | <50 |
| 4 | Reference 1 | 5,388 | 5,116.2 | 268.5 | 100 |
| 5 | Reference 2 | 5,551 | 5,265.4 | 281.1 | 103 |
| 6 | Candidate 2 | 5,562 | 5,216.8 | 342.0 | <50 |

The Long Tasks observer reports nothing below its 50 ms threshold: zero in the raw summary means
**no reported long task**, not zero work. All three candidates have no reported long task, against
3/4/4 in their reference counterparts. Median maximum therefore falls from 101 ms to below 50 ms,
exceeding the predeclared 30% local target. Median total rises **5.434 → 5.562 s (2.4%)**; median
preparation rises **5.169 → 5.302 s**. The repair improves responsiveness, not total work. Candidate
2's 342 ms fence is retained; it is outside the preparation change. Maximum unprofiled timer gaps
are **103–108 → 37–43 ms**.

The separate profiled CPU-4x pair:

| Measure | Reference | Candidate |
| --- | ---: | ---: |
| Total | 24.704 s | 25.417 s |
| Preparation | 23.992 s | 24.654 s |
| Final fence | 700.1 ms | 752.4 ms |
| Maximum reported task | 483 ms | 97 ms |
| Reported task count, whole collection window | 11 | 8 |
| Maximum timer gap, whole collection window | 918 ms | 844 ms |

Maximum task falls **79.9%**; total rises **2.9%**, below the predeclared 20% investigation threshold.
The predicted 150–250 ms remaining CPU-4x maximum was conservative for this observation. The aligned
candidate preparation tasks now top out at **97 ms** (about 95 ms inclusive in the planner's inventory
clone), followed by 58/51 ms coverage construction/Yjs application, a 54 ms initial capture and 50 ms
cleanup. Final census/comparison/native materialization also remain. This does not make conversion
transparent or establish a phone result.

Timer, crypto and work collection includes profiler startup/drain and 50 ms after conversion. The
large profiled timer gaps cannot be assigned to a preparation loop from those aggregate numbers;
use the separately aligned task spans for that attribution. Profiles and their collection overhead
are not pooled with the unprofiled observations.

## Integrity and input controls

All **eight conversions** cold-recover exactly. All **three preparation-time input interventions**
cancel before mutation, preserve journal-before-apply and undo/redo, and cold-recover exactly. Their
handler-to-admission times are reference CPU-1x **10.0 ms**, candidate CPU-1x **10.7 ms**, and candidate
CPU-4x **41.4 ms**. They do not measure a physical key arriving while JavaScript is already blocked.

All six unprofiled observations have identical work and native crypto counts: **14** scoped authority
checks, six delivery/inbound verifications and censuses, 2,402 delivery prefix links, 13,376 source
parses, 4,834 imports, 2,416 derivations, 10,852 decryptions, 9,638 signature verifications, 26,485
digests and three MAC signatures. The profiled reference has one extra native signature verification,
whose source is not established; the candidate has an additional post-conversion warm audit of
16 rows / 63,079 bytes. Other scoped counters match. No authentication was removed.

Focused checks:

- **154 unique unit cases exercised.** The initial ten-file run passes 153; the large encrypted-anchor
  test hits its unchanged five-second timeout during concurrent seeding/checks. Its isolated 32-test
  file rerun passes unchanged. Both logs are retained. The new controls interrupt self projection
  before coverage, prove decoded-buffer cleanup and caller isolation, retry fresh, preserve partially
  consumed sources, and reject a changed obligation beyond the next batch. Existing retirement
  controls prohibit signing/installing after invalidation.
- **18 native controls pass:** atomic abort/crash/retry, exact inventory, late rows, input during
  preparation/final fencing, freeze/close/resume, old network reads, journal-era restore and undo.
- **Two packaged lifecycle journeys pass** (original/joined rotation, replacement and detached editing).
  The third, checkpoint installation plus repeated cuts/cold open, initially fails: after the editor
  is visible, checking history returns the joined device to the chooser. The retained error context
  does not expose why the owner closed. Three diagnostic repetitions and two unchanged-application
  repetitions then pass with the same assertions and timeouts. Diagnostic logging changes timing;
  the other two runs retain a trace only on failure. No lifecycle fix or timeout increase was made.
  **The original failure remains unexplained**, not dismissed as host load or declared repaired.
  This is not a completely clean lifecycle validation result; it remains a private activation hold.
- TypeScript, focused lint/format, disposable ordinary Vite build, Yjs patch/runtime, origin scan
  (56 built files) and **138.4 kB / 350 kB** initial-JS budget pass.

The packet retains the initial lifecycle log/context, temporary diagnostic patch/log and unchanged
rerun log. Its initial run overlapped fixture seeding and other focused checks; the five follow-ups
ran after all measurements. That difference limits attribution and does not establish a cause.

## Reproduce and provenance

Host: Apple M1 Pro, 32 GiB, Node v26.11.1, Chromium 151.0.7922.34. Sample-entry one-minute load ranges
from 5.69 to 10.67; external host/VM activity was not controlled. Unit/native/lifecycle checks ran
during fixture seeding, then stopped before all timed observations. Diagnostic lifecycle runs began
only after the benchmark completed. These are repeated observations of one fixture on one host,
not independent users or population latency percentiles.

The reference bundle is the preceding packet's candidate, matching signed `127fcf2a`; its SHA-256 is
`9a86d1bf20888dfcdd6967fe0365b61138c10b202773aba647805b6a07515719`. The candidate bundle is
`b8e7c1ddb5d41b77fd42712d300a6456553e8a12ffa3aede4842a0cabaf90293`. The source hashes and patch
identify the measured runtime. Synthetic row contents include randomness, so rebuilding a fixture
reproduces its shape and assertions rather than the same ciphertext.

```sh
mkdir -p /tmp/retention-task-rerun
gzip -dc docs/performance-experiments/2026-10-13-retention-tasks/evidence/reference-bundle.js.gz > /tmp/retention-task-rerun/reference.js
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 \
  DEPTH_OUT=/tmp/retention-task-rerun CUT_REFERENCE=/tmp/retention-task-rerun/reference.js \
  node --experimental-strip-types --test docs/performance-experiments/2026-10-13-retention-tasks/probe/cut.mjs
python3 docs/performance-experiments/2026-10-13-retention-tasks/probe/summarize.py /tmp/retention-task-rerun/results.json
python3 docs/performance-experiments/2026-10-13-retention-tasks/probe/fenced-profile.py /tmp/retention-task-rerun/candidate-4x-0.cpuprofile
python3 docs/performance-experiments/2026-10-13-retention-tasks/probe/tasks.py /tmp/retention-task-rerun/candidate-4x-0.cpuprofile
```

[summary.json](./summary.json) retains ranges and work counts. The evidence directory contains frozen
bundles, raw numeric results, profiles/traces, task attribution, focused logs and the initial retained
capture; [manifest.json](./manifest.json) hashes all packet files. Native traces and scripts use only
synthetic fixtures. Public trigger/cadence, capacity behavior, compatible reader-first rollout/rollback,
phone evidence and general release validation remain separate.
