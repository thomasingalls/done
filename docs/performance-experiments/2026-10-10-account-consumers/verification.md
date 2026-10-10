# Focused verification

This is a bounded implementation check, not release qualification. Full release validation remains
paused. All browser accounts and fixtures used here are disposable. Private test passkey/device-code
restart fixtures are kept outside the repository.

Completed checks (logs retained; final units/typecheck/lint repeated after the profiling guard fixes):

- TypeScript `tsc -b --noEmit`: pass.
- Targeted lint and source/test/prose whitespace checking: pass. Verbatim evidence logs and patch
  context retain their original whitespace; they are excluded from that formatting check.
- Nine Vitest files, 73 tests pass: byte/reference differentials; isolated complete/pending/malformed
  Yjs validation; catalogue duplicate/conflict differentials; detached cache projections;
  invalidation/late completion; exact compaction; Account source capture and undo/redo; selection
  snapshot ownership, including generated forks both with and without string reuse.
- Five focused native sync tests pass with incremental mode and full audit on every delta:
  submit-derived own receive progress; lost reply; submission abort; response abort; generated
  insert/delete/compaction/cold continuation. These assert candidate execution and zero mismatches.
- Four current-key retry tests pass, covering exact original bytes, interrupted persistence, refusal
  signatures/purposes and old-writer authority boundaries.
- The explicit `reference` override passes the focused native own-stream progression check.
- The final ordinary packaged build succeeds, with the reference path still selected by default.
- The packaged returning-editor/pruned-history journey passes with the candidate and full audits.
- The first packaged peer/history journey times out after interrupted installation/offline reopen.
  A diagnostic rerun instead sees an early enrollment authority-change refusal. A subsequent
  diagnostic run passes the complete peer/history journey, as does a signed-baseline diagnostic
  control. Both successful diagnostic runs exhibit repeated service 429s. See decisions.md;
  retain the failures and do not describe this as an uninterrupted clean browser result.

Later browser checks, in order:

| Log | Build/check | Outcome |
|---|---|---|
| `packaged-default.log` | Proposed default, ordinary tests | Peer/history delivery deadline fails; returning-editor test fails earlier in enrollment |
| `packaged-silent-debug.log` | Incremental, audit every; quiet error capture | Peer/history passes; no admission queue error; Retry storage is hidden |
| `packaged-baseline-quiet.log` | Signed baseline + counters, incremental; ordinary test | Peer/history passes |
| `packaged-normal-diagnostic.log` | Candidate, normal audits; in-memory scheduler/response capture | Both peer/history and returning-editor journeys pass |
| `packaged-deadline-diagnostic.log` | Same diagnostic candidate; retain deadline failure and observe eventual arrival | Stops earlier in enrollment; does not test the later-arrival hypothesis |

Diagnostic code and test changes are preserved in `packaged-diagnostic.patch`, not installed in the
application. The earlier console-listener probes changed timing; the later probes primarily retained
small numeric/status snapshots in memory. None proves the failed journeys equivalent to successful
ones. Error records from a retired scheduler during navigation are not evidence that its successor
is blocked. `Retry storage` in shell text is also not evidence of a block: the button exists hidden.

**Decision: hold default activation.** Performance and ordinary audit criteria passed, but the
intermittent packaged results are unresolved. Do not claim missing text was recovered after the
deadline: the probe intended to establish that stopped before reaching it. No product retry,
authority, timeout or rate-limit behavior was changed. The temporary proposed source default was
reverted, and its generated dist was replaced by an ordinary reference-default build.

Commands are recorded in the final evidence README. Numeric profiling is development-only;
normal builds do not enable the new work counters. Native audits share low-level cryptographic
primitives with the incremental path, so the audit is not an independently implemented protocol.
