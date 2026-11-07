# Phase 329 — record-scoped retained receipts, lab evidence only

The proposed diagnosis is confirmed in the private prototype. The first warm-audit difference is `inbound.peers.map#3.retained[7].envelope` at 260 physical rows: full replay retained a stale dense page's envelope for a later legacy record. The byte lengths are 339 versus 383; the bounded walk took 2,699 visits. No other first differing path was observed in the initiating diagnostic.

The private record-scoped repair passes all 18 paired journeys, including actual automatic maintenance on both devices and 36 exact offline cold reopens. **All six paired latency cells still fail**: peer p95 and every-marker fail in every journey; one journey also fails input p95. The three repaired 2,048-position withheld runs and P0 pass their measured predicates and both-owner cold checks. The matched unrepaired P1 control reproduces `owner-error` during building, with `Local baseline refused: integrity` at `localBaselineReplay.ts:596`. The functional stop rule fires. Single-500 with Device 1 writing and the final deep control remain **not run**.

Nothing lands or earns acceptance credit. No default, format, security guard, gate, limit or deadline changes. No hardening, release preparation, production access or computer use. The full 25-run record includes the pre-repair diagnostic, common fixture preparation, 18 paired journeys and all five grown runs. Parent roots and failures stay intact.

## Contract and sequence

See [predeclared protocol](./PROTOCOL329.md), [summary](./summary329.json), [artifact index](./evidence-index.json) and [independent input check](./independent329-check.json). This executes the requested follow-up after phase327; phase328 is the intervening immutable evidence-provenance correction. The new root is `/private/tmp/done-retained-scope-lab-20261101`.

The operator's latest amendment is explicit: latency misses in every arm fail the predicate and cell, and do not stop subsequent runs. Owner closure, repair-required, maintenance owner-error, missing/lost writing and cold failure stop in any arm; unexpected first difference or a fault extending into shared main code also stops. This applies to the negative control too. It ran last, so its failure leaves item6 unrun; no expected-failure waiver was invented. No later experiment runs after that stop.

Here P denotes the parsed-page treatment from phase324 onward; the older dense-receipt writer remains on in both P0 and P1 controls. The selected lab stack stays G8/R1000/SY1N/P1/V0/D0/E+B, RECEIVE_QUIET_MS750, full prefix comparison, original per-entry crypto/expiry/authorization/chain/witness/commit checks, synchronous journal admission and chain-order commit. Server account64/s burst480/session16/s burst120, account/session active16/4, Worker RPC8, index32MiB/logical32768 and maintenance120s remain. Grown >=60-key overlap stays; no normal latency is relabeled report-only.

## Counterexample and repair

Before any repair, `source-before` adds a bounded first-difference observer and message/stack logging at the maintenance catch. It changes no comparison result or error behavior. The initiating native audit still closes repair-required. Critical observations stream before termination; high-volume ordinary crypto spans remain local. This avoids treating diagnostic Window exchanges as protocol performance evidence.

Two new real-crypto controls construct dense then legacy records for two publishers and compare a single full `verifyInboundLedger` call to continuations over exactly the same records using `sameAccountLedger`. They independently check every retained envelope's sequence against its ledger position. One extent starts at zero; the other has `first > 0`. Both fail unrepaired: the first retains sequence1 at own positions2/3 and peer position3; the second tries to use entry0 from an extent beginning at1. Both P1 controls and their P0 counterparts pass after the private repair.

The repair closes a cached turn when iteration leaves its creating physical record, and supplies `recordTurn` only when `pageRecord === record`. Both stored verification and the retained-envelope read use that scoped value. Legacy records use their own `decodeInboundPage(event.page)`. The turn's entry returns owned bytes, preserving erasure behavior. No unauthenticated input gains stored status, and no signature, ledger, witness, expiry, authority, coverage or commit check is removed.

Canonical `inboundLedger.ts` has no `pageTurn` optimization; all 1,552 canonical inputs are unchanged. The incorrect derived state is lab-only. The negative control reaches the existing shared `verifyReceipt` guard that checks publisher and sequence, exactly as predicted; that guard is preserved, not repaired or weakened. Its mapped stack is [retained separately](./retention329-mapped.json).

Focused validation is **122 cases in 17 files**, plus strict TypeScript (explicit final child exit0). It includes stored-mode/readers, transport quotas/queues, journal admission, batching/scheduler, automatic retention and the mixed-receipt controls. This is not a full-unit-suite or release-validation claim. The first post-repair run had 121 passes and one observer-test failure: caller-side critical-only streaming was corrected while preserving the old stream API and test assertions. The first strict run had two new-test `Uint8Array<ArrayBufferLike>` annotations; the new test's wire annotation was corrected. All failed logs remain, as does an initial postprocessing TypeError corrected before analysis; no run was discarded or regraded.

## Paired fixture and measurement boundary

The old two-card sender fixture leaves Device1 below the unchanged automatic1024-record threshold under coordinated sending. Waiting would not expose maintenance. A common fixture was therefore grown through native public typing on the repaired coordinated build: one known ` seed329:` plus700 `g` keys at150ms, in the SA card only; every other file remains exact. Both full archives were checked and profiles locked/saved before maintenance. Saved physical counts are Device1=1,675 and Device2=3,089. No storage rewrite, manual maintenance, threshold override or fake time. See [preparation receipt and metadata caveat](./GROW-RECEIPT329.json).

The original growth plan retains unused inherited reference/2-writer/300-key template fields. The frozen growth spec and build flags establish the actual coordinated/one-writer/700-key preparation; it is not a 300-key sender measurement. This caveat does not alter the plan's original bytes.

All three policies use this same maintenance-eligible fixture, distinct persistent Chrome processes/publishers, 300 keys/device at150ms and three markers per device, in the declared mixed three blocks at0/50ms. Native harmless pointer pulses keep the ordinary input-quiet timer active only during sequential setup; they stop and are awaited before measured typing. Both owners have zero maintenance attempts at typing start. Publication/receipt/position costs are captured before Undo and maintenance. Full original archives plus only offered appends, peer convergence, Undo, actual maintenance completion and offline cold editing/Undo are retained. The absolute120s-after-last-key maintenance limit is unchanged.

These larger-fixture timings are **not a matched before/after performance comparison** with phase326's small sender fixture. The scope repair's effect on latency is not identified. All six cells fail; the unexplained long Device2-to-Device1 peer delays remain a next diagnostic, not an accepted cost.

## Paired results — every run

Times below are seconds. Input and peer values list Device1/Device2 writing separately; peer is observed on the opposite device. Each functional pass includes both owners completing maintenance and exact offline cold reopens. Detailed counts, commands, all markers, read/write units, cold timing and predicates are in [direction CSV](./paired329-directions.csv), [maintenance CSV](./paired329-maintenance.csv) and [cell record](./paired329-cells.json). No missing key was observed in these18 journeys. All36 maintenance traces have zero overflow/capacity refusal/throw; completion was41.868–71.053s after the last measured key. Critical post-start observations contain64 equal-ledger audits and no first-difference/throw/native-close event; no observed stream gap/drop.

| Run | RTT ms | Policy | Functional/cold | Input p95 s D1/D2 | Peer p50 s D1/D2 | Peer p95 s D1/D2 | Failed latency predicates |
|---|---:|---|---|---|---|---|---|
| r1 | 0 | coordinated-2000 | pass / exact both | 0.006/0.006 | 2.187/2.094 | 5.604/5.538 | peer2500ms, everyMarker2500ms |
| r1 | 0 | immediate-inflight | pass / exact both | 0.007/0.006 | 2.925/14.636 | 5.324/25.027 | peer2500ms, everyMarker2500ms |
| r1 | 0 | reference | pass / exact both | 1.422/0.006 | 2.384/15.244 | 4.686/26.708 | input16ms, peer2500ms, everyMarker2500ms |
| r1 | 50 | coordinated-2000 | pass / exact both | 0.006/0.005 | 2.120/2.660 | 4.914/6.504 | peer2500ms, everyMarker2500ms |
| r1 | 50 | immediate-inflight | pass / exact both | 0.005/0.005 | 3.088/12.360 | 6.894/24.811 | peer2500ms, everyMarker2500ms |
| r1 | 50 | reference | pass / exact both | 0.007/0.008 | 3.005/12.351 | 7.005/23.340 | peer2500ms, everyMarker2500ms |
| r2 | 0 | coordinated-2000 | pass / exact both | 0.008/0.007 | 1.979/1.955 | 4.778/5.086 | peer2500ms, everyMarker2500ms |
| r2 | 0 | immediate-inflight | pass / exact both | 0.004/0.004 | 2.386/14.351 | 4.570/24.734 | peer2500ms, everyMarker2500ms |
| r2 | 0 | reference | pass / exact both | 0.004/0.005 | 2.606/12.447 | 5.972/24.015 | peer2500ms, everyMarker2500ms |
| r2 | 50 | coordinated-2000 | pass / exact both | 0.012/0.014 | 2.412/2.814 | 6.245/7.151 | peer2500ms, everyMarker2500ms |
| r2 | 50 | immediate-inflight | pass / exact both | 0.005/0.005 | 2.784/11.994 | 5.387/22.482 | peer2500ms, everyMarker2500ms |
| r2 | 50 | reference | pass / exact both | 0.005/0.004 | 2.588/11.796 | 5.889/21.350 | peer2500ms, everyMarker2500ms |
| r3 | 0 | coordinated-2000 | pass / exact both | 0.008/0.008 | 1.896/2.037 | 4.585/5.192 | peer2500ms, everyMarker2500ms |
| r3 | 0 | immediate-inflight | pass / exact both | 0.005/0.004 | 2.640/12.334 | 6.040/24.530 | peer2500ms, everyMarker2500ms |
| r3 | 0 | reference | pass / exact both | 0.005/0.005 | 2.519/13.235 | 4.620/23.919 | peer2500ms, everyMarker2500ms |
| r3 | 50 | coordinated-2000 | pass / exact both | 0.004/0.004 | 2.121/2.186 | 5.051/5.810 | peer2500ms, everyMarker2500ms |
| r3 | 50 | immediate-inflight | pass / exact both | 0.004/0.005 | 2.827/12.106 | 5.497/22.931 | peer2500ms, everyMarker2500ms |
| r3 | 50 | reference | pass / exact both | 0.004/0.004 | 2.956/11.760 | 6.760/22.132 | peer2500ms, everyMarker2500ms |

Input fails in r1/0ms/reference Device1 at1.422s p95; Device2 is5.969ms. It remains a failed predicate, not a stop or exclusion. All18 peer and all18 every-marker predicates fail. One failing replicate fails its cell, so all six cells stay failed.

### Immediate-inflight — all markers, positions and cold

Peer times are seconds; input is ms. The denominator is300 offered keys per writer;303 input commands includes three marker insertions. Position counts are accepted service tip deltas captured after complete delivery and before Undo/maintenance. The CSV also records positions per100 commands. All twelve rows below cold-reopen exact with offline edit/Undo.

| Replicate | RTT ms | Writer | Peer p50 s | Peer p95 s | Marker1/2/3 s | Input p95 ms | Positions/100keys | Cold |
|---|---:|---|---:|---:|---|---:|---:|---|
| 1 | 0 | D1 | 2.925 | 5.324 | 1.918 / 4.189 / 1.818 | 6.795 | 12.000 | exact |
| 1 | 0 | D2 | 14.636 | 25.027 | 3.407 / 24.728 / 4.128 | 6.233 | 28.333 | exact |
| 1 | 50 | D1 | 3.088 | 6.894 | 2.348 / 4.758 / 1.763 | 5.301 | 11.000 | exact |
| 1 | 50 | D2 | 12.360 | 24.811 | 3.791 / 23.163 / 3.317 | 4.668 | 24.000 | exact |
| 2 | 0 | D1 | 2.386 | 4.570 | 1.670 / 3.221 / 1.906 | 4.223 | 13.333 | exact |
| 2 | 0 | D2 | 14.351 | 24.734 | 3.273 / 24.844 / 3.577 | 4.221 | 31.000 | exact |
| 2 | 50 | D1 | 2.784 | 5.387 | 2.386 / 1.074 / 1.830 | 4.937 | 11.667 | exact |
| 2 | 50 | D2 | 11.994 | 22.482 | 3.873 / 20.082 / 9.127 | 4.516 | 24.667 | exact |
| 3 | 0 | D1 | 2.640 | 6.040 | 2.578 / 3.192 / 0.990 | 4.508 | 13.333 | exact |
| 3 | 0 | D2 | 12.334 | 24.530 | 3.097 / 23.783 / 2.483 | 4.440 | 31.667 | exact |
| 3 | 50 | D1 | 2.827 | 5.497 | 2.442 / 1.060 / 1.008 | 4.343 | 11.000 | exact |
| 3 | 50 | D2 | 12.106 | 22.931 | 3.977 / 21.431 / 7.779 | 4.818 | 24.000 | exact |

### Historical coordinated failure stays separate

Phase326 coordinated missed every-marker in **6/6** paired journeys, before this fixture change. The first marker was2.728–2.802s at0ms and3.038–3.125s at50ms across directions. This is not cured or regraded by functional successes here. [Every original marker and the immutable source hash](./coordinated326-historical-markers.json).

## Grown withheld — all five declared outcomes

Original writer120s wait/assertions, actual preparation+backlog at typing start, 120 keys500ms, >=60 overlap,30s new-delivery and original cold steps are unchanged. Reader completion uses the absolute120s-after-last-key diagnostic window; it is not substituted for the writer gate. A reader halt/close would stop. Per-owner journal peaks, every interruption by arriving job, retry clocks and waits are in [owners](./grown329-owners-analysis.json), [attempts](./grown329-attempts.csv), [retries](./grown329-retries.csv) and [conditions](./grown329-interruptions.csv). Journal values below are observed in-memory maps and saved durable delta payloads, not encrypted disk usage or RAM totals.

| Run | Child | Peer p95 s | Input p95 ms | Overlap keys | Backlog s | New delivery after final command s | Measured predicates | Cold |
|---|---:|---:|---:|---:|---:|---:|---|---|
| grown329-withheld-repaired-r1 | 0 | 1.756 | 5.757 | 79 | 54.109 | 1.883 | pass all | pass |
| grown329-withheld-repaired-r2 | 0 | 1.793 | 5.307 | 78 | 53.687 | 1.884 | pass all | pass |
| grown329-withheld-repaired-r3 | 0 | 1.652 | 3.449 | 87 | 58.085 | 0.867 | pass all | pass |
| grown329-withheld-P0-control | 0 | 1.675 | 5.404 | 103 | 65.518 | 1.876 | pass all | pass |
| grown329-withheld-unrepaired-P1-control | 1 | 1.740 | 3.289 | 71 | 50.138 | 0.868 | functionalAndOriginalWriterDeadline, bothColdExact | not reached |

| Run / owner | Completion after last key s | Attempts | Interruptions | Peak map bytes | Peak durable payload bytes | Capacity | Cold |
|---|---:|---:|---:|---:|---:|---:|---|
| grown329-withheld-repaired-r1 / reader | 55.409 | 18 | 15 | 31101825 | 18990390 | 0 | passed |
| grown329-withheld-repaired-r1 / writer | 35.630 | 5 | 2 | 30709790 | 14767448 | 0 | passed |
| grown329-withheld-repaired-r2 / reader | 55.417 | 18 | 15 | 31114050 | 19140009 | 0 | passed |
| grown329-withheld-repaired-r2 / writer | 32.561 | 4 | 1 | 30703840 | 14959162 | 0 | passed |
| grown329-withheld-repaired-r3 / reader | 54.003 | 17 | 14 | 30709893 | 21700045 | 0 | passed |
| grown329-withheld-repaired-r3 / writer | 32.516 | 5 | 2 | 30709790 | 14558212 | 0 | passed |
| grown329-withheld-P0-control / reader | 73.315 | 22 | 16 | 31268758 | 29548729 | 0 | passed |
| grown329-withheld-P0-control / writer | 46.112 | 7 | 1 | 30709790 | 26285973 | 0 | passed |
| grown329-withheld-unrepaired-P1-control / reader | — | 5 | 4 | 4134707 | None | 0 | not reached |
| grown329-withheld-unrepaired-P1-control / writer | — | 4 | 1 | 30703840 | 16006016 | 0 | not reached |

The repaired writers finish32.516–35.630s and readers54.003–55.417s after the last key, inside120s. P0 finishes46.112s/73.315s (writer/reader). The unrepaired writer halts on attempt4 while building: `Error: Local baseline refused: integrity`; its name is `Error`, as predicted. The mapped stack enters `verifyReceipt` at596, where envelope publisher/seq must equal the retained position, then snapshot-receipt collection at741. All earlier offered writing and Undo had converged, but maintenance/cold predicates fail and cold is not attempted. The reader is censored at that functional stop, not called passed or failed cold. No capacity refusal is measured in any grown owner.

The unrepaired control was built from source matching repaired source except restoring exact `source-before/src/crdt/inboundLedger.ts`; the independent check verifies that only this source file differs. Its recurrence, the mixed-record counterexamples and four successful repaired/P0 grown journeys support the common stale-retained-envelope cause. They do not prove every historical owner closure had that cause.

## Limits, preserved failures and next decision

All25 timed runs have external5s host CPU/top-process logs. [Load summaries](./host329-summary.json) qualify the measurements; no quiet-host guarantee or exclusion is inferred. No competing build/heavy analysis was launched during the timed cells. Browser is frozen Chrome156; this is not Android observation. The profiler session issue from322 is not retested here. Source/build identities and apparatus maps are retained for every stage. Historical pre-stop runner bytes are explicitly reconstructed by reversing only the later stop additions and matching their frozen input hash; no historical input identity is silently replaced with the current runner.

The final independent check verifies all1,552 canonical inputs, HEAD, every frozen runtime/asset/server/apparatus/fixture input map, matched negative source and the real empty Git index. The evidence pack contains inert private source differences, new controls, recipes and exact raw logs/JSON/CSV with hashes; it excludes compiled assets, profiles, database/state and credential fixtures. Raw roots remain intact. No running preservation output is snapshotted.

Next work requires operator direction: resume the unrun Device1 single-500 and deep control after the intentional negative-control stop, then isolate paired latency on this maintenance-eligible fixture, including the1.422s input outlier. No sender default is selected. Landing the record-scoping repair would require a separately authorized hardened patch/control series; the dense format's compatibility/rollback/handoff and other open landing contracts remain unchanged. No hardening starts here.
