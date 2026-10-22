# Phase23: bounded publication authority reuse

**Status: HELD — complete peer latency regresses and misses the original2.5s gate.** Sequential23 follows22. This packet records a development mechanism and its failed end-to-end acceptance. No merge, deployment, preview update or release qualification.

The prior phase22 removes duplicate authority/history reconstruction inside locator/catalog requests. Phase23 reuses authority evidence across publications. Functional reference22 isolates its18 appended cases; the prospectively chosen performance reference21 tests the combined22+23 candidate. These measurements cannot attribute the live-latency regression to one of those phases separately.

## Contract and implementation

Only account-service/delivery.ts changes at runtime in23. The existing pure inbound projection is renamed for shared use; its body is unchanged. A separate private publication verifier function namespaces reuse inside the existing core-owned pool. The context retains pin, publisher and every native/future field except rows and promotion.delivery_witness/publisherWitness. Independent source review shows authority producers/resolvers do not consume those live fields. They still pass, unchanged, to fresh witnessed census on the original snapshot.

The existing128-entry/16MiB visible-projection pool,2MiB context limit, exact serialized context comparison, brands, detached mutable projections, replayed current custody checks, verifier identity, LRU, revision, clear/close and asynchronous input fences remain. No-cache publication takes full verification on the original snapshot. Ordinary inbound reuse still uses its original strict header context. Every signed request/wire, live witness/census, current grant/session/custody/expiry and native owner/version/commit/four-attempt/final transaction fence remains. No protocol/client/quota/retry/deadline change or new corruption-detection window.

`source-review.json` reverses the reviewed adapter/call/rename and checks the entire remaining delivery AST, exact projection body and old-test prefixes. `challenge.json` contains six real implementation omission controls. These are bounded implementation checks, not proof of every future change.

## Regressions and broader checks

18 appended cases cover warm committed original/joined/continued streams, native future fields, account/pin separation, absent-cache/oversize fallback, failed proof recovery, clear/close/inflight behavior, fresh wire/custody/grant/witness checks, lost replies/byte-exact retries and four genuine competing write attempts. Old22 fails the two intended warm-operation counterexamples. All old test bytes are exact prefixes; no assertion or deadline was removed. The final targeted selection passes24 cases, and the strengthened live-witness plus existing pool/race selection passes46. Types and lint pass. Paired affected suites: 422 tests/405 pass/17fail on22 and 440 tests/423 pass/17same failures on23. Failure identities are retained in affected-comparison.json; no full-suite claim.86 planning tests pass; metadata review independently preserves400 source paths, domain sets, construction bytes, all old case IDs/guard fields,882 obligations and338 unresolved. New case census is not qualification credit.

Preserved fixture/machinery mistakes: missing copied parent directory repaired before the final new cases; incorrect new two-account workspace-ID assumption corrected to independent account identity; rejected relative formatter invocation; one wrong-cwd invocation before test execution. Logs remain. Only newly appended test blocks were formatted.

## Fixed coupled performance comparison

R21,C23,C23,R21, four distinct whole journeys, all retained. Same original110 client files, genuine seeded H6/M2/Q2 device/history populations1024/256/32, four browser roots and10contexts per journey, persistent Q profiles and actual offline same-profile cold reopen without reinjection. Same1CPU/1GiB/zero swap/pids128 envelope and16/64 policy. Native/client/crypto instrumentation is absent; both arms use the same closed HTTP error/body-SHA observer. Common partial snapshots occur only at existing trace boundaries. Timing reconstruction and renderer/host clock brackets are independently checked. Fractional/negative sub-ms samples reflect event/clock resolution; no exclusive CPU or population inference.

|Run|Local p95 ms|Complete peer p95 ms|Writer submit p95 ms|Writer submits|Slowest H replay s|
|---|---:|---:|---:|---:|---:|
|1-R|3.5|5557.4|1580|72|323.7|
|2-C|4.7|36213.2|140|120|298.3|
|3-C|2.3|32867.4|127|120|262.5|
|4-R|1.8|5470.1|1733|77|320.3|

Original16ms local p95, all120keys/30s delivery,600s background replay,120s continuation and all data guards pass in all4. Every complete peer p95 fails2500ms; both candidates regress. No gate, retry, rate or cold lifecycle was relaxed. All candidate observations are complete; no missing keys are converted into quantiles. publication-observations.json describes faster submits and increased request count without causal attribution. The next lead is changed publication cadence/receiver work and separate22/23 attribution, not raising limits.

`evidence-review.json` independently reconstructs raw event/timing, refusal, cold archive/retained-record, identity and all original gate results. `native-audit.json.gz` uses independent Node/OpenSSL verification for ciphertext/envelope/wrapper/accepted signatures and exact per-publisher prefixes, preserves every seed row, checks distinct accounts/workspaces/device credentials, and permits added writing only in Q. All original/pending writing, automatic convergence, whole exports, reverse/UndoRedo and isolation guards pass. Six evidence/native fault controls detect altered inputs/times/cold archive/retained delivery/replay and native ciphertext. These checks do not erase the17 existing failures or prove deployed-device behavior.

## Infrastructure attempts and ownership

Before the final series, a reference was interrupted by Docker unexpected EOF/socket disappearance. Cleanup hid its partial result; final data/performance outcome is unknown and uncredited. Then a fresh series could not start because the pinned carrier image was absent; no app or input ran. Both whole attempts and frozen harnesses are preserved under infrastructure-attempts. The exact pinned linux/arm64 image was restored and checked with network disabled, Node24.18.0; source/client/envelope/deadlines remained unchanged.

A common temporary harness now persists partial output at existing trace boundaries, saves final result even on cleanup failure, and rejects dead-child controls immediately. Three fault tests pass; the original failure is retained separately from cleanupError. This evidence machinery repair is not a product/runtime change. A new complete fixed R,C,C,R plan was declared and all four outcomes retained; no selective successful replacement. Final frozen input hashes are independently rechecked. All5 owned container IDs and16 recorded browser roots are stopped/absent, no owned profiles or port53781 gateway remain. Preview8443, production and personal browsers were untouched.

## Artifacts and limits

protocol.md states the prospective scope/gates. measurement-identity.json.gz hashes native/reference/client/lab/observer inputs. journeys retain raw results, partial checkpoints, runner/identity/command/log receipts; analysis.json.gz contains every key and original gate. Reproduction text retains scripts and lab, with exact candidate source/test snapshots. Cryptographic/source identities and SHA256SUMS/provenance protect correspondence. The private fixture, databases, browser profiles, keys, codes and UI error-context artifacts are excluded. privacy-audit.json checks36 known private values after decompression plus a curated path audit; this is not universal DLP.

Qualification remains paused at882 obligations/338 unresolved. These patches are unsigned/uncommitted; the actual Git index remains unchanged. No push, preview update, merge or deployment. Stronger live responsiveness still needs a bounded repair and new prospective acceptance evidence.
