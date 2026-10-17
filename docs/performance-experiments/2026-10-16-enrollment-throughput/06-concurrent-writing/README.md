# Concurrent writing — retained failed experiment

The dense-page candidate revealed repeated full-prefix verification when a same-publisher write wins a read's commit race. A proposed bounded append-prefix cache repair rehashed every prior wire/proof and derived indexed metadata, keeping the stale request refused. Its 11 directed cases passed (including corruption, external connection, authority/witness and row/byte/time fallback controls), alongside 23 preceding native cases. The prototype and its test are retained here as compressed, clearly deferred source; none is included in the runtime changes or normal test collection.

## Prospective guardrail and outcome

The same 1,024-row first-epoch fixture offers nine writes at fixed 500 ms input offsets while replaying eight-entry pages. Offered input latency includes client queueing; writes are serialized, every offered write finishes, and a second account continues independent reads. Three restored pairs alternate order. Both arms use the phase-C frontend-independent API protocol and identical rates; candidate adds only the proposed prefix repair. No validator ran concurrently. The first reference attempt refused with 409 and was retained; before repeating, the protocol was amended to run all six predefined arms, preserve refusals and award no completion/timing credit to failed replay. No 409 is silently retried by the probe.

**All six arms fail replay with `409 unknown/state-changed`.** All nine writes per arm eventually succeed; no rate-limit response occurs. The candidate reduces full censuses (reference 19/19/13; candidate 12/12/6), but neither reliable completion nor the prospective writer guardrail is established. Failed runs have unequal completed replay work; their CPU and duration cannot support a paired speedup claim. The original failed attempt remains alongside the final six outcomes.

## Decision and remaining work

Defer the additional cache implementation. Restore the exact phase-C runtime before the final functional checks. Numeric rate limits and all existing authorization, cryptographic, native commit-race and corruption checks remain. The measured accounting/page-density improvements remain reviewable patches, but phase C's final concurrent-writer acceptance condition is **not met**. The patch series is a tested development candidate with this explicit open blocker, not ready for release or a claim that device approval is reliable under sustained concurrent writing.

A future bounded phase must reproduce the real history client's transient state-change handling and establish completion plus bounded writer latency under a fixed offered workload. It must preserve fresh transaction authorization, exact signed requests/cuts, expiry/retirement, corruption detection and the existing work/byte bounds. Do not infer that raising rate limits repairs this failure: these six runs contain no 429s. Reconsider the cache mechanism only against that discriminating outcome.

No keys, credentials, private fixture snapshots or service databases are included. General qualification remains paused. No commit, preview change, push, merge or deployment.
