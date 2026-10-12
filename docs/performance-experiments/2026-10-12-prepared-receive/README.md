# Prepared remote handoff and budgeted CPU yielding

2026-10-12. Base signed **08a82089**. Local implementation; uncommitted and unpublished.
Release validation remains paused. No stored/wire format change or rollback fence.

**Retain the improvement, with the latency target still open.** Both matched repetitions improve
active-peer p95 by 52–59% and backlog p95 by 26–38%, meeting the prospective >=25% improvement
rule. Neither condition meets the 50 ms working target. Median typing remains about 22–24 ms,
also above the separate 16 ms TRD target. Silent-peer p95 is broadly unchanged.

| CPU-4x condition | Reference p95, repetitions 1 / 2 | Candidate p95, repetitions 1 / 2 |
|---|---:|---:|
| Silent peer | 31.5 / 28.2 ms | 33.0 / 27.6 ms |
| Ten active peer edits | 179.1 / 147.3 ms | 85.4 / 60.2 ms |
| 600-position backlog | 165.3 / 133.1 ms | 101.9 / 98.3 ms |

Candidate backlog has **6 and 5 of 120 keys above 100 ms**, versus 10 and 7 reference. Local queue
wait falls from 1.02–1.38 s to 0.24–0.32 s with an active peer, and from 0.69–1.20 s to 0.52–0.61 s
during backlog. The second backlog repetition's queue-wait improvement is much smaller than the
first; the per-session rows are retained. Long tasks remain, reaching **148 ms** on the candidate.

The [handoff contract](../../account-prepared-remote-handoff-design.md) separates content preparation
from final apply. One bounded proposal verifies/commits on the serialized storage owner while local
commands retain synchronous encrypted journal-before-apply. After storage releases, final promotion
joins the editor FIFO, freshly rechecks authority, and applies original frames to current state/undo.
It cannot bypass refused local input; closing or discarding a durable undisplayed proposal requires
cold replay. History installation and authority transition paths keep their existing fences.
CPU cooperation targets 8 ms between splittable operations and 64 KiB comparison chunks. It is not
an 8 ms bound on a Yjs apply, full authentication, clone or native operation.

All **12 final unprofiled sessions pass** exact local writing, last-key undo/redo, peer preservation,
export convergence and cold offline replay. Every typing request returns HTTP 200; both send and
receive make progress. The first backlog candidate processes slightly fewer receive groups while
typing (14 versus 16), so this is a responsiveness improvement with a scheduling tradeoff, not a
claim of increased catch-up throughput. Profiles are separate observations and are not pooled here.

The fixture is 120 cards, about 60 KB of card text and 12 KB Goals, editing a roughly 400-character
card. Service requests have 75 ms added delay. Sessions, not keystrokes, are independent comparison
units; two repetitions do not establish a population distribution. CDP delivery can undersample
pre-handler blocking. These are desktop emulation observations, not phone or release qualification.

## Record

- [Prospective protocol](protocol.md) and [session rows](sessions.md).
- [Full numeric summary](summary.json), [focused checks](checks.md).
- Build/fixture/source hashes and numeric-only archive are recorded with the final diagnostics.
- The preliminary pilot was stopped for a pressure-boundary correction before the final comparison;
  it is retained and excluded, not silently replaced.

## Remaining work, from separate diagnostics

Both diagnostic sessions also pass the correctness guardrails. The cooperative record comparison
still consumes sampled self CPU (2.99 s active / 0.90 s backlog over the typing window); yielding
changes its scheduling, not its asymptotic work. Unsplit ledger/other byte equality adds 1.38 / 0.45 s,
with `readIfMatches`, delivery verification reads and inbound coverage among its callers. Inventory
comparison adds 0.48 / 0.73 s; cursor callbacks add 0.65 / 0.91 s. These are sampled categories,
not additive estimates of key latency or a matched fixed-work cost comparison.

The three longest tasks in each profile reach 114–137 ms. Their samples include protocol recovery/
admission parsing, encoding, digest and signature calls; the recorded stacks include full joined
custody authentication and inbound verification. Some of those calls sit below one async operation
and cannot be split merely by yielding around that operation. The packet retains function and caller
attribution rather than declaring a single root cause for every tail.

On the unprofiled active runs, final remote jobs total 348–412 ms (previous whole-remote jobs
1.84–1.90 s); their longest final job remains 70–75 ms. During backlog the final jobs reach 88–93 ms.
Some local wait also overlaps explicit flush barriers. The next bounded investigation should separate
that final authority-read/apply span and the remaining protocol parsing/authentication bursts. Any
further change must retain the fresh final authority check, live undo history and journal ordering.
Local retained-history baselines remain a separate design project; this slice does not remove
history-dependent memory or CPU growth.

[Diagnostics summary](diagnostics.json), [source/build identities](source-identity.json), and
[archive manifest](manifest.json) accompany the [numeric evidence archive](evidence.tar.gz).
The archive excludes private fixture, browser and service snapshots; their hashes identify inputs.
