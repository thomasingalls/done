# Known native append markers: same-publisher write/read races

2026-10-21 · unsigned bounded patch06 after immutable01→05/tree3fd6967e.

## Outcome

A native verified proposed decision announces a process-local commit marker only AFTER actual COMMIT.
Old captures and delayed memo installation are rejected without discarding the preceding authenticated
prefix. That marker advances no count/link/cut/witness and grants no authority. Fresh captures still
verify the new rows/current witness, fresh headers and served rows, transaction-time state, signatures,
expiry, custody and grant. Unique commit markers are separate from the bounded publisher/audit owner:
continuous appends must not cancel an independent audit's success or corruption quarantine.

Unknown fingerprint changes, data_version, clear/close, eviction/recreation and quarantine retain their
original fences. No new queue, persisted/wire format, shared authority result, retry/rate/burst/concurrency/
work/body/deadline increase. Numeric refill stays16/session,64/process. All127 affected cases pass,
including13 new regressions, and11 precise omission controls fail at intended assertions. Type/lint/
format pass. Independent AST checks retain all50 old assertion calls and their registration/options.
All109 planning cases pass; every879 old obligation and97 construction contracts/statuses is exact.
The new test stays blocked:880 obligations/336 unresolved; general qualification remains paused.

The warm mixed workload now completes in both candidate arms. ORIGINAL COLD MIXED ACCEPTANCE REMAINS
OPEN. The initial cold verification fan-out delays the first writer, and its queued writes then drain
in a burst that safely exhausts the unchanged four-read-attempt guard. Do not label this phase a full
cold-capacity, universal race/liveness or rate-promotion pass.

## Evidence before repair

The actual old native implementation fails the new assertion that an old capture must be rejected
without losing its authenticated pre-append prefix. A separate anonymous observer-only original-source
run records3413 events with zero overflow:27 hot read fingerprint failures and175 hot full censuses.
The hot writer accepts96 writes, but replay still fails with581 verified positions at shutdown/drain.
The observer affects scheduling and supplies mechanism evidence, not ordinary timing or frequency.
Actual valid commits advance counts; stale read guards destroy still-authenticated prefixes.

New tests cover accepted/refused commits, exact historical retries, non-proposed outcomes, multiple
captures/appends, stale full-census installation, rollback/lost replies, unannounced same-connection
commit, external/global fences, fabricated/pre-COMMIT notification, served tail corruption and real
worker audit continuity/quarantine. Worker SQL/cryptography runs unchanged; a temporary builtin-Worker
wrapper delays only its exit callback until after two real appends, making the schedule explicit.
The documented off-path corruption window is retained, not relabelled as per-request full verification.

## Original cold workload: all failures retained

Six genuine hot sessions ×256 positions, one1024-position seed; hot500ms and unrelated1000ms writes,
unrelated250ms reads, exact scoped grants, independent original wire/page proofs. Whole restored runs
are units; positions/requests are dependent. No synthetic409 retry. Existing4291000/2000ms waits,
10s HTTP,120s replay and1GiB sampled-server-RSS ceilings remain. Elapsed includes drain after stopping;
verified positions in failures are totals by shutdown/drain, not completed replay or necessarily at120s.

| Fixed original order | Outcome | Positions verified by drain | Hot writes verified | Elapsed |
| --- | --- | ---: | ---: | ---: |
| 1-reference | failed409 | 517 | 75 | 39.670s |
| 1-candidate | failed409 | 454 | 6 | 4.005s |
| 2-candidate | failed409 | 494 | 6 | 4.003s |
| 2-reference | failed409 | 579 | 66 | 34.071s |

The first candidate hot writes, offered at500ms, verify at2955/3036ms. The following five queued writes
then drain in84/92ms. All six readers lose their four bounded attempts during that burst. Candidate
cold hot-write p95 is2455/2536ms on these stopped six-write arms; one also misses the additional2500ms
interaction guard. Both original cold completion conditions stay failed. No timings from these stopped
runs are promoted to completed throughput, and later warm success does not erase them.

## Added warm-state discriminator

After the cold falsifier, the protocol explicitly adds one actual scoped signed HTTP read and independent
page proof BEFORE metrics/start. Its full wall interval/status is retained separately. This warms the
hot publisher; it cannot hide cold cost or replace the cold denominator. Reference and candidate source
differ only in publisherTips.ts and one post-COMMIT notification in delivery.ts. Same full workload,
fixed[reference,candidate],[candidate,reference] order and original guards.

The first warm block and first own-only control are retained with no clean timing credit: I started
the next runner before the final warm reference had reported termination. Its startup may overlap
the last reference tail. Filesystem timestamps do not establish the exact measured overlap; sandbox
process inventory was unavailable. Repeat ALL four warm arms and own-only serially after the complete
browser series terminates. Do not select only successful runs or drop the original block.

| Clean repeated warm order | Outcome | Positions | Hot / other writes verified | Replay or stopping boundary | Hot offered-to-verified p95 |
| --- | --- | ---: | ---: | --- | ---: |
| 1-reference | failed | 1007 | 240 / 120 | 120s replay ceiling; 124.276s with drain | 82096ms |
| 1-candidate | passed | 1536 | 40 / 20 | 20.179s complete | 576ms |
| 2-candidate | passed | 1536 | 39 / 19 | 20.002s complete | 563ms |
| 2-reference | failed | 637 | 53 / 26 | 409; 28.018s with drain | 18585ms |

Both clean candidates meet full completion and the predeclared2500ms hot input-write p95 guard.
This is backend offered-to-original-proof time including the producer's queue, not editor paint or
physical-phone latency. Refused/timed-out reference arms are censored failures, not paired completed
latency samples; report no percentage speedup, population confidence, maximum capacity or absence of
starvation. All producer offers and successes remain separate in raw schedules. The actual warm-read
cost is retained per arm and excluded only from the explicitly warm measurement.

The other-writer+peer/no-hot-writer control completes1536 positions and20 other writes. The repeated
cold own-writer/no-other-traffic control still fails409 after458 verified positions and six hot writes;
its first offered write verifies after2463ms. This supports isolating concurrent FIRST verification
and queued-write bursts as the next bounded investigation, without introducing queues/shared evidence
or relaxing the strict native guard in this patch.

## Actual unchanged packaged client

Exact prior patch02 build (110 files), same encrypted121-card/13,000-character Goals fixture with600
missing accepted positions, two disposable Chromium contexts. CLI cwd/source and remote-batch proxy
hash checked before each invocation; no service source observer. Original600s catch-up/30s writing
guards and complete exports, both-way writes, Undo/Redo and locked offline document reopen remain.

- browser-natural: 34.251s catch-up, every data guard passed.
- browser-pressure: 156.031s catch-up, every data guard passed.
- browser-remote-refusals: 139.580s catch-up, every data guard passed.

All final exports are identical. No natural browser state-changed reply is observed. The known injected
remote batch has only remote inner requests and autonomously continues with nonempty pages after
1164ms; the refused pending submit is accepted for identical body bytes after
1038ms. No manual Retry/reload/wake creates progress. The submit refusal body is
unavailable to CDP; classification comes from the unique device/path/time-matched pre-forward proxy
injection, and any available CDP hint must agree. Missingness remains explicit. This tests known refusal
continuation, not natural cold-burst behavior or its production frequency. Duplicate reads share one
device session, not six independent installations. These journeys are functional, not a matched browser
speed comparison, Firefox/Android/physical-phone/WAN or full-process cold-browser qualification.

## Checks, corrections and preserved denominator

- First publisher run passes31/33: the new known-commit distinction changes two old fixtures that were
  exercising automatic prefix destruction using a known append. Make those actual native commits
  explicitly unannounced to that memo owner, preserving every original invalidation/audit assertion.
  New known-commit/audit-continuity cases test the complementary side. Retain the failed run.
- The old commit-removal omission regex needs the one new post-COMMIT line in both its exact anchor
  and replacement. Every assertion, timeout, case and original native commitment falsifier remains.
  Independent AST comparison confirms50 assertions and all registration/options exact in both files.
- Eleven precise omissions detect missing commit notification, guard/memo stamp, transaction boundary,
  proposed-only condition, correct placement, audit ownership, unknown-race/full fresh comparison,
  external clear and owner bound. No failed mutation anchor is credited as an effective omission.
- All16 raw native runs (11 failures) are retained, including trace, both full warm blocks and repeated
  cold control. All16 stopped native stores pass independent cold SQL original-wire/proof/position/prefix
  checks. Offered, queued and unacknowledged writes are not promoted to success.
- Crypto source-census refresh changes only delivery/publisherTips hashes; all domain sites and
  classifications are exact. Independent two-way planning comparison preserves every old obligation,
  exclusion/selection and all97 construction entries; the new file is explicitly blocked.

See protocol.md, starting.json, source-identity.json, identity.json, native/browser plans and raw runs,
omission-controls.json, old-test-review.json, census-review.json, planning-audit.json, overlap-note.json,
check receipts and verification.json. Reproduction sources are text; private fixture JSON/SQLite,
browser storage, keys/codes and installed dependencies stay outside Git. Known-value scan checks35
raw/escaped fixture values (not a general secret detector). SHA256SUMS covers all packet artifacts.

Run probes serially with the recorded Node24/runtime and unchanged private fixture paths/recipe.
api-load.mjs retains the original cold protocol; api-load-warm.mjs separately records warm preflight.
audit-api.mjs independently opens every stopped service DB read-only. run-browser.py checks its frozen
cwd/proxy closure and restores each journey; never overlap benchmarks/builds/validators. The current
cumulative checkout already contains01→06; do not reapply patches over it. Use --whitespace=nowarn to
preserve archived evidence bytes against global Git whitespace fixing. No stage/sign/commit/push,
preview8443 restart/merge/deployment. General qualification stays paused; cold acceptance stays open.
