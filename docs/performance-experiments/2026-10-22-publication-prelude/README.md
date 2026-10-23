# Publication authority and receiver prelude — phase21

**Traced; evidence only.** Base is cumulative patch20, tree `a6249fa1172b039c4a04388875e1070b767d1810`. The candidate remains held at the live-sync2500ms gate. This phase changes no application code, old tests, security checks, limits, retry clocks, qualification or deployment.

## Findings

Two fixed diagnostic journeys restored the existing H6/M2/Q2 fixture (1024/256/32 histories) in four independent Chromium roots with two persistent quiet profiles. Each offered120 trusted focused inputs at500ms against the existing1CPU/1GiB service. All original writing reached its peer within the existing30s observation. Background replay was stopped at90s, not credited as a600s replay pass. Original/pending writing, exact encrypted-record retention, actual same-profile cold offline reopen without reinjection, whole-export automatic convergence, reverse writing, Undo/Redo and isolation passed. Independent native OpenSSL verification retains every seeded decision byte-exact and validates all added quiet-account decisions.

| Diagnostic, original order | Run1 | Run2 |
| --- | ---: | ---: |
| Quiet writer completed submits |72|76|
| Submit HTTP p95 |1873ms|1589ms|
| Native authority span p95 |1749.7ms|1572.6ms|
| Sum authority wall / sum same-request HTTP wall |93.0%|92.4%|
| Authority signature verifications per submit |77|77|
| Authority digests per submit |205|205|
| Peer discovery HTTP median (10 actual requests) |603ms|688ms|
| Peer catalog HTTP median (10 actual requests) |610ms|611ms|
| Peer local discovery proof median |22.1ms|21.1ms|
| Peer local catalog proof median |0.3ms|0.3ms|
| Quiet capacity429s |0|0|

Each peer discovery request verifies current authority (77 signatures/205 digests), then independently reconstructs its membership timeline (114 signatures/309 digests). Catalog requests exhibit the same two families of work. This is genuine repeated proof reconstruction in the measured early/certified two-device history; it does not contradict phase17's reuse of an already-existing branded timeline for later-history paths. A timeline that was not returned by the early authority path cannot be reused by the catalog.

For peer discovery, total native authority+second-chain spans are6472/7955ms across10 requests; complete HTTP totals6723/8162ms. For catalogs, authority+timeline spans total9153/6546ms versus9550/6895ms HTTP. These are wall-time observations under contention, not exclusive CPU attribution. The writer also holds its shared scheduler in one discovery/history prelude for about4.25/3.85s near the end of typing. Client envelope/submission preparation remains material (p95 about58–60/34–37ms), but it is much smaller than the observed publication waits.

All quiet submit/discovery/catalog requests join to native records by complete request SHA256, path, response status and completion clock. One M1 capacity429 per run is explicitly unjoined by body SHA: refusal can complete before body consumption. It remains in the raw HTTP evidence and is not attributed to a quiet request. All other declared observed requests join. Session renew/acknowledgment, grant finish and notifications are outside the declared body-observed set. No observer drops occurred.

Instrumentation wraps crypto and awaits in disposable copies. Reverse transforms recover exact base20 runtime bytes. Async spans and process CPU deltas overlap; the global resource interval includes subsequent guard/continuation work. Observer bookkeeping and preemption separate endpoint event stamps from the timer brackets by at most31.3/19.5ms, so tiny native spans are not precise attribution. Instrumented input→peer p95 is10.467/5.979s (all120 observed); local p95 is3.2/2.9ms. These are diagnostic observations, not a matched acceptance or claimed improvement. Prior uninstrumented phase20 results and its held status remain authoritative.

## Static optimization map

The user's repetition hypothesis is partly supported. The [independent subagent report](static-analysis/README.md) and [machine-readable map](static-analysis/opportunities.json) review22 findings:14 static hypotheses,5 already optimized cases,3 unsupported/retain-boundary cases. The finite census covers296 frozen runtime TS/TSX files, all98 named authority calls (each dispositioned),203 reconstruction calls,791 explicit copy/serialization calls and4543 distinct retained calls. All inventoried calls correspond to genuine AST nodes; the parent independently enumerated the98 authority calls and checked both coverage directions, source hashes and finding sites. Syntax coverage is exhaustive only for the declared source set/categories; semantic optimization opportunities are not exhaustively proven. Call count does not establish cost.

Best remaining candidates are publication authority evidence, duplicate discovery/catalog reconstruction, envelope-source rescanning despite existing source/used indexes, and cloning complete inbound state to select one publisher. Independent audit workers, cold lifecycle transitions, current custody/commit checks and already-shared client history must keep their distinct boundaries. The static report remains a frozen pre-measurement assessment; this packet supplies dynamic evidence for its service hypotheses rather than rewriting its confidence labels.

**Important cache constraint:** existing inbound reuse intentionally includes both live witnesses. Wiring submissions into that cache would commonly miss after each write. Phase20's late-capture stage projection is not automatically a valid cache-equivalence contract. The next bounded repair should establish one service-owned verified authority/history evidence result, starting by eliminating duplicate reconstruction within an operation and defining its exact native-input closure before reuse across publications. Preserve every signed request, member wire signature, live witnessed prefix, served-byte proof, grant/session/custody, native owner/version/commit, expiry, rollback and final transaction check. Keep bounded evidence lifetime/size, private brands, independent corruption controls and fresh issuer.check. Do not ignore a future authority field or infer authorization from a cache hit. Then rerun the coupled heavy-load journey with the original gates; no additive speedup is presumed.

## Checks, failures and limits

- Two fixed journeys and independent native proof/data audit pass; four analytical fault controls and observer true/false-crypto, identity/exception, counter and overflow controls pass.
-31 existing selected discovery/history regressions pass. The paired56 native cases each give55 pass/1 fail: the same previously reproduced cold-wait clear failure. It remains unresolved. No tests or assertions were edited, and no clean full-suite claim follows.
- The first diagnostic startup failed because its wrapper imported an unexported drop counter; app/browser restoration never started. The original attempt and corrected fixed plan are preserved.
- The initial diagnostic observer made SubtleCrypto methods nonwritable, breaking an existing test hook (54 pass/2 fail). Measured runtime source contains no such hook. A separate writable observer, not substituted into measured evidence, restores the paired55/1 result. Do not treat the diagnostic wrapper as a production API-neutral mechanism.
- Review development failures are retained: a line/column key initially collapsed nested call nodes; a multiline site initially failed a single-line checker; an overprecise2ms endpoint agreement assertion failed under observed bookkeeping/preemption. The final checks use genuine node multisets, multiline anchors and explicitly report timer/event spread rather than inventing exclusive CPU precision. The initial joiner also ambiguously matched an identical M1 retry body until response status and exact completion timing were included.

No physical Firefox/Android/WAN, indefinite churn, arbitrary power-loss, population capacity or general qualification claim. The earlier17 broad-suite failure identities and882-obligation/338-unresolved qualification pause are unchanged. All three owned containers and persistent profiles stopped, localhost53781 closed. Production, preview8443 and personal browser data were untouched; no staging/signing/commit/push/merge/deploy.

See protocol, measurement identities, raw compressed run records, reversed transforms, independent reviews, static map and SHA256SUMS. All static sources/support bytes are retained. Private fixtures, native databases, personal storage/profiles, keys/codes/credentials and generated browser error snapshots are excluded.

The initial disposable Git proof emitted redundant recursive-alternate nesting warnings while still reproducing both expected trees. Read-only object-directory views removed that machinery warning; subsequent canonical proof uses those nonrecursive views. Initial proof output and its superseded identity are retained for provenance. No real Git metadata changed.
