# Faster device approval through bounded transport grouping

2026-10-16. Bounded development work on signed base `a18d5d1c`. Three sequential patches separate attribution, the server transport contract and client integration. No production data/browser, preview bundle, deployment or release qualification was changed. The earlier Firefox account disappearance remains unresolved; the user's successful real Chrome enrollment does not explain its cause.

## Result

The final additional-device replay groups up to four **unchanged signed one-position reads** per HTTP round trip. Each request still executes through the original server authorization owner, and each page still passes the original client verifier in order. The busy period includes independently reconstructing accepted writing, capturing local writing, delivering a key and verifying installation/countersignature. The round-trip reduction speeds one substantial component of that work.

Twelve final timed connections restore identical service and browser snapshots within each workload, alternating baseline/candidate order across three pairs. All twelve retain identical exported Markdown entry names and complete bytes, two-way writing and factor-protected reopening.

| Final matched observation, median | Single-read transport | Batched transport |
| --- | ---: | ---: |
| Fresh-case button operation | 2,839 ms | 2,385 ms |
| After 24 separately synced Goals bursts: button operation | 5,874 ms | 4,380 ms |
| Same history workload: both devices certified | 8,688 ms | 7,148 ms |
| History-read round trips, fresh | 5 | 2 |
| History-read round trips, 24-burst workload | 29 | 8–9 |

The primary history-case median falls **25.4%**; certification falls 17.7%. History button-operation ranges are 5,863–6,403 ms versus 4,342–4,907 ms. One candidate pair improves by less than 20%. The prospective protocol named a 20% target but did not prescribe the aggregation statistic; the median summary is descriptive, and pairwise target attainment is mixed. These are small descriptive desktop samples, with raw observations retained and no population confidence/tail claim. Earlier prototype measurements gave 31.8%; the final figures above include the slow-work guard and fresh authenticated fixtures.

Button figures include Playwright actionability and assertion polling; in-page busy-status transition traces are retained. These are observed completion bounds, not exact physical display latency.

Both arms use the same candidate service: the baseline uses its unchanged single-read handler. Each history-read reply has an imposed **75 ms** delay. These are controlled round-trip-sensitivity measurements using Chromium and virtual passkeys, not measured phone, physical-provider or WAN latency. Both small fixtures stay within burst allowances; deeper history can encounter the unchanged service work budget. Grouping reduces HTTP round trips, while cryptographic and domain verification work remains.

## Boundaries and checks

The optional route holds a single existing login-owner callback per group. The original signature, nonce/request, reader/publisher, historical authority/generation, actor/schema, prefix/link/monotone-observation, accepted-cut, expiry, byte/event and lifetime checks remain. No local schema, persistent verification cache, remembered factor, key rotation or recipient-eligibility rule changes. Only a 404 selects the old single-read route; other failures stop normally. The older-server hint lasts only for the unlocked coordinator and supplies no authority.

Server grouping reserves four existing request/inflight units conservatively. Aggregate inner pages stay within 10 MiB. A 250 ms cooperative completed-work bound returns a nonempty prefix instead of starting further slow reads; it does not preempt running cryptography or extend the ten-second HTTP deadline. Final history runs used 8, 8 and 9 round trips. Individual response-page counts were not retained, so the extra request is not assigned a cause. See the normative [transport amendment](../../account-receive-transport.md).

- Nine new Node cases and 17 affected existing scoped-HTTP/history/handoff cases pass; 16 existing scoped-client and nine selected unit cases pass.
- Four new packaged cases pass for original/joined approvers, older-server fallback, substituted pages and lost replies. Both fault cases stop before key delivery and resume the durable approval after reload without another code comparison. Eleven new/existing browser journeys passed before the last server work guard; the four new cases pass again on the final guard. The test's later layout-only change has an independent normalized-AST proof.
- All 175 execution-adapter/registry checks pass after registering the carrier as a new open obligation and updating its exact count/list fixture. All 78 specified construction contracts and every preceding construction status and manifest stage assignment remain.
- Typecheck, changed-source lint, build, initial-JS budgets and origin isolation pass. Source identities and the complete runtime diff are retained. The manifest remains **blocked: 866 obligations, 322 unresolved**; the new test files receive no aggregate execution credit from these local observations. Normal CI explicitly executes their cases.

This is focused functional/performance evidence. The full functional suite and generalized qualification were not resumed. Publication still requires its separate signed-source/build/operator procedure.

## Inconvenient results retained

[Attribution](./01-attribution/README.md) records the two initial descriptive runs. [Transport](./02-transport/README.md) owns the byte/authorization controls. [Integration evidence](./03-client-and-verification/) contains all final observations, profiles' source identities, reports, prospective protocol/amendment and failed-attempt summaries.

An initial matched comparison incorrectly compared ZIP container bytes, whose timestamps differed despite matching Markdown entries. Teardown also left an interception callback in flight; the corrected probe drains it and compares all entry names/bytes. Initial permanent regression launches selected an old build or wrong working directory and are not credited. A tampering test assumed the first publisher had multiple pages; correcting it to wait for an actual multi-page group exposed a cleanup bug in the new test. The retained port then blocked eight later cases; unconditional service cleanup repaired the harness, and all affected journeys passed. Sandbox listen failures are preserved separately.

The final recheck first reused comparisons older than their authenticated ten-minute expiry and stopped during setup. The retained database timestamps establish that expiry preceded the recheck. Fresh real fixtures restored the measurement without changing any deadline. The next run replaced those failed UI-context artifacts; runner JSON/log, exact probe and private service snapshots remain. An intermediate manifest check lacked Git history in its source archive; a disposable Git directory with read-only access to the original pinned objects repaired that check. No historical commit was invented or rewritten.

Private service databases/operator keys, browser storage snapshots, passkeys and codes stay outside Git under the local scratch root. Sanitized retained logs omit disposable bearer tokens. `SHA256SUMS` in each phase binds the public packet; archived `.ts.txt` probes are outside test discovery and qualification credit.

## Remaining scope

Detailed progress wording, screen-lock/background behavior and durable incremental replay resumption remain unchanged. A long interrupted replay can still need accepted-prefix work again. This repair reduces round trips while preserving that contract. Phone/Safari/Firefox timing, larger-history steady-state rate limits, and reuse of locally held authenticated proofs require separately bounded work. The earlier desktop disappearance remains open for future evidence.
