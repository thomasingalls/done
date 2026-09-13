# Account sync liveness: measured mechanisms and first repair boundary

2026-09-12 · baseline signed `1372c39` · F-07/N-01/N-02/P-01 with N-03/P-02/P-03.
**Measurement/preparation complete; production repair remains open.** V8-only product findings
F-08/N-04 and N-09 are disposed by explicit non-shipment, not by fixing their old driver.

[Protocol and implementation boundary](../../account-sync-liveness.md) ·
[Raw evidence](../../account-conformance-runs/2026-09-12-account-liveness/README.md) ·
[Passed campaign](../../account-conformance-runs/2026-09-12-account-liveness/campaign/summary.json).

## What the current owner does

One genuine disposable v9 creating-member workspace, service and Chromium retained 24 added input jobs:
20 short insertions, three tail deletions and one 8,400-byte paste. Setup used real Local genesis,
recovery, promotion, selection, capture/spool/delivery preparation and signed HTTP delivery. The fixture
authenticator is synthetic. Expected Markdown was maintained by the controller and checked throughout,
including cold reopen through ordinary and instrumented bundles. All observed source, accepted and
received positions agree. The paste produced multiple capsules; input jobs are not stream positions.

Each isolated status sample calls deliveryStatus, receiveStatus and spoolStatus, while scheduling is
gated offline. Three repeats at each retained history have the same operation counts. Counts below are
for that **three-call set**, not one status getter or one keystroke. A content-record application is an
iteration replaying a retained update/state inside coverage reconstruction; it is not a unique edit.

| Added input jobs | Retained source positions | Master UTF-8 bytes | Median status set (ms) | Coverage reconstructions | Content-record applications |
| --- | --- | --- | --- | --- | --- |
| 0 | 3 | 19 | 91 | 15 | 120 |
| 8 | 11 | 44 | 315 | 55 | 1,320 |
| 16 | 27 | 8,478 | 1106 | 135 | 7,560 |
| 24 | 35 | 8,502 | 1388 | 175 | 12,600 |

Every set loads the carrier three times, verifies the inbound ledger five times and the delivery ledger
four times. At 35 positions it invokes 1,232 SubtleCrypto verification calls and 1,233 decryption calls.
Repeated event verification plus a fresh content reconstruction per event explains the rising work;
it is not just a network timeout. Source probes record inclusive body time, so overlapping durations
must not be added or interpreted as CPU utilization.

The ordinary terminal bundle took 1232–1378 ms for the same status set;
the instrumented comparison took 1246–1282 ms. Both reopened the same retained
history and produced the expected writing. This corroborates a substantial cost without instrumentation.
The fixed order, one host and three dependent samples do not estimate population latency or a causal
instrumentation-overhead percentage.

Exactly one ordinary service read occurred in each corrected idle sample. Each caused eight inbound
ledger verifications, with 24 and
280 coverage reconstructions at three and 35 positions.
The windows lasted 5.17 and 7.03 seconds, including
the production five-second poll wait. The corresponding service census body times were
2.5 and
28.1 ms. These are distinct inclusive
measurements, not an additive end-to-end cost decomposition. Editing bursts and their scheduler
timelines are also retained in growth.json; setup retries are excluded from those editing windows.

## Controlled failures and safety constraint

**N-03 reproduced.** While a genuine read response was held, an edit was acknowledged in
5.1 ms. The requested durable flush remained unresolved during the 250 ms observation.
Releasing the response let it finish; the edit survived cold reopen. This establishes the held-task
ordering problem in the current composition, not typical internet delay or loss of acknowledged data.

**N-01's final-commit expiry path reproduced.** A +60-second offset applied only to the final receive
commit check made a genuine page fail that guard. Receive halted with `operation-failed` at position
4 while send had accepted position
5. Removing the offset and issuing a fresh
request reached position 5; cold reopen retained the expected writing.
Service issuance, the signed request and earlier verification used real time. This isolates the guard;
it does not reproduce an entire slow-host wall-clock history or prove a universal natural expiry cliff.

**A witness-only cache fails.** The real coverage/ledger verifiers reject missing content while the
same actual event witness still verifies. A separate invisible pending-original case has the same
visible text before and after the loss, but the coverage verifier detects it. Forty seeded property
histories cover reordered originals, duplicate delivery, deletion and complete snapshots. An explicit
faulty cache first verifies a good view, then reuses its result by event identity and incorrectly accepts
the lost content. The full verifier rejects each lost set. These are independent two-publisher unit
fixtures, not native multi-member Account composition.

## Disposition and next work

F-07/N-01/N-02/P-01 remains high-priority, now supported by fresh bounded measurements. N-03 is also
reproduced. No production optimization, expiry relaxation or authority/projection bypass was made.
The review's universal failure counts, position-per-character premise and inevitable idle queue growth
are not established. The production scheduler remains single-flight and schedules idle polls after
completion. P-02/P-03 have design dispositions; these trials do not independently establish their full
cross-device effects.

Next: implement one owner-scoped verified view for **exactly unchanged retained storage**, with complete
input identity and invalidation, and the full verifier retained on cold open/change. Reusable results
must not escape as mutable buffers that callers erase. Generated negative controls must cover missing
content/source inputs, rollback, compaction, owner replacement, pending state and caller erasure. This
first optimization will not solve all growing-history cost; incremental append/coverage verification
is a subsequent boundary. Owned fetch separation, specifically classified expiry retry and scheduler
wake refinement follow under the [same repair contract](../../account-sync-liveness.md).

## Validation and limits

`node scripts/account-liveness/run.mjs` passed all seven stages: types, instrument calibration,
coverage properties, controlled native cases, growing native history, scoped lint and format. It is
also exposed as `pnpm account:liveness`. The campaign rechecked 883 source hashes;
there were six top-level tests, including 40 seeded histories. No timeout, skip or cancellation occurred.
The installed Yjs source/ESM/CJS hashes, lock/workspace patch pins, four peer resolutions and both
runtime regressions also passed the separate `node scripts/check-yjs-patch.mjs` check.

The first recorded campaign passed its tests but raw inspection found two reads inside each nominal
idle window: setup retry completion was not actually awaited. Its evidence is retained as preliminary;
the corrected campaign requires exactly one read. Earlier unfrozen fixture pilots are also retained,
without treating them as measurements of the final source pins. Setup initially exposed a TypeScript 7
compiler-API mismatch and generic typed-array annotation errors; these were harness issues fixed before
the final campaign. The corrected runs above do not validate a production liveness fix or release capacity.

No production source, personal package, browser/profile/recovery, Account, server, factor, operator key,
pin or routing changed. Historical review annotations and L-2 remain unchanged. This measurement/preparation was committed in original `0e07fe4` (signed counterpart `82cb5d5`); its runtime repair was subsequent work.
The [crosswalk](../../account-conformance-runs/2026-09-13-signed-review-history.json) preserves source identity.
The [current index](./findings.md) records those bounded reductions, Q-02/Q-03's remaining liveness
costs, and the still-open platform/release obligations.
