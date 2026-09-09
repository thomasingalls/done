# Legacy cleanup failure evidence — 2026-09-09

The user ran exactly `pnpm storage:legacy-cleanup`. This records the completed portion of
`test-results/legacy-cleanup/2026-09-09T19-10-29.708Z`; it is not a successful campaign.
The frozen harness bytes are now committed as `6a5ebe7`; the tested runtime base was `4c3c3ab`.
The original report retains the run-time HEAD and individual tested-file hashes unchanged.

- All 45 directed cases passed, including 16 deliberate renderer deaths.
- Generated histories 1–20 passed; history 21 failed with `Field too long` in database fingerprinting.
- Fast-check attempted 44 shrink candidates: 22 passed, 21 hit the same exception and one exhausted
  the remaining shrink budget. No minimal counterexample or final fast-check path was produced.
- The two-minute shrink budget expired at 19:15:12 UTC. The final candidate had 1,018 ms remaining.
  Neither the ten-minute campaign cap nor the thirty-minute supervisor cap fired. Teardown completed.
- The seven fault controls were never reached.

The [confirmed input, exception, original report and provenance](../../test/legacy-cleanup/regressions/field-too-long-2026-09-09/README.md)
are committed byte-for-byte. The [complete event log](./2026-09-09-cleanup-failure-events.jsonl.gz) is losslessly
compressed; [artifact hashes](./2026-09-09-cleanup-failure-artifacts.json) pin its stored and decompressed bytes.
These records contain synthetic test data and local diagnostic paths, not a user's production profile.

The call stack identifies a source-capacity mismatch: the reader accepts up to 16 MiB, but cleanup
passes all hex-encoded database rows through one 65,535-byte field. The first programmed-abort call
also raised this exception; its broad refusal assertion accepted it, and the retry exposed the failure.
This exception occurs before cleanup writes its manifest or deletes source material.

Additional focused pre-repair tests exposed the same width issue for local fingerprints and cleanup
manifests. Four tests failed, including a UTF-8 boundary property that shrank twice. Their available
[output](./2026-09-09-cleanup-size-before.json) and [tested source hashes](./2026-09-09-cleanup-size-before-hashes.json)
are retained without manufacturing a missing successful run. These supplementary tests do not change the
native campaign's outcome. The runtime repair and its post-repair validation belong to the next commit.
