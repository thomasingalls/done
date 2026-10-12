# Foreground stalls during received-history maintenance

**2026-10-12.** Parent: signed `460fefd8` (bounded prefetch). This repair is implemented and checked
locally, uncommitted and unpublished. Release validation remains paused; `docs/progress.md` is
unchanged. No service API, stored receipt, schema or reader-fence change.

The natural diagnostic capture reproduced a **1,530 ms** main-thread task. The reference audit
inside compaction was responsible: task-window CPU samples put **1,178 ms** in inbound verification,
including **1,106 ms** in repeated workspace coverage proofs. The full audit spanned 1,485 ms of wall
time. This was a chain of synchronous work and already-resolved promise continuations, not a
slow network request or the native deletion transaction. The preceding capture had **no audit and
no long task**; it is retained, not pooled with the reproduction.

## Repair

- Keep the independent reference coverage algorithm. The same receipt census can now pause
  between complete records; receive verification pauses between receipts; self-stream reference
  coverage pauses between originals. These pauses use the existing maintenance task's ~8 ms
  budget and ownership/cancellation checks. An individual record/proof is still synchronous.
- Install the completely authenticated incremental view before running the diagnostic audit.
  If input interrupts maintenance, keep that exact-bound view and leave the audit due. Retry
  the audit during the next maintenance opportunity, instead of making the keystroke redo a
  cold verification. A retry starts independent reference coverage over the current snapshot.
- Preserve only the carrier's prior detached cache on `MaintenanceInterrupted`. Reuse still
  requires the authenticated counter and exact sealed row bytes. Other failures/mismatches
  invalidate the verified state and keep the existing refusal behavior. Authority changes and
  closing retain their cache/keys cleanup. No partial audit result may publish or delete rows.

Ordered admission is unchanged: input never overtakes an active operation or IndexedDB transaction.
The interrupted maintenance operation first settles, then input runs. Audit attempts, interruptions
and successful completions are counted separately. An audit is not complete merely because its
next attempt was deferred. Continued activity can postpone completion; a sufficiently quiet
maintenance window completes it, and cold reopening still verifies the full retained history.

## Measurements

See the [prospective protocol](./protocol.md). Attribution uses build-only numeric markers and a
1 ms CPU sampling interval. The clock bridge error for the natural reproduced task is 0.5 ms.
Overlapping async spans alone are not used as attribution. These are individual desktop engineering
observations, not population estimates or phone/public-service results.

The focused collision restores the same deep received-history fixture for each run. A build-only
control lowers maintenance/audit thresholds so one flushed edit makes the identified operation due;
it leaves receipt checks, exact coverage, ordering and transactions in place. One input is sent
from the runner 25 ms after the audit begins. The test waits for retry/completion, compares the
whole export with exactly the two typed characters added, and cold-opens offline. The threshold
control can cause two completed audits in a single maintenance attempt; it is not a measure of
normal audit frequency.

| Controlled collision | Parent | First repair | Final repair |
| --- | ---: | ---: | ---: |
| Key sent → admitted text visible | 2,157 ms | 242 ms | **24 ms** |
| Key handler → admitted text visible | 18 ms | 21 ms | 21 ms |
| Largest observed task during maintenance | 2,178 ms | 278 ms | **64 ms** |
| Audit attempts | 2 | 3 | 3 |
| Interrupted / completed audits | 0 / 2 | 1 / 2 | 1 / 2 |
| Full verification displaced onto input | — | 0 | 0 |
| Full export and offline recovery | pass | pass | pass |

The final send-to-visible reduction is **98.9%**, meeting the >=75% target. No task exceeds the
prespecified 200 ms ceiling in that observation. No repeat in reverse order was required by the
protocol: the change is much larger than the timing ambiguity. The baseline has no completion
counter; its two successful audit returns establish completion. The final handler figure uses
DOM observation (not paint) and rounded wall-clock milliseconds.

The first repair fell short of the task ceiling. A separate CPU capture showed ~220 ms in the
initial receipt census and ~200 ms in the final self-stream coverage array. Those two synchronous
sections were then given budget boundaries too. The intermediate run and its profile are retained.
The final collision has no sampling profiler; the build-only markers remain.

The ordinary packaged journey has **no diagnostic transform, CPU profiler, lowered threshold or
ledger profiling flag**. It restores 120 cards, 12 KB Goals and 600 queued positions, adds 75 ms per
API request, types 120 keys on the writer during catch-up, sends an edit from the receiver, checks
12 subsequent live bursts, types 120 receiver keys, compares complete exports and reopens offline.

| Ordinary delayed journey | Retained prefetch result | Final repair |
| --- | ---: | ---: |
| 600-position catch-up | 100.978 s | **112.521 s** |
| Catch-up tasks >=50 ms | 1 | 3 |
| Largest catch-up task | 1,238 ms | **73 ms** |
| Subsequent live-burst median / maximum | 2.352 / 2.863 s | 2.366 / 3.356 s |
| Writer submit-response interval, median | 2.276 s | 2.270 s |
| Receiver first submit starts | 2.066 s | 2.254 s |
| Peer reads / repeated cursors | 604 / 0 | 600 / 0 |
| Own checks | 18 | 20 |
| Offline cold open | 6.804 s | 7.497 s |
| Post-GC heap | 19,922,172 B | 19,932,616 B |
| Equal export size | 54,211 B | 54,211 B |

The elapsed catch-up time is **11.4% longer**, below the prospective >15% investigation threshold.
This is a responsiveness repair, not a demonstrated throughput gain. There is no fresh ordinary
baseline in this phase; machine/run drift and extra yielding are not separated. The prior prefetch
observation had fetched four concurrent-writer positions beyond the original backlog at the
observation boundary. Every primary HTTP response is 200, with zero 429s; 73 browser request-failure
events after HTTP 200 (`net::ERR_ABORTED`) remain recorded. Whole exports and recovery pass despite
those events. HTTP timestamps are proxies for service acceptance, not decoded proof measurements.

## Focused checks and limits

**72 unit checks and three native cases pass**, plus all seven packaged observations (two natural
diagnostic captures, four controlled collisions including the intermediate profile, one ordinary
journey). Unit checks cover shared-census equivalence/refusal, cancelled/lifetime-invalid reference
checks, self-original erasure, full coverage, ordered admission, compaction, and exact ciphertext
reuse after interruption. Native cases cover self progress through compaction/cold replay, a forced
reference disagreement closing the warm owner, and serialized Account readers. TypeScript,
ordinary build, targeted lint/format and whitespace checks pass. No generalized campaign ran.

This does not reduce the full audit's total CPU cost or bound history growth. Source-spool work
and individual Yjs operations remain synchronous; the observed 64/73 ms maxima are not universal
bounds for larger workspaces or other devices. Cold opening remains above the 2.5-second goal.
Local accepted-history retention and checkpoint-based catch-up remain separate architectural work.
No personal device, writing, credential or deployment was used.

## Reproduction and evidence

`probe/diagnostic.config.ts` adds markers only at build time. `STALL_COLLISION_BUILD=1` selects the
explicit threshold control; `VITE_ACCOUNT_LEDGER_PROFILE=1` enables numeric counters in diagnostic
builds. Build normally without either for the ordinary journey. `probe/stall.config.ts` runs the
retained catch-up journey; `probe/collision.config.ts` runs the controlled input collision.
Set `DONE_PERF_SOURCE`, `DONE_PERF_DIST`, `DONE_PERF_RESULTS`, `DONE_PERF_FIXTURE_ROOT` and
`RECEIVE_DELAY_MS=75`; collision also needs `DONE_REOPEN_FIXTURE` and (for the repair)
`STALL_EXPECT_REPAIR=1`. `STALL_PROFILE=1` adds a collision CPU capture. Private ports are
53771/53772/53774; use one worker and no concurrent builds/tests while measuring.

```sh
node node_modules/vitest/vitest.mjs run test/contentMaintenance.test.ts test/contentInterruptedReuse.test.ts test/accountReceiveLedger.test.ts test/accountSelfReceive.test.ts test/verifiedRecords.test.ts test/preparedCoverage.test.ts test/admissionQueue.test.ts test/contentCompaction.test.ts
ACCOUNT_LEDGER_AUDIT=every node --test --test-concurrency=1 --test-name-pattern='one owner advances|reference audit disagreement|concurrent Account readers' test/account-sync/native.test.mjs
```

Numeric, content-redacted observations are in `samples/*.json.gz`; CPU profiles and restricted-task
analysis are in `profiles/*.gz`. `probe/task-profile.mjs` reproduces attribution from a restored
result/profile and its matching external bundle/maps. The previous attribution analyzer and
prefetch supplementary analyzer reproduce the ordinary summary. `probe/retain.mjs` records
content-redacted observations, profiles, logs, source/bundle/fixture hashes and external raw paths.
Credential-bearing replay fixtures and service state stay external under `/tmp`; they must not be
published. The intermediate candidate's external bundle/maps identify its code. Final runtime
patch and hashes are recorded in `identity/`. `manifest.json` hashes this packet except itself.
Node 26.11.1 and the project's Playwright Chromium were used, not production's Node 24.
