# Actual client continuation and shared publisher-tip invalidation

**Confirmed mechanism:** a stale fingerprint on one publisher can invalidate otherwise byte-identical captures for a different publisher, including a different account. The original full workload fails with and without observer source; its trace records six unrelated-publisher fingerprint invalidations followed by 28 hot-publisher revision refusals. A deterministic same-connection schedule independently establishes that the hot publisher's complete snapshot bytes did not change. A fresh capture still verifies.

**Actual client result:** all nine restored browser journeys pass complete exports, both-way writing, Undo/Redo and locked offline document reopening. In a targeted control under competing read load, the unchanged production client autonomously continues after a refused remote batch and resubmits the identical pending write after a refused submit. Both refusals are explicitly injected before forwarding. The natural browser loads produce no client-facing state-changed response; they do not establish actual-client behavior under the exact long-running cross-account native workload or indefinite contention. No runtime or limit is changed by this phase.

## Contract, source and boundaries

[Prospective protocol and chronological amendments](./protocol.md), [starting patch identities](./starting.json), [source/probe identities](./trace-identity.json), [browser summaries](./browser-summary.json), [native summaries](./native-summary.json), [raw evidence](./runs/) and [reproduction](./reproduction/) retain the distinction between observation, intervention and inference. Same Node 24.18.0, Chromium 151, M1 Pro/macOS host and locked dependency inputs as the prior rate investigation. Exact default production identity covers 803 files; the client build covers 110 files. Dependency-lock agreement does not audit the entire installed package store.

Only a disposable diagnostic copy of publisherTips.ts adds exception-isolated anonymous observations. It retains every original condition, mutation, transaction, authority check and retry. The final direct counterexample uses the existing native-test issuer convention; it does not claim scoped HTTP authorization from that direct call. The full contention runs use genuine scoped grants and independent Node/OpenSSL checks. The packaged browser uses its real service, transport, schedulers, IndexedDB, editor, service worker and current durable receipts, without a client rebuild, manual Retry, reload or scheduler wake to manufacture recovery. Shipped default 16/session and 64/process rates, bursts, concurrency, byte/work/deadline bounds and all current authority, custody, signature and durable-before-visible requirements remain.

These are fixed-fixture local mechanism/functional observations. The whole restored journey is the analysis unit; dependent requests and keystrokes are not independent samples. Instrumented and different-size conditions are not pooled as performance replicates. No population interval, maximum capacity, optimal rate, phone/Firefox/WAN, production incidence/adoption or generalized security/release qualification claim.

## Real browser continuation

Two independently restored browser contexts use the existing encrypted 121-card, 13,000-byte Goals fixture with 600 accepted missing positions. A offers 120 inputs at 150ms spacing while B reads and sends its own sentinel. The bounded pressure proxy duplicates only valid captured B reads, with at most three extra requests in flight and the same session budget. Those extra copies do not count as client progress and do not model six independent installations. All original 600s catch-up/30s live-writing deadlines and data assertions remain. Pressure stops for guardrails and every shadow is closed on cleanup.

| Restored journey | Backlog observed | Injected state-changed replies | Native client state-changed replies |
| --- | ---: | ---: | ---: |
| browser-pressure-pilot | 138.573s | 0 | 0 |
| browser-1-baseline | 33.217s | 0 | 0 |
| browser-1-pressure | 145.165s | 0 | 0 |
| browser-2-pressure | 135.506s | 0 | 0 |
| browser-2-baseline | 33.708s | 0 | 0 |
| browser-forced-refusals | 136.572s | 2 | 0 |
| browser-pressure-trace | 136.914s | 0 | 0 |
| browser-forced-remote-batch | 151.662s | 2 | 0 |
| browser-forced-remote-batch-v2 | 138.183s | 2 | 0 |

The load deliberately spends allowance on discarded duplicate reads; longer durations are not ordinary production catch-up estimates or a proposed policy. Preserve both fixed baseline/pressure orders and the separate pressure pilot. All nine final plaintext export identities agree. The observer-only browser run detects one fingerprint invalidation without a client-facing state-changed response; an invalidation need not exhaust the service's internal retry loop.

The initial forced read is a remote single read (decoded self=false), with the next read 402ms later. My early self-read label was incorrect; preserve the metadata and explicit correction rather than inferring a retry-clock guarantee. The first batch-named invocation selected the old proxy because its CLI working directory stayed at source-D; its results remain a remote single-read control and the batch analyzer correctly rejects them. The separately named, directory/hash-checked v2 control targets read-v2-batch and independently checks every inner request is remote. The next remote attempt starts 1172ms after refusal; a successful nonempty remote batch and all app data guards follow. A's original pending submit is accepted with the exact same body SHA-256, 1032ms after refusal. This verifies automatic client continuation across these known transient refusals, not absence of starvation under arbitrarily repeated natural refusals. CDP could not retrieve the refused submit's body in v2; the analyzer preserves that missingness and binds the unique network 409 to the proxy's exact injected reason by device/path/time containment. Any available decoded hint must agree. The accepted identical-body retry and complete app data guards, not the unsigned proxy hint, establish progress. The failed initial binding analysis is retained.

## Service mechanism and discriminators

Restore 1024 hot seed positions, six genuine hot sessions, one unrelated position and bounded independently signed write wires. Eight fixed 64-position/no-peer-read controls (two reversed 2×2 hot/unrelated writer blocks) all verify 384 positions. They do not reproduce the original workload and are not substitutes for its completion condition.

The source-matched original 256-position workloads both fail: traced at 7.015s and default at 7.004s, each with seven state-changed refusals, no hot accepted write and six unrelated accepted writes. The trace maps all 28 stale-revision guards to hot captures whose first invalidation came from the unrelated publisher's fingerprint race. Read, verification, current-snapshot comparison and fixed-purpose signing remain unchanged.

A separate deterministic schedule warms both publishers, captures both, and commits one valid unrelated write through the native delivery owner on the same SQLite connection. Independent verification accepts that write; the hot publisher's complete snapshot bytes remain exactly equal. Guarding the changed old capture advances the shared revision, after which the unchanged captured guard returns false. Fresh capture and full independent page proof still succeed. The no-change control guards both old captures successfully. This isolates a possible cross-publisher mechanism from incidental scheduling and from generic external data-version invalidation.

The full-size discriminators also retain inconvenient results. Removing the hot writer while keeping unrelated reads/writes still fails in 6.002s with no replay progress and five unrelated accepted writes. Removing unrelated writes permits 492 verified hot positions and 109 hot accepted writes before a later state-change refusal at 59.296s. Removing unrelated reads permits 586 verified positions plus 120 hot/60 unrelated accepted writes before refusal at 62.184s. Same-publisher append races therefore remain a separate contention surface; cross-publisher invalidation is not an explanation for every refusal.

All five failed full-size raw runs remain failed. The adapter still aborts on409 instead of exercising the app's complete continuation policy; those partial windows do not prove indefinite production starvation or completed capacity. The 64-position controls, two direct schedules, full-size failed runs and browser journeys have distinct purposes and are not pooled.

## Independent checks and preserved limitations

Every one of the 14 native states receives a read-only cold SQL audit. Each stored seed/interactive wire matches the independent original and every actual stored acceptance proof verifies with the Node/OpenSSL oracle. Offered, started, verified and unacknowledged stored outcomes remain distinct; failed/queued offers are not promoted to completion. These checks concern synthetic stores and are not a general corruption/security audit.

All 14 unchanged publisher-tip invariant cases pass against the observer-only source even when the observer throws on every event. This retains damaged row/count/predecessor/witness, signature, quarantine, stale-audit, exact historical-retry and transaction assertions. All 17 unchanged default budget/accounting cases pass. Planning coverage remains 878 obligations / 334 unresolved, 516 files / 510 required, and all 97 construction contracts/statuses exact. General qualification stays paused.

The uninstrumented full-default run retains its complete HTTP/results evidence but its expected empty observer file is zero bytes: the parent's post-acknowledgement termination can interrupt a redundant exit flush. Preserve that artifact and V1 source; mark the trace unavailable rather than invent events. All instrumented native traces parse without overflow. The pending browser trace uses atomic file replacement, with both monitor versions and identities retained. The first analyzer's parse failure, mistaken self-read label and CLI source-selection error are recorded rather than hidden by successful reruns.

Explicit preservation excludes fixture JSON, raw databases, browser storage, codes and keys. Known-value scanning covers 35 raw/JSON-escaped private fixture values; it is not a general secret detector. Previous three patches/packets, append-only record prefixes, the other seat's progress.md and deferred formatting remain exact.

## Next bounded opportunity

Review publisher-scoped invalidation for detected fingerprint races, keeping global invalidation for external/unknown state changes, closure and other conservative boundaries. Preserve the changed publisher's rejection, fresh transaction snapshot, full authority/signature checks, exact receipt/commit behavior, cache/memory bounds and effective corruption/quarantine controls. Add a failing desired-behavior regression before repair, then repeat the cross-publisher counterexample, full contention, actual-client continuation and security-boundary tests. Do not erase the separate own-publisher race result or raise rates on this evidence.

This phase prepares evidence-only patch 04 after immutable patches 01→02→03. No staging, signing, commit, preview restart, push, merge or deployment.
