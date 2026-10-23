# Read conflicts and publication/retry pacing — phase 19

**Status: traced; no application repair or promotion.** Base is cumulative patch18, tree `fc7ac49010091cf59e29ccc51d9dc310a7fe7a1a`, still held for its measured live-sync regression. This packet is the next sequential evidence patch. No application runtime, old tests, rates, retry bounds, security predicates, preview, production or qualification status changes.

## What the trace establishes

Two fixed diagnostic journeys ran the existing H6/M2/Q2 seeded accounts,1024/256/32 histories,120 trusted focused inputs at500ms. The service kept1CPU/1GiB, existing16/64 request rates and all request/session/grant/history/ledger/lifetime checks. Both complete journeys passed original30s delivery and the existing post-load continuation, encrypted-record retention, same-profile offline cold reopen, whole-export convergence, reverse writing, Undo/Redo and account-isolation guards. An independent OpenSSL audit retained every seed decision byte-for-byte and verified envelope/wrapper/head signatures and exact per-publisher prefixes.

A returned batch409 in run2 was `state-changed`. Its first inner read captured cursor71 four times. All four transaction guards rejected **the same publisher owner's changed commit identity**, while revision, external data version and owner identity stayed unchanged. Ordinary correctly committed writing had invalidated each read snapshot; neither request auth nor a rate limit failed. The request exposed no partial page.

| Component of that failure | Observed wall time |
|---|---:|
| Four native attempts through returned refusal |4614ms|
| Browser request to response headers |4628ms|
| Snapshot capture through authority verification, summed across attempts |4399ms|
| Client's next retry wait, measured after completion |999.1ms|
| Next receive pass starts after due time |3ms|

Thus~95.3% of native request wall time was in authority verification after taking the live snapshot. This includes interleaved service work and asynchronous waits; it is **not** attributed CPU time. The one-second wait is the established first-failure backoff, not a hidden multi-second throttle. A gap between HTTP starts would have conflated this server work and retry delay. The two uncaptured phase18 batch bodies remain unclassified; this new trace does not retrospectively identify them.

The same instrumented load produced40 and41 rejected native snapshots, respectively. Most succeeded within four attempts:23/28 were known committed writes on the selected publisher, and17/13 were exact-fingerprint changes only to `promotion.delivery_witness` while the joined reader probed its own stream. That latter dependency is on the first publisher's unrelated current writing. Existing history/boundary witness checks remain necessary; this is evidence about the live witness, not permission to discard authority or history.

No Q0/Q1 HTTP429 occurred in either journey. Each M1 had one capacity429. Run1 had **no Q409** yet visible peer delay remained substantial. These observations rule out explaining this workload solely with rate-limit refusal or failed-operation backoff. They do not rule out service CPU contention.

## Publication and receiving

| Diagnostic stage, p95 |Run1|Run2|
|---|---:|---:|
| Writer prepares envelope |54.3ms|60.3ms|
| Writer prepares submission |36.1ms|32.4ms|
| Writer submit operation, including local reply handling |1367.9ms|1464.4ms|
| Submit HTTP start→headers |1333ms|1424ms|
| Local handling after submit headers |35.9ms|34.9ms|
| Receiver authority-cache miss, captured→verified |1235ms|1304ms|
| Receiver authority-cache hit, captured→verified |1ms|1ms|

Publication's large measured wait was inside the submission round trip. This instrument did not split the native outbound verifier's CPU, queueing and other service work; no claim that a particular write-side cache change fixes it. Receive discovery/history could each add~0.9–1.4s at p95, and complete receive passes reached5.3/5.9s. Source and a controlled scheduler check also show that a due sender waits behind an active receiver because the two lanes deliberately share one pass; this is a scheduling cost even when no retry occurs, not evidence that concurrent operation is safe. The heavy typing period here had only one writer receive pass near its end, so do not attribute every publication delay to that mechanism.

Instrumented peer p95 was9.0/16.2s, still over the unchanged2.5s target; all120 inputs reached the peer within the original post-typing30s. These are two **diagnostic** journeys with a newly compiled instrumented client and90s load censoring, not the phase18 matched measurement and not evidence of a speedup or acceptance. The phase18 uninstrumented R,C,C,R results remain the performance reference.

## Next bounded repair contract

Investigate moving volatile publisher-ledger capture behind expensive immutable authority verification and reader-request authentication, following the earlier history-catalog repair's separation of stages. A fresh complete authority comparison must establish that the verified authority is still current before the new ledger capture can be used. Then verify the selected live witness/census, every served predecessor/row, exact full native snapshot and owner/commit/version fences, and current grant/session/custody/expiry across signing and COMMIT. Four competing-commit attempts, admission limits and deadlines remain. Do not broaden the existing cache context or change ordinary snapshot comparison to obtain a passing result.

Prospective repair tests must distinguish live appends from authority/membership/removal/recovery/rotation changes, capture/write overlap after the new capture, stale ownership/external-version/clear/close, corruption and session/grant/expiry loss. Rerun the full matched workload and durability guards before claiming improvement. Separate later work may address authority proof reuse on publication and the cost/frequency of receiver preludes, but native write-stage attribution is still missing.

## Evidence and limits

`analysis.json` correlates actual serialized HTTP replies and native read attempts by complete request SHA256, and client scheduler/stage observations by closed label and time. `native-stage-analysis.json` preserves attempt-level stage timing. `evidence-review.json` independently reconstructs the returned409, all four failed guards and the exact retry clock from raw events. Both observers reported zero drops. Instrumentation transforms reverse to exact base bytes; all frozen executing source and client assets are hashed. The new bundle uses the prior coordinated-2000 policy/defaults and an explicit diagnostic dirty version; it is intentionally not claimed byte-identical to the old client bundle.

Four controlled mechanism cases pass against **uninstrumented** patch18: one actual same-connection append causes a recapture and valid exact page; four such appends exhaust four attempts, emit no page and continue correctly afterward; a slow receive blocks queued publication; and failure backoff starts after completion and survives ordinary content hints. Independent Node/OpenSSL framing verifies their real append decisions/pages. These are packet reproduction cases, not newly registered aggregate release credit.61 existing native and21 existing scheduler tests pass unchanged. Five raw-evidence faults and omission of the native read guard are detected (six controls); both native mechanism cases fail under guard omission.

All attempts are retained: the first build used an invalid date format and failed before app startup; an initial host mechanism invocation incorrectly used Linux-only diagnostic observer paths; the first scheduler-mechanism source closure lacked the WASM directory and imported no cases. Their corrected runs have distinct logs. Neither measured journey was replaced. Added standalone mechanism code after the run freeze does not participate in the Playwright test match; it is separately preserved and hashed.

Two whole journeys are engineering mechanism evidence, not independent per-request samples, a production capacity estimate, real Firefox/Android/WAN evidence, power-loss durability, or a guaranteed benefit from the proposed repair. Background600s acceptance was deliberately not run here; stopping load at90s is diagnostic censoring, never an invented replay pass. Existing16 full-suite failures, held performance gate and882-obligation/338-unresolved qualification status remain unchanged.

No production/personal data was accessed. Disposable profiles/DBs/keys/codes are excluded. Both owned containers/browser profiles stopped and loopback53781 closed. No preview8443, staging, signature, commit, push, merge, deployment or general qualification.

Packaging also preserves an interrupted read-only attempt: the first exact-base check spawned one Git process per27,230 files. Only that owned packager was stopped, before generating patch19; the replacement checks the same Git blob identities directly. The initial log and receipt remain. No diagnostic journey or result was rerun or replaced.
