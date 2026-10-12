# Keep verified sync loads warm across owned reservations

2026-10-12, base signed `008b2fa9`. Runtime patch: `src/crdt/contentStore.ts` only.
No receipt/wire/storage-format change. Release validation remains paused; no publication.

The owner now advances its retained authenticated counter after its own exact reservation
transaction completes. It retains the old committed rows and their semantic identity until
records commit. Pre-commit sync checks can therefore stay warm instead of misclassifying that
known reservation as an unexpected counter change. They still authenticate the counter, check
store counts/end keys, run rolling audits and validate Account evidence. Returned bytes remain
detached. Unknown transitions and resume/reacquisition still require full reads.

See the [boundary trace](trace.md), [focused checks](checks.md), and
[prospective protocol](protocol.md). The accepted old-row corruption detection window is unchanged
in policy: an incidental full read disappears, so same-shape damage can wait for its audit rather
than being detected at the next reservation. Previously verified memory remains the only source
for reused rows; no damaged on-disk bytes are newly trusted.

## Measurement scope

Twelve fresh restored sessions, two per arm/condition, CPU-4x on B, 75 ms per account request,
120 keys at requested 150 ms spacing. Approximately 120 cards and 12 KB Goals, editing Project 2;
A's ten periodic edits affect Project 1, and the 600-position backlog affects Receive target.
Silent and active conditions start caught up from the exact same deep-history seed. Backlog
starts from the older contemporaneous pair, B offline until typing starts. Compare arms within
conditions; the backlog's initial local history differs from the settled cases.

Keydown-to-frame timing starts after event dispatch. Long tasks and observed key spacing are
reported separately: automation waits for browser commands, so it can undersample pre-dispatch
blocking. Event timestamp-to-handler delay is a proxy, not physical input latency. Do not interpret
a good silent-peer frame p95 as absence of background blocking. Two sessions per cell establish
local magnitude, not statistical significance or real-phone performance.

## Results

All **12/12** timing sessions pass complete text, last-key undo/redo, peer preservation, eventual
export convergence and cold offline replay. All typing-phase HTTP responses are 200. Each has
120 resolved frame samples. No failed timing observation is discarded.

| Condition | Reference frame p95, two sessions | Candidate frame p95, two sessions | Full-load plaintext MB, reference → candidate |
| --- | --- | --- | --- |
| Online, silent peer | 21.0 / 26.8 ms | 21.5 / 24.2 ms | 122.0 / 114.8 → 0 / 0 |
| Online, ten peer edits | 504.7 / 523.4 ms | 403.2 / 408.3 ms | 82.6 / 79.0 → 0 / 0 |
| Typing during backlog | 399.0 / 351.6 ms | 334.2 / 366.5 ms | 20.8 / 20.8 → 0 / 0 |

The targeted mechanism succeeds: every candidate load stays warm during typing. Active-peer p95
improves in both repetitions; backlog frame latency is **mixed**, with the second candidate worse
than its matched reference. This is not a satisfactory backlog typing fix. Candidate backlog has
12 keys above 100 ms per 120 keys. The remote fence still causes logical waits.

Copy counters decrease but do not disappear: candidate active-peer sessions copy about **115 MB**
of records versus **147–154 MB** on the reference. These counters measure selected explicit copies,
not total allocation or disk I/O. Silent sessions perform differing numbers of accepted outbound
positions during timing (candidate 7–8, reference 6); job counts therefore differ as well.

Main-thread blocking remains separate and substantial: candidate sessions have **132–145 long
tasks**, maxima **108–182 ms**, and about **9.6–10.1 seconds** summed long-task duration during
roughly 22–24 seconds of input. Backlog long-task duration does not show a consistent improvement.
The silent-peer frame p95 conceals much of that pre-dispatch blocking; observed key gaps and the
dispatch proxy are in [the individual sessions](sessions.md).

During every backlog typing window the receive status goes from 0 to 28 and outbound acceptance
from 0 to 5; those are driver status values, **not 28 newly received peer positions**. Receive status
aggregates streams and starts at zero before the offline-open driver first refreshes it. Five or six remote
admission jobs complete during each window, with send/network work interleaved; this is a pending
600-position backlog under the real scheduler, not an artificially saturated remote-only queue.
Full catch-up and exported equality are checked after the typing window, at normal CPU speed.

Two separate candidate diagnostic runs also pass all correctness checks. They are excluded from
the table above. Source-mapped CPU samples identify these remaining costs across each whole typing
window (not per key, and not elapsed admission waits):

| Candidate profile | Custody-record payload encoding | Ledger/other byte comparison | Largest task |
| --- | --- | --- | --- |
| Active peer | 3.71 s | 3.45 s | 160 ms |
| Backlog | 4.86 s | 1.02 s | 176 ms |

The backlog's longest task contains approximately 44.5 ms sampled in custody payload encoding,
30.3 ms in `verify`, and 19.8 ms in protocol hex decoding. These support investigating repeated
unchanged-authority work next; they do not prove all of that cost can safely be removed. Ledger
comparison remains important at depth. Residual synchronous work must be removed where redundant
or split with budgeted yields; relocating an unchanged long task outside FIFO alone cannot make
the main thread responsive.

## Evidence and reproduction

`summary.json` and `sessions.md` retain per-session summaries. `source-identity.json` records exact
base/runtime patch inputs, bundle hashes, fixture hashes, shared instrumentation and environment.
`evidence.tar.gz` retains numeric raw results, logs and separate diagnostic profiles; `manifest.json`
records every archive member's size/hash. The initial no-metrics setup and initial test-scaffolding
failure remain in the evidence, distinct from valid observations. Private fixture files, browser
credentials, service databases, compiled bundles and Playwright artifacts are excluded.

The [runbook](checks.md#measurement-reproduction) uses the committed probe and the retained paired
fixture hashes. Profiles use the previous packet's source-map/attribution helpers with the exact
candidate bundle. They are diagnostic and excluded from the repeated timing comparison.

## Next boundary

Keep this repair, then implement unchanged-authority authentication reuse with its own lifetime
and invalidation checks. The current candidate remains far beyond the predeclared 50 ms threshold
when receiving. After that second slice, exceeding the online/backlog trigger requires
[prepared remote handoff](../../account-prepared-remote-handoff-design.md), not a third general
shrinking pass. The final remote apply must stay ordered, membership/authority transitions remain
fenced, and residual splittable main-thread receive work needs budgeted yielding. Handoff and local
retention are design-only here. This repair does not claim history-independent warm CPU work.
