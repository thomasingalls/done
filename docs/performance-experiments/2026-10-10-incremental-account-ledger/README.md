# Incremental Account ledger validation

Development experiment on `codex/account-self-stream-progress`, following signed `d5763346`.
Release validation remains paused. No public rollout or on-disk/wire format change.

The [protocol](./protocol.md) records predictions before implementation. The implementation retains
full physical census/authentication, journal durability, authority ownership and transaction guards.
An owner-local verified prefix can now be extended by exact appends rather than reparsing and
semantically replaying the whole ledger on every storage task.

**Outcome:** the opt-in candidate substantially reduces warm-session growth, but does not finish
editing latency work. Across the four matched points, the fitted main-thread p50 slope falls from
0.3799 to 0.0445 ms per prior edit (**88.3% lower**). Stable-text p95 improves at both deep points,
meeting the predeclared development targets. Cold opening is slower and retained heap is higher;
periodic full-audit maintenance still approaches 1.6 seconds. Keep the candidate behind the switch;
reference remains the default and nothing is deployed.

## Matched results

Baseline is signed `d5763346441ff98809442bb48b38ddd621516cd6` plus numeric compaction instrumentation.
Candidate source/build hashes are in [source.json](./source.json); the displayed base revision alone
does not identify the uncommitted patch. Both arms completed all 2,320 edits, all timed blocks reported
complete text, and neither reported a text mismatch, application error, or missed history target.
Two normal-cadence candidate audits ran across the measured page lifetimes, with zero mismatches.

Milliseconds, baseline → candidate. Stable text is the **last** arrival after any native insertion
and controlled-editor removal/reappearance; first-arrival summaries are optimistic under pressure.

| Prior per-key edits | Predicted main p50 (baseline / candidate) | Observed main p50 | Stable text p95 | Paint p95 |
| --- | ---: | ---: | ---: | ---: |
| 0 | 145 / 80 | 140.0 → 99.7 | 64.1 → 11.4 | 55.6 → 10.8 |
| 520 | 350 / 150 | 345.5 → 125.3 | 1,237.9 → 115.6 | 363.7 → 49.7 |
| 1,220 | 575 / 250 | 604.6 → 165.1 | 2,529.4 → 329.6 | 859.2 → 120.7 |
| 2,220 | 850 / 390 | 986.3 → 197.4 | 5,071.9 → 613.3 | 1,621.3 → 231.7 |

Endpoint slopes are 0.3812 → 0.0440 ms/edit; fitting all four points gives 0.3799 → 0.0445.
At the deepest point main-thread p50 is 80.0% lower and stable-text p95 is 87.9% lower.
That remaining 613 ms p95 is still poor interactive latency. The full candidate exceeded the
predicted warm improvement at depth; its fresh main-thread p50 was worse than predicted.

Requested key gaps are 110–180 ms; observed median gaps at the four points are baseline
171.6/341.6/609.6/988.4 ms and candidate 155.9/171.6/188.2/212.5 ms (see raw analysis for exact values).
The driver slows under load. Batching, persisted positions and background request counts consequently
differ; this is a comparison at matched logical typing history, not matched physical row counts.

### Maintenance, cold opening and heap

Each row covers the interval ending **after** its 100-key block. Compaction maxima include nested
validation, so do not add the full-audit maximum to them. There was no compaction in the first interval.

| End-of-block edits | Compaction max ms (baseline → candidate) | Candidate full check max ms / audits | Cold open ms (baseline → candidate) | Post-reopen GC heap MiB (baseline → candidate) |
| --- | ---: | ---: | ---: | ---: |
| 100 | — | 1.1 / 0 | 1,120 → 1,259 | 8.85 → 9.14 |
| 620 | 392.5 → 98.2 | 125.5 / 0 | 3,291 → 3,554 | 10.25 → 10.86 |
| 1,320 | 1,017.9 → 895.4 | 668.3 / 1 | 6,903 → 7,126 | 11.70 → 12.79 |
| 2,320 | 1,720.8 → 1,591.8 | 1,311.0 / 1 | 9,663 → 11,813 | 13.56 → 15.09 |

The deepest cold open is 2.15 seconds slower and post-reopen heap is 1.53 MiB higher. These are
observations from one pair, not independently attributed cache costs. Full checks include the cold
open at the start of each interval and any subsequent audit. Content reconstruction alone remains
small on this tiny typing workspace (candidate maximum 12.9 ms in the deepest interval); the isolated
large-document probe below shows why that should not be generalized. Peak heap, exact retained-cache
bytes and bytes scanned per physical load were not measured; post-GC page heap is only a partial
answer to the memory question.

This result supports keeping the incremental implementation for the next repair. It does not justify
closing F-17, changing its budgets, restarting release validation or claiming history-independent work.
Next: inspect the retained physical census/copies and admission-queue occupancy, while explicitly
accounting for the cold-open and periodic-audit costs. Accepted-prefix digest-only representation is
still separate work.

## Eligibility and authority

`VITE_ACCOUNT_LEDGER=incremental` enables the candidate in the packaged application. Unset (or
`reference`) uses the reference path. Every old row must still match kind, generation, sequence and
bytes. New sequences must follow the verified tail. An old-row change, insertion below the tail,
noncontent deletion, history installation or unsupported transition falls back to full verification.
Changed authority clears the view. The complete signed counter witness must agree after every delta.

Source indexes, allocation order, invocation grants, envelopes, submissions, signed decisions and
peer pages extend the previous semantic state. Crypto verification applies to affected positions and
new evidence. Existing accepted own positions and verified peer prefixes need not replay their
coverage proofs again. Speculative precommit checks use a detached continuation; they never install
success before the durable commit. A commit abort therefore cannot publish the proposed view. Failed
verification or owner invalidation clears reusable success, and late async completion cannot reinstall
it. Cold opening always uses the full verifier.

Exact content compaction is an explicit exception to the append classifier: every surviving row must
still match, all deleted rows must be content, and independently reconstructed Yjs state must equal
the prior content view including pending/deletion state. Otherwise full verification runs. Positive
coverage conclusions survive that proof. Negative conclusions are never cached. Pending-state
transitions clear positive memoization. Hash buckets are only indexes: an exact byte comparison
resolves every hit/collision.

## Audit and bounds

A full reference comparison runs after at least 1,024 appended rows when a newly written compaction
state is observed. It uses an isolated coverage reconstruction, compares the observable census,
delivery and inbound state, and invalidates the owner on disagreement. Reporting is a fixed
`done/account-ledger-reference-mismatch` code and a numeric counter, with no writing/identity/keys.
This audit shares maintenance/validation scheduling; it can still delay a key arriving during that
work. Lock does not wait for an audit before key erasure. Tests can use
`VITE_ACCOUNT_LEDGER_AUDIT=every` (native harness: `ACCOUNT_LEDGER_AUDIT=every`).

Additional indexes are limited to 32,768 rows, 32,768 source frames and 32 MiB of input. Above that,
the reference path applies. Positive coverage owns at most 4 MiB/4,096 entries. These are **not a
bound on total application memory**: the existing byte-owning verified view and cryptographic memo
still retain historical material, and several public/internal projections copy it. Replacing accepted
bytes with digests needs a separate change to retry, duplicate and projection ownership. No claim
of constant-memory operation or history-independent total latency follows from this repair.

`VITE_ACCOUNT_LEDGER_PROFILE=1` exposes a numeric-only diagnostic getter for the probe. Elapsed
validation/compaction times can overlap and are not CPU attribution. Chrome traces measure
main-thread work separately. The incremental/source/event counters include speculative precommit
work as well as durable-view extension; they are not counts of unique persisted rows. Normal builds do not expose the getter.

## Evidence

[Comparison](./comparison.json), `baseline/`, `candidate/` and `step2/` retain every completed block,
raw key/network captures, summaries, stable-arrival tables and run logs. The network probe records
paths/timings/byte lengths, not request bodies or authentication headers. [Focused verification](./verification.md)
records checks and commands. Large Chrome traces remain in `/tmp/done-incremental-ledger/results-*`;
their derived summaries are saved here, but the temporary traces are not durable evidence. Disposable
service state and credentials are excluded.

The early source/spool/delivery-only run is retained separately. At 520 prior edits it measured
177.3 ms main-thread p50/key (previous repair's comparable block: 349.7), stable-text p95 268.1 ms
(previous 1,221.1), and paint p95 135.5 ms (previous 408.3). This was one shortened run, before
coverage continuation, and does not establish the slope or final behavior.

## Measurement definitions and limits

The matched four-point probe traces 100 ordinary keys after exactly 0, 520, 1,220 and 2,220 prior
per-key edits. Bulk history uses the predeclared 60 ms requested cadence. It then locks, navigates to
a fresh page and reopens the saved account after **each** block. Thus cold-open/heap observations
are at 100, 620, 1,320 and 2,320 edits; the next typing block has a fresh in-memory undo stack. Both
arms use that sequence. Historical packets without those intervening reopens are context, not an
identical control. Cold-open duration includes native storage, full verification, virtual passkey and
editor rendering from the unlock click. It is not pure ledger CPU time.

Heap is Chrome CDP `JSHeapUsedSize` after forced GC, including the application and probe. It is not
peak allocation or a direct retained-cache measurement. The warm probe has accumulated observations;
navigation clears them before the reopened measurement. Baseline instrumentation adds only numeric
compaction timing; its zero semantic counters mean **not instrumented**, not zero verification work.
Compaction timing covers the storage compactor, while separate candidate reconstruction/audit timers
cover work that can follow it. Neither alone is the complete user-visible maintenance pause.

The larger-document probe uses 1 KiB, 128 KiB and 1 MiB texts with distinct prepended Yjs items and a
delete range; setup is outside timing. Eight measured repetitions follow one warm-up at each size.
It measures rebuilding, a real uncached fork/comparison, a positive cache hit, and an equivalent
snapshot replacement. It does not claim these synthetic documents represent a large production
workspace. Full cold replay remains required regardless of cache-hit speed.

### Isolated coverage cost

Eight measured repetitions after warm-up; milliseconds, p50. Positive-hit times are at/below the
browser timer resolution (20 hits per timed sample), not a claim of literally zero work.

| Synthetic text / structs | Rebuild | Uncached check | Equivalent snapshot replacement | Fresh reference rebuild + check |
| --- | ---: | ---: | ---: | ---: |
| 1 KiB / 32 | 0.1 | 0.2 | 0.2 | 0.2 |
| 128 KiB / 4,096 | 2.5 | 1.5 | 3.4 | 4.2 |
| 1 MiB / 32,768 | 20.9 | 13.0 | 25.4 | 33.4 |

[Raw numeric results](./coverage.json). New/missing coverage still invokes the full fork-and-compare
operation. Caching removes repeat work; it does not change that operation's workspace-size cost.

## Disposition of the implementation advice

1. **Adopted:** predictions first, then all four matched history depths; stable arrival as well as paint.
2. **Adopted:** compaction timing and independent content equivalence; reuse prior positive conclusions
   only after that proof. The periodic reference audit's cost is reported separately.
3. **Adopted:** positive-only memoization. Missing coverage is reconsidered on later content.
4. **Adopted:** isolated per-check cost at larger sizes, without claiming a whole-application large-corpus result.
5. **Partially adopted:** bounded added metadata/positive bytes and measured post-GC heap/cold open.
   The existing retained historical byte view remains; accepted-prefix digest-only storage is deferred.
6. **Adopted with placement changed:** reference audit at the compaction boundary after 1,024 appended
   rows; no audit delaying lock/key erasure. Mismatch invalidates and emits a fixed, content-free code.
7. **Adopted:** three executed invalidation fault controls, plus abort/reopen native cases and generated histories.
8. **Adopted:** product switch connected at source/spool/delivery stage; that early measurement and
   exact partial source are retained alongside the complete candidate.

## Reproduction

Build separate scratch checkouts with the installed lockfile dependencies. For the comparator, start
at `d5763346`, apply `baseline-instrumentation.patch` and copy `baseline-metrics.ts` to
`src/crdt/accountLedgerMetrics.ts`. Build with `VITE_ACCOUNT_LEDGER_PROFILE=1`. Build the candidate
with `VITE_ACCOUNT_LEDGER=incremental VITE_ACCOUNT_LEDGER_PROFILE=1`; leave audit mode unset for
the normal maintenance cadence. Both measured builds use `APP_BUILD_DATE=2026-10-10` and the base
revision above; consult hashes for the candidate identity.

Copy `probe/` into a scratch directory with access to installed Node dependencies (a `node_modules`
symlink in its parent suffices). It creates disposable service state beside that copied directory.
Ports 53771/53772 must be free. Run arms sequentially; never point this at real service state:

```sh
DONE_PERF_SOURCE=/absolute/built-checkout DONE_PERF_RESULTS=/absolute/results node /scratch/probe/campaign.mjs slope
DONE_PERF_SOURCE=/absolute/built-checkout DONE_PERF_RESULTS=/absolute/results node /scratch/probe/stable.mjs slope
node docs/performance-experiments/2026-10-10-incremental-account-ledger/probe/analyse.mjs /baseline/results /candidate/results > comparison.json
node docs/performance-experiments/2026-10-10-incremental-account-ledger/probe/coverage.mjs /scratch/coverage.json
```

No concurrent browser campaign ran during timed blocks. Formatting/type/build and sub-second Node
checks ran during untimed preloads; these can influence background batching and are part of the
single-pair measurement limitation. The performance probe is observational development tooling, not
a release gate or an assertion that any fixed latency budget passed.
