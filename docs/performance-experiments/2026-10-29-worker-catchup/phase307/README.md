# Phase 307 — range-4 lab screen, ablations and original-gate challenge

2026-10-30. The operator-approved exploratory lane is complete. Every result is retained; none
is acceptance credit. All profiles and writing were fictional. Lab app source/builds stayed under
`/private/tmp`; this landing patch contains documentation and observations only. No original gate,
authority check, rate limit or release hold changed. The normal Page/Worker comparison remains held.
Phase 306 separately guards new range writes behind exact `VITE_ACCOUNT_RANGE_RECEIVE=1`, default off.
Durable-format and verification candidates still require independent hardening before landing.

## Frozen cells completed before exploration

The original S0/Y248/C291/fairness cohort finished first. Phase 300's older-browser S0 passed;
a browser identity change was refused before another timed cell. The pinned-browser cohort then
retained S0's 18.749 ms input p95 miss (302), exact Y248's passing 12.728 ms input / 2.182 s peer
p95 and 143.973 s backlog (303), C291's 3.354 s last-marker miss (304), and C291 fairness's
28.400 ms input / 6.460 s peer p95 plus five 600 s backlog misses (305). These results remain
separate; the lab does not overwrite them or establish a population effect from one matched pair.

## Actual Worker CPU diagnostic

One plain-build profile attached to the actual account-owner Worker, not the observation Worker.
The sampling interval was 1 ms; 21,088 samples cover 30.669 s, including a 565 ms capture tail.
The 30 s counters show 680 new native positions, 330 budget units, 171 inbound commits and
3,536 Window call/reply exchanges. No acceptance credit or profiled/unprofiled causal comparison.

Sampled self time:

| Location | Time | Share |
|---|---:|---:|
| Idle/await | 18.079 s | 58.95% |
| `verifiedRecords.ts:8`, exact record byte-span comparison | 3.830 s | 12.49% |
| `startupStorage.ts:104`, scoped IndexedDB cursor callback | 1.144 s | 3.73% |
| Garbage collection | 0.551 s | 1.80% |
| `account-protocol/recovery.ts:23`, unhex | 0.540 s | 1.76% |
| `verifiedRecords.ts:115`, selection | 0.441 s | 1.44% |
| `inboundTransport.ts:38`, hex validation | 0.398 s | 1.30% |
| `account-protocol/recovery.ts:16`, hex | 0.310 s | 1.01% |
| Native verify frame | 0.294 s | 0.96% |

The large byte-comparison hotspot compares record evidence; it is not signature arithmetic.
Request-start cycles averaged 117.35 ms per productive four-position round, about 29.34 ms per
position, and 66.33 ms for quiet rounds. Those cycles include the preceding reply/application and
next preparation; they are not exclusive stage CPU costs. Verified native receive-group spans
averaged 53.61 ms per four-position group; observed empty-native spans averaged 16.12 ms. The
remaining wall time cannot honestly be assigned from this one JS sampler: idle includes network,
IndexedDB, native crypto and Window waits. This run does not reproduce an exact 46 ms empty cycle.
Measured crypto wall spans include 232.2 ms verifying and 43.2 ms importing keys over the run;
overlapping wall spans are not additive CPU attribution. Raw samples and full mapped stacks remain.

Ledger retained ciphertext+nonce growth was 13,557.50 bytes per position (plaintext 13,501.50).
This is record payload accounting, not physical IndexedDB allocation. It exposes the repeated
page evidence cost without treating a CPU sample as a complete latency accounting.

## One-build runtime factors and design

A: authenticate empty replies but omit the Window preparation flight. B: batch quiet-peer signed
reads and retain only bounded raw replies for fresh verification. C: stretch the existing quiet
recheck budget from 750 ms to 3 s only while a known peer backlog drains. D: named content hints
with targeted invalidation. E: concurrent signature/envelope work and imported-public-key cache.
F: UNSAFE page-once process-local references, an upper-bound storage stub. G: eight-position
native turns; network page width stays four. F deliberately cannot survive a cold owner and is
never a landable representation. G changes the lab native-turn bound only; no service-budget change.

All factors share one 506-source / 606-asset artifact. The service still reports 16/session and
64/process; service automation stays off. Eight seeded, randomized L8 rows plus two extra plain
repeats were frozen before timing. One L8 row is itself plain, giving three plain observations.
The design is resolution III: main-effect contrasts are aliased with interactions. There are no
seven independently estimated causal effects, p-values or sample-size claims from per-position data.
Every journey uses a fresh copy of the same fictional state and a closed, already-uploaded sender.

Tokens are net charged logical units (acquire + reservation - refund), not session-plus-process
double counting. Window exchanges count port calls, each normally followed by a reply; raw message
counts are also preserved, including any in-flight boundary difference. Every denominator is native positions committed by 30 s. The target
is 1,024 historical positions plus one accepted final marker, 1,025 total. A dash means completion
was not observed within 30 s. No native receive failures occurred in the screen or ablations.

| Run | A..G | Positions at 30 s | Tokens total (per position) | Commits total (per position) | Window exchanges total (per position) | Cipher bytes/position | Completion |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `0000000` | 716 | 340 (0.475) | 180 (0.251) | 3659 (5.110) | 13559.3 | — |
| 2 | `0101011` | 1025 | 384 (0.375) | 130 (0.127) | 3175 (3.098) | 1643.8 | 22.191 s |
| 3 | `0000000` | 724 | 340 (0.470) | 182 (0.251) | 3653 (5.046) | 13559.7 | — |
| 4 | `1011010` | 1025 | 323 (0.315) | 258 (0.252) | 3627 (3.539) | 1643.8 | 28.633 s |
| 5 | `1100110` | 912 | 398 (0.436) | 229 (0.251) | 3211 (3.521) | 1640.6 | — |
| 6 | `1001101` | 960 | 399 (0.416) | 121 (0.126) | 2207 (2.299) | 13567.8 | — |
| 7 | `1110001` | 1025 | 323 (0.315) | 130 (0.127) | 2359 (2.301) | 13562.3 | 26.555 s |
| 8 | `0111100` | 868 | 284 (0.327) | 218 (0.251) | 3389 (3.904) | 13565.2 | — |
| 9 | `0010111` | 1025 | 302 (0.295) | 130 (0.127) | 2606 (2.542) | 1643.8 | 18.561 s |
| 10 | `0000000` | 704 | 336 (0.477) | 177 (0.251) | 3603 (5.118) | 13558.7 | — |

The plain runs made 716, 724 and 704 positions: spread 20, mean 714.67. The predeclared large
contrast threshold is max(10% of plain mean, plain spread), 71.47 positions. Aliased on-minus-off
contrasts were A +70, B +24, C +80.5, D +48, E -8.5, F +102.5, G +126.5. Named hints had **zero
exposure in every row**, so no benefit or harm of D is identified. E's negative aliased contrast is
not evidence that concurrent verification is intrinsically slower. C/F/G qualified for ablation.

F's apparent ledger saving excludes the external raw-page table: the complete runs also retained
1,529,791 external bytes, about 1,492.48 bytes per position. Its cost is not zero and its process-local
lifetime is deliberately unsafe. The on/off contrast is not a durable storage design qualification.

## Contributor removals

Best observed stack was C/E/F/G (`0010111`), selected by the frozen maximum-progress / minimum
completion-time rule. Each large enabled contributor was removed once using the same artifact.

| Stack | Positions at 30 s | Completion | Tokens | Commits | Window exchanges/position |
|---|---:|---:|---:|---:|---:|
| Best C/E/F/G | 1025 | 18.561 s | 302 | 130 | 2.542 |
| Remove C (`0000111`) | 1025 | 22.689 s | 386 | 130 | 3.153 |
| Remove F (`0010101`) | 1025 | 23.481 s | 314 | 130 | 2.587 |
| Remove G (`0010110`) | 1025 | 27.200 s | 320 | 258 | 3.863 |

All three removals still finish within 30 s. In particular, **C/E/G without unsafe F finishes in
23.481 s**, so the unsafe format is not required to clear this deep case. These are selected single
runs, not replicated independent component effects. The faster no-F stack has not received the
full original-gate challenge in this phase and is not an acceptance result.

## One frozen original-gate challenge of the exact winning stack

The exact C/E/F/G stack was challenged once per original cell, with invalid apparatus cells kept
and replaced separately as described below. Default budgets, 16 ms local p95, 2.5 s peer p95 and
every-marker gate, 30 s deep/final, 600 s backlog, 15 s public cold and original 180/900/1200 s
case deadlines are unchanged. The maintenance observer is separately identified: it forwards
actual native status facts, without changing optimization source or inferring counters.
The post-hoc observation extractor validates all 120 keys, three markers, trusted focused visible
inputs and the original clock formulas, but **does not convert failed whole journeys to passes**.
The old maintenance relative-ratio reference is not matched to this fresh fixture; no paired credit.

| Cell | Input p95 | Peer p95 | Worst marker | Backlog | Remaining failures |
|---|---:|---:|---:|---:|---|
| Two receivers, normal hints | 8.561 ms | 1.117 s | 1.114 s | 64.034 s | Cold reopen fails |
| Two receivers, hints withheld | 9.509 ms | 16.609 s | 3.464 s | 47.887 s | Cold reopen fails |
| Maintenance + editing, normal hints | 15.362 ms | 1.001 s | 0.929 s | 41.901 s | Cold reopen fails; only 58/120 keys during backlog (requires ≥60) |
| Maintenance + editing, hints withheld | 5.747 ms | 18.967 s | 11.095 s | 21.999 s | Cold reopen fails; only 18/120 keys during backlog (requires ≥60) |
| Unequal 10-device fairness | 16.100 ms | 1.628 s | — | 107.263 s worst | Input 16.100 ms >16; final peer cold reopen fails |

The withheld cases fail peer p95 and at least one marker. The absolute misses are preserved;
no rounding or changed gate. The maintenance normal/withheld cases also miss the ≥60-key backlog
overlap predicate because catch-up finishes sooner (58 and 18 keys respectively); those journeys
do not qualify that intended amount of contention. Actual native maintenance finishes, original
archive equality and edit/Undo convergence pass before the later cold failure.

Original native context/journal and native resumable-maintenance cases pass, including their
cold reader checks. The original deep joined case receives through 1036 in 15.142 s, has no
native receive failure, applies exact writing and excludes peer writing from local Undo, then
**explicitly refuses `UNSAFE LAB page reference lost across owner lifetime` on cold reopen**.
The public late/maintenance/fairness journeys separately fail to show the shell within their
original 15 s cold guard; do not infer a distinct root cause for every public failure from that UI
symptom alone. No original cold guard was bypassed or removed.

Fairness completes all six backlogs: H1 107.263 s, H2 104.746, H3 105.744, H4 104.655,
H5 104.186, M1 10.772. All 120 keys arrive by the original deadline. Original writing and pending
writing converge automatically after load clears; the offline writer's same-profile archive is
exact. The final peer cold failure means the suite's aggregate data guards still do not pass.
The original raw host/renderer latency formulas and clock brackets are retained, not retroactively
changed to make the 16.100 ms input observation pass.

Goals paragraph/refocus diagnostics complete on desktop and 4x CPU mobile emulation, 779/779
trusted focused visible inputs each, exact paragraph, return input, Undo/Redo and lock/reopen.
No long tasks appear in the paragraph/idle/return windows; the deliberate 120 ms control is detected
in both. Offer-to-rAF p95 is 18.154 ms desktop / 23.362 ms mobile, a different metric from the
existing mutation-observer 16 ms gate. These diagnostics earn no substitute gate or phone credit.

## Apparatus failures and replacements, all retained

The first gate attempt showed public clients with zero active lab bits despite the constructor
URL, so its public results cannot credit the winning treatment. Some apparent passes are retained
as invalid-treatment results, not reinterpreted as qualified plain controls. One native combined
process was also affected by a cleanup timer referring to the following case's dynamic output.
The corrected gate plan gives native cases separate processes, retains the original test bodies
and deadlines, and explicitly configures every actual BrowserContext.

Treatment preflight 1 refused: cached response alias retained its canonical Response.url, making
WorkerLocation lose the query bits. Reconstructing the alias from identical body/headers/status
with empty Response.url preserves the requested query. Preflight 2 proves actual native bits
`0010111`, eight-position groups, external pages and imported-key-cache hits. Original app/SW
byte hash guards remain; offline cache aliasing occurs before first offline transition, with
no cold storage reinjection.

Three native cells then failed before setup because an AST wrapper joined `await` to its function
name. The isolated replacement changes only that missing space; originals remain. They produce
the two native passes and the explicit deep cold failure above, not favorable reruns of app failures.

The original maintenance-withheld Window probe saw zero frames despite 200 subscription responses;
that cell is invalid fault exposure. The replacement injects loss at actual authenticated server
SSE writes, scoped to the fictional reader's existing public credential, passing ready/heartbeat
and other-device frames. Two role adapters refused before any browser setup: the first helper
only recognized later candidate admissions; the second incorrectly assumed the older admission's
version. The final adapter uses the actual v2 content admission's admittingCredential, the field
native reading verification compares to its reader ID. Original source/assertions remain.
The resulting **119 reader content hints are withheld, zero from the other device**, and the
unchanged >0 assertion passes. This valid withheld result is the 18.967 s peer p95 failure above.
No false favorable result replaces any of these attempts.

## Publication on genuine v5

The earlier 22.378 s publication used explicit `installLocalBaseline` into a v3 lab state. No
shipped caller was established, and normal retention goes directly to v5. That result remains
historical lab evidence, not an established ordinary production publication cost.

A separate fictional account started at real v2/revision0 and ran actual production
`compositionRemoveLocalHistory(0)`: six saved preparation slices, five activity/journal skips,
then 7,275 records removed into v5/revision1. No counter forgery or installLocalBaseline call.
With all seven lab factors off, one fresh source was admitted in 20.701 ms, flushed in 36.050 ms
and natively accepted in **648.104 ms**, including nine status polls. The handler returned in
15.985 ms; before/after counters are v5/revision1. The unchanged shipping reader cold-opens the
exact archive. One observer-inclusive observation, not a population estimate or paired speedup.

## Next bounded candidates and holds

1. Preserve this fast-direction evidence, but isolate the withheld-hint failure before hardening
   the selected scheduling stack. C's 3 s quiet budget cannot simply be adopted against a 2.5 s
   gate; this phase does not establish that C alone causes the much longer observed delays.
2. Explore the no-F C/E/G stack, then separate eight-position fairness from verification concurrency.
   Avoid a new durable format merely to clear deep30s: the no-F ablation already does so in one run.
3. Exact byte-comparison/storage coordination is a stronger profile lead than signature arithmetic.
   Any verification reuse still needs exact evidence, owner/lifetime fencing and fresh authority;
   concurrency/key caches require isolated hardening before landing.
4. If page deduplication is pursued later, design durable authenticated references, atomic commit,
   cold recovery, interruption, garbage collection, stale-tab and rollback compatibility together.
   The process-local F stub must never land.

Range writer remains default off. V2 receipts remain development-only; stale-tab/rollback,
original deep/marker/fairness/input obligations and release holds stay open. Phase 306's full-unit
red attempt (storage compatibility timeout / late async contamination) and isolated unchanged-file
pass remain separate; no full-suite green is claimed here. No signing, commit, push, merge,
deployment, preview change, real profile or computer use occurred in this phase.

The [evidence index](./evidence-index.json) records 266 raw artifacts and all retained roots;
[screen rows](./screen-results.json), [contrasts](./screen-analysis.json),
[ablations](./ablation-results.json), [gate observations](./gate-observations.json),
[CPU summary](./cpu-summary.json) and [real v5 publication](./v5-publication.json) are directly readable.
Runtime/source/asset hashes and the CPU capture are preserved without copying lab implementation
or builds into the landing series. Existing metadata manifests receive no lab-test or gate credit.

Documentation closeout: all 266 raw artifact copies match their originals and recorded hashes;
every retained frozen apparatus still matches its input manifest. The 10screen rows match the
frozen design in both directions; three ablations and every failed cell remain. All seven
repository contract checks and diff whitespace checks pass. No new runtime/test source or
qualification credit is introduced by this evidence patch.
