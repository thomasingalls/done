# Account typing-burst batching

2026-10-11. Bounded development work on `codex/account-burst-batching`, based on merged
`7b6d8d9f315b03cc0875782e3145fbeafecbc97f`. Its application runtime matches deployed
`5ccee4d000d691cde6206e03551e5104ca5e864d`. Release validation remains paused; all measurements
use disposable desktop accounts. No production state or service is changed by this packet.

## Question and implementation

The [predeclared protocol](./protocol.md) separates publication timing from local flush timing.
Publication alone cannot remove an admission queue stall caused by a local flush. Account candidates
use a 300 ms quiet deadline and either a 1,000 or 2,000 ms maximum. The selected ordinary-build default is now **coordinated-2000**. `VITE_ACCOUNT_BATCH` also accepts
`publication-1000`, `publication-2000`, `coordinated-1000`, or `reference` for reproduction/rollback;
invalid values refuse the build. Unset and empty values select the measured default.
The coordinated variants additionally replace the fixed 250 ms Account flush schedule with the same
quiet/maximum policy. These are separate windows with the same policy, not a claim of one atomic timer.

Every accepted local edit still enters the synchronous encrypted journal before visible acceptance.
Pressure and explicit durability barriers still force IndexedDB commit. The longer interval changes
when already journalled writing moves to IndexedDB; it does not make acknowledgment depend on network
publication. The existing UI reports unaccepted pending input/storage errors, not merely a dirty journal.
Local-only workspaces keep their previous schedule.

A send rechecks batch eligibility after its asynchronous prelude, before allocating a new envelope.
Already sealed envelopes and retained submissions bypass that preparation gate. Typing cannot move a
failure retry deadline in either direction. New input can extend the quiet deadline only as far as the
first edit's maximum; a lifecycle-closed window cannot be extended again. Existing 32-source / 64 KiB
bounds, actor/kind/epoch splits, original frame bytes, nonce allocation and authority checks are unchanged.
A maximum wait bounds scheduling eligibility; queue work, verification, transport and retry add latency.

Hidden/pagehide closes the healthy send window and requests a best-effort durability barrier. Suspension
can prevent asynchronous work. Lock still aborts the owner and clears timers immediately; it must not
retain unlocked keys while waiting for a server. Unsent journalled writing resumes on reopening. The
change makes no guarantee that closing a laptop delivers the last sentence before the browser suspends.

For Account receives under this policy, the private owned page handoff applies every original frame in order,
including pending structs and deletion sets, but checks the complete projection and publishes to workspace
subscribers once after the page. Durable commit still precedes promotion. Revision advancement remains
per frame. Local capture/undo is not used for peer updates; later local input follows the completed page.

## Selection and fixed-history comparison

**Select the two-second coordinated policy.** It meets the predeclared deep typing and CPU improvement
criteria; one second improves stalls but saves only about 5% CPU. Publication-only one second changes
little at depth. No server/wire/schema migration is required. The code selects the policy for the next
build; this packet does not publish an image or update the live service.

Each arm cold-opens a copy of the same 2,320-edit / 295-position retained account, then types 300 keys.
Order is the table order; both baseline bookends remain substantially slower. The keyboard uses the
same 110–180 ms jitter; actual gaps also include dispatch/scheduling delays. These are five whole
sessions, not 1,500 independent replicates, and they do not establish phone latency.

| Policy | Stable text p95 (ms) | Profiled CPU/key (ms) | New positions | Dirty flush calls | Flush work occupying admission (s) | Local input queue wait (s) |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 285.0 | 150.6 | 32 | 125 | 18.33 | 13.46 |
| Publication only, 1s | 277.7 | 147.6 | 31 | 124 | 18.36 | 13.77 |
| Coordinated, 1s | 116.8 | 143.6 | 34 | 67 | 6.69 | 3.48 |
| Coordinated, 2s | **57.1** | **95.6** | **23** | **41** | **2.00** | **0.56** |
| Baseline repeat | 337.5 | 148.9 | 30 | 124 | 20.71 | 15.45 |

The two-second arm cuts p95 by 80–83% and sampled CPU/key by 36% relative to the two bookends.
Dirty flushes fall from about 0.42/key to 0.14/key. The visible pending-input indicator occupied
1.2% of the block, versus 19.9–22.9% in the bookends. Immediate journal acknowledgments are unchanged.
These elapsed queue totals overlap other nested operations; they are not extra CPU to add to the CPU column.

The original prediction was 7 or 13 keys/position at 1s/2s, versus the prior shallow request probe's
2.7. At retained depth the baseline was already processing slowly enough to collect 9.4–10 keys per
position. The 1s/2s arms produced 8.8/13.0 respectively: the important added gain was the flush policy,
not a hypothetical 2.5x reduction from the already-slow deep baseline. No requests were refused.

Cold opens of this exact same retained history remain **12.6–13.0 seconds**, including the virtual
unlock. Reopened retained JS heap is approximately 17–18 MB. This is not a repair for existing cold
history. The 2s matched block did not cross the content-compaction threshold, so its lack of compaction
is not evidence of cheap compaction; the uninterrupted run below explicitly exercises it.

## One uninterrupted session, including maintenance

Both diagnostic sessions keep one renderer and its undo history through 2,320 edits: 100 fresh profiled
keys, 2,120 bulk edits at 60 ms cadence, then 100 deep profiled keys, before a cold reopen. Bulk edits
span cards without reopening. The account starts empty in each arm, so later physical history differs.

| Measurement | Activated baseline | Selected 2s policy |
|---|---:|---:|
| Fresh stable-text p95 | 3.7 ms | 2.3 ms |
| Fresh profiled CPU/key | 83.5 ms | 14.9 ms |
| Fresh positions / 100 keys | 66 | 8 |
| Deep stable-text p95 | 240.7 ms | 39.4 ms |
| Deep profiled CPU/key | 156.4 ms | 82.2 ms |
| Deep dirty flushes / 100 keys | 45 | 14 |
| Ordinary compactions during session | 9 | 9 |
| Largest compaction operation | 1,387.9 ms | 1,044.5 ms |
| Cold open after 2,320 edits | 12,432 ms | 6,304 ms |
| Warm retained heap after GC | 32.1 MB | 29.8 MB |
| Reopened retained heap after GC | 17.8 MB | 15.6 MB |

The shorter new-history cold open reflects fewer positions/ledger rows accumulated during this session,
not faster opening of the old retained history above. Original per-edit source capsules still grow.
Both largest compactions are around a second and remain an unresolved responsiveness cost. Earlier
7.2–7.5s cold-open figures came from a different measurement; these current runs must not be treated as
a controlled comparison with that older packet.

## Two devices typing while receiving

One baseline pair followed by one candidate pair, 300 keys/device at requested 150 ms gaps, each on its
own card. Both complete texts converge in both devices. These are fresh paired accounts, separate from
the deep single-device comparison. Arrival measurements use synthetic character lengths and browser
wall-clock timestamps; DOM stability is not an actual pixel presentation timestamp.

| Measurement | Baseline A / B | Candidate A / B |
|---|---:|---:|
| Own stable-text p95 (ms) | 59.3 / 46.7 | 30.7 / 27.6 |
| Each writer's peer-arrival p50 (ms) | 3,837 / 1,630 | 2,605 / 2,430 |
| Each writer's peer-arrival p95 (ms) | 6,427 / 3,376 | 3,605 / 3,388 |
| Longest task while typing/receiving (ms) | 167 / 144 | 137 / 132 |
| Number of long tasks | 1 / 1 | 1 / 2 |
| Total long-task time (ms) | 167 / 144 | 137 / 186 |

Combined submissions fall **74 → 47**, non-session/non-notification requests **374 → 327**. All measured
requests succeed with **zero 429s**. The final convergence check (including its fixed 2s settling pause)
finishes 5.17s/4.75s after typing. One candidate receiver has an additional 54ms task, so the result is
not a claim of fewer long tasks everywhere. No observed typing-p95 or longest-task regression appears;
this small sample cannot rule out rare stalls. Peer B's median wait rises as expected from batching.

Each candidate device records 323/324 full projection checks during the block: 300 local transitions
plus received pages. The focused native pending-frame test independently checks exactly one comparison
and one subscriber publication for a three-frame received page. The paired baseline did not have that
extra counter, so do not infer an observed baseline projection count from it.

## Evidence, compatibility and remaining work

[comparisons.json](./comparisons.json) retains per-block counts, queue times, maintenance and numeric
summaries. The raw captures and CPU profiles are gzip-compressed beside each session; paired request
and arrival captures are retained separately. [source.json](./source.json) identifies the base,
condition patches, source hashes and built assets. The final default integration changes the selector,
Docker rollback argument and hidden-page completion wake; the measured candidates used an explicit
2s build flag. These lifecycle/default changes do not affect the foreground timing conditions above.
See [verification.md](./verification.md) for focused commands and their scope, and
[probe/README.md](./probe/README.md) for reproduction.

Retained private fixtures (device keys, unlock codes, browser storage and service state) stay outside
the repository. No real writing or deployment credentials were used.
Numeric counts distinguish all attempted journal flush calls from dirty flush calls. Queue measurements
record active elapsed work, wait time and peak queued jobs by kind; they are not independent CPU totals.
Nested timing counters must not be summed.


The next publication can deliver this measured improvement. The next performance targets are the
repeated cold-open parsing/verification and full physical census/copying that still occur on warm loads,
plus the roughly one-second maintenance pause. The paired run also retains considerable discovery/read
traffic. None is claimed fixed by batching; no general release-validation work was resumed.
