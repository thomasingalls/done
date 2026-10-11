# Two-device catch-up: what bounds the replay rate

2026-10-11. Diagnostic measurement at deployed `main` `7b6d8d9f315b03cc0875782e3145fbeafecbc97f`,
prompted by the operator's report from the public installation: history replays on a second device
"bit by bit", and sync is by far the most important thing to repair. Release validation remains
paused. This is not a budget run, a passing verification or a deployment, and the causal probes are
diagnostics, not proposed changes.

## Provenance: what this packet is and is not

**Every number here was produced by a delegated agent of the Claude review session, in scratch
checkouts made with `git archive` on private ports 53781/53782.** Nothing was measured in a repository
checkout or against the public service, and nothing is taken from or pooled with the implementing
session's packets. Those measured the writing device: request counts per key in
[2026-10-11-account-requests](../2026-10-11-account-requests/README.md), and typing under batching in
the packet committed with `4bcac419`, which is not deployed and is not what was measured here. Until
this packet, nothing had measured a receiving device catching up.

[receive-trace.md](./receive-trace.md) is a read-only trace of the receive path written while the
measurement ran. It ran nothing.

## Findings

1. **Catch-up delivers one position at a time**: about one every 0.4 s on a short ledger, and one every
   1.2–1.5 s once the writer's ledger passes about 500 positions.
2. **Past about 500 positions the service is the limiter.** Handling time for every request that
   touches the writer's ledger rose about fivefold at the writer's 498th accepted position. Raising
   the service's verification cache bound removed the rise; lowering it to 64 moved it to the 67th
   position.
3. **The writing device is throttled by the same rise.** Its interval between accepted positions grew
   from about 0.5 s to about 5 s.
4. **Below about 500 positions the receiving client is the limiter**: an empty read of its own stream
   before every useful read, a 50 ms pause after each position, and about 120 IndexedDB read
   transactions and 400 WebCrypto calls per position.
5. **Typing on the receiving device was not delayed** during catch-up, and no request was refused.

## Setup

One account, two devices, a local service. Device B's browser context is taken offline; device A types
to build a backlog; B comes back online and catches up. Sizes and order were fixed in
[plan.md](./plan.md) before each stage, including the amendment made after the main run. All runs are
single runs.

Node 26.11.1, Vite 8.1.5, Playwright 1.62.0 with headless Chromium 151.0.7922.34, macOS 26.5.1 on an
Apple M1 Pro with other applications running; the one-minute load average ranged from 4 to 17.
[builds.json](./builds.json) records each build's commit, patch, `dist` digest and entry-file hashes.
The client build is unmodified in every run except the two client diagnostics. The service carries
`service-probe.patch`, an environment-guarded numeric request log.

| Build | What differs from `7b6d8d9f` | Patch SHA-256 (first 16) |
| --- | --- | --- |
| `base` | service request log only | `358e75281033c24c` |
| `varA` | client: no 50 ms delay after receive progress | `b7740395af461400` |
| `varB` | client: keep reading the publisher whose last page advanced | `453d8514785b83a8` |
| `svcC` | service: verification cache bounds read from the environment | `f5915cd3ec033b1f` |

Eight runs, 65.3 minutes, all exit 0. Run 01 is a smoke run and not a result. Another session's
packaged service was listening during 6% of the main run's samples and during none of the others.
[summary.json](./summary.json) has every run's conditions and headline figures.

## Results

### Catch-up rate

| Run | Cache bound | Backlog positions (keys, keys per position) | Writer's ledger | Catch-up time | Positions/s | Characters/s | Rate by quarter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 02 main, phase 1 | 512 | 101 (263, 2.6) | 105 | 40.7 s | 2.48 | 6.5 | 2.58, 2.52, 2.45, 2.42 |
| 03 control | 512 | 121 (331, 2.7) | 125 | 51.1 s | 2.37 | 6.5 | 2.43, 2.42, 2.40, 2.26 |
| 02 main, phase 2 | 512 | 400 (3,734, 9.3) | 505 | 474.7 s | 0.84 | 7.9 | 0.92, 0.94, 0.81, 0.74 |
| 02 main, phase 3 | 512 | 170 (3,974, 23.4) | 676 | 252.3 s | 0.68 | 15.8 | 0.72, 0.69, 0.66, 0.65 |
| 05 bound lifted | far above the ledger | 581 (1,156, 2.0) | 585 | 358.6 s | 1.62 | 3.2 | 1.96, 1.77, 1.45, 1.42 |
| 06 bound lowered | 64 | 101 (260, 2.6) | 105 | 49.0 s | 2.06 | 5.3 | 2.10, 2.10, 2.04, 2.03 |

The rate falls through each backlog as the receiver's own store grows. Phase 3 was planned at 1,200
positions and stopped at its 840-second build cap with 170, because the writing device had slowed to
about 5 s per position. Keys per position rose with depth for the same reason: a slower writer collects
more keys into each position.

### One position on the receiving device

| Condition | Cycle, mean | Service handling | Client remainder |
| --- | --- | --- | --- |
| Ledger 125, bound 512 | 418 ms | 115 ms | 303 ms |
| Ledger 505, bound 512 | 1,181 ms | 715 ms | 466 ms |
| Ledger 676, bound 512 | 1,469 ms | 848 ms | 621 ms |
| Ledger 585, bound lifted | 616 ms | 220 ms | 396 ms |

Each position takes two reads: an empty `delivery/read-v2` of the device's own stream, then one that
returns the entry, both with `limit: 1`. `membership/v2/discover` and `history/v1/checkpoint` each run
every 5–6 s, which is 0.08 per position on a short ledger and 0.19–0.24 past the bound.

Service handling, p50:

| Request | Ledger 105–125 | Ledger 505 | Ledger 676 |
| --- | --- | --- | --- |
| Empty read of own stream | 35–44 ms | 44 ms | 40 ms |
| Read returning the entry | 48–52 ms | 505 ms | 608 ms |
| Receiver's discover | 88–103 ms | 99 ms | 91 ms |
| Receiver's history checkpoint | 186–208 ms | 561 ms | 650 ms |

On the client, 81–88 ms passed between the empty read returning and the entry read starting, and
195–208 ms after the entry read, which includes the 50 ms pause; both grow with depth. Per position
the receiver made 121–130 IndexedDB read transactions, 2–2.5 write transactions, and about 390–520
WebCrypto calls.

The receiver's CPU profile at ledger 125 (`runs/07-DF-fresh-profile/B-p0-profile-tree.txt`) shows
188 ms of CPU per position. Of that, 75 ms is `assertCurrent` (`src/crdt/accountReceive.ts:198`),
almost all of it `recordEqual` (`src/crdt/custodyRecord.ts:404`) hex-encoding the same custody record
to compare it. UI publication was 1.8 ms and promotion with document comparison 0.7 ms on this small
workspace.

The receiver had no long tasks on a short ledger, 5 totalling 3.5 s (longest 1.33 s) in the
400-position catch-up, and 3 totalling 5.4 s (longest 2.04 s) in the 170-position one. Sixty keys
typed on B during the 400-position catch-up arrived with stable text at 0.8 ms p50, 57 ms p95 and
108 ms maximum.

### Service handling against the writer's ledger length

p50 milliseconds, by hundred positions of ledger, from the main run (`serviceMsByLedger` in
`runs/02-main/analysis.json`):

| Ledger positions | Submit | History checkpoint |
| --- | --- | --- |
| 0–99 | 48 | 134 |
| 100–199 | 55 | 189 |
| 200–299 | 72 | 327 |
| 300–399 | 88 | 449 |
| 400–499 | 107 | 545 |
| 500–599 | 561 | 584 |
| 600–676 | 648 | 656 |

Submit handling stepped up at the writer's 498th accepted position and stayed up. With the bound
lowered to 64 the step came at the 67th. Reads that return an entry follow the same shape: 48 ms at
ledger 105, 505 ms at 505 and 608 ms at 676 with the bound at 512; 106 ms at 585 with it lifted; 124 ms
at 105 with it at 64. The history checkpoint costs about 1 ms per position at every length, with or
without the bound. The measuring agent also reported the writer's own empty reads rising to about
558 ms in the 500–599 bucket; the retained table mixes both devices' empty reads, so that figure is
not recomputable from the summary tables alone; the retained per-run log archive is required.

The service's CPU profile (`runs/06-DP-cache-64-profile/service-profile-tree.txt`) puts 51% of active
CPU in the per-byte `hex` and `unhex` helpers at `account-protocol/recovery.ts:15-23`.
`account.sqlite` was 1.13 MB at 505 positions and 1.44 MB at 676.

### Causal probes

One run each, against the control's 2.37 positions/s and 383 ms cycle p50.

| Probe | Result |
| --- | --- |
| A: no 50 ms pause after receive progress | 2.79 positions/s (+18%), cycle p50 321 ms |
| B: keep reading the publisher that just advanced | 3.41 positions/s (+44%), cycle p50 269 ms; service handling per position fell from 115 to 74 ms |
| C: cache bound lifted, ledger 585 | entry read 106 ms and 1.62 positions/s, against 505–608 ms and 0.84–0.68 with the bound |
| C′: cache bound lowered to 64, ledger 105 | step at the 67th submit; entry read 124 ms against 48 ms; 2.06 positions/s against 2.48 |

Probe C typed about 2 keys per position where the main run had 9–23, so its rate is not a like-for-like
comparison with the main run. Its service handling times are.

## What bounds the rate

- **Ledger past about 500 positions:** service handling is 58–61% of the cycle. The 512-entry
  verification cache cannot hold the ledger, so each request re-verifies all of it.
- **Ledger below that:** the client is about 72% of the cycle, in parts of comparable size: the empty
  self-read pass, the 50 ms pause, storage and crypto round trips, and about 100 ms of CPU re-checking
  authority.
- **Not binding in these runs:** the session request budget, UI publication, document comparison, and
  the network on loopback.

## Measured, inferred and not measured

Measured: every figure in the tables above.

Inferred: a projection for the public installation. Each position needs about 2.4 requests, so added
latency of L per request adds about 2.4 × L per position. A 300-position backlog below the bound would
take about 2.3 minutes locally; 600 positions past the bound about 13 minutes; 1,500 positions about
52–62 minutes on extrapolated service times. A slower server CPU raises the service share.

Not measured: the public service's CPU, ledger length and latency; three or more devices; catch-up
after a cold reopen (the receiver was offline, not closed); a large workspace, where per-update
promotion and publication would cost more; a phone as the receiver. No Chrome trace was taken, so the
split of the client remainder between waiting and CPU comes from the CPU profile's idle share alone.

## Files

| File | Contents |
| --- | --- |
| [plan.md](./plan.md) | Sizes and order fixed before each stage, with the amendment |
| [summary.json](./summary.json) | All runs: conditions, load, other-session overlap and headline figures |
| [builds.json](./builds.json) | Commit, patch, `dist` digest and entry-file hashes per build |
| `runs/NN-label/` | `analysis.txt`, `analysis.json` and `meta.json` per run, and the three profile trees |
| `service-probe.patch`, `diagnostic-*.patch` | The service request log and the three diagnostics |
| `probe/`, `scripts/` | The Playwright probe, the run scripts, `analyze.py` and `profile-tree.mjs` |
| [logs-manifest.json](./logs-manifest.json) | Path, size and SHA-256 of the 58 per-run log files, and of one archive of them |
| [receive-trace.md](./receive-trace.md) | The read-only trace of the receive path |

**The per-run logs are included in [results-logs.tar.gz](./results-logs.tar.gz).** They are 2.3 MB in 58 files (`catchup.json`,
`service.jsonl`, `sampler.jsonl`, `run.log` and the copies of the files above), archived as
`results-logs.tar.gz` (250,965 bytes, SHA-256
`cf1faadd8234d717420c5b00f2175dcbeac1d82b9cf8e0bfd0d5d28d5bd55480`). The manifest now resolves the archive inside this packet and preserves the original review-session
scratch location for provenance. On integration, the archive hash and all 58 recorded member hashes
were verified; original macOS metadata members are separately counted. No archive bytes or results changed. Disposable service state, Playwright artifacts, raw CPU profiles and the service
profiler's output are neither archived nor hashed. The probe's two TypeScript files and
`profile-tree.mjs` were formatted after the run; nothing else in the copies was changed.

## Reproduction

Make a scratch checkout with `git archive 7b6d8d9f`, symlink installed dependencies, apply
`service-probe.patch`, and build with `APP_BUILD_REVISION=<commit> APP_BUILD_DATE=2026-10-11` and
`vite build`. Apply a diagnostic patch to a second copy for A, B or C. From a directory holding
`probe/`, `scripts/` and the build directories, `scripts/run.sh` and `scripts/run2.sh` execute one run;
`scripts/diagnostics.sh` and `scripts/diagnostics2.sh` chain the probes; `scripts/analyze.py` writes
each run's `analysis.txt` and `analysis.json`. Ports 53781/53782 must be free. It must never be pointed
at real service state.
