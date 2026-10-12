# Unchanged-authority authentication reuse

2026-10-12; base **`9bf9f3c6`** (signed owned-reservation repair). The new repair is enabled
locally, uncommitted and unpublished. Release validation remains paused.

The exclusive v9 owner now reuses prior authentication only after freshly reading and exactly
comparing the complete scoped custody inventory. This removes repeated factor opening, MAC
verification, large payload encoding and duplicate inventory reads. It preserves current-byte
change detection, clear/import interlocks, expected-authority matching, task lifetime checks,
resume/adoption invalidation and private buffer ownership. It retains no decrypted keys.
See the [contract](../../account-authority-authentication-reuse.md) and [prospective protocol](protocol.md).

## Matched typing results

Twelve fresh restored sessions, two per arm/condition, reversed arm order in repetition two.
CPU-4x on the receiving device; 75 ms added to account requests; 120 keys at requested 150 ms
spacing in a roughly 400-character card, with 120 cards and 12 KB Goals. Both arms share this
phase's source and instrumentation; reference disables authority reuse. This compares the switch,
not a byte-identical historical build. Diagnostics are separate from these timing repetitions.

| Condition | Reference frame p95, both sessions | Reuse frame p95, both sessions | Reference → reuse long-task count |
| --- | --- | --- | --- |
| Online, silent peer | 21.9 / 23.2 ms | 20.8 / 20.9 ms | 146 / 142 → 60 / 60 |
| Ten peer edits while typing | 398.4 / 390.3 ms | 210.6 / 207.2 ms | 129 / 128 → 71 / 71 |
| Start 600 positions behind | 324.3 / 314.5 ms | 162.2 / 136.7 ms | 136 / 152 → 26 / 28 |

All twelve observations pass complete text preservation, last-key undo/redo, peer preservation,
export equality after convergence and cold offline replay. Every typing-phase HTTP response is
200. All 120 frame samples resolve in every session. See [individual sessions](sessions.md),
`summary.json`, [checks and reproduction](checks.md), source hashes and the archive manifest.

The mechanism is visible: candidate silent-peer windows reuse all 99 checks, active-peer windows
reuse all 191/197, and backlog windows perform one initial authentication then reuse 260/270.
Reference windows perform full authentication on all 89–134 checks. Candidate workloads complete
more sync operations in the same typing period, so check counts are not fixed between arms.

Active-peer local queue waiting falls from 3.37–3.57 s to 1.63–1.70 s per window; backlog waiting
falls from 2.84–3.07 s to 1.06–1.21 s. Of candidate waiting, 92–98% active-peer and over 99% backlog
overlaps remote admission. These are elapsed wait overlaps, not sampled CPU or additive costs.

Backlog remote-admission jobs increase from 5/6 to 20/21 while sending progresses too (reference
5/6 accepted positions; candidate 7/8). The receive driver's aggregate goes from its initial zero
to 28/33 versus 90/95. That initializes on first online work and includes the own stream; it must
not be described as that many newly received peer positions. Both remain behind during timing,
then fully converge at normal CPU speed. This is not a standalone catch-up-throughput benchmark.

## What remains

Two separate candidate diagnostics also pass all correctness checks. Custody payload encoding
accounts for **305 ms active-peer / 406 ms backlog** of sampled CPU, while fresh authority-inventory
byte comparison costs **579 / 816 ms**. The preceding phase sampled 3.71 / 4.86 s in custody payload
encoding. Those are diagnostic windows with different completed work, not matched timing estimates
or a per-operation speedup calculation. Full-reading paths outside `assertCurrent` remain and
still contribute to the largest individual tasks (141–148 ms in these profiles).

Ledger/other byte equality is now the largest sampled client category: **6.47 s active / 2.07 s
backlog**, mainly `verifiedRecords.verify`, `sameRecords`, and `readIfMatches`. Fresh custody cursor
callbacks also remain (627 / 836 ms). More work completes in candidate windows; do not infer a
per-operation regression from a category growing against the prior packet. The source-mapped
profiles, caller stacks and twelve largest-task breakdowns are retained in the evidence archive;
`diagnostics.json` keeps these runs separate from timing repetitions.

The prior escalation rule is met in both repetitions: online/backlog p95 remains above 50 ms;
9/11 of 120 candidate backlog keys exceed 100 ms. Proceed to
[prepared remote handoff](../../account-prepared-remote-handoff-design.md), with budgeted yielding
for remaining splittable CPU work, instead of a third general shrinking pass.

Long tasks are fewer, but the worst candidate tasks still span **86–169 ms** across conditions.
The median key-to-frame result does not capture those blocks before handler dispatch. Actual
median key gaps are 167–180 ms rather than the requested 150 ms, and automation waits for browser
commands: it can undersample human input arriving during a long task. Dispatch timestamps are a
browser proxy, not physical-input latency. The per-session gaps, dispatch proxy and handlers are
retained rather than pooled into the frame result.

Detached ledger copies also remain. Candidate active windows copy 177–199 MB versus 108 MB in
the reference windows, alongside completing more receive/send work; those window totals do not
establish a per-operation regression. This repair does not remove whole-history comparisons,
change local ledger retention, meet the 16 ms TRD target, or establish physical-phone performance.
Two repetitions support a local engineering decision, not population confidence intervals.

The additional custody fixture's missing-history-endpoint failure reproduced with reuse disabled;
the corrected fixture passes. Unit/native probe mistakes and this setup failure are retained and
explained in the checks; no failed timing observation was dropped.
