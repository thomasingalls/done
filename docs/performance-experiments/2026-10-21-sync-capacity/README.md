# Sync capacity and rate-policy investigation

**Finding:** the current session allowance materially delays ordinary loopback catch-up. Increasing only its refill from 16 to 64 work units/s reduces two restored 600-update journeys from 33.243/33.743s to 22.575/23.088s (31.6–32.1%). Increasing only the process refill from 64 to 256 does not help this fixture. **Keep shipped rates unchanged for now:** the separate contention probe fails its completion condition at default and higher rates, with `state-changed` refusals before any 429. This phase identifies a rate cost and a further liveness boundary; it does not qualify a production policy or measure maximum server capacity.

## What was controlled

The same exact patch 02 client build runs in every arm. Temporary service copies vary only two numeric refill literals in `account-service/requestBudget.ts`; all 803 source identities and 110 built client files are checked. D = 16/session, 64/process; S = 64/64; P = 16/256; B = 64/256. Burst 120/480, live concurrency 4/session and 16/process, map bound 1024, invalid-bearer allowance, byte/work/deadline bounds and all signatures/current authority/custody checks remain. No repository runtime source or shipped limit changes.

The code explicitly describes these as admission policy rather than measured capacity. A full batch costs four work units, with one unit charged before its bounded body and the remaining actual requested work reserved atomically. Unstarted work alone is refundable. Renewed access/grants retain their server-held session key. Current scoped HTTP capacity retries retain exact bytes and wait 1000ms, then 2000ms. Those waits and the refill policy interact; elapsed savings cannot be split into additive causal shares merely by summing wait intervals.

The [prospective protocol](./protocol.md) freezes conditions, units, workload, outcomes, guardrails and failure handling before measurement. [Identities](./identity.json), [browser plan](./browser-plan.json), [raw runs](./runs/), [analysis](./browser-summary.json) and [reproduction](./reproduction/) retain the boundaries. Node 24.18.0, Chromium 151, the same M 1 Pro/macOS host and locked dependencies are used. Lock agreement does not audit the full package store. These are local engineering observations, not Firefox/Android/WAN, production adoption, release qualification or container sizing.

## Browser rate intervention

All fourteen ordinary journeys preserve full export equality, two-way writing, Undo/Redo retaining remote writing and locked offline document reopening. The fixed fixture has 121 cards, 13,000-byte Goals and exactly 600 already accepted missing positions, with 120 new inputs independently offered at 150ms plus a reverse-device sentinel. Restore matching private browser/API state each time; local opening/unlock is outside the catch-up clock. No overlapping benchmark/build/validator or successful-only retry. The complete restored journey is the analysis unit; requests/keystrokes are dependent and no population confidence interval is claimed.

| Loopback factorial arm | Block 1 | Reversed block 2 | HTTP 429s |
| --- | ---: | ---: | ---: |
| D: session 16 / process 64 | 33.243s | 33.743s | 12 / 12 |
| S: session 64 / process 64 | 22.575s | 23.088s | 0 / 0 |
| P: session 16 / process 256 | 34.281s | 33.798s | 12 / 12 |
| B: session 64 / process 256 | 23.115s | 23.085s | 0 / 0 |

The predeclared third D/B pair is 33.764→23.586s. Median paired B/D improvement across all three is 30.5%, exceeding the investigation's 15% meaningful-effect threshold; every pair improves. Reference drift is 1.57%, below the 15% follow-up rule. S/P contrasts have two repeats and are mechanism diagnostics, not an independently qualified optimal policy.

At +75ms/request, D/B changes 38.721→37.737s (2.54%), so the rate lift supplies little benefit in that one higher-latency pair. This is not a full rate×latency response curve. Foreground isolated peer p 95 is 613.8→670.4ms; continuous peer p 95 is 2256.4→2250.9ms. Every local/peer typing guard passes, including the predeclared ≤ 10% peer p 95 tolerance. These tolerances do not replace TRD latency budgets or prove zero regression. The independent analyzer reconstructs DOM percentiles from raw length observations and checks complete exports, rather than treating HTTP 200 or CDP body availability as domain progress.

## Separate anonymous budget diagnostic

The instrumented default journey takes 33.716s and passes all data guards. Five HTTP 429s agree exactly with five `top-up:session-rate` observations; no process-rate, concurrency or map refusal occurs in that window. The next same-session admission follows each refusal by 1004–1011ms. Observer output contains numeric session ordinals rather than tokens/session identifiers. This diagnostic is excluded from ordinary timing.

The API uses 11.131 CPU core-seconds across a 34.546s instrumented window, with sampled RSS peak 269.2MB and event-loop utilization 0.245. RSS is sampled every 20ms, not a whole-heap bound; event-loop delay uses 10ms resolution. The API process excludes browser/client CPU and local IndexedDB work. Idle time here does not establish safe aggregate capacity. [Diagnostic observations](./diagnostic-summary.json) retain the exact window, reasons and resource samples.

## Contention: acceptance condition not met

A fresh, independently signed first-epoch native fixture has 1024 accepted hot-account positions, six genuine sessions of that workspace and a separate account. Six replay streams each target 256 positions; the hot session has 500ms write offers, while the unrelated account has 250ms read offers and 1000ms write offers. Each writer serializes its contiguous positions while offers remain independent, so queueing is observable. Server CPU/RSS are measured in a separate process from client signing and independent OpenSSL proofs. This models a hot workspace with several sessions, not six independent authority histories.

All six fixed arms `[D,S,B]`, then `[B,S,D]`, fail before all 1536 requested positions complete. All refusals are HTTP 409 `unknown/state-changed`; there are zero 429s. The hot writer completes no offered write, while the unrelated account completes 6–7 writes per run. Five runs verify no replay position; one S run verifies 67 before stopping. Partial results remain failed/censored outcomes and are not lower-latency wins. The raw probe stops at a state-change reply and implements the scoped HTTP capacity retry, not the app's complete outer continuation policy. This does not prove indefinite writer starvation or a production stoppage; safe transient refusal may be recoverable by the actual client. The API method counters are outer read invocations, not counts of internal snapshot retries or cryptographic operations.

These failed 7.0–8.0s windows consume 15.1–17.0 CPU core-seconds, with sampled RSS 408.7–436.0MB. They do not estimate maximum capacity, useful sustained throughput or a safe policy. All remain below the 1GiB resource stop; none is silently extended beyond the 120s replay ceiling. [API summaries](./api-summary.json) and raw statuses preserve the exact failed schedule and partial prefixes.

Both predeclared reader-only D controls pass: one reader verifies 64 positions in 1.001s; six verify 384 total in 2.530s, with no writes/peer and no refusals. This associates the observed failure with the competing-write workload in this fixture. It does not yet isolate which commit or invalidation initiates the failure. Source inspection provides a concrete hypothesis: `publisherTips.guard()` uses a shared revision, and a detected fingerprint race invalidates all captured publishers; delivery retries a changed snapshot four times before returning `state-changed`. A controlled cross-publisher invalidation trace is needed before changing that mechanism. No guard is removed, result trusted or blanket 409 retry added here.

Read-only cold SQL audits independently verify every stored seed/interactive wire and acceptance proof in successful and failed runs. Each failed primary run retains all 1024 hot seed positions and one unrelated seed plus 6–7 new unrelated accepted positions; none stores a hot offered write as accepted. Successful live write replies are also independently verified. Failed, unacknowledged and queued offers remain distinct from completed operations. This is evidence about these synthetic stores, not a general corruption or security audit.

## Decision and preserved failures

Keep shipped 16/64 refill policy and the process ceiling. The browser counterfactual identifies session-rate-plus-retry cost; it does not establish that 64/session is optimal or safe. First test actual client continuation and isolate any unnecessary contention invalidation while preserving the fresh snapshot, authority, exact receipt and transaction guards. Then repeat contention/capacity checks and consider a smaller per-session step such as 32 as an untested candidate. The process-only intervention does not support a blanket global increase. Remaining client verification/storage work and latency costs are separate targets.

Preserve both API pilots and sources. The first passes but contains an unintended reader/writer-proof barrier; the corrected pilot exposes 409s before recording reason bodies, so only later primary observations establish their exact classification. Retain the initial missing signed contract-input seed failure and its corrected invocation. In chat, an intermediate update gave incorrect latency-pair figures; the raw result was immediately reread and corrected to 38.721/37.737s, which all durable analyses use. No outcome or threshold is rewritten around those attempts.

All 17 existing default-budget/refill/accounting regressions pass unchanged. No old test, assertion, release obligation, construction status or aggregate block changes. General qualification remains paused. Private fixture JSON, database state, passkeys/codes, session tokens and keys stay outside Git through an explicit whitelist and exact known-value scan; that scan is not a general secret detector. No signing, staging, commit, preview restart, push, merge or deployment. Prepare evidence-only sequential patch 03 after immutable patches 01→02; `docs/progress.md` and deferred formatting stay untouched.
