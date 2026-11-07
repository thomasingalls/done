# Hardened receive and maintenance — Stage 6 landing report

**Outcome:** the final 36 blocking journeys pass their original applicable
predicates. Nine report-only journeys are valid; six retain latency misses. The
3,072-position report is **not exposed** because the unchanged 30-minute fixture
setup stops after 690 of 1,024 new edits. That evidence remains incomplete. This report
records the limitation and the requested debts; it does not waive a check, assert
all requested reports complete or authorize publication.

[Every journey and earlier-source rows](./journeys.json) ·
[Worker-reply census](./worker-replies.md) · [Machine census](./worker-replies.json).

This is a hardening handoff, not a deployment or generalized release qualification.
The working tree is based on signed `4d20580c8b9385e225a6452e4ffc74711f829b38`
with the subsequent sequential patches. Later patches are prepared, not signed,
pushed, merged or deployed. The final signed release image and its rollback mate
must be built during the separately authorized publication procedure.

## Scope and source

The acceptance build is the phase 469 repair and the plain phase 470 release-profile
assets, with phase 473's separate canonical native test entry. The 2,046 build inputs
and 125 ordinary frontend files have exact source/asset manifests. The actual API
runs outside the browser test process in an isolated Docker container, 1 CPU/1 GiB,
with the existing 16/s/device and 64/s/shared budgets. Its 123 effective server inputs
are bound separately: the old 430 image alone is not the new effective server, since
the seven approved future-clock source files are supplied as an exact overlay.
No server wire protocol or rate-limit change was introduced.

No lab factor, switch, named-hint header, instrumentation or profiler enters the
plain acceptance assets. The sender report uses the approved 480 observed build;
The prepared 3,072 report would use the private 484 index observer; it was not
run. Neither observed variant earns extra blocking gate credit. Ordinary inverse/source proofs remain separate from observations.

The Stage 5 preflight follows the operator's accepted 432–436 functional checkpoint.
Phase 469's app repair then passes 115 focused cases, the 332-file full unit suite
(3,226 passed plus one existing skip, 128.63 s under the approved 240 s hang guard),
types, lint, changed-file formatting and 16 census/policy controls. Eight new case IDs
are independently reconciled, none removed. No app source changes follow 469.
The approved 488 fixture-only poll repair has six explicit permanent regression
controls, including a sensitive restoration of the old RPC. These controls are
not claimed as aggregate qualification credit.

## Prepared implementation and evidence

| Item | Prepared behavior and retained checks | Evidence |
|---|---|---|
| Capacity mapping | All five PreparationCapacity sites map to skipped/capacity; journal/caps remain. Integrity/storage faults halt with content-free diagnostic classes. Reopen parks again; changed authenticated hints retry behind 60 s. |335,358;442 actual encoded-baseline ceiling |
| Fresh-work slice S | Slice starts on first fresh miss; replay hits do not consume fresh-work time. All pause, journal, shadow, lifecycle and final-commit guards remain. |336;358 checkpoint |
| Priority retry Y | Typed priority-only interruption retries after 10 s; nonpriority/mixed reasons stay 60 s. Input quiet and drain readiness remain. Zero-delay SY1 N is absent. |337,358 |
| Repair polling R1000 | Per-slot 1 s/30 s repair window follows quiet discovery without an intervening publisher hint. Initial lost hint with no backlog retains the old idle wait. |359,366;final live/withheld cells |
| Quiet reads E | Bounded ephemeral exact bytes; no trust or persistence.750 ms quiet eligibility,5 s own checks, round robin/send yielding and request-start proof age remain. |360–366;437;452;477 |
| Binary receipt v1 | Approved writer-on format, one self-contained signed page per admitted extent, shared readers and authenticated floor. All entry crypto/signature/expiry/authorization/chain/witness/commit checks remain. v2/lab dense rows were not released; conversion was dropped. |367,375–400,408;421–430 |
| Stored mode | Live/stored selection comes only from saved-byte API arguments. All four stored consumers, aged requests, empty/duplicate refusal and interior cuts are covered. |388,392,395–400,407;421 |
| Owned pages | Native/journal memo, exact retained-row agreement, per-load/live ownership and record-scoped turns; no owner lease/counter/audit substitution for the exact prefix comparison. |390–405,409–413;406 negative control |
| G8 and B | Eight logical positions per turn, range 4, four signed requests of eight positions per wire batch, fallback two concurrent individual reads; chain-order commit and every verification remain.8 cache entries/32 logical positions/MAX_PENDING_BYTES reservations, cancel/drop/wipe and partial/interior cuts retained. |418–422;437 continuous fairness;441 lower-ceiling fallback;452 functional reruns |
| Format lifecycle | Authenticated floor preserved across retained installation, rotation, stale active/cold owners, loss of acknowledgment and pending writing. Reader-only same-tree artifact reads dense data and survives an already-open compatible tab. |423–430;427 old-artifact controls;430 two ARM64 images |
| Idle-start audit | Discretionary audit waits 1 s after local activity and no foreground storage job; force cap invokes an attempt. Full comparison and guards remain. Logical dense work does not dilute audit pressure. |368–373,416–417,425 s tale-turn closure |
| Maintenance arbitration repair | Per-owner FIFO between read-only preparation and discretionary warm audits; foreground bypasses it and retains priority. Captures prep token at true queue head. Mutation/final task stays outside this arbitration. |469 eight regressions and negative control;470–472 maintenance reruns |
| Build/runtime profile | Explicit RANGE_RECEIVE forwarding; ordinary builds remain writer-off. Scope excludes V/F/D, sender default changes, automatic service checkpoints and scheduler-lane rewrite. |420;430 component images;final manifests |
| Clock future bound | Operator-approved 2 minskew added only to six too-far-future checks. Past-expiry/signature/lifetime constants remain exact. |456 offset;457 unit controls;458 effectiveAPI |

The format is approved for writing in this release. The final release still needs
signed-source image preparation; the 430 writer-on/off ARM64 pair proves the recorded
430 tree's component behavior, not a newly built image for the later 469 s ource.

## Every final blocking journey

All 36 original applicable predicates pass. No failed earlier attempt is removed.

| Cell / replicate | Phase | Input p95 ms | Peer p95 ms | Deep ms | Goals beforeinput / rAF p95 ms | Result |
|---|---:|---:|---:|---:|---:|---|
| `old-maintenance-normal` / 1 | 471 | 3.384 | 796.318 | — | — | pass |
| `old-maintenance-withheld` / 1 | 471 | 3.180 | 1829.596 | — | — | pass |
| `old-maintenance-normal` / 2 | 471 | 3.530 | 796.353 | — | — | pass |
| `old-maintenance-withheld` / 2 | 471 | 3.484 | 1847.544 | — | — | pass |
| `old-maintenance-normal` / 3 | 471 | 3.696 | 816.707 | — | — | pass |
| `old-maintenance-withheld` / 3 | 471 | 3.530 | 1830.457 | — | — | pass |
| `grown-normal` / 1 | 472 | 3.607 | 1030.140 | — | — | pass |
| `grown-withheld` / 1 | 472 | 4.420 | 1473.400 | — | — | pass |
| `grown-normal` / 2 | 472 | 5.079 | 1031.183 | — | — | pass |
| `grown-withheld` / 2 | 472 | 3.921 | 1584.941 | — | — | pass |
| `grown-normal` / 3 | 472 | 3.896 | 1015.449 | — | — | pass |
| `grown-withheld` / 3 | 472 | 4.146 | 1600.451 | — | — | pass |
| `native-context` / 1 | 474 | — | — | — | — | pass |
| `native-resumable` / 1 | 474 | — | — | — | — | pass |
| `native-deep` / 1 | 474 | — | — | 21851.721 | — | pass |
| `native-context` / 2 | 474 | — | — | — | — | pass |
| `native-resumable` / 2 | 474 | — | — | — | — | pass |
| `native-deep` / 2 | 474 | — | — | 19528.540 | — | pass |
| `native-context` / 3 | 474 | — | — | — | — | pass |
| `native-resumable` / 3 | 474 | — | — | — | — | pass |
| `native-deep` / 3 | 474 | — | — | 21659.155 | — | pass |
| `late-normal` / 1 | 475 | 3.955 | 1033.360 | — | — | pass |
| `late-withheld` / 1 | 475 | 3.213 | 1779.782 | — | — | pass |
| `late-normal` / 2 | 475 | 3.710 | 1037.590 | — | — | pass |
| `late-withheld` / 2 | 475 | 4.481 | 1937.680 | — | — | pass |
| `late-normal` / 3 | 475 | 3.853 | 1029.259 | — | — | pass |
| `late-withheld` / 3 | 475 | 4.765 | 1994.494 | — | — | pass |
| `fairness` / 1 | 477 | 7.600 | 841.400 | — | — | pass |
| `fairness` / 2 | 477 | 6.900 | 799.700 | — | — | pass |
| `fairness` / 3 | 477 | 8.500 | 892.100 | — | — | pass |
| `goals-desktop` / 1 | 478 | — | — | — | 6.502 / 15.415 | pass |
| `goals-mobile4x` / 1 | 478 | — | — | — | 4.273 / 32.661 | pass |
| `goals-desktop` / 2 | 478 | — | — | — | 6.498 / 17.562 | pass |
| `goals-mobile4x` / 2 | 478 | — | — | — | 4.157 / 32.557 | pass |
| `goals-desktop` / 3 | 478 | — | — | — | 6.367 / 17.635 | pass |
| `goals-mobile4x` / 3 | 478 | — | — | — | 4.289 / 32.519 | pass |

The accompanying journey JSON keeps every source row and all sender marker/direction values. The phase records own full per-owner/cold/host evidence.

## Every report-only journey

| Workload / replicate | Direction peer p50 / p95 ms | Input p95 ms | Failed report predicates | Functional / cold |
|---|---:|---:|---|---|
| `r1-single500-device1` | 750.820 / 875.013 | 3.693 | none | pass / pass |
| `r1-paired150` | 1608.323 / 2535.522; 1619.675 / 2567.829 | 6.802; 6.346 | peer 2500 ms, everyMarker2500 ms | pass / pass |
| `r2-single500-device1` | 759.561 / 885.397 | 3.927 | none | pass / pass |
| `r2-paired150` | 1608.809 / 2533.592; 1636.629 / 2553.601 | 6.893; 7.005 | peer 2500 ms, everyMarker2500 ms | pass / pass |
| `r3-single500-device1` | 739.931 / 844.034 | 3.585 | none | pass / pass |
| `r3-paired150` | 1587.543 / 2520.780; 1623.082 / 2538.045 | 6.732; 6.168 | peer 2500 ms, everyMarker2500 ms | pass / pass |
| `r1-deep50` | drain 40.010 s | — | report-only 30 s sample | pass / pass |
| `r2-deep50` | drain 39.412 s | — | report-only 30 s sample | pass / pass |
| `r3-deep50` | drain 39.987 s | — | report-only 30 s sample | pass / pass |
| `index3072` / 1 | unavailable | unavailable | not exposed: setup ceiling | not run / not run |

The fresh producer confirms 690 of 1,024 new individually accepted edits, reaching
2,738 backlog positions. The global 1,800,000 ms setup ceiling cuts short the next
poll. Independent stopped-service decisions match all 690 confirmations, with no
additional unconfirmed acceptance. The full final archive and 3,072 reader are not
reached. No index fallback position, byte/position, Undo or cold metric is claimed.
The earlier 441 functional lowered-ceiling proof remains a separately bound result.
This report-only item remains open; there is no deadline extension or smaller-run
substitution. Do not call all ten reports complete.

## Earlier attempts and amendments retained

| Phase | Result / failed boundary | Disposition |
|---|---|---|
|445–448|Four known-backlog fairness attempts miss sparse 60 before cutoff;447/448 are diagnostic runs.|Retained red; per-row Playwright assertions in acceptedRows consumed 74.4% of the profiled Node samples. No source optimization or time extension used to erase them.|
|449|Strict-assert diagnostic fairness passes; post-run wrapper fails on new SQLite sidecars from a read-only query.|Guard-only retry uses a private DB copy; app was not silently rerun. Old source/result stays.|
|450–451|15/16 census checks initially pass;3-case denominator disagreement.|Reconciled provenance before fixture counts changed; no removed tests.|
|452|All 5 fairness cases including unfair sensitivity,3 past-index and dense/group-cut/idle/owners cases pass.|Functional preflight, distinct from later timed fairness.|
|454–460|Tool-entry SW routing/loader preconditions;455 fresh enrollment refuses expiry;459 s eed has only 1,000 of intended 13,407 Goals bytes.|All retained. Operator approves future-only skew and exact-completion seed checks. Real complete cohort 460 passes; no stored-data editing.|
|461–462|Nine native and six live journeys pass on pre 469 s ource, plus retained importer/adapter/reporting apparatus failures.|All 15 s ource rows remain in JSON; not transferred as final 469 acceptance.|
|466|Old fixture completes maintenance before saved-slice prerequisite, zero typing offered.|Operator approves old-fixture prerequisite amendment only. Original failure stays; grown saved-slice requirement unchanged.|
|467|Old-normal 120 s maintenance completion fails after 120 keys; archive/Undo/convergence passed before timeout.|Real failed cell retained.468 diagnostic also reaches 120 s;469 arbitration repair and full affected checks precede fresh reruns.|
|472|First grown-normal app/cold steps pass, optional observer then queries closed Page.|Attempt ungraded, preserved. Repair observer only and rerun fresh;6 validreplicates remain.|
|480–481|Observed owner identity assumptions wrong in 2 preflights, then 2 correctpreflights pass. One common-fixture setup fails before a result due offscreen heading/pointer wrapper.|All attempts retained; no ordinary app/latency predicates changed.|
|482|All 3 paired 150 report cells fail peer/every-marker 2.5 s; all single 500 and functional/cold checks pass.|Report-only misses stay; sender default unchanged.|
|483|All 3 deep 50 report cells miss 30 s sample; native/Undo/cold pass.|Report-only; unpaired kickoff prevents a matched RTT causal claim.|
|485–487|Three unobserved/plain status-poll reproductions and one correctly observed reproduction stop at message-boundafter 76 confirmedadditional writes.|Full status aggregate crosses byte guard; exact guard/code preserved.487 firstprivateobserverbindinghasnocredit.488 changesonlytheapprovedper-keyfixturepoll.|


## Interpretation of the final matrix

One failed replicate fails its cell. Grown maintenance alone retains>=60 overlapping
keys and saved preparation. Old-fixture overlap and saved-slice exposure follow the
explicit operator amendments; every other assertion/deadline remains. Both grown
owners are observed through completion or 120 s after the last key; no reader censoring.
All timed blocks use pinned Chrome 156.0.8078.80, no profiler, caffeinate/display
observation, five-second external CPU/process/swap logs and windowed power logs.
No favorable noise rerun is taken. One optional-observer harness failure in 472 is
preserved and rerun fresh after repair; the app had already passed both cold steps.

The Goals cases retain their original diagnostic predicates. Their beforeinput
and animation-frame observations are not the native mutation 16 ms gate. Actual H
Goals is 13,407 UTF-8 bytes, M4,157 andQ1,049; the old lab comparison used 5,000 bytes.
Desktop rAF p95 is 15.415/17.563/17.635 ms, mobile 4 x32.661/32.557/32.519 ms. They are
reported, not relabelled as sub 16 ms frames or physical-phone typing. All 779 keys,
return edits and Undo/Redo/archive checks pass; no paragraph/idle/return Window
long task is observed. The 4 xcase is desktop CPU throttling, not Android hardware.

## Hardened results beside lab values

| Measure | Lab reference | Hardened evidence | Interpretation |
|---|---|---|---|
| Deep 1,025 at 0 ms |14.6 s|21.852/19.529/21.659 s|All original 30 s gates pass; not evidence of improvement over the lab.|
|2,048 maintenance after last key|34 s writer/55 s reader|writer 31.712–38.321 s;reader 38.175–62.404 s|All 12 owners complete within 120 s;10 s priority retry retained.|
| Input |source/browser-dependent lab results|max gating mutationp 958.5 ms in fairness|Original 16 ms applicable predicates pass; no physical phone claim.|
| Live peer |2.5 s gate unchanged|normal/withheld final live maxp 951,994.494 ms|Every applicable marker passes; some post-drain windows lack exposure.|
| Grown peer/input |same gates|peer max 1,600.451 ms;input max 5.079 ms;marker max 1,952.412 ms|>=60 keys overlap in every grown run.|
| Cold |15 s gate|All original cold predicates pass; native exact max 9.764 s|Live individual cold is not separately timed; joint post-typing-through-wrapper upper bound 12.357 s is qualified.|
| Deep at 50 ms|report-only|40.010/39.412/39.987 s|All exact/Undo/cold pass; all miss the report-only 30 s sample. Different kickoff from 0 ms, not a matched RTT effect.|
| Paired 150 coordinated|lab paired missed 2.5 s|six directionp 95 values 2,535.522/2,567.829;2,533.592/2,553.601;2,520.780/2,538.045 ms|All three report cells fail peer/every-marker predicates; functional/cold pass.|
| Single 500 Device 1|grown case previously unrun|peer p95875.013/885.397/844.034 ms|All report predicates pass;119 positions/120 keys,99.167 per 100.|
| Positions per 100 paired keys|sender study|7.333 each direction|22 acceptedpositions per 300 keys; no sender default change.|
| Dense/index bytes and first cap|labv 2 rough 13.5 KB/position, not RAM|Unavailable after unchanged setup deadline|Do not mix receipt plaintext bytes, index buffer capacity and whole-browser heap.|

Sender full audits are observed only after typing; none definitely or possibly
overlaps typing in the six report runs. All recorded full-audit attempts end
incomplete or are still active at the last pre-cold snapshot. Do not report their
1.9–2.85 s attempt durations as completed full-oracle costs, zero cost or proof of
starvation. Foreground exports/Undo/lock can interrupt them as designed. The 480
observer identity, prefix, overflow/failure and clock controls are retained.

## Proposed RC debts and deferred work

1. A full warm audit still blocks receive while it runs. The lab measured 4.6–5.0 s at
   ~2,700 rows,6.5 s worst,~1.7 ms/row; the hardened sender reports do not establish a
   completed replacement cost. During continuous input the completed full oracle
   can lag by roughly 1,024 work units rather than the old 256; force means attempt.
2. Paired 150 under coordinated sending remains above 2.5 s. The 2 s maximum sender hold
   contributes; the single send/receive work lane is unchanged. The 334 immediate-
   inflight diagnosis and prefix-walk/lane ideas remain deferred and unmeasured here.
3. No physical Android or real-account timing in this hardening pass. Simulated 4 x
   mobile, virtual passkeys and fictional profiles do not establish that experience.
4. No proven RAM saving. Receipt bytes and retained buffer accounting omit object/
   string overhead and transient copies. Real-scale index RAM/time stays a debt.
5. Capacity parks safely with its journal. New authenticated ledger hints can lift
   the park behind 60 s, so continued writing can make repeated expensive attempts;
   per-attempt wall/CPU cost and actual repeated cadence remain unmeasured.
6. The 4 MiB baseline record limit is effectively about 2 MiB of raw snapshot after hex/
   JSON overhead.442 observed 2,779,095 rawbytes encoding to 5,763,419, over 4,194,304.
   This was LocalBaselineCapacityError, not any of five PreparationCapacity sites.
   One exact post-park edit synced; that does not prove unlimited future growth.
   Binary encoding or a limit change needs an operator format/limit decision.
7.438/439 preparation costs remain unexplained: a900 s setup produced only~3.7 MB/
   64 acceptedpositions while 1,344 versions were witnessed; other preserved attempts
   recorded 2,464,019 and 4,249,788 wire bytes. Do not turn setup walltime into per-attempt
   maintenance cost. The lower 1 MiB functional index proof does not measure 32 MiB RAM.
8. The 250 ms batch shortcut cap can omit quiet publishers under real service work;
   they then wait up to eight busy logical positions. This is not a wall-time bound.
9. A first missed content hint with no known backlog still waits for ordinary idle
   discovery. R1000 only activates after an unhinted quiet read finds content.
10. The final production 3,072 report is missing. The approved fresh recipe's only
    change is its bounded poll; six permanent controls pass and every other byte
    inverses to 485. It confirms 690 additional accepted positions in its 30-minute
    setup, then stops. The last acknowledgment is only 1.969 s before wrapper end;
    the next 30 s poll did not receive a full exposure. No app/data-integrity fault
    or precise preparation-cost attribution is established by this timeout. A
    different fixture approach requires later review; no new setup or diagnosis
    is built. Real-scale index time/RAM/cap exposure remains open.
11. `compositionStatus` remains in the shipped facade and builds an unpaginated
   history-sized aggregate, bounded only by the transport refusing it.487 bproves
   the accounted-byte refusal at 2,131 s pool positions; the 488 fixture repair does not
   remove that API debt or raise its 1 MiB guard.
12. Each compositionStatus call invokes listCaptures, which calls carrier.load and decodes
   the source catalog. Delivery/spool status also enter native work. Proof reuse
   may apply: this is not a claim of fresh full crypto validation on every call.
   Its per-call cost is unmeasured. The fixture now avoids this work per key.
13. The static Worker-reply census finds another unpaginated history-sized result,
   Local compactContent's removed-sequence list, and pending-work-sized append/
   flush and device-count-sized roster replies. These are static size risks, not
   new measured failures. Pagination/bounded summaries are future work. The full
   census, existing bounds and method classifications accompany this report.

V/F/D, named hints, immediate-inflight, zero-delay priority retry, automatic server
checkpoints/two-device admission/signed tips, per-publisher fetch-ahead, forged-ID
work and a CRDT rewrite stay out. No new lab or unlisted speed experiments ran.

## Flags and rollback

All names below start with VITE_ACCOUNT_. The acceptance profile is BASELINE_READ=1,
BASELINE_INSTALL=1, RETENTION=1, RETENTION_AUTO=1, RETENTION_RESUME=1, RANGE_RECEIVE=1,
HISTORY_AUTO=0, BATCH=coordinated-2000, LEDGER=incremental, LEDGER_PROFILE=0. Range 4,
G8, quiet 750 ms, R1000, 10 s priority retry, 16/s and 64/s budgets, and the 32 MiB index remain. Ordinary
RANGE_RECEIVE builds stay off. The repo does not record deployed flags: operator
confirmation of the intended publication profile is required before release.

Compared with ordinary Vite defaults, BASELINE_INSTALL, RETENTION,
RETENTION_AUTO, RETENTION_RESUME and RANGE_RECEIVE change from 0 to 1. BASELINE_READ
already defaults to 1; HISTORY_AUTO=0, LEDGER=incremental, BATCH=coordinated-2000 and
LEDGER_PROFILE=0 remain their ordinary defaults. Docker forwards AUTO/RESUME/RANGE;
AUTO=1 coherently derives installer/retention writers. Direct evaluation of the
existing flag-policy functions records valid and rejected rollback combinations.


- The safe format rollback is a **same-source, reader-on/writer-off image** with
  RANGE_RECEIVE=0. The 430 pair proves compatible stale-tab/dense/offline behavior
  for its recorded tree; rebuild and identify the final signed-source pair before
  publication. Writer-off stops new range/dense writing and falls back to supported
  single-entry reads; it does not erase rows or lower the authenticated floor.
- **Rolling back to any pre-release build locks out devices that wrote dense rows.**
  This remains true after pruning; the authenticated format floor is preserved.
  Do not clear storage, force an old schema, rewrite receipts or invent a rollback
  conversion. No released build ever wrote the development v2/lab dense formats.
- To stop new automatic local attempts with the current Docker build arguments,
  set RETENTION_AUTO=0 **and** RETENTION_RESUME=0. The installer and retention writer
  then default to 0; BASELINE_READ remains 1 for existing reduced writing. Saved
  preparation journals are not evidence that data can be reverted; this profile
  disables their resumable optimization. It does not undo installed baselines or
  reconstruct pruned history. Keeping RESUME=1 while automatic is 0 is rejected
  unless BASELINE_INSTALL=1 and RETENTION=1 are explicitly supplied to Vite; the
  current Dockerfile does not forward those two independent arguments. Such a
  manual-writer profile needs a separately reviewed build recipe, not silent flags.
- BASELINE_INSTALL/RETENTION writer controls can stop future installs/mutations;
  preserve BASELINE_READ for already reduced devices. Reader removal is not a safe
  rollback of existing v5 data. HISTORY_AUTO stays 0; service automation is not enabled.
- R/E/audit policy changes have no independent release flags here. A selective code
  revert must retain the new format readers/floor and be rebuilt/tested; the old
  pre-format artifact is not a safe substitute. Keep the approved sender default.

Publication remains separate: operator merges, signed-source artifact identity,
writer-on/off image testing and digest pin, infrastructure PR/reconciliation and
actual-device adoption. Nothing in this report publishes or deploys an image.

## Evidence homes and status

- Phase 335: [335-capacity](../335-capacity/README.md).
- Phase 336: [336-fresh-slice](../336-fresh-slice/README.md).
- Phase 337: [337-priority-stop](../337-priority-stop/README.md).
- Phase 358: [358-stage 1-closed](../358-stage 1-closed/README.md).
- Phase 359: [359-receive-repair-polling](../359-receive-repair-polling/README.md).
- Phase 366: [366-stage 2-closed](../366-stage 2-closed/README.md).
- Phase 367: [367-format-contract](../367-format-contract/README.md).
- Phase 375: [375-binary-receipt-codec](../375-binary-receipt-codec/README.md).
- Phase 388: [388-explicit-stored-mode](../388-explicit-stored-mode/README.md).
- Phase 406: [406-mixed-replay-control](../406-mixed-replay-control/README.md).
- Phase 408: [408-indirect-readers](../408-indirect-readers/README.md).
- Phase 417: [417-unreduced-idle-oracle](../417-unreduced-idle-oracle/README.md).
- Phase 420: [420-explicit-range-build-flag](../420-explicit-range-build-flag/README.md).
- Phase 421: [421-native-interior-expiry-cold](../421-native-interior-expiry-cold/README.md).
- Phase 422: [422-native-multi-request-cut](../422-native-multi-request-cut/README.md).
- Phase 425: [425-genuine-stale-turn-idle-audit](../425-genuine-stale-turn-idle-audit/README.md).
- Phase 427: [427-frozen-old-owner-lifecycles](../427-frozen-old-owner-lifecycles/README.md).
- Phase 429: [429-rotation-authenticated-receipt-floor](../429-rotation-authenticated-receipt-floor/README.md).
- Phase 430: [430-same-tree-arm 64-reader-rollback](../430-same-tree-arm 64-reader-rollback/README.md).
- Phase 436: [436-coherent-functional-checkpoint](../436-coherent-functional-checkpoint/README.md).
- Phase 437: [437-continuous-native-b-fairness](../437-continuous-native-b-fairness/README.md).
- Phase 441: [441-native-index-fallback](../441-native-index-fallback/README.md).
- Phase 442: [442-capacity-debt-observation](../442-capacity-debt-observation/README.md).
- Phase 452: [452-native-importer-preflight](../452-native-importer-preflight/README.md).
- Phase 457: [457-future-clock-tolerance](../457-future-clock-tolerance/README.md).
- Phase 469: [469-maintenance-arbitration](../469-maintenance-arbitration/README.md).
- Phase 470: [470-maintenance-repair-confirmation](../470-maintenance-repair-confirmation/README.md).
- Phase 471: [471-maintenance-gate-block](../471-maintenance-gate-block/README.md).
- Phase 472: [472-grown-maintenance-gates](../472-grown-maintenance-gates/README.md).
- Phase 474: [474-native-gate-block](../474-native-gate-block/README.md).
- Phase 475: [475-live-catchup-gates](../475-live-catchup-gates/README.md).
- Phase 477: [477-fairness-gates](../477-fairness-gates/README.md).
- Phase 478: [478-goals-journeys](../478-goals-journeys/README.md).
- Phase 482: [482-sender-report-block](../482-sender-report-block/README.md).
- Phase 483: [483-deep 50-reports](../483-deep 50-reports/README.md).
- Phase 487: [487-composition-status-reply-ceiling](../487-composition-status-reply-ceiling/README.md).
- Phase 488: [488-bounded-fixture-status](../488-bounded-fixture-status/README.md).
- Phase 489: [489-grown 3072-setup-deadline](../489-grown 3072-setup-deadline/README.md).
- Phase 490: [490-index-report-unavailable](../490-index-report-unavailable/README.md).

The source and journey manifest hashes, all original failures and private artifact
identities are retained in evidence.json and the earlier homes. Worker endpoints
are referenced by commit/path/hash; changed delegated helpers are bound by the
frozen working-source manifest. No copied source objects are added. Windowed
power logs retain their run window and full-log hash/size only. No commit, push,
merge, publication or deployment. Stop here; further fixture or optimization work
requires the operator's next direction.
