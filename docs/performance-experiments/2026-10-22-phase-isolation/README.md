# Phase24: isolate authority optimizations and sync backlog

**Status:** diagnostic isolation complete; candidate23 remains **held**. No runtime repair or performance promotion.

The prospectively frozen four-condition design separates request-local authority/history sharing22 from the publication adapter23. A=21 neither; B=22 only; C=true21 with only the reviewed23 publication hunks; D=23 both. C is a coherent complete native source tree, not a mixed-module replacement. Exact hashes and the minimal publication diff are preserved. All variants run with the same protocol, wrapper, original110 client artifacts, cloned seeded state, isolated browser profiles and cold service caches.

Fixed order A,B,D,C,C,D,B,A gives each condition two mirrored whole journeys. The journey is the analysis unit; keys, requests and progress samples are dependent observations. These finite, nonrandomized results expose component effects for this diagnostic workload, not population or stable tail distributions. Host drift remains possible; reversal checks consistency without eliminating nonlinear drift.

|Condition|Peer p95, seconds (both runs)|Writer submissions|Displayed max backlog|
|---|---:|---:|---:|
|Neither (21)|5.49/9.68|78/78|5/11|
|Request-local only (22)|15.26/9.72|61/64|12/9|
|Publication reuse only (21 + adapter23)|26.28/27.78|120/120|52/54|
|Both (23)|36.63/31.30|116/120|66/63|

Enabling publication reuse raises unique submissions from61–78 to116–120 and increases displayed backlog in both conditional contrasts. Zero repeated body identities means these counts are distinct submissions, not retry amplification. All peer samples are complete. Request-local sharing also does not improve live latency in these journeys. No phase is promoted; faster publication p95 alone does not satisfy responsiveness.

## Scope and retained gates

Same H6/M2/Q2 with original1024/256/32 history workloads, four independent browser roots and10contexts each,1CPU/1GiB/zero swap/pids128,16session64process policy.120 trusted focused inputs at500ms; original16ms local/2500ms complete-peer and30s delivery observations are unchanged. All local and foreground delivery outcomes pass, every peer p95 fails2500ms. Competing background load stops at a predeclared90s; replay is explicitly censored, not credited or failed at600s. No quota/retry/request timeout or security guard changed. No native/client/crypto instrumentation in this phase; original DOM/input/status probe and closed HTTP body/error observer only.

Original120s automatic continuation, exact whole exports, guaranteed pending offline writing, actual same-profile cold reopen without reinjection, retained encrypted delivery records, reverse writing, Undo/Redo and account isolation pass for all8. Independent Node/OpenSSL native inspection validates ciphertext digests, envelope/wrapper/acceptance signatures, exact publisher prefixes, every seed row, distinct account/workspace/device identities and unchanged background accounts. Source/frozen-input and resource-envelope reviews include the actual mounted variant. All8 owned containers and32 recorded roots are stopped/absent; no owned persistent profiles or localhost53781 gateway remain.

## Analysis and tests

The new diagnostic helper in scripts/lib/sync-cadence-analysis.mjs reconstructs complete/missing per-key latency, exact submission identity/cadence and displayed sender/receiver progress. Seventeen hand-derived regression cases cover fixed trusted denominators, missing peers, unequal starting positions, repeated requests, account/phase separation, invalid timing, negative clock samples, counter regression and censoring. Six actual source omissions are detected. A separate Python raw-time/grid algorithm independently checks each key and backlog integral in both directions, rather than borrowing helper output. Seven altered-evidence/native-ciphertext controls are detected.

Progress is a UI notification proxy: it does not certify native acceptance or durable ingestion. Sender and receiver initial positions differ; each series is normalized to its own last pre-input baseline. Leading/negative progress differences and negative sub-ms clock samples remain visible rather than clamped. Renderer/host clock brackets, incomplete observations and observed subsets are retained. No full-peer quantile is invented for missing data.

All24 selected publication cases pass on C and D,48 total. One new negative-clock fixture initially put the sample before the measurement baseline; its failed attempt remains and the fixture is corrected. The first native selection matched17 instead of the wrapper's expected24; the selector was broadened without removing cases. A default-sandbox run then refused its loopback listener; the failure is retained and the authorized isolated-network run passes. These are fixture/runner limitations, not erased inconvenient results.

No production runtime, protocol, original client or old test bytes change in this patch. All86 planning tests pass. Crypto census and construction bytes are exact; all prior882 obligation rows/338 unresolved entries are preserved, plus one blocked analyzer-adapter obligation:883/339. No qualification receipt or clean-full-suite claim; the prior17 broad failures remain unresolved in the prior record.

## Next boundary and artifacts

The next bounded phase will trace all four native conditions with original client bytes: submission acceptance and receive request/response prefixes, cache hits/misses and authority/census work. Ordinary inbound cache still includes live witnesses while publication reuse omits them. This is a concrete hypothesis for measurement, not an established mediator or permission to skip fresh ledger/authorization checks.

protocol.md is prospective. analysis.json.gz and journeys retain all8 whole observations, counters, partial snapshots, runner/identity/command/log receipts. measurement-identity.json.gz and variant-closure.json identify exact sources; variants snapshots retain the four changed native modules. Reproduction text includes scripts and the temporary90s-censor lab. SHA256SUMS/provenance protect correspondence. Private fixture/state databases/profiles/keys/codes and browser error-context artifacts are excluded;36 known private values are checked after decompression, with a curated path audit rather than a universal DLP claim.

Sequential patch24 follows23; all are already reflected in the cumulative checkout, unstaged/uncommitted. No actual commit/push/preview8443/merge/deploy; general release qualification stays paused.
