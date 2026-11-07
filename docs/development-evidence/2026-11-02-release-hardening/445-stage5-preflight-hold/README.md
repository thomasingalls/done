# Stage 5 preflight hold — phase 445

The operator resumed Stage 5, then explicitly accepted the unchanged application
checkpoint from 432–436 and narrowed the preflight. The initial broader launcher
completed its already-active command before interruption; all outputs remain.
This is an operator-directed stop of that launcher, not an app test failure.
The fixed CPU/swap retry rule and clear-machine handshake were declared before
any timed matrix result. The original 36 blocking and 10 report-only journeys
remain declared; **none has started**.

## Completed preflight

| Check | Result |
|---|---|
| Typecheck | Pass |
| Unit suite | 330 files; 3,210 pass, existing one skip; 137.46 seconds |
| Lint | Initial 1,213 errors in three archived files; approved exact three-path exclusion; normal `pnpm lint` passes |
| Inventory/policy | Pass; existing checks and limits retained |
| Power-window dry run | Pass; 231 bytes stored from a 3,925,451-byte full log, with full hash/size and exact in-window timestamps |
| Frozen release build | Pass; unchanged package build script, explicit release flags, no lab/observation markers in shipping assets |
| Fresh three-device seed | Pass, 26.9 seconds |
| Fairness known-backlog normal | **Fail: sparse items 20/40 visible, 60 absent before hot writing stops** |
| Remaining fairness / past-index | Not run after the stop |

The copied-context `pnpm build` launcher first attempted a dependency reinstall
and aborted before compilation. That failure is retained. The exact package
build script then passed directly with pinned existing tools; no install or
runtime-source repair was used. Separate committed test-only builds exercise
fairness and the index ceiling; they are not shipping assets or timing credit.
The original Chrome 156.0.8078.80 executable is available at its frozen path with
matching SHA-256 for future timings. Functional preflight uses the same installed
Playwright Chromium151as437/441.

## Failure and stop

The unchanged positive case schedules 90 hot edits at 500 ms and sparse offers at
keys 20, 40 and 60. The required sparse liveness assertion fails; four remaining
fairness cases were not run. Later full-archive, Undo and ordinary offline cold
assertions were not reached. This does not establish durable data loss or owner
closure, and no cold success is claimed.

The fixed noise predicate is **false**. Across 20 five-second host samples,
Firefox exceeds one core only once (111.3%); there is no sustained interval over
ten seconds. Swap falls from 16,520.31 to 16,512.31 MiB, with no increases.
Do not invoke the noise-rerun exception or replace the failed result with a pass.
A next bounded diagnosis must explain the sparse publisher's delay before the
preflight and timing matrix can resume. No app code, case body, assertion, wait,
gate, limit, trust or sender policy is changed in this phase. Only the explicitly
approved lint-scope configuration and bookkeeping change.

[Evidence](./evidence.json) references tracked source by exact commit/path and
identifies local run artifacts by SHA-256 and size without copying their source
or full power logs into the repo. All earlier roots and failed attempts stay
intact. No profiler, new lab phase, timed gate, commit, push or deployment occurs.
Stage 6 still lacks a completed matrix and has no landing verdict.
